package server

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/modelsphere/console/internal/billing"
	"github.com/modelsphere/console/internal/iam"
)

func (s *Server) EnableBilling(service *billing.Service) error {
	if service == nil || service.Store == nil || service.Meter == nil || service.Client == nil || service.Namespace == "" || service.Currency == "" || s.router == nil {
		return errors.New("billing requires its store, metering, Kubernetes client, namespace, currency and CRD router")
	}
	if err := s.router.EnforceBilling(true); err != nil {
		return err
	}
	s.billing = service
	s.SetMetering(service.Meter)
	return nil
}

func (s *Server) mountBilling(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/billing/wallet/rebuild", s.handleRebuildWallet)
	mux.HandleFunc("GET /api/billing/wallet", s.handleBillingWallet)
	mux.HandleFunc("GET /api/billing/wallet/reconciliation", s.handleBillingReconciliation)
	mux.HandleFunc("GET /api/billing/admin/customers", s.handleBillingCustomers)
	mux.HandleFunc("GET /api/billing/ledger", s.handleBillingLedger)
	mux.HandleFunc("GET /api/billing/ledger/summary", s.handleLedgerSummary)
	mux.HandleFunc("GET /api/billing/usage", s.handleBillingUsage)
	mux.HandleFunc("GET /api/billing/usage/summary", s.handleUsageSummary)
	mux.HandleFunc("GET /api/billing/usage/{id}", s.handleBillingUsage)
	mux.HandleFunc("POST /api/billing/usage/{id}/reconcile", s.handleUsageReconciliation)
	mux.HandleFunc("POST /api/billing/credits", s.handleBillingCredit)
	mux.HandleFunc("GET /api/billing/users", s.handleBillingUsers)
	mux.HandleFunc("GET /api/billing/prices/history", s.handlePriceHistory)
	mux.HandleFunc("GET /api/billing/prices", s.handleBillingPrices)
	mux.HandleFunc("PUT /api/billing/prices", s.handlePublishPrice)
	mux.HandleFunc("GET /api/billing/recovery/deadletters", s.handleDeadLetters)
	mux.HandleFunc("POST /api/billing/recovery/deadletters/{id}/replay", s.handleReplayDeadLetter)
	mux.HandleFunc("GET /api/billing/runtime", s.handleBillingRuntime)
}

func (s *Server) billingOwner(writer http.ResponseWriter, request *http.Request) (string, bool) {
	identity := identityFrom(request.Context())
	if identity == nil {
		writeError(writer, http.StatusUnauthorized, "unauthenticated")
		return "", false
	}
	user, err := s.store.GetUser(request.Context(), identity.Name)
	if err != nil {
		writeError(writer, http.StatusUnauthorized, "user identity unavailable")
		return "", false
	}
	ownUID := iam.CanonicalUID(user)
	if identity.PrincipalUID != "" && identity.PrincipalUID != ownUID {
		writeError(writer, http.StatusUnauthorized, "session belongs to a previous user identity")
		return "", false
	}
	if ownUID == "" {
		writeError(writer, http.StatusForbidden, "user identity unresolved")
		return "", false
	}
	selected := request.URL.Query().Get("ownerUserID")
	if selected == "" || selected == ownUID {
		return ownUID, true
	}
	if len(selected) > 512 || strings.TrimSpace(selected) != selected {
		writeError(writer, http.StatusBadRequest, "invalid owner identity")
		return "", false
	}
	if !s.authorize(writer, request, "get", "billingaccounts", selected) {
		return "", false
	}
	return selected, true
}

func (s *Server) billingFilter(writer http.ResponseWriter, request *http.Request) (billing.Filter, bool) {
	owner, ok := s.billingOwner(writer, request)
	if !ok {
		return billing.Filter{}, false
	}
	filter := billing.Filter{OwnerUID: owner, Model: request.URL.Query().Get("model"), APIKeyID: request.URL.Query().Get("apiKeyID"), RequestID: request.URL.Query().Get("requestID"), State: request.URL.Query().Get("state"), Page: 1, Limit: 20}
	if id := request.PathValue("id"); id != "" {
		filter.RequestID = id
	}
	if !billing.ValidUsageState(filter.State) {
		writeError(writer, http.StatusBadRequest, "invalid state filter")
		return filter, false
	}
	for name, target := range map[string]*int{"page": &filter.Page, "limit": &filter.Limit} {
		if value := request.URL.Query().Get(name); value != "" {
			number, err := strconv.Atoi(value)
			if err != nil || number < 1 || (name == "limit" && number > 200) {
				writeError(writer, http.StatusBadRequest, "invalid pagination")
				return filter, false
			}
			*target = number
		}
	}
	for name, target := range map[string]**time.Time{"from": &filter.From, "until": &filter.Until} {
		if value := request.URL.Query().Get(name); value != "" {
			parsed, err := time.Parse(time.RFC3339Nano, value)
			if err != nil {
				writeError(writer, http.StatusBadRequest, "invalid time filter")
				return filter, false
			}
			*target = &parsed
		}
	}
	if filter.From != nil && filter.Until != nil && !filter.From.Before(*filter.Until) {
		writeError(writer, http.StatusBadRequest, "from must precede until")
		return filter, false
	}
	if filter.Page > 10000000 || len(filter.Model) > 512 || len(filter.APIKeyID) > 512 || len(filter.RequestID) > 512 || (filter.From != nil && filter.Until != nil && !filter.From.Before(*filter.Until)) {
		writeError(writer, http.StatusBadRequest, "invalid billing filter bounds")
		return filter, false
	}

	return filter, true
}

