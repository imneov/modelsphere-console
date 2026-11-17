package server

import (
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/modelsphere/console/internal/billing"
	"github.com/modelsphere/console/internal/iam"
)

type billingCustomer struct {
	Name         string `json:"name"`
	DisplayName  string `json:"displayName,omitempty"`
	OwnerUID     string `json:"ownerUserID"`
	Currency     string `json:"currency"`
	Balance      int64  `json:"balance,string"`
	Revision     int64  `json:"revision"`
	BillingState string `json:"billingState"`
	Topups       int64  `json:"topups,string"`
	Charges      int64  `json:"charges,string"`
	Adjustments  int64  `json:"adjustments,string"`
	Net          int64  `json:"net,string"`
}

func (s *Server) handleBillingCustomers(writer http.ResponseWriter, request *http.Request) {
	if !s.authorize(writer, request, "list", "billingaccounts", "") {
		return
	}
	from, until, ok := billingTimeWindow(writer, request)
	if !ok {
		return
	}
	wallets, err := s.billing.Store.CustomerWallets(request.Context(), from, until)
	if err != nil {
		s.billingError(writer, "list customer wallets", err)
		return
	}
	users, err := s.store.ListUsers(request.Context())
	if err != nil {
		s.billingError(writer, "list billing users", err)
		return
	}
	byOwner := make(map[string]billing.CustomerWallet, len(wallets))
	for _, wallet := range wallets {
		byOwner[wallet.OwnerUID] = wallet
	}
	items := make([]billingCustomer, 0, len(users)+len(wallets))
	seen := make(map[string]bool, len(users))
	for index := range users {
		user := &users[index]
		uid := iam.CanonicalUID(user)
		if uid == "" || seen[uid] {
			continue
		}
		seen[uid] = true
		wallet, exists := byOwner[uid]
		if !exists {
			wallet = billing.CustomerWallet{
				OwnerUID:     uid,
				Currency:     s.billing.Currency,
				BillingState: "blocked",
			}
		}
		items = append(items, billingCustomer{
			Name:         user.Name,
			DisplayName:  user.Spec.DisplayName,
			OwnerUID:     uid,
			Currency:     wallet.Currency,
			Balance:      wallet.Balance,
			Revision:     wallet.Revision,
			BillingState: wallet.BillingState,
			Topups:       wallet.Topups,
			Charges:      wallet.Charges,
			Adjustments:  wallet.Adjustments,
			Net:          wallet.Net,
		})
	}
	for _, wallet := range wallets {
		if seen[wallet.OwnerUID] {
			continue
		}
		items = append(items, billingCustomer{
			Name:         wallet.OwnerUID,
			OwnerUID:     wallet.OwnerUID,
			Currency:     wallet.Currency,
			Balance:      wallet.Balance,
			Revision:     wallet.Revision,
			BillingState: wallet.BillingState,
			Topups:       wallet.Topups,
			Charges:      wallet.Charges,
			Adjustments:  wallet.Adjustments,
			Net:          wallet.Net,
		})
	}
	sort.Slice(items, func(left, right int) bool {
		leftName := items[left].DisplayName
		if leftName == "" {
			leftName = items[left].Name
		}
		rightName := items[right].DisplayName
		if rightName == "" {
			rightName = items[right].Name
		}
		if strings.EqualFold(leftName, rightName) {
			return items[left].OwnerUID < items[right].OwnerUID
		}
		return strings.ToLower(leftName) < strings.ToLower(rightName)
	})
	writeJSON(writer, http.StatusOK, map[string]any{"items": items})
}

func billingTimeWindow(writer http.ResponseWriter, request *http.Request) (time.Time, time.Time, bool) {
	now := time.Now().UTC()
	from := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	until := now
	for name, target := range map[string]*time.Time{"from": &from, "until": &until} {
		value := request.URL.Query().Get(name)
		if value == "" {
			continue
		}
		parsed, err := time.Parse(time.RFC3339Nano, value)
		if err != nil {
			writeError(writer, http.StatusBadRequest, "invalid customer overview time window")
			return time.Time{}, time.Time{}, false
		}
		*target = parsed
	}
	if !from.Before(until) {
		writeError(writer, http.StatusBadRequest, "from must precede until")
		return time.Time{}, time.Time{}, false
	}
	return from, until, true
}

