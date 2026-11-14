package billing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type HTTPUsageVerifier struct {
	URLTemplate string
	Upstream    string
	Token       string
	Client      *http.Client
}

func (verifier *HTTPUsageVerifier) Verify(ctx context.Context, request Request) (Verification, error) {
	if verifier.Upstream == "" || request.Upstream != verifier.Upstream || !strings.Contains(verifier.URLTemplate, "{request_id}") {
		return Verification{}, errors.New("request has no configured trusted upstream usage source")
	}
	identifier := request.UpstreamRequestID
	if identifier == "" {
		identifier = request.RequestID
	}
	lookup, err := verifier.lookup(ctx, identifier)
	if err != nil {
		return Verification{}, err
	}
	client := http.Client{Timeout: 10 * time.Second}
	if verifier.Client != nil {
		client = *verifier.Client
	}
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	response, err := client.Do(lookup)
	if err != nil {
		return Verification{}, fmt.Errorf("read trusted upstream usage: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return Verification{}, fmt.Errorf("trusted upstream usage returned status %d", response.StatusCode)
	}
	var proof struct {
		RequestID  string    `json:"request_id"`
		Model      string    `json:"model"`
		Usage      Usage     `json:"usage"`
		TerminalAt time.Time `json:"terminal_at"`
	}
	decoder := json.NewDecoder(io.LimitReader(response.Body, 64<<10))
	if err := decoder.Decode(&proof); err != nil {
		return Verification{}, fmt.Errorf("decode trusted upstream usage: %w", err)
	}
	if proof.RequestID != identifier || proof.Model != request.Model || !proof.Usage.Complete {
		return Verification{}, errors.New("upstream usage proof does not identify this completed request")
	}
	proof.Usage.Source = "upstream_reconciliation"
	if err := proof.Usage.Validate(); err != nil {
		return Verification{}, err
	}
	return Verification{Usage: proof.Usage, TerminalAt: proof.TerminalAt}, nil
}

func (verifier *HTTPUsageVerifier) lookup(ctx context.Context, identifier string) (*http.Request, error) {
	target := strings.ReplaceAll(verifier.URLTemplate, "{request_id}", url.PathEscape(identifier))
	parsed, err := url.Parse(target)
	if err != nil || (parsed.Scheme != "https" && parsed.Scheme != "http") || parsed.Host == "" {
		return nil, errors.New("invalid trusted usage endpoint")
	}
	lookup, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return nil, err
	}
	if verifier.Token != "" {
		lookup.Header.Set("Authorization", "Bearer "+verifier.Token)
	}
	return lookup, nil
}
