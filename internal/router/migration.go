package router

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"slices"
)

type OwnerMapping struct {
	User         string `json:"user"`
	PrincipalUID string `json:"principalUID"`
}

func keySetHash(keys map[string]Key) (string, error) {
	normalized := make(map[string]Key, len(keys))
	for id, key := range keys {
		key.Models = slices.Clone(key.Models)
		slices.Sort(key.Models)
		normalized[id] = key
	}
	encoded, err := json.Marshal(normalized)
	if err != nil {
		return "", err
	}
	digest := sha256.Sum256(encoded)
	return hex.EncodeToString(digest[:]), nil
}

func (store *CRDStore) mappedKeys(keys map[string]Key, owners map[string]OwnerMapping, frozen bool) (map[string]Key, error) {
	mapped := make(map[string]Key, len(keys))
	if len(owners) != len(keys) {
		return nil, fmt.Errorf("%w: provide one explicit mapping for each legacy key", ErrBadInput)
	}
	for id, key := range keys {
		owner, exists := owners[id]
		if !exists || owner.User == "" || owner.PrincipalUID == "" {
			return nil, fmt.Errorf("%w: user and UID mapping missing for key %s", ErrBadInput, id)
		}
		uid := owner.PrincipalUID
		if !frozen {
			var err error
			uid, err = store.resolveOwner(owner.User, owner.PrincipalUID, true)
			if err != nil {
				return nil, err
			}
		}
		if len(id) != 2*idBytes || !isHex(id) || len(key.Hash) != 64 || !isHex(key.Hash) || len(key.Salt) != 2*saltBytes || !isHex(key.Salt) {
			return nil, fmt.Errorf("%w: invalid legacy credential metadata for key %s", ErrBadInput, id)
		}
		key.User, key.PrincipalKind, key.PrincipalUID, key.WalletID = owner.User, "User", uid, uid
		key.Creator, key.KeyMasked, key.From = key.CreatedBy, key.Masked(), "external"
		mapped[id] = key
	}
	return mapped, nil
}

func (store *CRDStore) validateStaged(ctx context.Context, mapped map[string]Key) error {
	staged, err := store.List(ctx)
	if err != nil {
		return err
	}
	for _, key := range staged {
		expected, found := mapped[key.ID]
		if !found {
			return fmt.Errorf("%w: target contains an independent key %s", ErrMigrationConflict, key.ID)
		}
		expectedHash, err := keySetHash(map[string]Key{key.ID: expected})
		if err != nil {
			return err
		}
		actualHash, err := keySetHash(map[string]Key{key.ID: key})
		if err != nil {
			return err
		}
		if actualHash != expectedHash {
			return fmt.Errorf("%w: staged key %s differs from the mapped legacy credential", ErrMigrationConflict, key.ID)
		}
	}
	return nil
}

func (store *CRDStore) Import(ctx context.Context, legacy *Store, owners map[string]OwnerMapping, operationID string) error {
	if operationID == "" || len(operationID) > 200 {
		return fmt.Errorf("%w: migration operationID is required", ErrBadInput)
	}
	source, _, marker, err := legacy.readSnapshot(ctx)
	if err != nil {
		return err
	}
	frozen := marker.OperationID == operationID && (marker.Phase == migrationFrozen || marker.Phase == migrationComplete)
	mapped, err := store.mappedKeys(source, owners, frozen)
	if err != nil {
		return err
	}
	if err := store.preflightImport(ctx, mapped); err != nil {
		return err
	}
	hash, err := keySetHash(mapped)
	if err != nil {
		return err
	}
	sourceHash, err := keySetHash(source)
	if err != nil {
		return err
	}
	if err := legacy.freezeMigration(ctx, operationID, hash, sourceHash); err != nil {
		return err
	}

	for _, key := range mapped {
		if err := store.put(ctx, key); err != nil && !errors.Is(err, ErrExists) {
			return fmt.Errorf("stage key %s: %w", key.ID, err)
		}
	}
	if err := store.verifyComplete(ctx, mapped); err != nil {
		return err
	}
	return legacy.changeMigration(ctx, func(marker migrationMarker) (migrationMarker, error) {
		if marker.OperationID != operationID || marker.ContentHash != hash || (marker.Phase != migrationFrozen && marker.Phase != migrationComplete) {
			return marker, ErrMigrationConflict
		}
		marker.Phase = migrationComplete
		return marker, nil
	})
}