func (s *Server) handleBillingWallet(writer http.ResponseWriter, request *http.Request) {
	owner, ok := s.billingOwner(writer, request)
	if !ok {
		return
	}
	wallet, err := s.billing.Store.Wallet(request.Context(), owner, s.billing.Currency)
	if err != nil {
		s.billingError(writer, "read wallet", err)
		return
	}
	writeJSON(writer, http.StatusOK, s.walletAdmission(wallet))
}

func (s *Server) handleBillingReconciliation(writer http.ResponseWriter, request *http.Request) {
	owner, ok := s.billingOwner(writer, request)
	if !ok {
		return
	}
	wallet, err := s.billing.Store.Reconcile(request.Context(), owner)
	if err != nil {
		s.billingError(writer, "reconcile wallet", err)
		return
	}
	if wallet.Currency == "" {
		wallet.Currency = s.billing.Currency
	}
	writeJSON(writer, http.StatusOK, s.walletAdmission(wallet))
}

func (s *Server) handleBillingUsage(writer http.ResponseWriter, request *http.Request) {
	filter, ok := s.billingFilter(writer, request)
	if !ok {
		return
	}
	page, err := s.billing.Store.Requests(request.Context(), filter)
	if err != nil {
		s.billingError(writer, "query usage", err)
		return
	}
	if request.PathValue("id") != "" && page.TotalItems == 0 {
		writeError(writer, http.StatusNotFound, "request not found")
		return
	}
	writeJSON(writer, http.StatusOK, page)
}

func (s *Server) handleBillingLedger(writer http.ResponseWriter, request *http.Request) {
	filter, ok := s.billingFilter(writer, request)
	if !ok {
		return
	}
	page, err := s.billing.Store.Ledger(request.Context(), filter)
	if err != nil {
		s.billingError(writer, "query ledger", err)
		return
	}
	writeJSON(writer, http.StatusOK, page)
}

func (s *Server) handleUsageSummary(writer http.ResponseWriter, request *http.Request) {
	filter, ok := s.billingFilter(writer, request)
	if !ok {
		return
	}
	summary, err := s.billing.Store.SummarizeUsage(request.Context(), filter)
	if err != nil {
		s.billingError(writer, "summarize usage", err)
		return
	}
	writeJSON(writer, http.StatusOK, summary)
}

func (s *Server) handleLedgerSummary(writer http.ResponseWriter, request *http.Request) {
	filter, ok := s.billingFilter(writer, request)
	if !ok {
		return
	}
	summary, err := s.billing.Store.SummarizeLedger(request.Context(), filter)
	if err != nil {
		s.billingError(writer, "summarize ledger", err)
		return
	}
	writeJSON(writer, http.StatusOK, summary)
}

func (s *Server) billingError(writer http.ResponseWriter, action string, err error) {
	s.log.Error("billing operation failed", "action", action, "err", err)
	if errors.Is(err, billing.ErrConflict) {
		writeError(writer, http.StatusConflict, "operation conflicts with existing immutable data")
		return
	}
	writeError(writer, http.StatusServiceUnavailable, fmt.Sprintf("billing %s unavailable", action))
}

func decodeBillingBody(writer http.ResponseWriter, request *http.Request, target any) bool {
	decoder := json.NewDecoder(http.MaxBytesReader(writer, request.Body, 64<<10))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		writeError(writer, http.StatusBadRequest, "invalid billing request body")
		return false
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		writeError(writer, http.StatusBadRequest, "billing body must contain exactly one JSON object")
		return false
	}
	return true
}

func (s *Server) walletAdmission(wallet billing.Wallet) billing.Wallet {
	wallet.AdmissionState, wallet.AdmissionRevision = s.router.WalletAdmission(wallet.OwnerUID)
	return wallet
}
