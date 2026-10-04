package server

import (
	"errors"
	"net/http"
	"strconv"

	apierrors "k8s.io/apimachinery/pkg/api/errors"

	"github.com/modelsphere/console/internal/cluster"
)

// Read-only workload views for the module pages: a release's events, its pods'
// containers and their logs. Authorized as console resources, not by the
// backend they describe, so a role can grant them on their own.
func (s *Server) mountWorkload(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/k8s/namespaces/{ns}/events", s.handleEvents)
	mux.HandleFunc("GET /api/k8s/namespaces/{ns}/pods", s.handlePods)
	mux.HandleFunc("GET /api/k8s/namespaces/{ns}/pods/{pod}", s.handlePod)
	mux.HandleFunc("GET /api/k8s/namespaces/{ns}/pods/{pod}/log", s.handlePodLog)
}

func (s *Server) handleEvents(w http.ResponseWriter, r *http.Request) {
	if !s.authorize(w, r, "list", "events", "") || !s.haveKube(w) {
		return
	}
	events, err := s.kube.Events(r.Context(), r.PathValue("ns"), r.URL.Query().Get("prefix"))
	if err != nil {
		writeKubeError(w, err)
		return
	}
	if events == nil {
		events = []cluster.Event{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": events})
}

func (s *Server) handlePods(w http.ResponseWriter, r *http.Request) {
	if !s.authorize(w, r, "list", "pods", "") || !s.haveKube(w) {
		return
	}
	pods, err := s.kube.Pods(r.Context(), r.PathValue("ns"), r.URL.Query().Get("prefix"))
	if err != nil {
		writeKubeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": pods})
}

func (s *Server) handlePod(w http.ResponseWriter, r *http.Request) {
	if !s.authorize(w, r, "get", "pods", "") || !s.haveKube(w) {
		return
	}
	pod, err := s.kube.Pod(r.Context(), r.PathValue("ns"), r.PathValue("pod"))
	if err != nil {
		writeKubeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, pod)
}

func (s *Server) handlePodLog(w http.ResponseWriter, r *http.Request) {
	if !s.authorize(w, r, "get", "pods/log", "") || !s.haveKube(w) {
		return
	}
	q := r.URL.Query()
	num := func(k string) (int64, bool) {
		v := q.Get(k)
		if v == "" {
			return 0, true
		}
		n, err := strconv.ParseInt(v, 10, 64)
		return n, err == nil && n >= 0
	}
	tail, ok1 := num("tailLines")
	since, ok2 := num("sinceSeconds")
	if !ok1 || !ok2 {
		writeError(w, http.StatusBadRequest, "tailLines and sinceSeconds must be non-negative integers")
		return
	}
	out, err := s.kube.PodLog(r.Context(), r.PathValue("ns"), r.PathValue("pod"), cluster.LogOptions{
		Container: q.Get("container"), TailLines: tail, SinceSeconds: since, Previous: q.Get("previous") == "true",
	})
	if err != nil {
		writeKubeError(w, err)
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write(out)
}

func (s *Server) haveKube(w http.ResponseWriter) bool {
	if s.kube == nil {
		writeError(w, http.StatusServiceUnavailable, "console has no cluster connection")
		return false
	}
	return true
}

// The cluster's answer, with its status: a pod that is gone is a 404 here too,
// and a 403 means console's own ServiceAccount lacks the grant (the chart's
// ClusterRole), not that the caller does.
func writeKubeError(w http.ResponseWriter, err error) {
	var status apierrors.APIStatus
	switch {
	case errors.Is(err, cluster.ErrNoClientset):
		writeError(w, http.StatusServiceUnavailable, err.Error())
	case errors.As(err, &status) && status.Status().Code != 0:
		code := int(status.Status().Code)
		if code == http.StatusForbidden {
			writeError(w, http.StatusBadGateway, "console's ServiceAccount may not read this: "+err.Error())
			return
		}
		writeError(w, code, err.Error())
	default:
		writeError(w, http.StatusBadGateway, err.Error())
	}
}
