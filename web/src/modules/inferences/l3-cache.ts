import type { Plan, PlanRequest } from "@swiss/lib/api";
import { mergeValues, planValues } from "./recovery";

export const L3_SCHEMA_BACKENDS = ["mooncake", "file", "sim", "npu_memcache", "hf3fs", "nixl", "aibrix", "dynamic", "eic", "simm", "mori", "shm", "tensorcast", "seaweedfs"] as const;
export const L3_FIELDS = {
  hostMode: { group: "hicache", key: "host-memory-mode", choices: ["cache", "buffer_only"] },
  ratio: { group: "hicache", key: "ratio", number: true },
  size: { group: "hicache", key: "size", number: true, integer: true, min: 1 },
  memoryFraction: { group: "hicache", key: "host-memory-fraction", number: true, min: 0, max: 1 },
  writePolicy: { group: "hicache", key: "write-policy", choices: ["write_back", "write_through", "write_through_selective"] },
  ioBackend: { group: "hicache", key: "io-backend", choices: ["direct", "kernel", "kernel_ascend"] },
  layout: { group: "hicache", key: "mem-layout", choices: ["layer_first", "page_first", "page_first_direct", "page_first_kv_split", "page_head"] },
  prefetchPolicy: { group: "hicache", key: "storage-prefetch-policy", choices: ["best_effort", "wait_complete", "timeout"] },
  extraConfig: { group: "hicache", key: "storage-backend-extra-config" },
  retryInterval: { group: "hicache", key: "storage-prefetch-retry-poll-interval", number: true, integer: true, min: 0 },
  retryAttempts: { group: "hicache", key: "storage-prefetch-retry-max-attempts", number: true, integer: true, min: 0 },
  master: { group: "mooncake", key: "master" },
  metadata: { group: "mooncake", key: "te_meta_data_server" },
  protocol: { group: "mooncake", key: "protocol" },
  device: { group: "mooncake", key: "device" },
  segmentSize: { group: "mooncake", key: "global_segment_size" },
} satisfies Record<string, L3Field>;

interface L3Field {
  group: "hicache" | "mooncake";
  key: string;
  choices?: readonly string[];
  number?: boolean;
  integer?: boolean;
  min?: number;
  max?: number;
}
export type L3FieldName = keyof typeof L3_FIELDS;
export type L3Settings = { enabled: boolean; storageBackend: string } & Record<L3FieldName, string>;
export type L3Patch = Partial<L3Settings>;
type Tree = Record<string, unknown>;
const object = (value: unknown): Tree => value && typeof value === "object" && !Array.isArray(value) ? value as Tree : {};

export function l3Supported(chart: { name?: string; version?: string }, engine?: string): boolean {
  if (chart.name !== "sglang" || engine !== "sglang") return false;
  const match = /^(\d+)\.(\d+)\.(\d+)(?:\+[\w.-]+)?$/.exec(chart.version ?? "");
  if (!match) return false;
  const [major, minor, patch] = match.slice(1).map(Number);
  return major > 0 || minor > 9 || (minor === 9 && patch >= 27);
}

export function l3Settings(values: Tree = {}): L3Settings {
  const storage = object(values.storageKVOffload);
  const groups = { hicache: object(storage.hicache), mooncake: object(storage.mooncake) };
  const fields = Object.fromEntries(Object.entries(L3_FIELDS).map(([name, field]) => [name, groups[field.group][field.key] == null ? "" : String(groups[field.group][field.key])])) as Record<L3FieldName, string>;
  return { ...fields, enabled: storage.enabled === true, storageBackend: typeof storage.storage_backend === "string" ? storage.storage_backend : "" };
}

export function localOffloadEnabled(values: Tree): boolean {
  return object(values.localKVOffload).enabled === true;
}

export function withL3(request: PlanRequest, patch: L3Patch): PlanRequest {
  if (!Object.keys(patch).length) return request;
  const storage: Tree = {};
  if (patch.enabled !== undefined) {
    storage.enabled = patch.enabled;
    if (patch.enabled) storage.backend = "hicache";
  }
  if (patch.storageBackend !== undefined) storage.storage_backend = patch.storageBackend.trim() || null;
  for (const [name, field] of Object.entries(L3_FIELDS) as [L3FieldName, L3Field][]) {
    const raw = patch[name];
    if (raw === undefined) continue;
    const text = raw.trim();
    const value = !text ? null : field.number && Number.isFinite(Number(text)) ? Number(text) : text;
    storage[field.group] = { ...object(storage[field.group]), [field.key]: value };
  }
  return { ...request, overrides: mergeValues(request.overrides, { storageKVOffload: storage }) };
}

export type L3Error = "chart" | "engine" | "enabled" | "backend" | "storageBackend" | "localConflict" | "colocate" | "command" | "number" | "choice" | "config" | "rawConflict";

export function l3Error(plan: Plan): L3Error | undefined {
  const values = planValues(plan);
  const storage = object(values.storageKVOffload);
  if (storage.enabled === undefined || storage.enabled === false) return;
  if (storage.enabled !== true) return "enabled";
  if (plan.chart.name !== "sglang" || !l3Supported(plan.chart, "sglang")) return "chart";
  if (plan.engine !== "sglang") return "engine";
  if (storage.backend !== undefined && storage.backend !== "hicache") return "backend";
  if (!L3_SCHEMA_BACKENDS.includes(storage.storage_backend as typeof L3_SCHEMA_BACKENDS[number])) return "storageBackend";
  if (localOffloadEnabled(values)) return "localConflict";
  const pd = object(values.pd);
  if (pd.enabled === true && pd.colocate === true) return "colocate";
  if (values.commandOverride !== undefined && values.commandOverride !== null) return "command";
  const groups = { hicache: object(storage.hicache), mooncake: object(storage.mooncake) };
  for (const field of Object.values(L3_FIELDS) as L3Field[]) {
    const value = groups[field.group][field.key];
    if (value == null) continue;
    if (field.number) {
      if (typeof value !== "number" || !Number.isFinite(value) || (field.integer && !Number.isInteger(value)) || (field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max)) return "number";
    } else if (field.choices) {
      if (typeof value !== "string" || !field.choices.includes(value)) return "choice";
    } else if (typeof value !== "string" && !(field.key === "global_segment_size" && typeof value === "number" && Number.isInteger(value))) return "choice";
  }
  const configured = new Map<string, unknown>([
    ["storage-backend", storage.storage_backend],
    ...Object.entries(groups.hicache).filter(([, value]) => value != null),
  ]);
  const raw = new Map<string, unknown>();
  for (const args of [values.extraArgs, ...(pd.enabled === true ? [object(pd.prefill).extraArgs] : [])]) {
    if (!Array.isArray(args)) continue;
    for (let index = 0; index < args.length; index++) {
      const match = /^--hicache-([a-z0-9-]+)(?:=(.*))?$/.exec(String(args[index]));
      if (match) raw.set(match[1], match[2] ?? args[++index]);
    }
  }
  for (const [key, value] of raw) {
    if (!configured.has(key)) continue;
    const expected = configured.get(key);
    if (typeof expected === "number" ? Number(value) !== expected : String(value) !== String(expected)) return "rawConflict";
  }
  const config = groups.hicache["storage-backend-extra-config"];
  if (typeof config === "string" && !config.startsWith("@")) {
    try {
      const parsed: unknown = JSON.parse(config);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "config";
    } catch {
      return "config";
    }
  }
}
