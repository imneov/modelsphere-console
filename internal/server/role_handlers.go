package server

import (
	"encoding/json"
	"net/http"

	rbacv1 "k8s.io/api/rbac/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/modelsphere/console/internal/iam"
)

type roleView struct {
	Name          string              `json:"name"`
	Rules         []rbacv1.PolicyRule `json:"rules"`
	UIPermissions []string            `json:"uiPermissions,omitempty"`
}

type roleInput struct {
	Name          string              `json:"name"`
	Rules         []rbacv1.PolicyRule `json:"rules"`
	UIPermissions []string            `json:"uiPermissions"`
}

func roleToView(r *iam.IAMRole) roleView {
	return roleView{Name: r.Name, Rules: r.Spec.Rules, UIPermissions: r.Spec.UIPermissions}
}

func (s *Server) handleListRoles(w http.ResponseWriter, r *http.Request) {
	if !s.authorize(w, r, "list", "iamroles", "") {
		return
	}
	roles, err := s.store.ListRoles(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := make([]roleView, 0, len(roles))
	for i := range roles {
		out = append(out, roleToView(&roles[i]))
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": out})
}

func (s *Server) handleGetRole(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !s.authorize(w, r, "get", "iamroles", name) {
		return
	}
	role, err := s.store.GetRole(r.Context(), name)
	if err != nil {
		writeError(w, http.StatusNotFound, "role not found")
		return
	}
	writeJSON(w, http.StatusOK, roleToView(role))
}

func (s *Server) handleCreateRole(w http.ResponseWriter, r *http.Request) {
	if !s.authorize(w, r, "create", "iamroles", "") {
		return
	}
	var in roleInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	role := &iam.IAMRole{
		ObjectMeta: metav1.ObjectMeta{Name: in.Name},
		Spec:       iam.IAMRoleSpec{Rules: in.Rules, UIPermissions: in.UIPermissions},
	}
	created, err := s.store.CreateRole(r.Context(), role)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, roleToView(created))
}

func (s *Server) handleUpdateRole(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !s.authorize(w, r, "update", "iamroles", name) {
		return
	}
	var in roleInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	role, err := s.store.GetRole(r.Context(), name)
	if err != nil {
		writeError(w, http.StatusNotFound, "role not found")
		return
	}
	role.Spec.Rules = in.Rules
	role.Spec.UIPermissions = in.UIPermissions
	updated, err := s.store.UpdateRole(r.Context(), role)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, roleToView(updated))
}

func (s *Server) handleDeleteRole(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !s.authorize(w, r, "delete", "iamroles", name) {
		return
	}
	if err := s.store.DeleteRole(r.Context(), name); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type bindingView struct {
	Name     string           `json:"name"`
	Role     string           `json:"role"`
	Subjects []rbacv1.Subject `json:"subjects"`
}

type bindingInput struct {
	Name     string           `json:"name"`
	Role     string           `json:"role"`
	Subjects []rbacv1.Subject `json:"subjects"`
}

func bindingToView(b *iam.IAMRoleBinding) bindingView {
	return bindingView{Name: b.Name, Role: b.Spec.RoleRef.Name, Subjects: b.Spec.Subjects}
}

func (s *Server) handleListRoleBindings(w http.ResponseWriter, r *http.Request) {
	if !s.authorize(w, r, "list", "iamrolebindings", "") {
		return
	}
	bindings, err := s.store.ListRoleBindings(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := make([]bindingView, 0, len(bindings))
	for i := range bindings {
		out = append(out, bindingToView(&bindings[i]))
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": out})
}

func (s *Server) handleCreateRoleBinding(w http.ResponseWriter, r *http.Request) {
	if !s.authorize(w, r, "create", "iamrolebindings", "") {
		return
	}
	var in bindingInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Name == "" || in.Role == "" {
		writeError(w, http.StatusBadRequest, "name and role are required")
		return
	}
	b := &iam.IAMRoleBinding{
		ObjectMeta: metav1.ObjectMeta{Name: in.Name},
		Spec: iam.IAMRoleBindingSpec{
			Subjects: in.Subjects,
			RoleRef: rbacv1.RoleRef{
				APIGroup: iam.Group,
				Kind:     "IAMRole",
				Name:     in.Role,
			},
		},
	}
	created, err := s.store.CreateRoleBinding(r.Context(), b)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, bindingToView(created))
}

func (s *Server) handleDeleteRoleBinding(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if !s.authorize(w, r, "delete", "iamrolebindings", name) {
		return
	}
	if err := s.store.DeleteRoleBinding(r.Context(), name); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
