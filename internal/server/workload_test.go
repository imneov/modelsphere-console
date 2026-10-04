package server

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/kubernetes/fake"

	"github.com/modelsphere/console/internal/cluster"
)

func event(name, involved string, last time.Time) *corev1.Event {
	return &corev1.Event{
		ObjectMeta:     metav1.ObjectMeta{Name: name, Namespace: "ai"},
		InvolvedObject: corev1.ObjectReference{Kind: "Pod", Name: involved},
		Type:           corev1.EventTypeWarning,
		Reason:         "FailedScheduling",
		Message:        "0/1 nodes are available",
		Count:          3,
		LastTimestamp:  metav1.NewTime(last),
		Source:         corev1.EventSource{Component: "default-scheduler"},
	}
}

func workloadServer(t *testing.T, objs ...runtime.Object) http.Handler {
	t.Helper()
	srv := testServer(t)
	srv.kube.WithTyped(fake.NewSimpleClientset(objs...))
	return srv.Handler()
}

func TestEventsByRelease(t *testing.T) {
	t0 := time.Date(2026, 10, 4, 1, 0, 0, 0, time.UTC)
	series := event("e5", "qwen-7d9f-x", time.Time{})
	series.Count = 0
	series.EventTime = metav1.NewMicroTime(t0.Add(time.Minute))
	series.Series = &corev1.EventSeries{Count: 9, LastObservedTime: metav1.NewMicroTime(t0.Add(5 * time.Minute))}
	h := workloadServer(t,
		event("e1", "qwen", t0),
		event("e2", "qwen-7d9f", t0.Add(2*time.Minute)),
		event("e3", "qwenx-1", t0),
		event("e4", "other", t0),
		series,
	)
	tok := login(t, h, "admin", "admin-pw")
	rec := do(h, "GET", "/api/k8s/namespaces/ai/events?prefix=qwen", tok, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	var got struct{ Items []cluster.Event }
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, e := range got.Items {
		names = append(names, e.Name)
	}
	if want := []string{"qwen-7d9f-x", "qwen-7d9f", "qwen"}; !equal(names, want) {
		t.Fatalf("names %v, want %v", names, want)
	}
	if s := got.Items[0]; s.Count != 9 || !s.FirstTimestamp.Equal(t0.Add(time.Minute)) {
		t.Fatalf("series event read as count %d first %v", s.Count, s.FirstTimestamp)
	}
	if got.Items[1].Source != "default-scheduler" {
		t.Fatalf("source %q", got.Items[1].Source)
	}
}

func TestWorkloadNeedsGrant(t *testing.T) {
	h := workloadServer(t)
	tok := login(t, h, "bob", "bob-pw")
	for _, path := range []string{"/api/k8s/namespaces/ai/events", "/api/k8s/namespaces/ai/pods/p", "/api/k8s/namespaces/ai/pods/p/log"} {
		if rec := do(h, "GET", path, tok, ""); rec.Code != http.StatusForbidden {
			t.Errorf("%s: status %d, want 403", path, rec.Code)
		}
	}
}

func TestPodContainers(t *testing.T) {
	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "qwen-7d9f-x", Namespace: "ai"},
		Spec: corev1.PodSpec{
			NodeName:       "n1",
			InitContainers: []corev1.Container{{Name: "fetch"}},
			Containers:     []corev1.Container{{Name: "engine"}, {Name: "sidecar"}},
		},
		Status: corev1.PodStatus{
			Phase:                 corev1.PodPending,
			InitContainerStatuses: []corev1.ContainerStatus{{Name: "fetch", State: corev1.ContainerState{Terminated: &corev1.ContainerStateTerminated{Reason: "Completed"}}}},
			ContainerStatuses: []corev1.ContainerStatus{
				{Name: "engine", RestartCount: 2, State: corev1.ContainerState{Waiting: &corev1.ContainerStateWaiting{Reason: "CrashLoopBackOff"}}},
				{Name: "sidecar", Ready: true, State: corev1.ContainerState{Running: &corev1.ContainerStateRunning{}}},
			},
		},
	}
	h := workloadServer(t, pod)
	tok := login(t, h, "admin", "admin-pw")
	rec := do(h, "GET", "/api/k8s/namespaces/ai/pods/qwen-7d9f-x", tok, "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	var got cluster.PodInfo
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	want := []cluster.Container{
		{Name: "fetch", Init: true, State: "terminated", Reason: "Completed"},
		{Name: "engine", RestartCount: 2, State: "waiting", Reason: "CrashLoopBackOff"},
		{Name: "sidecar", Ready: true, State: "running"},
	}
	if got.Node != "n1" || len(got.Containers) != 3 {
		t.Fatalf("got %+v", got)
	}
	for i := range want {
		if got.Containers[i] != want[i] {
			t.Errorf("container %d: %+v, want %+v", i, got.Containers[i], want[i])
		}
	}
	if rec := do(h, "GET", "/api/k8s/namespaces/ai/pods/gone", tok, ""); rec.Code != http.StatusNotFound {
		t.Fatalf("missing pod: status %d", rec.Code)
	}
}

func TestPodLog(t *testing.T) {
	h := workloadServer(t, &corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "p", Namespace: "ai"}})
	tok := login(t, h, "admin", "admin-pw")
	rec := do(h, "GET", "/api/k8s/namespaces/ai/pods/p/log?container=engine&tailLines=100", tok, "")
	if rec.Code != http.StatusOK || rec.Body.String() != "fake logs" {
		t.Fatalf("status %d body %q", rec.Code, rec.Body)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "text/plain; charset=utf-8" {
		t.Fatalf("content type %q", ct)
	}
	if rec := do(h, "GET", "/api/k8s/namespaces/ai/pods/p/log?tailLines=-1", tok, ""); rec.Code != http.StatusBadRequest {
		t.Fatalf("negative tail: status %d", rec.Code)
	}
}

func TestWorkloadWithoutClientset(t *testing.T) {
	h := testServer(t).Handler()
	tok := login(t, h, "admin", "admin-pw")
	if rec := do(h, "GET", "/api/k8s/namespaces/ai/events", tok, ""); rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status %d", rec.Code)
	}
}

func equal(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
