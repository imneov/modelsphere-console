// The acceptance fixture returns protocol usage without running a model.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	if err := run(ctx); err != nil {
		log.Error("acceptance upstream stopped", "err", err)
		os.Exit(1)
	}
}

func run(ctx context.Context) error {
	key := os.Getenv("BILLING_FIXTURE_KEY")
	if key == "" {
		return errors.New("BILLING_FIXTURE_KEY is required")
	}
	server := &http.Server{Addr: ":8080", ReadHeaderTimeout: 5 * time.Second, Handler: fixture{key: key}}
	result := make(chan error, 1)
	go func() { result <- server.ListenAndServe() }()
	select {
	case err := <-result:
		return err
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		defer cancel()
		return server.Shutdown(shutdown)
	}
}

type fixture struct{ key string }

func (fixture fixture) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	if request.Header.Get("Authorization") != "Bearer "+fixture.key {
		http.Error(writer, "unauthorized", http.StatusUnauthorized)
		return
	}
	writer.Header().Set("Content-Type", "application/json")
	if strings.HasSuffix(request.URL.Path, "/models") {
		_, _ = writer.Write([]byte(`{"data":[{"id":"qwen","object":"model"}]}`))
		return
	}
	var input struct {
		Stream bool `json:"stream"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(writer, request.Body, 1<<20)).Decode(&input); err != nil {
		http.Error(writer, "invalid JSON", 400)
		return
	}
	if !input.Stream {
		_, _ = writer.Write([]byte(`{"id":"fixture","choices":[{"message":{"role":"assistant","content":"fixture response"},"finish_reason":"stop"}],"usage":{"prompt_tokens":1000,"completion_tokens":500,"prompt_tokens_details":{"cached_tokens":200}}}`))
		return
	}
	streamFixture(writer, request)
}

func streamFixture(writer http.ResponseWriter, request *http.Request) {
	writer.Header().Set("Content-Type", "text/event-stream")
	for _, data := range []string{
		`{"id":"fixture","choices":[{"delta":{"content":"fixture "}}]}`,
		`{"id":"fixture","choices":[{"delta":{"content":"response"}}]}`,
		`{"id":"fixture","choices":[],"usage":{"prompt_tokens":1000,"completion_tokens":500,"prompt_tokens_details":{"cached_tokens":200}}}`,
		`[DONE]`,
	} {
		if _, err := fmt.Fprintf(writer, "data: %s\n\n", data); err != nil {
			return
		}
		writer.(http.Flusher).Flush()
		select {
		case <-request.Context().Done():
			return
		case <-time.After(10 * time.Millisecond):
		}
	}
}
