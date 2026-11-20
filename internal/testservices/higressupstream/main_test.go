package main

import (
	"bufio"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func fixtureRequest(body string) *http.Request {
	request := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(body))
	request.Header.Set("X-Console-Principal-Uid", "canonical-user")
	request.Header.Set("X-Console-User", "tester")
	request.Header.Set("X-Console-Source", "sdk")
	request.Header.Set("X-Console-Api-Key-Id", "key-id")
	request.Header.Set("X-Console-Model", "fixture-model")
	request.Header.Set("X-Console-Request-Id", "1b8cab2b-dcff-46d5-b004-0f409f47ff45")
	return request
}

func TestFixtureJSONAndSSE(t *testing.T) {
	for _, stream := range []bool{false, true} {
		upstream := new(fixture)
		body := `{"model":"fixture-model","stream":false}`
		if stream {
			body = `{"model":"fixture-model","stream":true}`
		}
		response := httptest.NewRecorder()
		upstream.routes().ServeHTTP(response, fixtureRequest(body))
		if response.Code != http.StatusOK || upstream.completed.Load() != 1 || !strings.Contains(response.Body.String(), "prompt_tokens") {
			t.Fatalf("response status=%d completed=%d", response.Code, upstream.completed.Load())
		}
		if stream && !strings.Contains(response.Body.String(), "data: [DONE]") {
			t.Fatal("missing stream terminator")
		}
	}
}

func TestFixtureRejectsLeakedCredentials(t *testing.T) {
	for _, header := range []string{"Authorization", "Cookie", "X-Remote-User", "X-Remote-Group", "X-Remote-Uid", "X-ModelSphere-Route"} {
		upstream := new(fixture)
		request := fixtureRequest(`{"model":"fixture-model"}`)
		request.Header.Set(header, "must-not-reach-model")
		response := httptest.NewRecorder()
		upstream.routes().ServeHTTP(response, request)
		if response.Code != http.StatusForbidden || upstream.started.Load() != 0 || upstream.rejected.Load() != 1 {
			t.Fatalf("%s was not rejected", header)
		}
	}
}

func TestFixtureSessionCannotHaveKeyIdentity(t *testing.T) {
	request := fixtureRequest(`{"model":"fixture-model"}`)
	request.Header.Set("X-Console-Source", "session")
	if trustedIdentity(request, "fixture-model") {
		t.Fatal("session accepted invented key")
	}
	request.Header.Del("X-Console-Api-Key-Id")
	if !trustedIdentity(request, "fixture-model") {
		t.Fatal("session rejected empty key")
	}
}

func TestFixtureObservesCancellation(t *testing.T) {
	upstream := new(fixture)
	server := httptest.NewServer(upstream.routes())
	defer server.Close()
	request, err := http.NewRequest(http.MethodPost, server.URL+"/v1/chat/completions", strings.NewReader(`{"model":"fixture-model","stream":true,"messages":[{"content":"fixture:cancel"}]}`))
	if err != nil {
		t.Fatal(err)
	}
	request.Header = fixtureRequest("").Header
	response, err := server.Client().Do(request)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := bufio.NewReader(response.Body).ReadString('\n'); err != nil {
		t.Fatal(err)
	}
	if err := response.Body.Close(); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(2 * time.Second)
	for upstream.canceled.Load() != 1 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if upstream.canceled.Load() != 1 || upstream.completed.Load() != 0 {
		t.Fatal("upstream did not observe canceled stream")
	}
}
