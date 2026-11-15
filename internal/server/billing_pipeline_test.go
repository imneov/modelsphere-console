package server

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/modelsphere/console/internal/billing"
	"github.com/modelsphere/console/internal/testservices"
	"github.com/redis/go-redis/v9"
)

type pipelineFixture struct {
	server    *Server
	store     *billing.Store
	journal   *billing.Journal
	queue     *billing.RedisQueue
	publisher *billing.RedisQueue
	projector *billing.AdmissionProjector
	workers   []*billing.UsageWorker
	caches    []*billing.PriceCache
}

func pipelineStore(t *testing.T, dsn string) *billing.Store {
	t.Helper()
	store, err := billing.Open(t.Context(), "postgres", dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Error(err)
		}
	})
	return store
}

func pipelineQueue(t *testing.T, url, prefix string) *billing.RedisQueue {
	t.Helper()
	queue, err := billing.NewRedisQueue(billing.RedisOptions{URL: url, Prefix: prefix, Partitions: 2, Group: "usage", LeaseDuration: 10 * time.Second})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := queue.Close(); err != nil && !errors.Is(err, redis.ErrClosed) {
			t.Error(err)
		}
	})
	return queue
}

func newPipelineFixture(t *testing.T) *pipelineFixture {
	t.Helper()
	dsn := testservices.PostgresDSN(t)
	upstream := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		if request.URL.Path == "/llm/v1/models" {
			_, _ = writer.Write([]byte(`{"data":[{"id":"qwen"}]}`))
			return
		}
		_, _ = writer.Write([]byte(`{"id":"upstream","choices":[],"usage":{"prompt_tokens":1000,"completion_tokens":500,"prompt_tokens_details":{"cached_tokens":200}}}`))
	}))
	t.Cleanup(upstream.Close)
	fixture := &pipelineFixture{server: crdInferenceServerAt(t, upstream.URL), store: pipelineStore(t, dsn)}
	var err error
	fixture.journal, err = billing.OpenJournal(t.Context(), billing.JournalOptions{Directory: t.TempDir(), SegmentBytes: 4096, MaxBytes: 1 << 20, SyncMode: "record"})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := fixture.journal.Close(); err != nil {
			t.Error(err)
		}
	})
	url, prefix := testservices.RedisURL(t), "pipeline-"+uuid.NewString()
	fixture.queue = pipelineQueue(t, url, prefix)
	fixture.publisher = pipelineQueue(t, url, prefix)
	log := slog.New(slog.DiscardHandler)
	meter := &billing.Meter{Journal: fixture.journal, Queue: fixture.publisher, FailurePolicy: "continue", PublishTimeout: time.Second, Log: log}
	if err := fixture.server.EnableBilling(&billing.Service{Store: fixture.store, Meter: meter, Queue: fixture.queue, Client: fixture.server.kube.Dynamic(), Namespace: "console", Currency: "USD"}); err != nil {
		t.Fatal(err)
	}
	fixture.projector, err = billing.NewAdmissionProjector(t.Context(), fixture.server.kube.Dynamic(), "console", fixture.store, log)
	if err != nil {
		t.Fatal(err)
	}
	for index := 0; index < 2; index++ {
		cache, err := billing.NewPriceCache(t.Context(), fixture.server.kube.Dynamic(), "console", pipelineStore(t, dsn), log)
		if err != nil {
			t.Fatal(err)
		}
		fixture.caches = append(fixture.caches, cache)
		fixture.workers = append(fixture.workers, &billing.UsageWorker{Queue: pipelineQueue(t, url, prefix), Store: pipelineStore(t, dsn), Prices: cache.Get, Log: log, Options: billing.WorkerOptions{Consumer: "worker-" + uuid.NewString(), FlushInterval: 5 * time.Second, PollInterval: time.Millisecond, MaxEvents: 100, MaxBytes: 1 << 20, Concurrency: 1}})
	}
	return fixture
}

