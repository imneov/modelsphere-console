package router

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"maps"
	"slices"
	"strings"
	"sync"
	"time"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
)

var (
	ErrInvalid     = errors.New("invalid api key")
	ErrExpired     = errors.New("api key expired")
	ErrExists      = errors.New("an api key with this name already exists")
	ErrNotFound    = errors.New("api key not found")
	ErrUnavailable = errors.New("api keys cannot be read")
	ErrBadInput    = errors.New("bad api key input")
)

// backend is the one Secret the keys live in.
type backend interface {
	SecretVersioned(ctx context.Context, namespace, name string) (map[string][]byte, string, error)
	WriteSecret(ctx context.Context, namespace, name string, data map[string][]byte, create bool, resourceVersion string) error
}

const (
	// cacheTTL bounds how long a key deleted through another replica still works.
	cacheTTL = 10 * time.Second
	// missRefresh rate-limits the re-read an unknown key triggers, so a flood of
	// made-up keys costs one GET a second, not one per request.
	missRefresh = time.Second
	writeTries  = 5
)

// Store keeps the keys in one Secret, one entry per key id holding its JSON.
type Store struct {
	b         backend
	namespace string
	name      string
	log       *slog.Logger
	now       func() time.Time

	mu        sync.Mutex
	keys      map[string]Key
	loaded    bool
	checkedAt time.Time
}

func NewStore(b backend, namespace, name string, log *slog.Logger) *Store {
	return &Store{b: b, namespace: namespace, name: name, log: log, now: time.Now}
}

func (s *Store) Ref() string { return s.namespace + "/" + s.name }

type Input struct {
	Name        string
	Description string
	Models      []string
	// ExpiresIn zero means the key never expires.
	ExpiresIn time.Duration
	CreatedBy string
}

// Create issues a key and returns its plaintext value, the only time it exists.
func (s *Store) Create(ctx context.Context, in Input) (Key, string, error) {
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		return Key{}, "", fmt.Errorf("%w: name is required", ErrBadInput)
	}
	if in.ExpiresIn < 0 {
		return Key{}, "", fmt.Errorf("%w: expiry must not be negative", ErrBadInput)
	}
	key, value, err := newKey()
	if err != nil {
		return Key{}, "", err
	}
	key.Name = in.Name
	key.Description = strings.TrimSpace(in.Description)
	key.Models = cleanModels(in.Models)
	key.CreatedBy = in.CreatedBy
	key.CreatedAt = s.now().UTC().Truncate(time.Second)
	if in.ExpiresIn > 0 {
		at := key.CreatedAt.Add(in.ExpiresIn)
		key.ExpiresAt = &at
	}
	err = s.mutate(ctx, func(keys map[string]Key) error {
		for _, k := range keys {
			if k.Name == key.Name {
				return ErrExists
			}
		}
		keys[key.ID] = key
		return nil
	})
	if err != nil {
		return Key{}, "", err
	}
	return key, value, nil
}

func (s *Store) Delete(ctx context.Context, id string) error {
	return s.mutate(ctx, func(keys map[string]Key) error {
		if _, ok := keys[id]; !ok {
			return ErrNotFound
		}
		delete(keys, id)
		return nil
	})
}

// List reads the Secret afresh, newest first.
func (s *Store) List(ctx context.Context) ([]Key, error) {
	keys, _, err := s.read(ctx)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	s.remember(keys)
	s.mu.Unlock()
	out := slices.Collect(maps.Values(keys))
	slices.SortFunc(out, func(a, b Key) int { return b.CreatedAt.Compare(a.CreatedAt) })
	return out, nil
}

// Verify answers from the cache, re-reading the Secret when the cache is old or
// the key is unknown to it. A failed re-read keeps the last good copy: a
// transient API error should not take inference down.
func (s *Store) Verify(ctx context.Context, value string) (Key, error) {
	id, secret, ok := Parse(value)
	if !ok {
		return Key{}, ErrInvalid
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.now()
	key, found := s.keys[id]
	age := now.Sub(s.checkedAt)
	if !s.loaded || age >= cacheTTL || (!found && age >= missRefresh) {
		s.checkedAt = now
		keys, _, err := s.read(ctx)
		switch {
		case err == nil:
			s.remember(keys)
		case !s.loaded:
			return Key{}, fmt.Errorf("%w: %v", ErrUnavailable, err)
		default:
			s.log.Warn("api keys not re-read, using the last known set", "secret", s.Ref(), "err", err)
		}
		key, found = s.keys[id]
	}
	if !found || !key.matches(secret) {
		return Key{}, ErrInvalid
	}
	if key.Expired(now) {
		return Key{}, ErrExpired
	}
	return key, nil
}

// mutate is a read-modify-write of the Secret, retried when another replica
// wrote in between.
func (s *Store) mutate(ctx context.Context, change func(map[string]Key) error) error {
	for try := 1; ; try++ {
		keys, version, err := s.read(ctx)
		if err != nil {
			return err
		}
		if err := change(keys); err != nil {
			return err
		}
		err = s.write(ctx, keys, version)
		if err == nil {
			s.mu.Lock()
			s.remember(keys)
			s.mu.Unlock()
			return nil
		}
		if try < writeTries && (apierrors.IsConflict(err) || apierrors.IsAlreadyExists(err)) {
			continue
		}
		return fmt.Errorf("write api keys %s: %w", s.Ref(), err)
	}
}

// version is where a write has to start from: nil when the Secret does not exist
// yet and the write creates it.
func (s *Store) read(ctx context.Context) (map[string]Key, *string, error) {
	data, rv, err := s.b.SecretVersioned(ctx, s.namespace, s.name)
	if apierrors.IsNotFound(err) {
		return map[string]Key{}, nil, nil
	}
	if err != nil {
		return nil, nil, fmt.Errorf("read api keys %s: %w", s.Ref(), err)
	}
	version := &rv
	keys := make(map[string]Key, len(data))
	for id, raw := range data {
		var k Key
		if err := json.Unmarshal(raw, &k); err != nil || k.ID != id {
			s.log.Warn("api key entry skipped: not a key this console wrote", "secret", s.Ref(), "entry", id)
			continue
		}
		keys[id] = k
	}
	return keys, version, nil
}

func (s *Store) write(ctx context.Context, keys map[string]Key, version *string) error {
	data := make(map[string][]byte, len(keys))
	for id, k := range keys {
		raw, err := json.Marshal(k)
		if err != nil {
			return err
		}
		data[id] = raw
	}
	if version == nil {
		return s.b.WriteSecret(ctx, s.namespace, s.name, data, true, "")
	}
	return s.b.WriteSecret(ctx, s.namespace, s.name, data, false, *version)
}

// remember installs keys as the cache; the caller holds mu.
func (s *Store) remember(keys map[string]Key) {
	s.keys = maps.Clone(keys)
	s.loaded = true
	s.checkedAt = s.now()
}

func cleanModels(models []string) []string {
	var out []string
	for _, m := range models {
		if m = strings.TrimSpace(m); m != "" && !slices.Contains(out, m) {
			out = append(out, m)
		}
	}
	return out
}
