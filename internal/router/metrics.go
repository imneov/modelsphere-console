package router

import "github.com/prometheus/client_golang/prometheus"

// Usage is observed, not stored: which key called what and when is a question
// for Prometheus, and answering it from the keys' Secret would put a write on the
// inference path.
type metrics struct {
	requests    *prometheus.CounterVec
	lastRequest *prometheus.GaugeVec
	rejected    *prometheus.CounterVec
}

func newMetrics(reg prometheus.Registerer) *metrics {
	m := &metrics{
		requests: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "router_requests_total",
			Help: "Requests forwarded for an API key, by the status the gateway answered. model is empty unless the answer was 2xx.",
		}, []string{"key_id", "key_name", "model", "code"}),
		lastRequest: prometheus.NewGaugeVec(prometheus.GaugeOpts{
			Name: "router_key_last_request_timestamp_seconds",
			Help: "When an API key last made a request that passed its key check.",
		}, []string{"key_id", "key_name"}),
		rejected: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "router_rejected_total",
			Help: "Requests the router answered itself instead of forwarding, by reason.",
		}, []string{"reason"}),
	}
	if reg != nil {
		reg.MustRegister(m.requests, m.lastRequest, m.rejected)
	}
	return m
}

// forget drops a deleted key's series.
func (m *metrics) forget(id string) {
	m.requests.DeletePartialMatch(prometheus.Labels{"key_id": id})
	m.lastRequest.DeletePartialMatch(prometheus.Labels{"key_id": id})
}
