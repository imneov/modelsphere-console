package iam

import (
	"context"
	"log/slog"
	"testing"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	dynamicfake "k8s.io/client-go/dynamic/fake"
)

func TestPasswordRoundtrip(t *testing.T) {
	hash, err := HashPassword("P@88w0rd")
	if err != nil {
		t.Fatal(err)
	}
	if !VerifyPassword("P@88w0rd", hash) {
		t.Fatal("correct password rejected")
	}
	if VerifyPassword("wrong", hash) {
		t.Fatal("wrong password accepted")
	}
}

func TestValidateComplexity(t *testing.T) {
	tests := []struct {
		name     string
		password string
		wantErr  bool
	}{
		{name: "empty", password: "", wantErr: true},
		{name: "seven characters", password: "Aa1!aaa", wantErr: true},
		{name: "missing uppercase", password: "aa1!aaaa", wantErr: true},
		{name: "missing lowercase", password: "AA1!AAAA", wantErr: true},
		{name: "missing digit", password: "Aa!aaaaa", wantErr: true},
		{name: "missing special", password: "Aa1aaaaa", wantErr: true},
		{name: "whitespace is not special", password: "Aa1 aaaa", wantErr: true},
		{name: "exactly eight characters", password: "Aa1!aaaa"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateComplexity(tt.password)
			if (err != nil) != tt.wantErr {
				t.Fatalf("ValidateComplexity(%q) error = %v, wantErr %v", tt.password, err, tt.wantErr)
			}
		})
	}
}

func TestRequiresPasswordReset(t *testing.T) {
	u := &User{ObjectMeta: metav1.ObjectMeta{Annotations: map[string]string{RequirePasswordResetAnnotation: "true"}}}
	if !u.RequiresPasswordReset() {
		t.Fatal("require-password-reset annotation was ignored")
	}
	u.Annotations[RequirePasswordResetAnnotation] = "false"
	if u.RequiresPasswordReset() {
		t.Fatal("false annotation was treated as enabled")
	}
}

func TestTokenRoundtrip(t *testing.T) {
	s := NewSigner("https://issuer.test", "secret-key", time.Hour)
	u := &User{
		ObjectMeta: metav1.ObjectMeta{Name: "alice"},
		Spec:       UserSpec{DisplayName: "Alice", Email: "alice@test", Groups: []string{"system:masters"}},
	}
	tok, err := s.Mint(u)
	if err != nil {
		t.Fatal(err)
	}
	if tok.TokenType != "Bearer" || tok.AccessToken == "" {
		t.Fatalf("bad token: %+v", tok)
	}
	id, err := s.Verify(tok.AccessToken)
	if err != nil {
		t.Fatal(err)
	}
	if id.Name != "alice" || id.Email != "alice@test" {
		t.Fatalf("bad identity: %+v", id)
	}
	if !id.IsSystemMaster() {
		t.Fatal("expected system:masters")
	}
	// A token signed with a different secret must not verify.
	other := NewSigner("https://issuer.test", "different", time.Hour)
	if _, err := other.Verify(tok.AccessToken); err == nil {
		t.Fatal("token verified under wrong secret")
	}
}

func TestLoginFlow(t *testing.T) {
	hash, _ := HashPassword("P@88w0rd")
	admin := &unstructured.Unstructured{Object: map[string]any{
		"apiVersion": Group + "/" + Version,
		"kind":       "User",
		"metadata":   map[string]any{"name": "admin"},
		"spec": map[string]any{
			"displayName":       "Administrator",
			"groups":            []any{"system:masters"},
			"encryptedPassword": hash,
		},
	}}
	scheme := runtime.NewScheme()
	dyn := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(scheme,
		map[schema.GroupVersionResource]string{UsersGVR: "UserList"}, admin)

	store := NewStore(dyn)
	signer := NewSigner("https://issuer.test", "secret", time.Hour)
	authn := NewAuthenticator(store, signer, slog.New(slog.DiscardHandler))

	if _, err := authn.Login(context.Background(), "admin", "wrong"); err == nil {
		t.Fatal("login with wrong password should fail")
	}
	tok, err := authn.Login(context.Background(), "admin", "P@88w0rd")
	if err != nil {
		t.Fatalf("login failed: %v", err)
	}
	id, err := signer.Verify(tok.AccessToken)
	if err != nil {
		t.Fatal(err)
	}
	if id.Name != "admin" || !id.IsSystemMaster() {
		t.Fatalf("bad identity: %+v", id)
	}
}
