package iam

import "strings"

// CanonicalUID preserves the origin identity of a distributed User.
func CanonicalUID(user *User) string {
	if user == nil || user.UID == "" || user.DeletionTimestamp != nil {
		return ""
	}
	labels := user.Labels
	distributed := false
	if _, exists := labels["karmada.io/managed"]; exists {
		distributed = true
	}
	for _, key := range []string{"resourcetemplate.karmada.io/uid", "work.karmada.io/name", "work.karmada.io/namespace"} {
		if _, exists := user.Annotations[key]; exists {
			distributed = true
		}
	}
	if !distributed {
		return string(user.UID)
	}
	if _, local := labels[Group+"/instance-local"]; local {
		return ""
	}
	origin := user.Annotations["resourcetemplate.karmada.io/uid"]
	if labels["karmada.io/managed"] != "true" || origin == "" || strings.ContainsAny(origin, " \t\r\n") {
		return ""
	}
	return origin
}
