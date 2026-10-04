import { ApiError, apiFetch, request } from "@/shell";

export interface K8sEvent {
  type: string;
  reason: string;
  message: string;
  count: number;
  firstTimestamp?: string;
  lastTimestamp?: string;
  kind: string;
  name: string;
  source?: string;
}

export interface PodContainer {
  name: string;
  init?: boolean;
  ready: boolean;
  restartCount: number;
  state: "running" | "waiting" | "terminated";
  reason?: string;
}

export interface PodInfo {
  name: string;
  phase: string;
  node?: string;
  containers: PodContainer[];
}

export interface LogQuery {
  container?: string;
  tailLines?: number;
  sinceSeconds?: number;
  previous?: boolean;
}

const ns = (namespace: string) => `/api/k8s/namespaces/${encodeURIComponent(namespace)}`;

export const workloadApi = {
  events: (namespace: string, prefix: string) => request<{ items: K8sEvent[] }>("GET", `${ns(namespace)}/events?prefix=${encodeURIComponent(prefix)}`),
  pod: (namespace: string, pod: string) => request<PodInfo>("GET", `${ns(namespace)}/pods/${encodeURIComponent(pod)}`),
  log: async (namespace: string, pod: string, q: LogQuery) => {
    const p = new URLSearchParams();
    if (q.container) p.set("container", q.container);
    if (q.tailLines) p.set("tailLines", String(q.tailLines));
    if (q.sinceSeconds) p.set("sinceSeconds", String(q.sinceSeconds));
    if (q.previous) p.set("previous", "true");
    const res = await apiFetch(`${ns(namespace)}/pods/${encodeURIComponent(pod)}/log?${p}`);
    if (!res.ok) {
      let msg = res.statusText;
      try {
        msg = (await res.json())?.error ?? msg;
      } catch {
        /* plain-text error */
      }
      throw new ApiError(res.status, msg);
    }
    return res.text();
  },
};