func (s *Server) handleBillingCredit(writer http.ResponseWriter, request *http.Request) {
	if !s.authorize(writer, request, "create", "billingcredits", "") {
		return
	}
	var input struct {
		OperationID  string `json:"operationID"`
		User         string `json:"user"`
		PrincipalUID string `json:"principalUID"`
		Currency     string `json:"currency"`
		Amount       int64  `json:"amount,string"`
		Kind         string `json:"kind"`
	}
	if !decodeBillingBody(writer, request, &input) {
		return
	}
	if input.OperationID == "" || strings.HasPrefix(input.OperationID, "settle/") || len(input.OperationID) > 200 || input.User == "" || input.PrincipalUID == "" || input.Currency != s.billing.Currency || input.Amount == 0 || (input.Kind != "topup" && input.Kind != "adjustment") || (input.Kind == "topup" && input.Amount < 0) {
		writeError(writer, http.StatusBadRequest, "operation, user, currency, amount and kind are required")
		return
	}
	user, err := s.store.GetUser(request.Context(), input.User)
	if err != nil || iam.CanonicalUID(user) != input.PrincipalUID {
		writeError(writer, http.StatusBadRequest, "user identity changed or unresolved")
		return
	}
	wallet, err := s.billing.Store.Credit(request.Context(), billing.Credit{OperationID: input.OperationID, OwnerUID: input.PrincipalUID, Currency: input.Currency, Amount: input.Amount, Kind: input.Kind, Actor: identityFrom(request.Context()).Name})
	if err != nil {
		s.billingError(writer, "credit wallet", err)
		return
	}
	s.log.Info("wallet credit recorded", "operation_id", input.OperationID, "owner_uid", input.PrincipalUID, "actor", identityFrom(request.Context()).Name)
	writeJSON(writer, http.StatusOK, map[string]any{"operationID": input.OperationID, "wallet": s.walletAdmission(wallet)})
}

func (s *Server) handleBillingUsers(writer http.ResponseWriter, request *http.Request) {
	if !s.authorize(writer, request, "create", "billingcredits", "") {
		return
	}
	users, err := s.store.ListUsers(request.Context())
	if err != nil {
		s.billingError(writer, "list users", err)
		return
	}
	result := make([]map[string]string, 0, len(users))
	for index := range users {
		user := &users[index]
		uid := iam.CanonicalUID(user)
		if uid != "" {
			result = append(result, map[string]string{"name": user.Name, "uid": uid, "displayName": user.Spec.DisplayName})
		}
	}
	writeJSON(writer, http.StatusOK, map[string]any{"items": result})
}

func (s *Server) handleBillingPrices(writer http.ResponseWriter, request *http.Request) {
	if !s.authorize(writer, request, "get", "billingprices", "") {
		return
	}
	rules, err := s.billing.Prices(request.Context())
	if err != nil {
		s.billingError(writer, "list price rules", err)
		return
	}
	writeJSON(writer, http.StatusOK, map[string]any{"items": rules})
}

func (s *Server) handlePublishPrice(writer http.ResponseWriter, request *http.Request) {
	if !s.authorize(writer, request, "update", "billingprices", "") {
		return
	}
	var price billing.Price
	if !decodeBillingBody(writer, request, &price) {
		return
	}
	price.RuleID = "publishing"
	if err := price.Validate(); err != nil {
		writeError(writer, http.StatusBadRequest, err.Error())
		return
	}
	if price.Currency != s.billing.Currency {
		writeError(writer, http.StatusBadRequest, "price currency differs from wallet currency")
		return
	}
	if err := s.billing.PublishPrice(request.Context(), price); err != nil {
		s.billingError(writer, "publish price", err)
		return
	}
	writeJSON(writer, http.StatusOK, map[string]string{"status": "published", "observedVersion": "pending"})
}

