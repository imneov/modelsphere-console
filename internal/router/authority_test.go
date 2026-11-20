package router

import (
	"testing"
)

func TestGatewayAuthRequiresActivatedCRDAuthorityWithoutWrites(t *testing.T) {
	for _, phase := range []string{"", migrationFrozen, migrationComplete, migrationActivating, migrationActive, "invalid"} {
		t.Run(phase, func(t *testing.T) {
			backend := &fakeSecret{version: 9, data: map[string][]byte{migrationEntry: []byte(`{"phase":"` + phase + `"}`)}}
			store, _ := testStore(backend)
			err := store.RequireCRDAuthority(t.Context())
			if (err == nil) != (phase == migrationActive) {
				t.Fatalf("phase %q: %v", phase, err)
			}
			if backend.version != 9 {
				t.Fatal("authorization process modified key authority")
			}
		})
	}
	store, _ := testStore(&fakeSecret{})
	if err := store.RequireCRDAuthority(t.Context()); err == nil {
		t.Fatal("authorization accepted missing authority marker")
	}
}
