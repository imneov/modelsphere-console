package billing

import (
	"context"
	"database/sql"
	"time"

	"github.com/prometheus/client_golang/prometheus"
)

type Telemetry struct {
	operations   *prometheus.CounterVec
	durations    *prometheus.HistogramVec
	backlog      *prometheus.GaugeVec
	dependencies *prometheus.GaugeVec
}

func NewTelemetry(register prometheus.Registerer) (*Telemetry, error) {
	metrics := &Telemetry{
		operations:   prometheus.NewCounterVec(prometheus.CounterOpts{Name: "billing_operations_total", Help: "Billing operations by bounded stage and outcome."}, []string{"stage", "outcome"}),
		durations:    prometheus.NewHistogramVec(prometheus.HistogramOpts{Name: "billing_duration_seconds", Help: "Billing stage duration or delivery lag.", Buckets: []float64{.0001, .0005, .001, .005, .01, .05, .1, .5, 1, 5, 10, 30, 60, 300}}, []string{"stage"}),
		backlog:      prometheus.NewGaugeVec(prometheus.GaugeOpts{Name: "billing_backlog", Help: "Unresolved work, bytes, or oldest age by bounded stage."}, []string{"stage"}),
		dependencies: prometheus.NewGaugeVec(prometheus.GaugeOpts{Name: "billing_dependency_up", Help: "Last telemetry probe success by dependency."}, []string{"dependency"}),
	}
	for _, collector := range []prometheus.Collector{metrics.operations, metrics.durations, metrics.backlog, metrics.dependencies} {
		if err := register.Register(collector); err != nil {
			return nil, err
		}
	}
	return metrics, nil
}

func (metrics *Telemetry) observe(stage string, started time.Time, err error) {
	if metrics == nil {
		return
	}
	outcome := "success"
	if err != nil {
		outcome = "error"
	}
	metrics.operations.WithLabelValues(stage, outcome).Inc()
	metrics.durations.WithLabelValues(stage).Observe(time.Since(started).Seconds())
}

func (metrics *Telemetry) record(stage, outcome string) {
	if metrics != nil {
		metrics.operations.WithLabelValues(stage, outcome).Inc()
	}
}

func (metrics *Telemetry) Probe(ctx context.Context, store *Store, queue EventQueue, journal *Journal) {
	if store != nil {
		err := metrics.probeStore(ctx, store)
		metrics.dependency("postgres", err)
	}
	if queue != nil {
		health, err := queue.Health(ctx)
		metrics.dependency("queue", err)
		if err == nil {
			for stage, value := range map[string]int64{"queue_length": health.Queued, "queue_pending": health.Pending, "dead_letters": health.DeadLetters} {
				metrics.backlog.WithLabelValues(stage).Set(float64(value))
			}
		}
	}
	if journal != nil {
		metrics.backlog.WithLabelValues("journal_bytes").Set(float64(journal.Bytes()))
		pending, err := journal.PendingBytes()
		if err == nil {
			metrics.backlog.WithLabelValues("journal_pending_bytes").Set(float64(pending))
		}
		free, err := journal.FreeBytes()
		metrics.dependency("journal_disk", err)
		if err == nil {
			metrics.backlog.WithLabelValues("journal_free_bytes").Set(float64(free))
		}
	}
}

func (metrics *Telemetry) dependency(name string, err error) {
	value := 1.
	if err != nil {
		value = 0
	}
	metrics.dependencies.WithLabelValues(name).Set(value)
}

func (metrics *Telemetry) probeStore(ctx context.Context, store *Store) error {
	queries := map[string]string{
		"start_only":          "SELECT COUNT(*) FROM billing_requests WHERE terminal_at IS NULL",
		"missing_usage":       "SELECT COUNT(*) FROM billing_requests WHERE terminal_at IS NOT NULL AND complete=0",
		"missing_price":       "SELECT COUNT(*) FROM billing_requests WHERE pricing_error<>''",
		"pending_charges":     "SELECT COUNT(*) FROM billing_charges WHERE state='pending'",
		"pending_projections": "SELECT COUNT(*) FROM billing_projection WHERE delivered_revision<revision",
	}
	for stage, query := range queries {
		var value int64
		if err := store.db.QueryRowContext(ctx, query).Scan(&value); err != nil {
			return err
		}
		metrics.backlog.WithLabelValues(stage).Set(float64(value))
	}
	if store.dialect == "postgres" {
		var walBytes float64
		err := store.db.QueryRowContext(ctx, "SELECT pg_wal_lsn_diff(pg_current_wal_lsn(),'0/0')::double precision").Scan(&walBytes)
		metrics.dependency("postgres_wal_probe", err)
		if err == nil {
			metrics.backlog.WithLabelValues("postgres_wal_position_bytes").Set(walBytes)
		}
	}
	return metrics.probeAges(ctx, store)
}

func (metrics *Telemetry) probeAges(ctx context.Context, store *Store) error {
	for stage, query := range map[string]string{
		"settlement_oldest_seconds": "SELECT MIN(created_at) FROM billing_charges WHERE state='pending'",
		"projection_oldest_seconds": "SELECT MIN(updated_at) FROM billing_projection WHERE delivered_revision<revision",
	} {
		var oldest sql.NullInt64
		if err := store.db.QueryRowContext(ctx, query).Scan(&oldest); err != nil {
			return err
		}
		age := 0.
		if oldest.Valid {
			age = max(0, time.Since(time.Unix(0, oldest.Int64)).Seconds())
		}
		metrics.backlog.WithLabelValues(stage).Set(age)
	}
	return nil
}
