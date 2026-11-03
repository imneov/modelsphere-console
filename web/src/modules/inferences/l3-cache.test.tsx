import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Plan, PlanRequest } from "@swiss/lib/api";
import { composeAdaptivePlan } from "./adaptive-concurrency";
import { EMPTY, formFromPlan, planRequest } from "./deployment-settings";
import { mergeValues, planValues, recoverySettings, withRecovery } from "./recovery";
import { L3_BACKENDS, l3Error, l3Settings, l3Supported, withL3 } from "./l3-cache";
import { L3CacheFields } from "./components/L3CacheFields";
import { DeployForm } from "./components/DeployForm";

const chart = { name: "sglang", version: "0.9.27" };
const plan = (layers: Plan["layers"], selected = chart): Plan => ({
  apiVersion: "swiss.modelsphere.dev/v1alpha1", release: { name: "model", namespace: "models" },
  source: { model: "weights", variant: "default" }, chart: selected, engine: selected.name,
  profile: "site", layers, hash: "hash",
});
const enabled = { storageKVOffload: { enabled: true, backend: "hicache", storage_backend: "mooncake" } };

function fields(values: Record<string, unknown> = {}, selected = chart, engine = selected.name) {
  return <L3CacheFields settings={l3Settings(values)} onChange={() => {}} chart={selected} engine={engine} />;
}

