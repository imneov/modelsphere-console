// Package iam is consoled's identity kernel: the User/Role/RoleBinding types,
// their storage as iam.theriseunion.io CRDs, password verification, and HS256
// token minting and verification.
//
// The types and token format are a deliberate subset of Rise Global's, kept
// byte-compatible so a community install can be upgraded to Global by sharing
// the signing secret and pointing at Global's apiserver -- no data migration.
package iam

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// Group/version, identical to Global.
const (
	Group                          = "iam.theriseunion.io"
	Version                        = "v1alpha1"
	RequirePasswordResetAnnotation = Group + "/require-password-reset"
)

// GroupVersion resources the dynamic client operates on.
var (
	UsersGVR        = schema.GroupVersionResource{Group: Group, Version: Version, Resource: "users"}
	RolesGVR        = schema.GroupVersionResource{Group: Group, Version: Version, Resource: "iamroles"}
	RoleBindingsGVR = schema.GroupVersionResource{Group: Group, Version: Version, Resource: "iamrolebindings"}
)

// UserState is the user lifecycle state. An empty state is treated as active.
type UserState string

const (
	UserActive   UserState = "Active"
	UserPending  UserState = "Pending"
	UserDisabled UserState = "Disabled"
)

type UserSpec struct {
	Email       string   `json:"email,omitempty"`
	DisplayName string   `json:"displayName,omitempty"`
	Description string   `json:"description,omitempty"`
	Groups      []string `json:"groups,omitempty"`
	// EncryptedPassword is a bcrypt hash. Write-only: never serialised back to
	// API clients (see handler responses, which strip it).
	EncryptedPassword string `json:"encryptedPassword,omitempty"`
	Lang              string `json:"lang,omitempty"`
}

type UserStatus struct {
	State         UserState    `json:"state,omitempty"`
	LastLoginTime *metav1.Time `json:"lastLoginTime,omitempty"`
	Reason        string       `json:"reason,omitempty"`
}

type User struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`
	Spec              UserSpec   `json:"spec,omitempty"`
	Status            UserStatus `json:"status,omitempty"`
}

func (u *User) RequiresPasswordReset() bool {
	return u != nil && u.Annotations[RequirePasswordResetAnnotation] == "true"
}

// realUserGroups is the group set stamped into a token: the user's declared
// groups plus system:authenticated, exactly as Global computes it.
func realUserGroups(u *User) []string {
	groups := make([]string, 0, len(u.Spec.Groups)+1)
	groups = append(groups, u.Spec.Groups...)
	for _, g := range groups {
		if g == "system:authenticated" {
			return groups
		}
	}
	return append(groups, "system:authenticated")
}
