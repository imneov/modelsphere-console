package server

import (
	"net/http"
	"time"

	"github.com/modelsphere/console/internal/iam"
)

type loginRecordView struct {
	Name      string `json:"name"`
	Time      string `json:"time"`
	User      string `json:"user"`
	Type      string `json:"type,omitempty"`
	Provider  string `json:"provider,omitempty"`
	SourceIP  string `json:"sourceIP,omitempty"`
	Success   bool   `json:"success"`
	Reason    string `json:"reason,omitempty"`
	UserAgent string `json:"userAgent,omitempty"`
}

func loginRecordToView(record *iam.LoginRecord) loginRecordView {
	return loginRecordView{
		Name:      record.Name,
		Time:      record.CreationTimestamp.Time.UTC().Format(time.RFC3339),
		User:      record.Labels[iam.UsernameLabel],
		Type:      record.Spec.Type,
		Provider:  record.Spec.Provider,
		SourceIP:  record.Spec.SourceIP,
		Success:   record.Spec.Success,
		Reason:    record.Spec.Reason,
		UserAgent: record.Spec.UserAgent,
	}
}

func (s *Server) handleListLoginRecords(w http.ResponseWriter, r *http.Request) {
	if !s.authorize(w, r, "list", "loginrecords", "") {
		return
	}
	records, err := s.store.ListLoginRecords(r.Context(), r.URL.Query().Get("user"))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := make([]loginRecordView, 0, len(records))
	for i := range records {
		out = append(out, loginRecordToView(&records[i]))
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": out})
}