describe("L3 KV deployment", () => {
  it.each([
    ["sglang", "0.9.26", "sglang", false], ["sglang", "0.9.27", "sglang", true],
    ["sglang", "0.9.28", "sglang", true], ["sglang", "0.10.0", "sglang", true],
    ["sglang", "1.0.0", "sglang", true], ["sglang", "0.9.27+build.1", "sglang", true],
    ["sglang", "0.9.27-rc.1", "sglang", false], ["sglang", ">=0.9.27", "sglang", false],
    ["sglang", "", "sglang", false], ["sglang", "latest", "sglang", false],
    ["sglang", "0.9.27", "vllm", false], ["vllm", "0.8.23", "vllm", false],
    ["vllm", "0.9.0", "vllm", false], ["other", "1.0.0", "other", false],
  ])("gates the released %s %s chart with %s engine", (name, version, engine, expected) => {
    expect(l3Supported({ name, version }, engine)).toBe(expected);
  });

  it("leaves untouched and unsupported deployments on the existing request contract", () => {
    const request = planRequest(EMPTY, { model: "weights" });
    expect(withL3(request, {})).toBe(request);
    expect(withL3(request, {}).overrides).not.toHaveProperty("storageKVOffload");
    expect(l3Error(plan({ form: request.overrides! }, { name: "vllm", version: "0.8.22" }))).toBeUndefined();
  });

  it("writes only the chosen backend and explicitly entered existing chart knobs", () => {
    const request = withL3({}, {
      enabled: true, storageBackend: "mooncake", hostMode: "buffer_only", size: "32", ratio: "1.5",
      master: " etcd://store.example.com:2379 ", metadata: "P2PHANDSHAKE", protocol: "rdma", device: "hca-example", segmentSize: "0",
      extraConfig: '{"storage_path":"/kv"}', retryAttempts: "0",
    });
    expect(request.overrides).toEqual({ storageKVOffload: {
      enabled: true, backend: "hicache", storage_backend: "mooncake",
      hicache: { "host-memory-mode": "buffer_only", size: 32, ratio: 1.5, "storage-backend-extra-config": '{"storage_path":"/kv"}', "storage-prefetch-retry-max-attempts": 0 },
      mooncake: { master: "etcd://store.example.com:2379", te_meta_data_server: "P2PHANDSHAKE", protocol: "rdma", device: "hca-example", global_segment_size: "0" },
    } });
    expect(l3Error(plan({ form: request.overrides! }))).toBeUndefined();
  });

  it("keeps optional defaults absent and clears explicitly reset knobs with null", () => {
    expect(withL3({}, { enabled: true }).overrides).toEqual({ storageKVOffload: { enabled: true, backend: "hicache" } });
    const request = withL3({}, { size: "", master: "", hostMode: "", extraConfig: "" });
    expect(request.overrides).toEqual({ storageKVOffload: { hicache: { size: null, "host-memory-mode": null, "storage-backend-extra-config": null }, mooncake: { master: null } } });
    const inherited = mergeValues(enabled, { storageKVOffload: { hicache: { size: 64 } } });
    expect(l3Settings(mergeValues(inherited, request.overrides)).size).toBe("");
  });

  it("preserves compile cache, local offload, recovery, extra environment and untouched L3 options", () => {
    const request = withRecovery(planRequest({ ...EMPTY, cache: true, cacheMaxSlots: "4" }, { model: "weights" }), { ...recoverySettings(), enabled: true, model: "glm-5.3" });
    request.overrides = mergeValues(request.overrides, enabled, {
      localKVOffload: { enabled: false, hicache: { ratio: 3 } }, env: [{ name: "EXISTING", value: "keep" }],
      storageKVOffload: { mooncake: { use_hugepage: true, hugepage: { page_size: "2Mi", resource_limit: "2Gi" } }, hicache: { "write-policy": "write_back" } },
    });
    const before = structuredClone(request);
    const updated = withL3(request, { size: "48" });
    expect(updated.overrides).toMatchObject({
      cache: { enabled: true, maxSlotsPerNode: 4 }, localKVOffload: { enabled: false, hicache: { ratio: 3 } },
      continuationGateway: { enabled: true, config: { continuationModel: "glm-5.3" } }, env: [{ name: "EXISTING", value: "keep" }],
      storageKVOffload: { hicache: { size: 48, "write-policy": "write_back" }, mooncake: { use_hugepage: true, hugepage: { page_size: "2Mi", resource_limit: "2Gi" } } },
    });
    expect(request).toEqual(before);
    expect(withL3({}, { enabled: false }).overrides).toEqual({ storageKVOffload: { enabled: false } });
  });

  it("seeds upgrade fields from the final plan merge order", () => {
    const current = plan({
      catalog: mergeValues(enabled, { storageKVOffload: { hicache: { ratio: 2, size: 16 } } }),
      site: { storageKVOffload: { hicache: { size: 32 }, mooncake: { master: "etcd://site.example.com:2379" } } },
      form: { storageKVOffload: { hicache: { size: 64 }, mooncake: { device: "hca-example" } } },
      edit: { storageKVOffload: { storage_backend: "file", hicache: { size: 96, "storage-backend-extra-config": "@/etc/backend.json" } } },
    });
    expect(l3Settings(planValues(current))).toMatchObject({ enabled: true, storageBackend: "file", size: "96", ratio: "2", master: "etcd://site.example.com:2379", device: "hca-example", extraConfig: "@/etc/backend.json" });
  });

  it.each([
    [{ storageKVOffload: { storage_backend: null } }, "storageBackend"],
    [{ storageKVOffload: { storage_backend: "redis" } }, "storageBackend"],
    [{ storageKVOffload: { backend: "lmcache" } }, "backend"],
    [{ storageKVOffload: { enabled: "true" } }, "enabled"],
    [{ localKVOffload: { enabled: true } }, "localConflict"],
    [{ pd: { enabled: true, colocate: true } }, "colocate"],
    [{ commandOverride: [] }, "command"],
    [{ storageKVOffload: { hicache: { size: 1.5 } } }, "number"],
    [{ storageKVOffload: { hicache: { size: 0 } } }, "number"],
    [{ storageKVOffload: { hicache: { "host-memory-fraction": 1.1 } } }, "number"],
    [{ storageKVOffload: { hicache: { "storage-prefetch-retry-max-attempts": -1 } } }, "number"],
    [{ storageKVOffload: { hicache: { "write-policy": "wrong" } } }, "choice"],
    [{ storageKVOffload: { hicache: { "storage-backend-extra-config": "[]" } } }, "config"],
    [{ storageKVOffload: { hicache: { "storage-backend-extra-config": "invalid" } } }, "config"],
  ])("rejects invalid final composed values %j", (edit, error) => {
    expect(l3Error(plan({ form: enabled, edit }))).toBe(error);
  });

  it("accepts all and only schema-listed storage backends without claiming engine compatibility", () => {
    expect(L3_BACKENDS).toEqual(["mooncake", "file", "sim", "npu_memcache", "hf3fs", "nixl", "aibrix", "dynamic", "eic", "simm", "mori", "shm", "tensorcast", "seaweedfs"]);
    for (const storage_backend of L3_BACKENDS) expect(l3Error(plan({ form: { storageKVOffload: { enabled: true, storage_backend } } }))).toBeUndefined();
    expect(l3Error(plan({ form: enabled }, { name: "sglang", version: "0.9.26" }))).toBe("chart");
    expect(l3Error(plan({ form: enabled }, { name: "vllm", version: "0.8.23" }))).toBe("chart");
    expect(l3Error({ ...plan({ form: enabled }), engine: "vllm" })).toBe("engine");
  });

  it("rejects raw HiCache arguments that override structured L3 settings", () => {
    const values = mergeValues(enabled, { storageKVOffload: { hicache: { size: 32 } } });
    expect(l3Error(plan({ catalog: { extraArgs: ["--tp-size=8", "--hicache-size=150"] }, form: values }))).toBe("rawConflict");
    expect(l3Error(plan({ catalog: { extraArgs: ["--hicache-size", "150"] }, form: values }))).toBe("rawConflict");
    expect(l3Error(plan({ catalog: { extraArgs: ["--hicache-storage-backend=file"] }, form: values }))).toBe("rawConflict");
    expect(l3Error(plan({ catalog: { extraArgs: ["--hicache-size=150"] }, form: values, edit: { extraArgs: ["--tp-size=8"] } }))).toBeUndefined();
    expect(l3Error(plan({ form: mergeValues(values, { extraArgs: ["--hicache-size=32", "--hicache-storage-backend=mooncake"] }) }))).toBeUndefined();
    expect(l3Error(plan({ form: mergeValues(values, { extraArgs: ["--hicache-size=150", "--hicache-size=32"] }) }))).toBeUndefined();
    expect(l3Error(plan({ form: mergeValues(values, { pd: { enabled: true, prefill: { extraArgs: ["--hicache-size=150"] } } }) }))).toBe("rawConflict");
  });

  it("keeps invalid numeric input invalid across JSON transport so YAML can repair it", () => {
    const request = JSON.parse(JSON.stringify(withL3({}, { enabled: true, storageBackend: "file", size: "NaN" }))) as PlanRequest;
    expect(l3Error(plan({ form: request.overrides! }))).toBe("number");
    expect(l3Error(plan({ form: request.overrides!, edit: { storageKVOffload: { hicache: { size: 8 } } } }))).toBeUndefined();
  });

  it("uses authoritative YAML to enable, repair conflicts or disable L3", () => {
    expect(l3Error(plan({ edit: enabled }))).toBeUndefined();
    expect(l3Error(plan({ form: mergeValues(enabled, { localKVOffload: { enabled: true } }), edit: { localKVOffload: { enabled: false } } }))).toBeUndefined();
    expect(l3Error(plan({ form: enabled, edit: { storageKVOffload: { enabled: false } } }, { name: "vllm", version: "0.8.23" }))).toBeUndefined();
    expect(l3Error(plan({ form: mergeValues(enabled, { pd: { enabled: true, colocate: false } }) }))).toBeUndefined();
  });

  it("validates the final upgrade plan after adaptive cleanup while preserving inherited L3 and YAML", async () => {
    const current = plan({ form: mergeValues(enabled, { serviceId: "model", storageKVOffload: { mooncake: { device: "hca-example" } }, modelRoute: { nginx: { values: { adaptive_cc: "false", adaptive_cc_init: "4" } } } }), edit: { storageKVOffload: { hicache: { size: 96 } } } });
    const form = formFromPlan(current);
    const request = withL3(planRequest(form, { model: "weights", fromRelease: "model" }), { size: "48" });
    const requests: PlanRequest[] = [];
    const final = await composeAdaptivePlan(request, form, undefined, async (input) => {
      requests.push(input);
      return plan({ form: input.fromRelease ? mergeValues(current.layers.form, input.overrides) : input.overrides!, edit: current.layers.edit });
    });
    expect(requests).toHaveLength(2);
    expect(requests[1].fromRelease).toBeUndefined();
    expect(planValues(final).storageKVOffload).toMatchObject({ enabled: true, storage_backend: "mooncake", hicache: { size: 96 }, mooncake: { device: "hca-example" } });
    expect(l3Error(final)).toBeUndefined();
  });

  it("renders a disabled switch with the actual vLLM or old-chart limitation", () => {
    const old = renderToStaticMarkup(fields({}, { name: "sglang", version: "0.9.26" }));
    expect(old).toContain("0.9.27");
    expect(old).toContain('aria-disabled="true"');
    const vllm = renderToStaticMarkup(fields({}, { name: "vllm", version: "0.9.0" }));
    expect(vllm).toContain("尚未实现 L3");
    expect(vllm).toContain("L2");
  });

  it("renders backend and essential inputs only when enabled, with Mooncake-specific endpoints", () => {
    const off = renderToStaticMarkup(fields());
    expect(off).toContain("L3 KV 缓存");
    expect(off).not.toContain("主机内存池大小");
    const on = renderToStaticMarkup(fields(mergeValues(enabled, { storageKVOffload: { mooncake: { master: "etcd://store.example.com:2379" } } })));
    expect(on).toContain("存储后端");
    expect(on).toContain("主机内存池大小");
    expect(on).toContain("后端配置");
    expect(on).toContain("Mooncake master 地址");
    expect(on).toContain('value="etcd://store.example.com:2379"');
    expect(on).toContain("更多 HiCache 参数");
    const file = renderToStaticMarkup(fields({ storageKVOffload: { enabled: true, storage_backend: "file" } }));
    expect(file).toContain("后端配置");
    expect(file).not.toContain("Mooncake master 地址");
  });

  it("associates storage and memory-mode labels with their dropdown triggers", () => {
    const html = renderToStaticMarkup(fields(enabled));
    const labels = [...html.matchAll(/<label\b[^>]*for="([^"]+)"[^>]*>([\s\S]*?)<\/label>/g)];
    for (const name of ["存储后端", "主机内存模式"]) {
      const label = labels.find((match) => match[2].includes(name));
      expect(label, name).toBeDefined();
      const trigger = [...html.matchAll(/<button\b([^>]*)>/g)].find((match) => match[1].includes(`id="${label?.[1]}"`));
      expect(trigger?.[1], name).toContain('role="combobox"');
    }
  });

  it("keeps L3 under resources and compile-cache controls under Advanced", () => {
    const html = renderToStaticMarkup(<DeployForm form={EMPTY} onChange={() => {}} submitted={false} target={null}
      defaults={{ cache: { defaults: { hostPath: "/cache", historyLimit: 2, maxSlotsPerNode: 8 }, siteOn: false } }} gpuOptions={[]}
      expanded={{ basic: false, resources: true, routing: false, advanced: true }} onExpand={() => {}} idPrefix="test-" l3={fields()} />);
    expect(html).toContain("编译缓存");
    expect(html.indexOf("L3 KV 缓存")).toBeLessThan(html.indexOf('id="test-advanced"'));
    expect(html.indexOf('id="test-advanced"')).toBeLessThan(html.indexOf("编译缓存"));
  });
});
