// Command higressupstream is an unbilled test model, never an inference gateway.
package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
)

type fixture struct {
	started, completed, canceled, rejected atomic.Int64
}

type chatRequest struct {
	Model    string `json:"model"`
	Stream   bool   `json:"stream"`
	Messages []struct {
		Content string `json:"content"`
	} `json:"messages"`
}

func main() {
	address := os.Getenv("LISTEN_ADDR")
	if address == "" {
		address = ":8080"
	}
	server := &http.Server{Addr: address, Handler: new(fixture).routes(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second}
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Error("fixture server failed", "error", err)
		os.Exit(1)
	}
}

func (upstream *fixture) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(writer http.ResponseWriter, _ *http.Request) { writer.WriteHeader(http.StatusOK) })
	mux.HandleFunc("GET /stats", upstream.stats)
	mux.HandleFunc("POST /v1/chat/completions", upstream.chat)
	return mux
}

func (upstream *fixture) chat(writer http.ResponseWriter, request *http.Request) {
	var body chatRequest
	if err := json.NewDecoder(http.MaxBytesReader(writer, request.Body, 1<<20)).Decode(&body); err != nil {
		http.Error(writer, "invalid fixture request", http.StatusBadRequest)
		return
	}
	if !trustedIdentity(request, body.Model) {
		upstream.rejected.Add(1)
		http.Error(writer, "untrusted identity or leaked credential", http.StatusForbidden)
		return
	}
	upstream.started.Add(1)
	writer.Header().Set("X-Fixture-Request-Id", request.Header.Get("X-Console-Request-Id"))
	writer.Header().Set("X-Fixture-Source", request.Header.Get("X-Console-Source"))
	writer.Header().Set("X-Fixture-Key-Id", request.Header.Get("X-Console-Api-Key-Id"))
	writer.Header().Set("X-Fixture-Principal-Uid", request.Header.Get("X-Console-Principal-Uid"))
	writer.Header().Set("X-Fixture-User", request.Header.Get("X-Console-User"))
	if body.Stream {
		upstream.stream(writer, request, body)
		return
	}
	writer.Header().Set("Content-Type", "application/json")
	response := map[string]any{"id": request.Header.Get("X-Console-Request-Id"), "object": "chat.completion", "model": body.Model,
		"choices": []any{map[string]any{"index": 0, "message": map[string]string{"role": "assistant", "content": "Higress direct upstream OK"}, "finish_reason": "stop"}},
		"usage":   usage()}
	if err := json.NewEncoder(writer).Encode(response); err != nil {
		upstream.canceled.Add(1)
		return
	}
	upstream.completed.Add(1)
}

func trustedIdentity(request *http.Request, model string) bool {
	for _, header := range []string{"Authorization", "Cookie", "X-Remote-User", "X-Remote-Group", "X-Remote-Uid", "X-ModelSphere-Route"} {
		if request.Header.Get(header) != "" {
			return false
		}
	}
	if request.Header.Get("X-Console-Principal-Uid") == "" || request.Header.Get("X-Console-User") == "" || model == "" || request.Header.Get("X-Console-Model") != model {
		return false
	}
	if _, err := uuid.Parse(request.Header.Get("X-Console-Request-Id")); err != nil {
		return false
	}
	switch request.Header.Get("X-Console-Source") {
	case "sdk":
		return request.Header.Get("X-Console-Api-Key-Id") != ""
	case "session":
		return request.Header.Get("X-Console-Api-Key-Id") == ""
	default:
		return false
	}
}

func (upstream *fixture) stream(writer http.ResponseWriter, request *http.Request, body chatRequest) {
	writer.Header().Set("Content-Type", "text/event-stream")
	writer.Header().Set("Cache-Control", "no-cache")
	controller := http.NewResponseController(writer)
	count := 2
	if len(body.Messages) > 0 && body.Messages[0].Content == "fixture:cancel" {
		count = 300
	}
	for index := 0; index < count; index++ {
		chunk := map[string]any{"id": request.Header.Get("X-Console-Request-Id"), "object": "chat.completion.chunk", "model": body.Model,
			"choices": []any{map[string]any{"index": 0, "delta": map[string]string{"content": "OK"}, "finish_reason": nil}}}
		if err := streamEvent(writer, controller, chunk); err != nil {
			upstream.canceled.Add(1)
			return
		}
		timer := time.NewTimer(100 * time.Millisecond)
		select {
		case <-request.Context().Done():
			timer.Stop()
			upstream.canceled.Add(1)
			return
		case <-timer.C:
		}
	}
	if err := streamEvent(writer, controller, map[string]any{"id": request.Header.Get("X-Console-Request-Id"), "model": body.Model, "choices": []any{}, "usage": usage()}); err != nil {
		upstream.canceled.Add(1)
		return
	}
	if _, err := fmt.Fprint(writer, "data: [DONE]\n\n"); err != nil {
		upstream.canceled.Add(1)
		return
	}
	if err := controller.Flush(); err != nil {
		upstream.canceled.Add(1)
		return
	}
	upstream.completed.Add(1)
}

func streamEvent(writer http.ResponseWriter, controller *http.ResponseController, event any) error {
	encoded, err := json.Marshal(event)
	if err != nil {
		return err
	}
	if _, err := fmt.Fprintf(writer, "data: %s\n\n", encoded); err != nil {
		return err
	}
	return controller.Flush()
}

func usage() map[string]int {
	return map[string]int{"prompt_tokens": 3, "completion_tokens": 2, "total_tokens": 5}
}

func (upstream *fixture) stats(writer http.ResponseWriter, _ *http.Request) {
	writer.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(writer).Encode(map[string]int64{"started": upstream.started.Load(), "completed": upstream.completed.Load(), "canceled": upstream.canceled.Load(), "rejected": upstream.rejected.Load()}); err != nil {
		slog.Warn("fixture stats response failed", "error", err)
	}
}
