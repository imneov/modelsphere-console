# Gateway billing implementation contract

Implementation follows [the billing specification](https://github.com/imneov/Neov-Research/issues/8) and its tasks #9–#18. The Key storage decision was refined during implementation: CRDs are authoritative; Informers supply local authentication and admission data.

## Identity and credentials

| Surface | Contract |
| --- | --- |
| Issued credential | `sk-<UUID v4>`, with a separately generated UUID management ID |
| Public Key fields | Global-compatible `user`, `principalKind`, `principalUID`, `creator`, `keyMasked`, `key`, `status`, `from`, `expiresAt` |
| Ownership | Server-resolved canonical User UID; username is display identity, creator is the operator |
| Persistence | Namespaced `gateway.modelsphere.io/v1alpha1` APIKey; credential digest only |
| Authentication | APIKey and User Informers; no per-request Kubernetes or Redis lookup |
| Lifecycle | Manual disable in spec; effective system disable and independent billing admission in status |
| Expiry | Checked locally against the clock even before a status update arrives |
| Migration | Explicit mapping of legacy Key IDs to users; preserve legacy salted digests, IDs, permissions and expiry |
| Authority switch | `router.keySource` selects `secret` or `crd`; never combine their lists |

Global's credential and DTO contracts come from [key.go](https://github.com/theriseunion/rise-global-extension/blob/ce11c8514ea689c472b46db793213e2e2942ed3f/plugins/ai-gateway/backend/internal/apikey/key.go) and [types.go](https://github.com/theriseunion/rise-global-extension/blob/ce11c8514ea689c472b46db793213e2e2942ed3f/plugins/ai-gateway/backend/internal/apikey/types.go). Global currently stores these credentials in Secrets; this APIKey CRD is Console's storage contract, outside the shared IAM group.

## Request and accounting boundaries

```text
SDK Key / Playground -> cached identity + admission -> model route
                                                         |
                                          start / terminal events
                                                         |
                                             Redis EventQueue
                                             |             |
                                     publish succeeds   fails / uncertain
                                             |             |
                                         accepted      journal backup
                                             ^             |
                                             +-- replay ---+
                                             |
                              Usage worker + immutable price -> Charge
                                             |
                              Lease + PostgreSQL fence -> wallet ledger
                                             |
                              projection outbox -> CRD status -> Informers
```

- Redis is the primary event queue. Normal successful publication does not append to the local journal. The journal is a durable fallback when publication fails or confirmation is uncertain; its replay loop republishes the same event IDs to Redis. Usage workers consume Redis, never journal files.
- Phase one does not add historical-journal migration, format compatibility, or full retained-file replay.
- Redis is only an event queue. BillingStore transactions own usage, prices, charges, wallets, ledger and projection recovery.
- Wallet identity is the canonical User UID. Client headers and wallet IDs never determine ownership.
- Prices and money use exact integer/decimal arithmetic. Missing usage or price remains unresolved.
- Replayed events retain their IDs; an identical ID with different content is a conflict.
- A top-up only restores billing admission. Manual disable, user inactivity, expiry and model restrictions remain independent.
- Informer updates are asynchronous. Admission changes take effect once observed; in-flight generations finish.

### Upstream failover

One model may be served by several routes of the same gateway. A failed attempt is replayed on another route only while the upstream cannot have consumed it:

| Outcome | Replayed |
|---|---|
| transport failure before the request was written (dial, DNS, TLS, refused) | yes, next route |
| answer in `router.pipeline.failoverStatuses` (default 429, 500, 502, 503, 504) | yes, next route |
| transport failure after the request was written | no: consumption is uncertain |
| any other answer, 4xx included | no: it is the caller's answer |

`maxAttempts` bounds the total; each attempt carries its own ID. A failed attempt counts against its own route's circuit, and a route whose circuit is open is skipped both for the first attempt and for failover.

## Verification

Use the specification's public seams: Console HTTP handlers with controlled upstreams, plus journal/Redis/PostgreSQL/SQLite adapter contracts. PostgreSQL concurrency and fencing require PostgreSQL, not SQLite substitution. The review baseline is `11d80b68b8daf412c44d2569601402f871b311bb`.

## Admission projection

`cluster.clientQPS` and `cluster.clientBurst` optionally tune the Kubernetes clients' token bucket together. Zero values preserve client-go defaults; positive values must be supplied together. The billing example uses 50 QPS / 100 burst for the measured 1000-user control-plane workload. This changes only control-plane reads/writes; inference remains local. Tune against API-server latency and throttling metrics.

Playground sessions may have no API Key. A namespaced `WalletAdmission` CRD therefore projects only canonical owner UID, admission state and wallet revision. Its name is a digest of the UID. Both entrypoints consult this local Informer; no balance or ledger fact lives in Kubernetes. APIKey status is maintained for per-Key management and inspection.

```text
ledger transaction -> projection outbox -> WalletAdmission + related APIKey statuses
                                                |
                                         Gateway Informers
                                                |
                                       SDK and session admission
```

- Billing-enabled admission requires an observed allowed wallet state; unknown wallets are blocked.
- Projection delivery rechecks the latest database revision and uses resourceVersion retries. Older revisions cannot overwrite newer Kubernetes status.
- Wallet and Key projection failures remain retryable after the financial transaction commits.
- Newly created Keys inherit the current wallet state through reconciliation.

Inference session checks use cached User and platform-role informers as well as the Key cache. Console-issued JWTs include an optional canonical `uid` binding while retaining Global's core claims. A legacy token without that binding is accepted for a wallet only when its signed issue time is strictly later than the current User's creation second; an ambiguous or stale session must sign in again. This prevents an old username-only session from consuming a recreated user's wallet.

## API and process contract

| Surface | Purpose |
| --- | --- |
| `GET /api/billing/usage` | Owner-filtered request lifecycle, usage, charge and backend pagination |
| `GET /api/billing/wallet` | Current user's wallet projection and ledger reconciliation |
| `GET /api/billing/ledger` | Filtered immutable wallet movements with backend pagination |
| `POST /api/billing/credits` | Authorized top-up or signed adjustment, mandatory idempotency key |
| `GET /api/billing/prices`, `PUT /api/billing/prices` | Inspect/publish current PriceRules; publishing archives the immutable version first |
| `POST /api/billing/usage/{id}/reconcile` | Authorized recovery through a trusted upstream usage reader |
| `GET /api/billing/runtime` | Authorized metering and queue recovery status |
| Process roles | Gateway (`console`); usage worker, settlement worker, journal replay (`billing`) — one role per process |

Money is represented as signed integer currency nanounits, serialized as decimal strings. Prices specify nanounits per `unitTokens`; the combined exact request charge rounds up once to a nanounit. Database DSNs and Redis credentials come from environment variables named by configuration, populated from existing Secrets in Helm.

## Deployment and recovery contract

- `billing.enabled` selects separate usage and settlement Deployments and a gateway StatefulSet. Workers run `billing.image` (the billing binary, without the SPA or the management API) and receive their role as `--role`; the gateway keeps `image`. Gateway ordinals retain their own journal PVCs on deletion and scale-down. `fsGroup` grants the nonroot process access to newly provisioned claims.
- `billing.journal.replayRetained` is an explicit recovery switch accepted only with the `replay` process role. It durably rewinds delivery to the first retained frame before publishing original event IDs again. It can replay only facts actually present in backups. Normal successful Redis events are not journaled, so this cannot recover arbitrary Redis data loss; Redis/database durability and backups must protect those events. This historical recovery switch is outside phase-one acceptance.
- External Redis must persist acknowledged stream writes; its partition count is immutable for a queue prefix. The adapter uses one Redis primary endpoint and atomic scripts, not Redis Cluster slots. PostgreSQL is required for distributed workers. SQLite is for a single local process set sharing one database file.
- Workers expose `/healthz`, `/readyz`, and `/metrics` on the configured metrics listener. Gateway readiness is independent of PostgreSQL initialization; local Key and wallet Informers govern inference.
- Price publication archives every version before replacing the current CRD. `GET /api/billing/prices/history` returns paginated immutable versions, including versions skipped by an Informer.
- Authorized recovery APIs list dead-letter metadata and replay the original event. `POST /api/billing/wallet/rebuild` rebuilds the wallet query projection from immutable ledger facts; ordinary GETs do not repair or settle anything.
- `/api/me.capabilities` controls visibility of optional modules. Billing pages require the `billing` capability in addition to their normal action permissions.

Wallet responses distinguish desired `billingState` from the gateway's locally observed `admissionState` and `admissionRevision`. A successful top-up can therefore show the updated balance while admission still awaits projection. Key migration performs Kubernetes dry-run validation before freezing the legacy Secret; descriptions within the existing HTTP body limit remain importable.
