package billing

import (
	"context"
	"fmt"
)

type Projection struct {
	OwnerUID string `json:"ownerUserID"`
	Revision int64  `json:"revision"`
	State    string `json:"state"`
}

func (store *Store) Projections(ctx context.Context, limit int) ([]Projection, error) {
	if limit < 1 {
		return nil, fmt.Errorf("projection limit must be positive")
	}
	rows, err := store.db.QueryContext(ctx, store.bind("SELECT owner_uid,revision,state FROM billing_projection WHERE revision>delivered_revision ORDER BY updated_at LIMIT ?"), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []Projection{}
	for rows.Next() {
		var projection Projection
		if err := rows.Scan(&projection.OwnerUID, &projection.Revision, &projection.State); err != nil {
			return nil, err
		}
		result = append(result, projection)
	}
	return result, rows.Err()
}

func (store *Store) LatestProjection(ctx context.Context, ownerUID string) (Projection, error) {
	projection := Projection{OwnerUID: ownerUID}
	err := store.db.QueryRowContext(ctx, store.bind("SELECT revision,state FROM billing_projection WHERE owner_uid=?"), ownerUID).Scan(&projection.Revision, &projection.State)
	return projection, err
}

func (store *Store) AckProjection(ctx context.Context, projection Projection) error {
	_, err := store.db.ExecContext(ctx, store.bind("UPDATE billing_projection SET delivered_revision=? WHERE owner_uid=? AND revision=?"), projection.Revision, projection.OwnerUID, projection.Revision)
	return err
}
