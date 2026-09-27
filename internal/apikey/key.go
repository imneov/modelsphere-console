// Package apikey issues and verifies the keys programs use to call models through
// console's /v1 endpoint. See docs/console-design.md, "API keys".
package apikey

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"slices"
	"strings"
	"time"
)

// Prefix starts every key, so a leaked one is recognisable by scanners and people.
const Prefix = "ms"

const (
	idBytes     = 8
	secretBytes = 16
	saltBytes   = 16
)

// Key is one issued key as stored. The secret itself is never kept: 128 random
// bits leave nothing to brute-force, so a salted SHA-256 is enough and keeps the
// check off the hot path's CPU budget.
type Key struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	Description string     `json:"description,omitempty"`
	Salt        string     `json:"salt"`
	Hash        string     `json:"hash"`
	Models      []string   `json:"models,omitempty"`
	CreatedBy   string     `json:"createdBy"`
	CreatedAt   time.Time  `json:"createdAt"`
	ExpiresAt   *time.Time `json:"expiresAt,omitempty"`
	LastUsedAt  *time.Time `json:"lastUsedAt,omitempty"`
}

func (k Key) Masked() string {
	return Prefix + "_" + k.ID[:min(4, len(k.ID))] + "***"
}

func (k Key) Expired(now time.Time) bool {
	return k.ExpiresAt != nil && !now.Before(*k.ExpiresAt)
}

// Allows reports whether the key may call model. No list means every model.
func (k Key) Allows(model string) bool {
	return len(k.Models) == 0 || slices.Contains(k.Models, model)
}

func (k Key) matches(secret string) bool {
	return subtle.ConstantTimeCompare([]byte(digest(k.Salt, secret)), []byte(k.Hash)) == 1
}

// newKey returns a stored key and the one plaintext value that opens it.
func newKey() (Key, string, error) {
	id, err := randomHex(idBytes)
	if err != nil {
		return Key{}, "", err
	}
	secret, err := randomHex(secretBytes)
	if err != nil {
		return Key{}, "", err
	}
	salt, err := randomHex(saltBytes)
	if err != nil {
		return Key{}, "", err
	}
	return Key{ID: id, Salt: salt, Hash: digest(salt, secret)}, Prefix + "_" + id + "_" + secret, nil
}

// Parse splits "ms_<id>_<secret>".
func Parse(value string) (id, secret string, ok bool) {
	rest, ok := strings.CutPrefix(value, Prefix+"_")
	if !ok {
		return "", "", false
	}
	id, secret, ok = strings.Cut(rest, "_")
	if !ok || len(id) != 2*idBytes || len(secret) != 2*secretBytes || !isHex(id) || !isHex(secret) {
		return "", "", false
	}
	return id, secret, true
}

func digest(salt, secret string) string {
	sum := sha256.Sum256([]byte(salt + secret))
	return hex.EncodeToString(sum[:])
}

func randomHex(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func isHex(s string) bool {
	for _, c := range s {
		if !('0' <= c && c <= '9' || 'a' <= c && c <= 'f') {
			return false
		}
	}
	return true
}
