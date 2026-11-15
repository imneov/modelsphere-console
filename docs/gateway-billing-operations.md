# Gateway billing operations

Use [the implementation contract](gateway-billing.md) for identity, API and durability semantics.

## Enable billing

1. Apply the chart's CRDs before upgrading existing installations; Helm does not upgrade existing CRD definitions automatically.
2. Back up the legacy Key Secret and PostgreSQL. Deploy the new version with `router.keySource=secret`, `router.migration=true`, billing disabled.
3. Import with an operation ID and an explicit `{user, principalUID}` mapping for every legacy Key ID. The endpoint validates target resources, freezes the source, imports and verifies the complete target. Retry the same operation and mapping after an interruption.
4. Set `router.keySource=crd`, `router.migration=false`. Startup verifies the frozen import and retires the old authority. Validate existing credentials before enabling billing.
5. Provide an existing credential Secret with `postgres-dsn` and `redis-url`, using PostgreSQL and a durable Redis primary. Start with [values-billing.example.yaml](../helm/console/values-billing.example.yaml), the installation's gateway profile and appropriate storage class.
6. Publish a price for each served model, fund users through the credits API, then wait for observed admission. An unknown or unfunded wallet is blocked.

```text
backup -> stage explicit owners -> freeze/import/verify -> CRD authority
                                                            |
                                        prices + credits -> billing enabled
```

The chart deploys two gateways with retained journal claims, two usage workers and two settlement candidates by default. Configuration checksums roll all process roles when settings change. Choose Kubernetes client QPS/burst against the API server's budget; these limits affect management and admission projection, not per-request authentication.

## Monitor and tune

| Signal | Interpretation / response |
| --- | --- |
| `billing_operations_total` | Logical requests, terminal usage completeness, durable events, failures and dead letters |
| `billing_duration_seconds` | Journal append/fsync, generation, queue publication, database transaction and pipeline lag |
| `billing_backlog` | Queue, unresolved usage/pricing, unsettled charges, projection revisions, oldest ages and journal capacity |
| `billing_dependency_up` | Last PostgreSQL, queue or journal-disk probe |
| Native Go/process metrics | CPU, memory, goroutines and runtime pressure |
| PostgreSQL WAL position | Compare WAL deltas with throughput and batch settings |

- Monitor queue publication as the normal request-path cost. Successful Redis publication does not write a journal event. `journal_append` and `journal_fsync` measure fallback recording after a Redis error or uncertain confirmation; interval mode weakens the backup crash-loss window.
- Tune usage `maxEvents`, `maxBytes`, `flushInterval` and concurrency together. Transactions never exceed the configured count/byte caps; count-one queue reads may return one reclaimed and one fresh fact for fairness, which are committed in separate capped chunks.
- Missing prices remain pending with backoff. Reclamation rotates through older pending pages while reserving capacity for fresh work. Publish the missing immutable price and inspect recovery; do not fabricate token counts.
- Settlement `maxWallets` and interval bound how quickly many independent users converge. Projection has its own loop and cannot block financial settlement. An observed admission revision can lag the committed balance.
- During a Redis outage, the journal backup may need two records per completed request. This local fsync budget applies to degraded operation, not healthy Redis traffic. Validate Redis publication, its configured durability, and fallback storage separately on the intended deployment.

## Recover

| Failure | Recovery |
| --- | --- |
| Redis unavailable | Gateways retain original events in their journals; restore Redis and watch replay/backlog converge |
| Redis acknowledged data lost | Restore the Redis/database backups according to their durability policy. Healthy Redis events are not mirrored into journals; local backup files cannot reconstruct events they never recorded |
| Gateway pod lost | Recreate the same ordinal with its retained claim; the journal's exclusive lock prevents concurrent ownership |
| PostgreSQL unavailable | Inference publishes events to Redis while queue capacity permits; usage/settlement retry transactions after recovery |
| Settlement leader lost | Kubernetes Lease elects a successor; its PostgreSQL generation fences old writers |
| Invalid event / immutable fact conflict | Inspect authorized dead-letter metadata, correct the producing code or configuration, and replay the original fact through the recovery API |
| Missing upstream usage | Use the configured authenticated GET verifier and request identity; never reissue generation |
| Wallet projection mismatch | GET reconciliation first, then authorized POST wallet rebuild; immutable ledger remains the source |

Phase one adds no historical-journal migration, compatibility or full-rewind acceptance requirement. Current-run backup records can still be replayed into Redis. Confirmation timeouts may create duplicate deliveries; preserve the original event ID.

`failurePolicy=continue` records an explicit delivery gap if both journal and queue fail. `reject_new` rejects new generations only when neither sink records their start; it does not interrupt accepted in-flight generations. Alert on delivery gaps regardless of policy.

A top-up/adjustment needs a stable business operation ID across retries. The `settle/` namespace is reserved for system-generated charge debits. The UI preserves a draft's operation ID until the operator explicitly begins another movement.

## Roll back the optional feature

1. Preserve PostgreSQL, Redis and every journal claim. Finish or explicitly account for outstanding events before disabling workers.
2. Set `billing.enabled=false` while keeping `router.keySource=crd`. The chart returns the gateway to a Deployment, removes billing workers and hides billing pages through capabilities.
3. Re-enable with the same database, queue prefix/partition count and retained claims when ready; verify ledger and admission convergence.

Retiring the old Secret is a one-way authority migration. Feature rollback must retain the new Key authority. Changing the queue's partition count under an existing prefix is rejected.

## Reproduce acceptance

`tools/billing/fixtures.py` emits isolated PostgreSQL, durable Redis and a deterministic usage-producing upstream; `users.py` emits fixture users/roles; `seed.py` credits and issues keys through public HTTP APIs. `renderer.py` is a Helm post-renderer that runs the real Console source in a disposable kind cluster, with a compiler-cache PVC. This source runner is an acceptance fixture; release images use the repository's GitHub publish workflow.

- Use only context `kind-console-billing-acceptance` and an explicit dedicated kubeconfig. The load, seeding and fault drivers reject other contexts.
- Keep fixture credential/checkpoint files outside the repository with mode 0600. HTTP bases must be loopback port-forwards; redirects are rejected.
- Seed 1000 users, expose both gateway pods separately, and run `load.py` with `--rate 10 --rate 30 --rate 200 --seconds 15 --expected-cost <nanounits>` plus `--metrics` URLs. The driver records offered/completed rate, scheduling-inclusive P95/P99, drain time, WAL positions and native container resource counters.
- Every successful response must produce two original event facts, one charge and one immutable debit. Charge/debit sums must match exact fixture prices, and every wallet must equal its ledger.
- `faults.py` tests Redis/PostgreSQL outages, settlement leader replacement and gateway journal-PVC takeover. Run each completed scenario to convergence before the next.
- Compare at least two batch caps with the same traffic, price, replicas, fsync mode and storage. Capture raw metrics alongside results. Keep environment-specific results in the originating research tracker.

Unit/adapter tests run without Kubernetes. Set `BILLING_TEST_POSTGRES_DSN` and optionally `BILLING_TEST_REDIS_URL` for real services; PostgreSQL tests isolate schemas. Local Redis outage tests own their process and never stop an externally supplied service.