func (legacy *Store) freezeMigration(ctx context.Context, operationID, hash, sourceHash string) error {
	return legacy.changeMigrationSnapshot(ctx, func(marker migrationMarker, data map[string][]byte) (migrationMarker, error) {
		keys := make(map[string]Key)
		for id, raw := range data {
			if id == migrationEntry {
				continue
			}
			var key Key
			if err := json.Unmarshal(raw, &key); err != nil || key.ID != id {
				return marker, fmt.Errorf("%w: invalid source entry %s", ErrMigrationConflict, id)
			}
			keys[id] = key
		}
		currentHash, err := keySetHash(keys)
		if err != nil {
			return marker, err
		}
		if currentHash != sourceHash {
			return marker, fmt.Errorf("%w: source changed; refresh mappings", ErrMigrationConflict)
		}
		if marker.Phase != "" && (marker.OperationID != operationID || marker.ContentHash != hash) {
			return marker, fmt.Errorf("%w: another durable migration operation owns the source", ErrMigrationConflict)
		}
		if marker.Phase != "" && marker.Phase != migrationFrozen && marker.Phase != migrationComplete {
			return marker, ErrMigrationConflict
		}
		if marker.Phase == migrationComplete {
			return marker, nil
		}
		marker = migrationMarker{Phase: migrationFrozen, OperationID: operationID, ContentHash: hash, SourceHash: sourceHash}
		return marker, nil
	})
}

func (store *CRDStore) verifyComplete(ctx context.Context, mapped map[string]Key) error {
	if err := store.validateStaged(ctx, mapped); err != nil {
		return err
	}
	staged, err := store.List(ctx)
	if err != nil {
		return err
	}
	if len(staged) != len(mapped) {
		return fmt.Errorf("%w: not all legacy credentials were staged", ErrMigrationConflict)
	}
	return nil
}

func (store *CRDStore) PrepareAuthority(ctx context.Context, legacy *Store) error {
	source, _, marker, err := legacy.readSnapshot(ctx)
	if err != nil {
		return err
	}
	if marker.Phase == migrationActive {
		return nil
	}
	if len(source) > 0 && marker.Phase != migrationComplete && marker.Phase != migrationActivating {
		return fmt.Errorf("%w: import and verify legacy keys before selecting CRD authority", ErrMigrationConflict)
	}
	if err := legacy.changeMigration(ctx, func(current migrationMarker) (migrationMarker, error) {
		if current.Phase == migrationActive {
			return current, nil
		}
		if len(source) > 0 && (current.ContentHash != marker.ContentHash || (current.Phase != migrationComplete && current.Phase != migrationActivating)) {
			return current, ErrMigrationConflict
		}
		if current.Phase == migrationFrozen {
			return current, ErrMigrationConflict
		}
		current.Phase = migrationActivating
		return current, nil
	}); err != nil {
		return err
	}
	if len(source) > 0 || marker.ContentHash != "" {
		if err := store.verifyActivation(ctx, source, marker.SourceHash, marker.ContentHash); err != nil {
			return err
		}
	}
	return legacy.changeMigration(ctx, func(current migrationMarker) (migrationMarker, error) {
		if current.Phase != migrationActivating && current.Phase != migrationActive {
			return current, ErrMigrationConflict
		}
		current.Phase = migrationActive
		return current, nil
	})
}

func (store *CRDStore) verifyActivation(ctx context.Context, source map[string]Key, sourceHash, hash string) error {
	currentHash, err := keySetHash(source)
	if err != nil {
		return err
	}
	if currentHash != sourceHash {
		return fmt.Errorf("%w: frozen source changed", ErrMigrationConflict)
	}
	target, err := store.List(ctx)
	if err != nil {
		return err
	}
	mapped := make(map[string]Key, len(target))
	for _, key := range target {
		mapped[key.ID] = key
	}
	targetHash, err := keySetHash(mapped)
	if err != nil {
		return err
	}
	if targetHash != hash || len(mapped) != len(source) {
		return fmt.Errorf("%w: staged credentials no longer match the verified migration", ErrMigrationConflict)
	}
	for id, original := range source {
		copied, found := mapped[id]
		if !found || original.Hash != copied.Hash || original.Salt != copied.Salt {
			return ErrMigrationConflict
		}
	}
	return nil
}

func (store *CRDStore) preflightImport(ctx context.Context, mapped map[string]Key) error {
	if err := store.validateStaged(ctx, mapped); err != nil {
		return err
	}
	for _, key := range mapped {
		err := store.createResource(ctx, key, metav1.CreateOptions{DryRun: []string{metav1.DryRunAll}})
		if errors.Is(err, ErrExists) {
			continue
		}
		if apierrors.IsInvalid(err) {
			return fmt.Errorf("%w: legacy key %s cannot be staged: %v", ErrBadInput, key.ID, err)
		}
		if err != nil {
			return fmt.Errorf("preflight legacy key %s: %w", key.ID, err)
		}
	}
	return nil
}