func (s *Server) handleUsageReconciliation(writer http.ResponseWriter, request *http.Request) {
	if !s.authorize(writer, request, "create", "billingreconciliation", "") {
		return
	}
	filter, ok := s.billingFilter(writer, request)
	if !ok {
		return
	}
	page, err := s.billing.Store.Requests(request.Context(), filter)
	if err != nil {
		s.billingError(writer, "read reconciliation request", err)
		return
	}
	if len(page.Items) != 1 {
		writeError(writer, http.StatusNotFound, "request not found")
		return
	}
	if s.billing.Verifier == nil {
		writeError(writer, http.StatusNotImplemented, "trusted upstream usage reader is not configured")
		return
	}
	if err := s.billing.Supplement(request.Context(), page.Items[0]); err != nil {
		s.billingError(writer, "verify upstream usage", err)
		return
	}
	writeJSON(writer, http.StatusAccepted, map[string]string{"status": "verified usage recorded"})
}

func (s *Server) handleBillingRuntime(writer http.ResponseWriter, request *http.Request) {
	if !s.authorize(writer, request, "get", "billingruntime", "") {
		return
	}
	result := map[string]any{"metering": s.billing.Meter.Stats()}
	if s.billing.Queue != nil {
		health, err := s.billing.Queue.Health(request.Context())
		if err != nil {
			result["queueError"] = strings.TrimSpace("queue unavailable")
		} else {
			result["queue"] = health
		}
	}
	writeJSON(writer, http.StatusOK, result)
}

func (s *Server) handlePriceHistory(writer http.ResponseWriter, request *http.Request) {
	if !s.authorize(writer, request, "get", "billingprices", "") {
		return
	}
	filter, ok := s.billingFilter(writer, request)
	if !ok {
		return
	}
	page, err := s.billing.Store.PriceHistory(request.Context(), filter)
	if err != nil {
		s.billingError(writer, "read price history", err)
		return
	}
	writeJSON(writer, http.StatusOK, page)
}

func (s *Server) handleDeadLetters(writer http.ResponseWriter, request *http.Request) {
	if !s.authorize(writer, request, "get", "billingruntime", "") {
		return
	}
	queue, ok := s.billing.Queue.(billing.RecoveryQueue)
	if !ok {
		writeError(writer, http.StatusNotImplemented, "queue recovery is unavailable")
		return
	}
	after := request.URL.Query().Get("after")
	if after != "" && !billing.ValidStreamID(after) {
		writeError(writer, http.StatusBadRequest, "invalid recovery cursor")
		return
	}
	messages, err := queue.DeadLetters(request.Context(), after, 100)
	if err != nil {
		s.billingError(writer, "list dead letters", err)
		return
	}
	next := ""
	if len(messages) == 100 {
		next = messages[len(messages)-1].ID
	}
	writeJSON(writer, http.StatusOK, map[string]any{"items": messages, "next": next})
}

func (s *Server) handleReplayDeadLetter(writer http.ResponseWriter, request *http.Request) {
	if !s.authorize(writer, request, "create", "billingreconciliation", "") {
		return
	}
	queue, ok := s.billing.Queue.(billing.RecoveryQueue)
	if !ok {
		writeError(writer, http.StatusNotImplemented, "queue recovery is unavailable")
		return
	}
	id := request.PathValue("id")
	if !billing.ValidStreamID(id) {
		writeError(writer, http.StatusBadRequest, "invalid dead letter identity")
		return
	}
	if err := queue.ReplayDeadLetter(request.Context(), id); err != nil {
		s.billingError(writer, "replay dead letter", err)
		return
	}
	s.log.Info("billing dead letter replayed", "stream_id", id, "actor", identityFrom(request.Context()).Name)
	writer.WriteHeader(http.StatusAccepted)
}

func (s *Server) handleRebuildWallet(writer http.ResponseWriter, request *http.Request) {
	owner, ok := s.billingOwner(writer, request)
	if !ok || !s.authorize(writer, request, "update", "billingaccounts", owner) {
		return
	}
	wallet, err := s.billing.Store.RebuildWallet(request.Context(), owner)
	if err != nil {
		s.billingError(writer, "rebuild wallet projection", err)
		return
	}
	s.log.Info("wallet projection rebuilt from ledger", "owner_uid", owner, "actor", identityFrom(request.Context()).Name)
	writeJSON(writer, http.StatusOK, s.walletAdmission(wallet))
}
