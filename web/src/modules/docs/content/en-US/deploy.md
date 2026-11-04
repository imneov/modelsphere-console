# Deploying models

Swiss (swissd) on the cluster performs every deployment. Each install, upgrade and rollback first composes a **plan** and previews the change; nothing runs until you confirm.

## First use: site setup

If swissd has no site profile yet, Model Serving opens on **Site setup**. Describe the cluster and save:

- model catalog: where deployable models come from
- chart and image registries
- model path template: where weights live on the nodes

You can change it any time in [Site Profile](/inferences/site-profile), as a form or as YAML. The server validates it before saving.

## 1. Pick a model

Open the [Model Library](/inferences/catalog):

- Narrow it down with search and filters (family, engine, hardware, tag); "Tuned only" keeps models with tuned variants.
- Click a card for details. The **Variants** tab lists the ways the model can be deployed (GPU model, GPU count, engine), each with "N nodes available" computed from the cluster's free GPUs.
- Click **Deploy** on the variant you want.

## 2. Fill in the form

| Section | Main fields | Notes |
|---|---|---|
| Basics | Service name, namespace | The service name also names the helm release, route, scaler and SLO; lowercase letters, digits and `-`, at most 53 characters. **Cannot be changed later** |
| Resources & scheduling | Autoscaling / replicas, GPU models, tolerations | Autoscaling is on by default: LLMScaler keeps replicas between the bounds |
| Routing | Publish route, route path, concurrency limit | Only with "Publish route" on can the model be called through the gateway and the Playground |
| SLO & monitoring | TTFT / TPS thresholds, ServiceMonitor | The scaler sizes replicas against the SLO |
| Advanced | Image override, model path, YAML overrides | Rarely needed |

Most fields can stay empty and take the site profile's and chart's defaults.

**Adaptive concurrency** groups the master switch, floor fraction, absolute floor, start point, idle hold, and TTFT decisions together; its internal knobs are available under **Advanced adaptive options**. Turning the switch off hides and clears the group's entered values; turning it back on does not restore them. **Default peer maximum** stays in **Capacity & failover** and still applies when adaptive concurrency is off; it also influences the static maximum used for adaptive bounds. Review the diff before confirming an upgrade.

## Generation recovery

Enable **Routing → Generation recovery** in the deploy or upgrade form. Enter the **Actual model** whose weights are deployed, such as `kimi-k3` or `glm-5.3`. This selects the continuation strategy; it is not the client-facing served name.

