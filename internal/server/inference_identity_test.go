package server

import (
	"log/slog"
	"net/http"
	"testing"
	"time"

	"github.com/modelsphere/console/internal/billing"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	k8stesting "k8s.io/client-go/testing"
)

func TestOldSessionCannotConsumeRecreatedUsersWallet(t *testing.T) {
	server := crdInferenceServer(t)
	journal, err := billing.OpenJournal(t.Context(), billing.JournalOptions{Directory: t.TempDir(), SegmentBytes: 4096, MaxBytes: 65536, SyncMode: "record"})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := journal.Close(); err != nil {
			t.Error(err)
		}
	})
	server.SetMetering(&billing.Meter{Journal: journal, FailurePolicy: "continue", PublishTimeout: time.Second, Log: slog.New(slog.DiscardHandler)})
	handler := server.Handler()
	old := login(t, handler, "admin", "admin-pw")
	user, err := server.store.GetUser(t.Context(), "admin")
	if err != nil {
		t.Fatal(err)
	}
	user.UID = types.UID("replacement-admin-uid")
	user.CreationTimestamp = metav1.Now()
	if _, err := server.store.UpdateUser(t.Context(), user); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(3 * time.Second)
	for {
		response := do(handler, "POST", "/api/llm/v1/chat/completions", old, `{"model":"qwen"}`)
		if response.Code == http.StatusUnauthorized {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("old session remains authorized after recreation: %d", response.Code)
		}
		time.Sleep(time.Millisecond)
	}
	if err := journal.Replay(t.Context(), func(event billing.Event) error {
		if event.OwnerUID == "replacement-admin-uid" {
			t.Fatal("old session was attributed to the replacement wallet")
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	fresh := login(t, handler, "admin", "admin-pw")
	if response := do(handler, "POST", "/api/llm/v1/chat/completions", fresh, `{"model":"qwen"}`); response.Code != http.StatusOK {
		t.Fatalf("fresh session: %d %s", response.Code, response.Body.String())
	}
}

func TestInferenceSessionUsesCachedUserAndRBACDuringAPIServerOutage(t *testing.T) {
	server := crdInferenceServer(t)
	handler := server.Handler()
	admin, bob := login(t, handler, "admin", "admin-pw"), login(t, handler, "bob", "bob-pw")
	role := `{"name":"model-caller","rules":[{"apiGroups":["iam.theriseunion.io"],"resources":["backends"],"resourceNames":["llm"],"verbs":["get","create"]}]}`
	if response := do(handler, "POST", "/api/iam/roles", admin, role); response.Code != http.StatusCreated {
		t.Fatalf("role: %d %s", response.Code, response.Body.String())
	}
	binding := `{"name":"model-caller-bob","role":"model-caller","subjects":[{"kind":"User","name":"bob","apiGroup":"iam.theriseunion.io"}]}`
	if response := do(handler, "POST", "/api/iam/rolebindings", admin, binding); response.Code != http.StatusCreated {
		t.Fatalf("binding: %d %s", response.Code, response.Body.String())
	}
	deadline := time.Now().Add(3 * time.Second)
	for {
		response := do(handler, "GET", "/api/llm/v1/models", bob, "")
		if response.Code == http.StatusOK {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("cached role not observed: %d", response.Code)
		}
		time.Sleep(time.Millisecond)
	}
	client := server.kube.Dynamic().(*dynamicfake.FakeDynamicClient)
	for _, verb := range []string{"get", "list"} {
		client.PrependReactor(verb, "*", func(k8stesting.Action) (bool, runtime.Object, error) {
			return true, nil, apierrors.NewServiceUnavailable("injected API Server outage")
		})
	}
	response := do(handler, "POST", "/api/llm/v1/chat/completions", bob, `{"model":"qwen"}`)
	if response.Code != http.StatusOK {
		t.Fatalf("inference depends on per-request API reads: %d %s", response.Code, response.Body.String())
	}
}
