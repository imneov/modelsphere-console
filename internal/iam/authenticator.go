package iam

import (
	"context"
	"errors"
	"log/slog"
)

// ErrAuth is returned for every credential failure, without distinguishing
// unknown-user from wrong-password -- the caller maps it to a single
// invalid_grant, so an attacker learns nothing about which users exist.
var ErrAuth = errors.New("invalid username or password")

// Authenticator turns a username and password into a token, verifying against
// the User CRD and stamping the last-login time.
type Authenticator struct {
	store  *Store
	signer *Signer
	log    *slog.Logger
}

func NewAuthenticator(store *Store, signer *Signer, log *slog.Logger) *Authenticator {
	return &Authenticator{store: store, signer: signer, log: log}
}

func (a *Authenticator) Login(ctx context.Context, username, password string) (*Token, error) {
	if username == "" || password == "" {
		return nil, ErrAuth
	}
	u, err := a.store.GetUser(ctx, username)
	if err != nil {
		return nil, ErrAuth
	}
	if u.Status.State != "" && u.Status.State != UserActive {
		return nil, ErrAuth
	}
	if u.Spec.EncryptedPassword == "" || !VerifyPassword(password, u.Spec.EncryptedPassword) {
		return nil, ErrAuth
	}
	tok, err := a.signer.Mint(u)
	if err != nil {
		return nil, err
	}
	// Best-effort: a stale last-login must not fail an otherwise valid login.
	if err := a.store.UpdateLastLogin(ctx, username); err != nil {
		a.log.Warn("update last login", "user", username, "err", err)
	}
	return tok, nil
}
