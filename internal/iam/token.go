package iam

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v4"
)

// Identity is an authenticated caller, extracted from a verified token.
type Identity struct {
	Name   string
	Groups []string
	Email  string
}

// IsSystemMaster reports whether the caller is in system:masters, the group the
// authorizer short-circuits to allow everything (matches Global and the
// helm-seeded admin).
func (id *Identity) IsSystemMaster() bool {
	for _, g := range id.Groups {
		if g == "system:masters" {
			return true
		}
	}
	return false
}

// Token is the OAuth2 token response, shaped exactly like Global's.
type Token struct {
	AccessToken  string `json:"access_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
	RefreshToken string `json:"refresh_token,omitempty"`
	Scope        string `json:"scope,omitempty"`
	IDToken      string `json:"id_token,omitempty"`
}

const tokenScope = "openid profile email groups"

// Signer mints HS256 tokens. The claim set is identical to Global's HMAC mode.
type Signer struct {
	issuer string
	secret []byte
	ttl    time.Duration
}

func NewSigner(issuer, secret string, ttl time.Duration) *Signer {
	return &Signer{issuer: issuer, secret: []byte(secret), ttl: ttl}
}

func (s *Signer) Mint(u *User) (*Token, error) {
	now := time.Now()
	exp := now.Add(s.ttl)
	claims := jwt.MapClaims{
		"iss":                s.issuer,
		"sub":                u.Name,
		"aud":                []string{s.issuer},
		"exp":                exp.Unix(),
		"iat":                now.Unix(),
		"nbf":                now.Unix(),
		"preferred_username": u.Name,
		"name":               u.Spec.DisplayName,
		"email":              u.Spec.Email,
		"groups":             realUserGroups(u),
		"scope":              tokenScope,
		"jti":                randomHex(16),
	}
	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.secret)
	if err != nil {
		return nil, fmt.Errorf("sign token: %w", err)
	}
	return &Token{
		AccessToken: signed,
		TokenType:   "Bearer",
		ExpiresIn:   int(s.ttl.Seconds()),
		Scope:       tokenScope,
		IDToken:     signed,
	}, nil
}

// Verify parses and validates a token. The issuer is intentionally not checked
// (multi-cluster: a token from one instance is accepted by another that shares
// the secret) -- exactly Global's behaviour.
func (s *Signer) Verify(tokenString string) (*Identity, error) {
	parser := jwt.NewParser(jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}))
	var claims jwt.MapClaims
	_, err := parser.ParseWithClaims(tokenString, &claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrSignatureInvalid
		}
		return s.secret, nil
	})
	if err != nil {
		return nil, err
	}
	return identityFromClaims(claims), nil
}

func identityFromClaims(claims jwt.MapClaims) *Identity {
	id := &Identity{Groups: []string{"system:authenticated"}}
	if v, ok := claims["sub"].(string); ok {
		id.Name = v
	}
	if v, ok := claims["preferred_username"].(string); ok {
		id.Name = v
	}
	if v, ok := claims["email"].(string); ok {
		id.Email = v
	}
	if gs, ok := claims["groups"].([]interface{}); ok {
		for _, g := range gs {
			if str, ok := g.(string); ok && str != "system:authenticated" {
				id.Groups = append(id.Groups, str)
			}
		}
	}
	return id
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
