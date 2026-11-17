package process

import (
	"context"
	"net"
	"net/http"
	"time"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/modelsphere/console/internal/billing"
)

func (runtime *Runtime) setJournal(journal *billing.Journal) {
	runtime.journalMu.Lock()
	runtime.journal = journal
	runtime.journalMu.Unlock()
}

func (runtime *Runtime) probe() {
	defer runtime.group.Done()
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		runtime.journalMu.RLock()
		journal := runtime.journal
		runtime.journalMu.RUnlock()
		probeContext, cancel := context.WithTimeout(runtime.ctx, 3*time.Second)
		runtime.Metrics.Probe(probeContext, runtime.Store, runtime.Queue, journal)
		cancel()
		select {
		case <-runtime.ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// ServeWorkerHealth exposes the worker's probes and metrics. Readiness waits for
// the database schema, not for settlement leadership: every replica is ready to
// work, and only one holds the lease.
func (runtime *Runtime) ServeWorkerHealth(address string) (*http.Server, error) {
	for _, collector := range []prometheus.Collector{collectors.NewGoCollector(), collectors.NewProcessCollector(collectors.ProcessCollectorOpts{})} {
		if err := runtime.Registry.Register(collector); err != nil {
			return nil, err
		}
	}
	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.HandlerFor(runtime.Registry, promhttp.HandlerOpts{}))
	mux.HandleFunc("GET /healthz", func(writer http.ResponseWriter, _ *http.Request) { writer.WriteHeader(http.StatusOK) })
	mux.HandleFunc("GET /readyz", func(writer http.ResponseWriter, _ *http.Request) {
		if runtime.Store != nil {
			select {
			case <-runtime.ready:
			default:
				http.Error(writer, "billing database initializing", http.StatusServiceUnavailable)
				return
			}
		}
		writer.WriteHeader(http.StatusOK)
	})
	listener, err := net.Listen("tcp", address)
	if err != nil {
		return nil, err
	}
	server := &http.Server{Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	go func() {
		if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
			runtime.Log.Error("billing monitor stopped", "err", err)
			runtime.cancel()
		}
	}()
	return server, nil
}
