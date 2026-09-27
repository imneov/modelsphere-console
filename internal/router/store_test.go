package router

import (
	"context"
	"errors"
	"log/slog"
	"maps"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

type fakeSecret struct {
	mu        sync.Mutex
	data      map[string][]byte
	version   int
	reads     int
	failReads error
	// conflicts makes the next n writes fail as if another replica wrote first.
	conflicts int
}

var secrets = schema.GroupResource{Resource: "secrets"}

func (f *fakeSecret) SecretVersioned(_ context.Context, _, name string) (map[string][]byte, string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.reads++
	if f.failReads != nil {
		return nil, "", f.failReads
	}
	if f.data == nil {
		return nil, "", apierrors.NewNotFound(secrets, name)
	}
	return maps.Clone(f.data), strconv.Itoa(f.version), nil
}

func (f *fakeSecret) WriteSecret(_ context.Context, _, name string, data map[string][]byte, create bool, version string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.conflicts > 0 {
		f.conflicts--
		f.version++
		return apierrors.NewConflict(secrets, name, errors.New("changed"))
	}
	switch {
	case create && f.data != nil:
		return apierrors.NewAlreadyExists(secrets, name)
	case !create && (f.data == nil || version != strconv.Itoa(f.version)):
		return apierrors.NewConflict(secrets, name, errors.New("changed"))
	}
	f.data = maps.Clone(data)
	f.version++
	return nil
}

type clock struct{ t time.Time }

func (c *clock) now() time.Time          { return c.t }
func (c *clock) advance(d time.Duration) { c.t = c.t.Add(d) }
func testStore(f *fakeSecret) (*Store, *clock) {
	c := &clock{t: time.Date(2026, 9, 27, 10, 0, 0, 0, time.UTC)}
	s := NewStore(f, "console", "console-api-keys", slog.New(slog.DiscardHandler))
	s.now = c.now
	return s, c
}

func TestParse(t *testing.T) {
	_, value, err := newKey()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(value, "ms_") || len(value) != len("ms_")+16+1+32 {
		t.Fatalf("value %q", value)
	}
	if _, _, ok := Parse(value); !ok {
		t.Fatalf("own value does not parse: %q", value)
	}
	for _, bad := range []string{"", "ms_", "sk-abc", "ms_0123456789abcdef", "ms_0123456789abcdeF_0123456789abcdef0123456789abcdef", "gpustack_0123456789abcdef_0123456789abcdef0123456789abcdef"} {
		if _, _, ok := Parse(bad); ok {
			t.Errorf("%q parsed", bad)
		}
	}
}

func TestCreateVerifyDelete(t *testing.T) {
	f := &fakeSecret{}
	s, c := testStore(f)
	ctx := context.Background()

	key, value, err := s.Create(ctx, Input{Name: " ci ", Models: []string{"qwen", "qwen", " "}, ExpiresIn: 7 * 24 * time.Hour, CreatedBy: "admin"})
	if err != nil {
		t.Fatal(err)
	}
	if key.Name != "ci" || len(key.Models) != 1 || key.ExpiresAt == nil || strings.Contains(string(f.data[key.ID]), value[len("ms_")+17:]) {
		t.Fatalf("stored %+v / %s", key, f.data[key.ID])
	}
	if key.Masked() != "ms_"+key.ID[:4]+"***" {
		t.Fatalf("masked %q", key.Masked())
	}

	got, err := s.Verify(ctx, value)
	if err != nil || got.ID != key.ID || !got.Allows("qwen") || got.Allows("llama") {
		t.Fatalf("verify: %+v %v", got, err)
	}
	wrong := value[:len(value)-1] + map[bool]string{true: "1", false: "0"}[value[len(value)-1] == '0']
	if _, err := s.Verify(ctx, wrong); !errors.Is(err, ErrInvalid) {
		t.Fatalf("wrong secret: %v", err)
	}
	if _, _, err := s.Create(ctx, Input{Name: "ci"}); !errors.Is(err, ErrExists) {
		t.Fatalf("duplicate name: %v", err)
	}

	c.advance(7 * 24 * time.Hour)
	if _, err := s.Verify(ctx, value); !errors.Is(err, ErrExpired) {
		t.Fatalf("expired: %v", err)
	}

	if err := s.Delete(ctx, key.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Verify(ctx, value); !errors.Is(err, ErrInvalid) {
		t.Fatalf("deleted: %v", err)
	}
	if err := s.Delete(ctx, key.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("delete twice: %v", err)
	}
}

func TestVerifySeesOtherReplicasWithinTTL(t *testing.T) {
	f := &fakeSecret{}
	here, c := testStore(f)
	there, _ := testStore(f)
	there.now = c.now
	ctx := context.Background()

	if _, err := here.Verify(ctx, "ms_0123456789abcdef_0123456789abcdef0123456789abcdef"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("empty store: %v", err)
	}
	key, value, err := there.Create(ctx, Input{Name: "a"})
	if err != nil {
		t.Fatal(err)
	}
	c.advance(missRefresh)
	if _, err := here.Verify(ctx, value); err != nil {
		t.Fatalf("new key from another replica: %v", err)
	}

	if err := there.Delete(ctx, key.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := here.Verify(ctx, value); err != nil {
		t.Fatalf("within the cache TTL the key still works here: %v", err)
	}
	c.advance(cacheTTL)
	if _, err := here.Verify(ctx, value); !errors.Is(err, ErrInvalid) {
		t.Fatalf("after the TTL a deleted key is gone: %v", err)
	}
}

func TestUnknownKeysAreRateLimited(t *testing.T) {
	f := &fakeSecret{}
	s, _ := testStore(f)
	for i := 0; i < 50; i++ {
		_, _ = s.Verify(context.Background(), "ms_0123456789abcdef_0123456789abcdef0123456789abcdef")
	}
	if f.reads != 1 {
		t.Fatalf("%d reads for 50 unknown keys in one instant", f.reads)
	}
}

func TestVerifyKeepsLastGoodSetOnReadError(t *testing.T) {
	f := &fakeSecret{}
	s, c := testStore(f)
	ctx := context.Background()
	_, value, err := s.Create(ctx, Input{Name: "a"})
	if err != nil {
		t.Fatal(err)
	}
	f.failReads = errors.New("apiserver down")
	c.advance(cacheTTL)
	if _, err := s.Verify(ctx, value); err != nil {
		t.Fatalf("stale but known: %v", err)
	}

	fresh, _ := testStore(f)
	if _, err := fresh.Verify(ctx, value); !errors.Is(err, ErrUnavailable) {
		t.Fatalf("never loaded: %v", err)
	}
}

func TestWritesRetryOnConflict(t *testing.T) {
	f := &fakeSecret{}
	s, _ := testStore(f)
	ctx := context.Background()
	if _, _, err := s.Create(ctx, Input{Name: "a"}); err != nil {
		t.Fatal(err)
	}
	f.conflicts = 2
	if _, _, err := s.Create(ctx, Input{Name: "b"}); err != nil {
		t.Fatalf("retried create: %v", err)
	}
	if len(f.data) != 2 {
		t.Fatalf("%d keys", len(f.data))
	}
	f.conflicts = writeTries
	if _, _, err := s.Create(ctx, Input{Name: "c"}); err == nil {
		t.Fatal("gave up after writeTries conflicts, want an error")
	}
}
