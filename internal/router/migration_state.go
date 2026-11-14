package router

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync/atomic"

	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/client-go/util/retry"
)

const migrationEntry = "migration-state"
const migrationFrozen = "frozen"
const migrationComplete = "complete"
const migrationActive = "activated"
const migrationActivating = "activating"

var ErrMigrationFrozen = errors.New("legacy key writes are frozen for migration")
var ErrMigrationConflict = errors.New("key migration conflicts with the current authority")

type migrationMarker struct {
	Phase       string `json:"phase"`
	OperationID string `json:"operationID,omitempty"`
	ContentHash string `json:"contentHash,omitempty"`
	SourceHash  string `json:"sourceHash,omitempty"`
}

func (marker migrationMarker) code() uint32 {
	switch marker.Phase {
	case "":
		return 0
	case migrationFrozen:
		return 1
	case migrationComplete:
		return 2
	case migrationActive:
		return 3
	case migrationActivating:
		return 4
	default:
		return 6
	}
}

func migrationRetired(state *atomic.Uint32) bool { code := state.Load(); return code == 3 || code == 4 }

func (s *Store) readSnapshot(ctx context.Context) (map[string]Key, *string, migrationMarker, error) {
	data, rv, err := s.b.SecretVersioned(ctx, s.namespace, s.name)
	if apierrors.IsNotFound(err) {
		return map[string]Key{}, nil, migrationMarker{}, nil
	}
	if err != nil {
		return nil, nil, migrationMarker{}, fmt.Errorf("read api keys %s: %w", s.Ref(), err)
	}
	marker, err := decodeMarker(data[migrationEntry])
	if err != nil {
		return nil, nil, marker, err
	}
	keys := make(map[string]Key, len(data))
	for id, raw := range data {
		if id == migrationEntry {
			continue
		}
		var key Key
		if err := json.Unmarshal(raw, &key); err != nil || key.ID != id {
			s.log.Warn("api key entry skipped: not a key this console wrote", "secret", s.Ref(), "entry", id)
			continue
		}
		keys[id] = key
	}
	s.migrationState.Store(marker.code())
	return keys, &rv, marker, nil
}

func decodeMarker(raw []byte) (migrationMarker, error) {
	if len(raw) == 0 {
		return migrationMarker{}, nil
	}
	var marker migrationMarker
	if err := json.Unmarshal(raw, &marker); err != nil {
		return marker, errors.New("invalid key migration state")
	}
	if marker.code() == 6 {
		return marker, errors.New("unknown key migration phase")
	}
	return marker, nil
}

func (s *Store) changeMigration(ctx context.Context, change func(migrationMarker) (migrationMarker, error)) error {
	return s.changeMigrationSnapshot(ctx, func(marker migrationMarker, _ map[string][]byte) (migrationMarker, error) { return change(marker) })
}

func (s *Store) changeMigrationSnapshot(ctx context.Context, change func(migrationMarker, map[string][]byte) (migrationMarker, error)) error {
	return retry.OnError(retry.DefaultRetry, func(err error) bool { return apierrors.IsConflict(err) || apierrors.IsAlreadyExists(err) }, func() error {
		data, version, err := s.b.SecretVersioned(ctx, s.namespace, s.name)
		create := apierrors.IsNotFound(err)
		if err != nil && !create {
			return err
		}
		if create {
			data = map[string][]byte{}
		}
		old, err := decodeMarker(data[migrationEntry])
		if err != nil {
			return err
		}
		next, err := change(old, data)
		if err != nil {
			return err
		}
		if next.Phase == "" {
			delete(data, migrationEntry)
		} else {
			encoded, err := json.Marshal(next)
			if err != nil {
				return err
			}
			data[migrationEntry] = encoded
		}
		if err := s.b.WriteSecret(ctx, s.namespace, s.name, data, create, version); err != nil {
			return err
		}
		s.migrationState.Store(next.code())
		return nil
	})
}

func (s *Store) CheckAuthority(ctx context.Context) error {
	_, _, marker, err := s.readSnapshot(ctx)
	if err != nil {
		return err
	}
	if marker.Phase == migrationActive || marker.Phase == migrationActivating {
		return fmt.Errorf("%w: legacy authority retired; retain CRD keySource", ErrMigrationConflict)
	}
	return nil
}
