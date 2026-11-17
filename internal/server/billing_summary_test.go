package server

import (
	"encoding/json"
	"net/http"
	"net/url"
	"testing"
	"time"

	"github.com/modelsphere/console/internal/billing"
)

// TestBillingSummaryRoutes mirrors the usage page: the KPI cards and the state
// tabs read the same owner scope as the table behind them.
func TestBillingSummaryRoutes(t *testing.T) {
	server, store, _ := billingServer(t)
	handler := server.Handler()
	admin := login(t, handler, "admin", "admin-pw")
	body := `{"operationID":"topup-summary","user":"bob","principalUID":"bob-uid","currency":"USD","amount":"2000000000","kind":"topup"}`
	if response := do(handler, "POST", "/api/billing/credits", admin, body); response.Code != http.StatusOK {
		t.Fatalf("credit: %d %s", response.Code, response.Body.String())
	}
	price := billing.Price{RuleID: "rule", Version: "1", Model: "qwen", Currency: "USD", UnitTokens: 1000000, InputRate: 1000000000}
	event := billing.Event{SchemaVersion: 1, EventID: "summary-terminal", Type: "request_terminal", RequestID: "summary-request", OwnerUID: "bob-uid", WalletID: "bob-uid", IdentitySource: "session", Model: "qwen", Upstream: "backend", AttemptID: "attempt", Reason: "completed", OccurredAt: time.Now().UTC(), Usage: billing.Usage{InputTokens: 1000, Complete: true, Source: "upstream_json"}}
	if err := store.Ingest(t.Context(), []billing.Event{event}, func(string) (billing.Price, bool) { return price, true }); err != nil {
		t.Fatal(err)
	}
	response := do(handler, "GET", "/api/billing/usage/summary?ownerUserID=bob-uid", admin, "")
	var usage billing.UsageSummary
	if err := json.Unmarshal(response.Body.Bytes(), &usage); err != nil {
		t.Fatal(err)
	}
	if response.Code != http.StatusOK || usage.Requests != 1 || usage.InputTokens != 1000 || usage.States.Pending != 1 {
		t.Fatalf("usage summary: %d %+v", response.Code, usage)
	}
	pending := do(handler, "GET", "/api/billing/usage?ownerUserID=bob-uid&state=pending", admin, "")
	var page billing.Page[billing.Request]
	if err := json.Unmarshal(pending.Body.Bytes(), &page); err != nil {
		t.Fatal(err)
	}
	if pending.Code != http.StatusOK || page.TotalItems != 1 || page.Items[0].Charge == nil {
		t.Fatalf("pending scope: %d %+v", pending.Code, page)
	}
	if response := do(handler, "GET", "/api/billing/usage?ownerUserID=bob-uid&state=settled", admin, ""); response.Code != http.StatusOK {
		t.Fatalf("settled scope: %d", response.Code)
	}
	if response := do(handler, "GET", "/api/billing/usage?ownerUserID=bob-uid&state=bogus", admin, ""); response.Code != http.StatusBadRequest {
		t.Fatalf("invalid state: %d", response.Code)
	}
	ledger := do(handler, "GET", "/api/billing/ledger/summary?ownerUserID=bob-uid", admin, "")
	var summary billing.LedgerSummary
	if err := json.Unmarshal(ledger.Body.Bytes(), &summary); err != nil {
		t.Fatal(err)
	}
	if ledger.Code != http.StatusOK || summary.Topups != 2000000000 || summary.Charges != 0 || summary.Net != 2000000000 {
		t.Fatalf("ledger summary: %d %+v", ledger.Code, summary)
	}
}

func TestBillingCustomerOverviewListsUsersAndRejectsNonAdmins(t *testing.T) {
	server, _, _ := billingServer(t)
	handler := server.Handler()
	admin, bob := login(t, handler, "admin", "admin-pw"), login(t, handler, "bob", "bob-pw")
	body := `{"operationID":"topup-customers","user":"bob","principalUID":"bob-uid","currency":"USD","amount":"2000000000","kind":"topup"}`
	if response := do(handler, "POST", "/api/billing/credits", admin, body); response.Code != http.StatusOK {
		t.Fatalf("credit: %d %s", response.Code, response.Body.String())
	}
	now := time.Now().UTC()
	window := url.Values{
		"from":  {now.Add(-time.Hour).Format(time.RFC3339Nano)},
		"until": {now.Add(time.Hour).Format(time.RFC3339Nano)},
	}
	response := do(handler, "GET", "/api/billing/admin/customers?"+window.Encode(), admin, "")
	var overview struct {
		Items []struct {
			Name         string `json:"name"`
			OwnerUID     string `json:"ownerUserID"`
			Balance      int64  `json:"balance,string"`
			BillingState string `json:"billingState"`
			Topups       int64  `json:"topups,string"`
		} `json:"items"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &overview); err != nil {
		t.Fatal(err)
	}
	if response.Code != http.StatusOK || len(overview.Items) != 2 {
		t.Fatalf("overview: %d %+v", response.Code, overview.Items)
	}
	var foundBob bool
	for _, item := range overview.Items {
		if item.OwnerUID == "bob-uid" {
			foundBob = item.Name == "bob" && item.Balance == 2000000000 && item.Topups == 2000000000 && item.BillingState == "allowed"
		}
	}
	if !foundBob {
		t.Fatalf("bob missing from overview: %+v", overview.Items)
	}
	if response := do(handler, "GET", "/api/billing/admin/customers?"+window.Encode(), bob, ""); response.Code != http.StatusForbidden {
		t.Fatalf("non-admin overview: %d", response.Code)
	}
}
