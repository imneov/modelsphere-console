package iam

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

const UsernameLabel = Group + "/username"

var LoginRecordsGVR = schema.GroupVersionResource{Group: Group, Version: Version, Resource: "loginrecords"}

type LoginRecordSpec struct {
	Type      string `json:"type,omitempty"`
	Provider  string `json:"provider,omitempty"`
	SourceIP  string `json:"sourceIP,omitempty"`
	Success   bool   `json:"success"`
	Reason    string `json:"reason,omitempty"`
	UserAgent string `json:"userAgent,omitempty"`
}

type LoginRecord struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`
	Spec              LoginRecordSpec `json:"spec,omitempty"`
}
