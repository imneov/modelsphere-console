package server

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"testing"

	"github.com/modelsphere/console/internal/router"
	"k8s.io/apimachinery/pkg/types"
)

func TestLegacyKeysAreMappedAndVerifiedBeforeAuthorityCutover(t *testing.T) {
	upstream, _ := gatewayUpstream(t)
	source := inferenceServer(t, upstream.URL, 0)
	for _, name := range []string{"admin", "bob"} {
		user, err := source.store.GetUser(t.Context(), name)
		if err != nil {
			t.Fatal(err)
		}
		user.UID = types.UID(name + "-uid")
		if _, err := source.store.UpdateUser(t.Context(), user); err != nil {
			t.Fatal(err)
		}
	}
	target, err := router.NewCRDStore(t.Context(), source.kube.Dynamic(), "console", slog.New(slog.DiscardHandler))
	if err != nil {
		t.Fatal(err)
	}
	if err := source.EnableKeyMigration(target); err != nil {
		t.Fatal(err)
	}
	handler := source.Handler()
	admin := login(t, handler, "admin", "admin-pw")
	key := createKey(t, handler, admin, `{"name":"legacy","models":["qwen"],"expiresInDays":7}`)
	response := do(handler, "POST", "/api/router/apikeys/import", admin, `{"operationID":"migration-1","owners":{}}`)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("missing explicit owner: %d %s", response.Code, response.Body.String())
	}
	body := `{"operationID":"migration-1","owners":{"` + key.ID + `":{"user":"bob","principalUID":"bob-uid"}}}`
	response = do(handler, "POST", "/api/router/apikeys/import", admin, body)
	if response.Code != http.StatusOK {
		t.Fatalf("prepare import: %d %s", response.Code, response.Body.String())
	}
	if response := do(handler, "POST", "/api/router/apikeys", admin, `{"name":"late"}`); response.Code != http.StatusConflict {
		t.Fatalf("source remained writable after verified import: %d", response.Code)
	}
	legacy := router.NewStore(source.kube, "console", "console-api-keys", source.log)
	if err := target.PrepareAuthority(context.Background(), legacy); err != nil {
		t.Fatal(err)
	}
	cfg := *source.cfg
	cfg.Router.KeySource = "crd"
	cfg.Router.Namespace = "console"
	destination := New(&cfg, source.kube, source.log, "test")
	destination.SetIAM(source.store, source.signer, source.authn, source.authz)
	if err := destination.EnableRouter(target); err != nil {
		t.Fatal(err)
	}
	switched := destination.Handler()
	awaitKeyResponse(t, switched, key.Value, "qwen", http.StatusOK)
	if response := do(switched, "POST", "/v1/chat/completions", key.Value, `{"model":"kimi"}`); response.Code != http.StatusForbidden {
		t.Fatalf("import widened model scope: %d", response.Code)
	}
	response = do(switched, "GET", "/api/router/apikeys", admin, "")
	var list struct {
		Items []struct {
			ID, User, PrincipalUID, CreatedBy string
			ExpiresAt                         *string
		}
		KeySource string
	}
	if err := json.Unmarshal(response.Body.Bytes(), &list); err != nil {
		t.Fatal(err)
	}
	if len(list.Items) != 1 || list.Items[0].ID != key.ID || list.Items[0].User != "bob" || list.Items[0].PrincipalUID != "bob-uid" || list.Items[0].CreatedBy != "admin" || list.Items[0].ExpiresAt == nil || *list.Items[0].ExpiresAt != *key.ExpiresAt || list.KeySource != "crd" {
		t.Fatalf("migration changed credentials or ownership: %+v", list)
	}
}
