package iam

import (
	"context"
	"sort"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/apimachinery/pkg/runtime"
)

func (s *Store) CreateLoginRecord(ctx context.Context, username string, spec LoginRecordSpec) (*LoginRecord, error) {
	record := &LoginRecord{
		TypeMeta: metav1.TypeMeta{APIVersion: Group + "/" + Version, Kind: "LoginRecord"},
		ObjectMeta: metav1.ObjectMeta{
			GenerateName: "loginrecord-",
			Labels:       map[string]string{UsernameLabel: username},
		},
		Spec: spec,
	}
	obj, err := runtime.DefaultUnstructuredConverter.ToUnstructured(record)
	if err != nil {
		return nil, err
	}
	created, err := s.dyn.Resource(LoginRecordsGVR).Create(ctx, &unstructured.Unstructured{Object: obj}, metav1.CreateOptions{})
	if err != nil {
		return nil, err
	}
	var out LoginRecord
	return &out, decodeInto(created, &out)
}

func (s *Store) ListLoginRecords(ctx context.Context, user string) ([]LoginRecord, error) {
	opts := metav1.ListOptions{}
	if user != "" {
		opts.LabelSelector = labels.Set{UsernameLabel: user}.AsSelector().String()
	}
	list, err := s.dyn.Resource(LoginRecordsGVR).List(ctx, opts)
	if err != nil {
		return nil, err
	}
	out := make([]LoginRecord, len(list.Items))
	for i := range list.Items {
		if err := decodeInto(&list.Items[i], &out[i]); err != nil {
			return nil, err
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		return out[i].CreationTimestamp.After(out[j].CreationTimestamp.Time)
	})
	return out, nil
}
