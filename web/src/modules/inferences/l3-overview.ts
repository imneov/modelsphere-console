import { api, type ClusterInfo, type Deployment, type Plan, type ReleaseStatus } from "@swiss/lib/api";
import { isUninstalling } from "@swiss/lib/phase";
import { l3Settings, l3Supported } from "./l3-cache";
import { planValues } from "./recovery";

export const L3_PAGE_SIZE = 25;
export type L3State = "on" | "off" | "unsupported" | "unknown" | "unreadable" | "loading";
export interface L3Overview {
  state: L3State;
  support: "supported" | "unsupported" | "unknown";
  backend: string;
  size: string;
  ratio: string;
  memoryFraction: string;
  chart: string;
  engine: string;
}

export function l3Overview(plan?: Plan, error?: Error | null, pending = false): L3Overview {
  const values = plan ? planValues(plan) : {};
  const settings = l3Settings(values);
  const supported = plan ? l3Supported(plan.chart, plan.engine) : undefined;
  const raw = values.storageKVOffload;
  const enabled = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as { enabled?: unknown }).enabled : undefined;
  return {
    state: error ? "unreadable" : pending && !plan ? "loading" : !plan?.layers ? "unknown" : supported === false ? "unsupported" : enabled === true ? "on" : enabled === false ? "off" : "unknown",
    support: supported === undefined ? "unknown" : supported ? "supported" : "unsupported",
    backend: settings.storageBackend,
    size: settings.size,
    ratio: settings.ratio,
    memoryFraction: settings.memoryFraction,
    chart: plan ? `${plan.chart.name} ${plan.chart.version}`.trim() : "",
    engine: plan?.engine ?? "",
  };
}

export function l3ConfigureBlocked(deployment: Deployment, cluster?: ClusterInfo, plan?: Plan, status?: ReleaseStatus): string | undefined {
  if (!cluster) return "clusterUnknown";
  if (!cluster.allowDeploy) return "readOnly";
  if (isUninstalling(deployment) || (status && isUninstalling(status))) return "uninstalling";
  if (!deployment.model && !plan?.source.model) return "untracked";
  if (!plan?.layers) return "planUnknown";
  if (!l3Supported(plan.chart, plan.engine)) return "unsupported";
  if (!status) return "statusUnknown";
  if (!status.exists) return "notInstalled";
  return undefined;
}

export function l3RowQueries(deployments: readonly Deployment[]) {
  return {
    plans: deployments.map((d) => ({
      queryKey: ["releasePlan", d.namespace, d.release],
      queryFn: () => api.releasePlan(d.namespace, d.release),
      retry: false as const,
      refetchInterval: 30_000,
    })),
    statuses: deployments.map((d) => ({
      queryKey: ["status", d.namespace, d.release],
      queryFn: () => api.status(d.namespace, d.release),
      retry: false as const,
      refetchInterval: 15_000,
    })),
  };
}

export function l3PageCounts(rows: readonly L3Overview[]) {
  return {
    total: rows.length,
    on: rows.filter((r) => r.state === "on").length,
    off: rows.filter((r) => r.state === "off").length,
    unsupported: rows.filter((r) => r.state === "unsupported").length,
    unknown: rows.filter((r) => ["unknown", "unreadable", "loading"].includes(r.state)).length,
  };
}