func TestRealRedisPostgresPipelinePricesOnceAndSettlesSharedWallets(t *testing.T) {
	fixture := newPipelineFixture(t)
	handler := fixture.server.Handler()
	admin := login(t, handler, "admin", "admin-pw")
	for _, user := range []string{"bob", "admin"} {
		response := do(handler, "POST", "/api/billing/credits", admin, `{"operationID":"credit-`+user+`","user":"`+user+`","principalUID":"`+user+`-uid","currency":"USD","amount":"2000000000","kind":"topup"}`)
		if response.Code != http.StatusOK {
			t.Fatalf("credit: %d %s", response.Code, response.Body.String())
		}
	}
	publishPipelinePrice(t, handler, admin, "v1", "1000000000", "250000000", "2000000000")
	if err := fixture.projector.ProjectPending(t.Context(), 100); err != nil {
		t.Fatal(err)
	}
	for index, name := range []string{"key-one", "key-two"} {
		if index == 1 {
			if err := fixture.publisher.Close(); err != nil {
				t.Fatal(err)
			}
		}
		key := createKey(t, handler, admin, `{"name":"`+name+`","user":"bob"}`)
		awaitKeyResponse(t, handler, key.Value, "qwen", http.StatusOK)
	}
	if response := do(handler, "POST", "/api/llm/v1/chat/completions", admin, `{"model":"qwen"}`); response.Code != http.StatusOK {
		t.Fatalf("session: %d %s", response.Code, response.Body.String())
	}
	publishPipelinePrice(t, handler, admin, "v2", "2000000000", "500000000", "4000000000")
	awaitPipelinePrices(t, fixture.caches, "v2")
	replayWithLostConfirmation(t, fixture)
	flushConcurrentPipelineWorkers(t, fixture.workers)
	assertPipelineCharges(t, handler, admin)
	generation, err := fixture.store.AcquireFence(t.Context(), "settler")
	if err != nil {
		t.Fatal(err)
	}
	for range 2 {
		if _, err := fixture.store.Settle(t.Context(), generation, 100, 1000); err != nil {
			t.Fatal(err)
		}
	}
	wallet, err := fixture.store.Reconcile(t.Context(), "bob-uid")
	if err != nil {
		t.Fatal(err)
	}
	if wallet.Balance != 1992600000 || wallet.Balance != wallet.LedgerBalance || wallet.Revision != 3 {
		t.Fatalf("shared wallet: %+v", wallet)
	}
}

func publishPipelinePrice(t *testing.T, handler http.Handler, admin, version, input, cached, output string) {
	t.Helper()
	body := `{"model":"qwen","priceVersion":"` + version + `","currency":"USD","unitTokens":1000000,"inputRate":"` + input + `","cacheRate":"` + cached + `","outputRate":"` + output + `"}`
	response := do(handler, "PUT", "/api/billing/prices", admin, body)
	if response.Code != http.StatusOK {
		t.Fatalf("publish: %d %s", response.Code, response.Body.String())
	}
}

func awaitPipelinePrices(t *testing.T, caches []*billing.PriceCache, version string) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for {
		ready := true
		for _, cache := range caches {
			price, found := cache.Get("qwen")
			ready = ready && found && price.Version == version
		}
		if ready {
			return
		}
		if time.Now().After(deadline) {
			t.Fatal("price caches did not archive and observe the published version")
		}
		time.Sleep(time.Millisecond)
	}
}

func assertPipelineCharges(t *testing.T, handler http.Handler, admin string) {
	t.Helper()
	response := do(handler, "GET", "/api/billing/usage?ownerUserID=bob-uid&page=1&limit=1", admin, "")
	var page billing.Page[billing.Request]
	if err := json.Unmarshal(response.Body.Bytes(), &page); err != nil {
		t.Fatal(err)
	}
	if response.Code != http.StatusOK || page.TotalItems != 2 || len(page.Items) != 1 || page.Page != 1 || page.Limit != 1 {
		t.Fatalf("pagination: %d %+v", response.Code, page)
	}
	if charge := page.Items[0].Charge; charge == nil || charge.Amount != 3700000 || charge.Price.Version != "v2" || charge.State != "pending" {
		t.Fatalf("first current price: %+v", charge)
	}
}

func replayWithLostConfirmation(t *testing.T, fixture *pipelineFixture) {
	t.Helper()
	var terminal billing.Event
	lost := false
	err := fixture.journal.Replay(t.Context(), func(event billing.Event) error {
		if err := fixture.queue.Publish(t.Context(), event); err != nil {
			return err
		}
		if !lost {
			lost = true
			return context.DeadlineExceeded
		}
		return nil
	})
	if err == nil {
		t.Fatal("publish confirmation loss was not injected")
	}
	if err := fixture.journal.Replay(t.Context(), func(event billing.Event) error {
		if event.Type == "request_terminal" {
			terminal = event
		}
		return fixture.queue.Publish(t.Context(), event)
	}); err != nil {
		t.Fatal(err)
	}
	if err := fixture.queue.Publish(t.Context(), terminal); err != nil {
		t.Fatal(err)
	}
}

func flushConcurrentPipelineWorkers(t *testing.T, workers []*billing.UsageWorker) {
	t.Helper()
	for range 4 {
		var group sync.WaitGroup
		for _, worker := range workers {
			group.Add(1)
			go func() {
				defer group.Done()
				if err := worker.FlushOnce(t.Context()); err != nil {
					t.Error(err)
				}
			}()
		}
		group.Wait()
	}
}
