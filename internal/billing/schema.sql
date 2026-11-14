CREATE TABLE IF NOT EXISTS billing_wallets (
 owner_uid TEXT PRIMARY KEY, currency TEXT NOT NULL, balance BIGINT NOT NULL DEFAULT 0,
 revision BIGINT NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS billing_ledger (
 operation_id TEXT PRIMARY KEY, owner_uid TEXT NOT NULL REFERENCES billing_wallets(owner_uid),
 currency TEXT NOT NULL, amount BIGINT NOT NULL, kind TEXT NOT NULL, actor TEXT NOT NULL,
 charge_id TEXT UNIQUE, revision BIGINT NOT NULL, occurred_at BIGINT NOT NULL,
 payload_hash TEXT NOT NULL, UNIQUE(owner_uid, revision)
);
CREATE TABLE IF NOT EXISTS billing_projection (
 owner_uid TEXT PRIMARY KEY REFERENCES billing_wallets(owner_uid), revision BIGINT NOT NULL,
 state TEXT NOT NULL, delivered_revision BIGINT NOT NULL DEFAULT -1, updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS billing_events (
 event_id TEXT PRIMARY KEY, request_id TEXT NOT NULL, owner_uid TEXT NOT NULL,
 event_type TEXT NOT NULL, occurred_at BIGINT NOT NULL, payload_hash TEXT NOT NULL, payload TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS billing_events_request ON billing_events(request_id);
CREATE TABLE IF NOT EXISTS billing_requests (
 request_id TEXT PRIMARY KEY, owner_uid TEXT NOT NULL, wallet_id TEXT NOT NULL,
 api_key_id TEXT NOT NULL, identity_source TEXT NOT NULL, model TEXT NOT NULL, upstream TEXT NOT NULL,
 started_at BIGINT, terminal_at BIGINT, reason TEXT NOT NULL DEFAULT '', complete INTEGER NOT NULL DEFAULT 0,
 usage_json TEXT NOT NULL DEFAULT '{}', upstream_request_id TEXT NOT NULL DEFAULT '', attempt_id TEXT NOT NULL,
 pricing_error TEXT NOT NULL DEFAULT '', attempts_json TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS billing_requests_owner ON billing_requests(owner_uid, started_at);
CREATE TABLE IF NOT EXISTS billing_prices (
 rule_id TEXT NOT NULL, version TEXT NOT NULL, model TEXT NOT NULL, observed_at BIGINT NOT NULL,
 payload_hash TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(rule_id, version)
);
CREATE TABLE IF NOT EXISTS billing_charges (
 charge_id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES billing_requests(request_id), charge_revision INTEGER NOT NULL DEFAULT 1,
 owner_uid TEXT NOT NULL, currency TEXT NOT NULL, amount BIGINT NOT NULL,
 price_json TEXT NOT NULL, usage_json TEXT NOT NULL, state TEXT NOT NULL,
 created_at BIGINT NOT NULL, settled_at BIGINT, UNIQUE(request_id,charge_revision)
);
CREATE INDEX IF NOT EXISTS billing_charges_pending ON billing_charges(state, owner_uid);
CREATE TABLE IF NOT EXISTS billing_fence (
 singleton INTEGER PRIMARY KEY, generation BIGINT NOT NULL, holder TEXT NOT NULL
);
INSERT INTO billing_fence(singleton, generation, holder) VALUES(1,0,'') ON CONFLICT(singleton) DO NOTHING;
