package iam

import "errors"

func ResolveSession(identity *Identity, user *User) (*Identity, error) {
	if identity == nil || user == nil || identity.Name != user.Name {
		return nil, errors.New("session identity does not match User")
	}
	uid := CanonicalUID(user)
	if uid == "" || (user.Status.State != "" && user.Status.State != UserActive) {
		return nil, errors.New("session User is inactive or unresolved")
	}
	if identity.PrincipalUID != "" {
		if identity.PrincipalUID != uid {
			return nil, errors.New("session belongs to a previous User identity")
		}
	} else if identity.IssuedAt.IsZero() || user.CreationTimestamp.IsZero() || identity.IssuedAt.Unix() <= user.CreationTimestamp.Unix() {
		return nil, errors.New("session identity cannot be bound; sign in again")
	}
	resolved := *identity
	resolved.PrincipalUID = uid
	resolved.Groups = realUserGroups(user)
	resolved.Email = user.Spec.Email
	return &resolved, nil
}