- Requires **CART**, **Publish a route**, and `sglang` chart **0.8.11+** or `vllm` chart **0.8.9+**. Composing the plan checks these conditions.
- **Stream idle timeout** is the time without a chunk after streaming starts; empty keeps the inherited timeout or chart default.
- **Resume interrupted responses** is on by default; off detects and logs interruptions without sending a continuation request.
- **Buffer tool calls** holds arguments until a complete call can be sent together, so interrupted calls can be regenerated.
- Requests flow through `openresty → continuation gateway → CART → inference instance`. The gateway is deployed with the model release; review and confirm the diff before applying.
- Unsupported requests, including structured JSON output, pass through. Verify the actual model and engine combination against the [gateway compatibility documentation](https://github.com/modelsphere/continuation_gateway). Quantized or fine-tuned variants use the listed base model name; vLLM with Kimi-K3 requires `--enable-scale-out`.
- Advanced YAML is validated after composition, so its final values decide whether recovery is enabled and valid.
- Upgrades carry the configured recovery settings forward. Turn the switch off, compose and confirm to remove the gateway. Advanced YAML takes precedence over the form; inspect the final plan and diff.

## L3 KV cache

Choose the first-level **L3 KV cache** tab in deploy or upgrade, alongside Basics and Routing. It groups the storage backend, host-cache policy and connection settings, with a GPU → host-memory → storage tier diagram. Switching tabs preserves draft settings.

| Engine / chart | L3 support |
|---|---|
| `sglang` **0.9.27+** | `storageKVOffload`, with `backend: hicache`; first released in [sglang-0.9.27](https://github.com/modelsphere/helm-charts/blob/sglang-0.9.27/charts/sglang/values.yaml) |
| `sglang` through **0.9.26** | No top-level `storageKVOffload`; choose a supported chart version first |
| `vllm` | Not implemented. The reserved section introduced in **0.8.23** explicitly rejects enabling it; local `mooncakeStore` offload is L2 |

1. Enable L3 to configure **Mooncake** and connect to an existing Mooncake Store. Other storage backends are not adapted by this interface. A name accepted by the chart schema is not a product integration or a runtime-validated client. Existing YAML using another backend is shown read-only and preserved; maintain it in Advanced YAML. It is not switched to Mooncake automatically.
2. Leave optional host-memory size, ratio, mode and fraction empty for engine defaults. Explicit size overrides ratio. More HiCache options exposes write policy, I/O backend, memory layout and prefetch settings. Clearing a previously set optional field removes that override; unchanged fields and options outside the form are carried forward.
3. Enter additional Mooncake configuration as a JSON object or an `@file` path already mounted in the engine container. Here `@file` names a configuration file, not another storage backend. Provision the store, config mounts, credentials and network access separately.
4. For Mooncake, connect to an existing Store using the master and transfer-metadata settings. Set protocol and the actual transfer devices to match the fabric; explicitly select HCAs on multi-rail clusters. Global segment size is passed through, including `0` for a pure client. With `P2PHANDSHAKE`, add `MOONCAKE_LOCAL_HOSTNAME` from `status.podIP` through the existing `env` values in Override YAML. Hugepage settings, if needed, remain under `storageKVOffload.mooncake` in YAML and require the chart's page size, limit and cluster capacity.
5. Compose, inspect the final plan and diff, then confirm. Advanced YAML remains authoritative, including when it enables or disables L3. Chart version, engine, backend, numeric values and conflicts are checked on the final plan after adaptive-concurrency cleanup.

- `storageKVOffload` subsumes SGLang `localKVOffload`. If local offload is enabled, explicitly set `localKVOffload.enabled: false` in Override YAML and move any desired HiCache knobs to `storageKVOffload.hicache`, or leave L3 off. Console shows the conflict and does not silently turn off local offload.
- In disaggregated PD, L3 applies to **prefill only**. Colocated PD is rejected. `commandOverride` replaces the generated engine command and cannot be combined with the graphical L3 configuration.
- Catalog or Override YAML `extraArgs`, and PD `pd.prefill.extraArgs`, are appended last to the engine command. A `--hicache-*` value that differs from the graphical L3 setting blocks review. In Override YAML, preserve the other arguments and remove the duplicate flags, or align their values. For example, a Kimi recipe containing `--hicache-size=150` overrides a graphical size of `32`; leave the graphical size empty to retain that recipe's capacity when only enabling L3.
- **Compile cache** under Advanced uses `cache` to retain compiled kernels on the node. It is a separate feature from KV offload; enabling L3 preserves it.
- Upgrade fields start from the current plan's final merged L3 values and are not reset by plan polling. Values in an existing Override YAML still take precedence over graphical changes; edit that YAML when necessary.
- This configures the model release only, with no independent cache-service manager. A successful plan or render does not verify an actual backend or GPU execution. After deploying with a compatible engine image, verify backend connectivity, successful GPU inference, and reuse/offload of repeated prefixes through engine logs and metrics. No GPU or cache-hit success is implied by enabling the switch.

## 3. Review and confirm

**Compose plan** opens the review:

- **Plan**: the configuration layers this deployment is made of.
- **Diff**: what will change compared with the cluster.
- **Change note**: why you are making the change; it goes into the activity log.

Click **Deploy** to confirm.

## 4. Wait until ready

Watch the [Inference Services](/inferences) list:

| State | Meaning |
|---|---|
| Applying | helm is running |
| Loading | pods are scheduled and reading weights |
| Serving | ready for traffic |
| Failed | the deployment failed; see its output in Activity |
| Not ready | not ready after an hour, longer than a normal load; investigate |

> **A cold start takes 20–40 minutes.** Loading large weights is slow; "Loading" is usually not an error.

Click a service for its details. **Overview** shows progress step by step: applied → instances ready → routed → autoscaling. The other tabs:

| Tab | Contents |
|---|---|
| Instances | pods, their nodes and restart counts |
| Logs | recent logs per pod and container |
| Events | Kubernetes events, optionally warnings only (kept for one hour by default) |
| Versions | revision history; view the values of any revision and roll back |
| Activity | this service's installs, upgrades and rollbacks |
| Plan | how the current plan is composed |

## Upgrade, roll back, uninstall

From a row's actions in the list, or the top of the detail page:

- **Upgrade**: change the model version, variant or settings; again you review the diff before confirming. Service name and namespace are fixed.
- **Roll back**: pick a revision under Versions to restore its plan as it was. To change settings, upgrade instead.
- **Edit SLO**: the latency and throughput targets and the replica bounds the scaler works with. Services deployed without SLO need it switched on in an upgrade first.
- **Uninstall**: stops the service and deletes its pods; the activity log is kept. Reinstalling loads the weights again.
- While pods are still terminating the service stays listed as **Uninstalling**; upgrade, roll back, SLO edits and uninstall stay disabled until it disappears.
- Uninstalling from the detail page keeps it open. **Overview → Uninstall progress** and **Instances** show the remaining pod count; **View instances** opens the pods still shutting down. An LLMService backend that reports deletion progress also supplies its cleanup message.
- The list and detail refresh every 3 seconds during uninstall. When pods are gone, the page waits for backend cleanup confirmation. A status warning prevents an unreadable pod list from being reported as cleared. This refresh interval does not shorten pod termination grace or actual resource cleanup.

"Behind catalog" in the list means the catalog has a newer version to upgrade to; "Untracked" means the release was not deployed by Swiss and cannot be upgraded here.

## Edit a catalog's variants

A catalog-server catalog can be edited from a model's page. In the [Site profile](/inferences/site-profile) editor, tick the catalog **Writable** and enter its catalog-server **Write token**; swissd keeps the token in its own Secret. Any later change to the catalog other than **Default** (its URL, its name, unticking **Writable**) removes the token: enter it again with the change. Saving checks the token with the catalog server first, a new catalog's too: if the server does not accept it or cannot be reached, nothing is saved and the editor says why. Each change is one commit to the catalog.

| Action | Where | What to know |
|---|---|---|
| Set up an empty catalog | **Set up this catalog** in the model library's toolbar | where the catalog is served and its repository; until then it takes no models |
| Catalog settings | **Catalog settings** in the model library's toolbar | its `catalog.yaml`: `site`, `raw`, `repo` |
| Add a model | **New model** in the model library's toolbar | its name and first variant id, its `metadata.yaml`, and the variant, copied from one the catalog has |
| Edit a model | **Edit model** in a model's header | its `metadata.yaml`: description, default variant, tuning |
| Add a variant | **Add variant** in the header | starts as a copy of the default variant at version 1.0.0; set its `id`, which is also its file name |
| Edit | the variant card's `⋯` menu | raise `version` on every change (**Raise version** does it); **Check** validates without committing |
| Delete | the variant card's `⋯` menu | refused for the default variant, one a tuning result names, or the model's last; its history stays |

- A writable catalog is labelled **Writable** in the model library's catalog selector.
- If someone changed the file after you opened it, saving says so; reload it and edit again.
- Commits are authored by the token's owner, not by you.
- If the token is changed or removed on the catalog server later, the next change says so; enter the new one in the Site profile editor.
- Editing needs the model deployment backend's (`swiss`) permissions: `update` to add or edit a variant or set a token, `delete` to delete either.

## Nodes and activity

- [Nodes](/inferences/nodes): the cluster's GPU inventory — free GPUs, the largest free slot on one node, models in stock, and unavailable nodes. Check here before deploying.
- [Activity](/inferences/runs): every install, upgrade, rollback and uninstall swissd has run; expand a row for its full output.

## Read-only mode

If action buttons are greyed out with "this swissd is read-only", swissd on the cluster is not allowed to deploy and you can only look. An operator has to turn on `allowDeploy` in Swiss's configuration.
