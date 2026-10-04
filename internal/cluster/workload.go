package cluster

import (
	"context"
	"errors"
	"sort"
	"strings"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// ErrNoClientset is returned by the workload reads on a Kube built without one.
var ErrNoClientset = errors.New("no Kubernetes clientset configured")

const (
	maxEvents     = 500
	DefaultTail   = int64(500)
	MaxTail       = int64(5000)
	maxLogBytes   = int64(2 << 20)
	eventPageSize = 1000
)

type Event struct {
	Type           string    `json:"type"`
	Reason         string    `json:"reason"`
	Message        string    `json:"message"`
	Count          int32     `json:"count"`
	FirstTimestamp time.Time `json:"firstTimestamp,omitzero"`
	LastTimestamp  time.Time `json:"lastTimestamp,omitzero"`
	Kind           string    `json:"kind"`
	Name           string    `json:"name"`
	Source         string    `json:"source,omitempty"`
}

type Container struct {
	Name         string `json:"name"`
	Init         bool   `json:"init,omitempty"`
	Ready        bool   `json:"ready"`
	RestartCount int32  `json:"restartCount"`
	// running, waiting or terminated, with the kubelet's reason when it gave one.
	State  string `json:"state"`
	Reason string `json:"reason,omitempty"`
}

type PodInfo struct {
	Name       string      `json:"name"`
	Phase      string      `json:"phase"`
	Node       string      `json:"node,omitempty"`
	Containers []Container `json:"containers"`
}

// Events in a namespace whose object is prefix or is named after it
// ("<prefix>-..."): a release's Deployment, ReplicaSets and Pods. Newest first.
// An empty prefix keeps them all.
func (k *Kube) Events(ctx context.Context, namespace, prefix string) ([]Event, error) {
	if k.typed == nil {
		return nil, ErrNoClientset
	}
	var out []Event
	opts := metav1.ListOptions{Limit: eventPageSize}
	for {
		list, err := k.typed.CoreV1().Events(namespace).List(ctx, opts)
		if err != nil {
			return nil, err
		}
		for i := range list.Items {
			if e := &list.Items[i]; ownedBy(e.InvolvedObject.Name, prefix) {
				out = append(out, toEvent(e))
			}
		}
		if list.Continue == "" {
			break
		}
		opts.Continue = list.Continue
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].LastTimestamp.After(out[j].LastTimestamp) })
	if len(out) > maxEvents {
		out = out[:maxEvents]
	}
	return out, nil
}

func ownedBy(name, prefix string) bool {
	return prefix == "" || name == prefix || strings.HasPrefix(name, prefix+"-")
}

// Events written through events.k8s.io leave the core timestamps empty and
// carry eventTime and a series instead.
func toEvent(e *corev1.Event) Event {
	first, last, count := e.FirstTimestamp.Time, e.LastTimestamp.Time, e.Count
	if e.Series != nil {
		last = e.Series.LastObservedTime.Time
		count = e.Series.Count
	}
	if first.IsZero() {
		first = e.EventTime.Time
	}
	if last.IsZero() {
		last = first
	}
	if count == 0 {
		count = 1
	}
	source := e.Source.Component
	if source == "" {
		source = e.ReportingController
	}
	return Event{
		Type: e.Type, Reason: e.Reason, Message: e.Message, Count: count,
		FirstTimestamp: first, LastTimestamp: last,
		Kind: e.InvolvedObject.Kind, Name: e.InvolvedObject.Name, Source: source,
	}
}

func (k *Kube) Pod(ctx context.Context, namespace, name string) (*PodInfo, error) {
	if k.typed == nil {
		return nil, ErrNoClientset
	}
	pod, err := k.typed.CoreV1().Pods(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}
	return podInfo(pod), nil
}

// Pods in a namespace named after prefix, as Events matches objects: every pod
// of a release, the ones swissd's status does not list (the cart's) included.
func (k *Kube) Pods(ctx context.Context, namespace, prefix string) ([]PodInfo, error) {
	if k.typed == nil {
		return nil, ErrNoClientset
	}
	list, err := k.typed.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	out := []PodInfo{}
	for i := range list.Items {
		if ownedBy(list.Items[i].Name, prefix) {
			out = append(out, *podInfo(&list.Items[i]))
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

func podInfo(pod *corev1.Pod) *PodInfo {
	info := &PodInfo{Name: pod.Name, Phase: string(pod.Status.Phase), Node: pod.Spec.NodeName}
	statuses := map[string]corev1.ContainerStatus{}
	for _, cs := range append(pod.Status.InitContainerStatuses, pod.Status.ContainerStatuses...) {
		statuses[cs.Name] = cs
	}
	add := func(c corev1.Container, init bool) {
		cs := statuses[c.Name]
		state, reason := "waiting", ""
		switch {
		case cs.State.Running != nil:
			state = "running"
		case cs.State.Terminated != nil:
			state, reason = "terminated", cs.State.Terminated.Reason
		case cs.State.Waiting != nil:
			reason = cs.State.Waiting.Reason
		}
		info.Containers = append(info.Containers, Container{Name: c.Name, Init: init, Ready: cs.Ready, RestartCount: cs.RestartCount, State: state, Reason: reason})
	}
	for _, c := range pod.Spec.InitContainers {
		add(c, true)
	}
	for _, c := range pod.Spec.Containers {
		add(c, false)
	}
	return info
}

type LogOptions struct {
	Container    string
	TailLines    int64
	SinceSeconds int64
	Previous     bool
}

// PodLog reads the tail of one container's log, capped in lines and bytes so a
// chatty engine cannot fill the console's memory.
func (k *Kube) PodLog(ctx context.Context, namespace, pod string, o LogOptions) ([]byte, error) {
	if k.typed == nil {
		return nil, ErrNoClientset
	}
	tail := o.TailLines
	if tail <= 0 {
		tail = DefaultTail
	}
	tail = min(tail, MaxTail)
	limit := maxLogBytes
	opts := &corev1.PodLogOptions{Container: o.Container, TailLines: &tail, Previous: o.Previous, Timestamps: true, LimitBytes: &limit}
	if o.SinceSeconds > 0 {
		opts.SinceSeconds = &o.SinceSeconds
	}
	return k.typed.CoreV1().Pods(namespace).GetLogs(pod, opts).DoRaw(ctx)
}
