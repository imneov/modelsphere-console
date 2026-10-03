import type { Node, NodeCondition } from "@swiss/lib/api";

// Ported from swiss's Nodes page, where they are page-local. `known` is whether
// GPU usage was measured: the cluster-wide pod list can be refused, and then
// free and used are unknown, not zero.

export const FOCUSES = ["all", "gpu", "room", "full", "unavailable", "cpu"] as const;
export type Focus = (typeof FOCUSES)[number];

export function placeable(n: Node): boolean {
  return n.GPUs > 0 && n.Ready && n.Schedulable;
}

export function matchesFocus(n: Node, focus: Focus, known: boolean): boolean {
  switch (focus) {
    case "all":
      return true;
    case "gpu":
      return n.GPUs > 0;
    case "room":
      return known && placeable(n) && (n.gpusFree ?? 0) > 0;
    case "full":
      return known && placeable(n) && (n.gpusFree ?? 0) === 0;
    case "unavailable":
      return !n.Ready || !n.Schedulable;
    case "cpu":
      return n.GPUs === 0;
  }
}

export function matchesQuery(n: Node, q: string): boolean {
  if (!q) return true;
  const hay = [n.Name, n.Kubelet ?? "", n.InternalIP ?? "", n.ExternalIP ?? "", n.GPUProduct, n.GPUResource ?? "", ...(n.Taints ?? []), ...(n.gpuPods ?? []).flatMap((p) => [p.name, p.namespace])];
  return hay.join("\n").toLowerCase().includes(q.toLowerCase());
}

export function byInventory(focus: Focus) {
  return (a: Node, b: Node) => {
    if (focus === "room") return (b.gpusFree ?? 0) - (a.gpusFree ?? 0) || a.Name.localeCompare(b.Name);
    return b.GPUs - a.GPUs || (b.gpusUsed ?? 0) - (a.gpusUsed ?? 0) || a.Name.localeCompare(b.Name);
  };
}

export function countByFocus(nodes: Node[], known: boolean): Record<Exclude<Focus, "all">, number> {
  const counts = { gpu: 0, room: 0, full: 0, unavailable: 0, cpu: 0 };
  for (const n of nodes) {
    if (n.GPUs > 0) counts.gpu += 1;
    else counts.cpu += 1;
    if (!n.Ready || !n.Schedulable) counts.unavailable += 1;
    if (known && placeable(n)) {
      if ((n.gpusFree ?? 0) > 0) counts.room += 1;
      else counts.full += 1;
    }
  }
  return counts;
}

// A node with GPUs but no product label is grouped by its extended resource.
export function productOf(n: Node): { key: string; resource?: string; unlabelled: boolean } {
  if (n.GPUProduct) return { key: n.GPUProduct, unlabelled: false };
  return { key: n.GPUResource ? `${n.GPUResource} (unlabelled)` : "unlabelled", resource: n.GPUResource, unlabelled: true };
}

export interface Product {
  key: string;
  unlabelled: boolean;
  gpus: number;
  used: number;
  free: number;
  nodes: number;
  largest: number;
  unavailable: number;
}

export function productsOf(nodes: Node[], known: boolean): Product[] {
  const map = new Map<string, Product>();
  for (const n of nodes) {
    if (n.GPUs === 0) continue;
    const p = productOf(n);
    const agg = map.get(p.key) ?? { key: p.key, unlabelled: p.unlabelled, gpus: 0, used: 0, free: 0, nodes: 0, largest: 0, unavailable: 0 };
    agg.gpus += n.GPUs;
    agg.used += n.gpusUsed ?? 0;
    agg.free += n.gpusFree ?? 0;
    agg.nodes += 1;
    if (!n.Ready || !n.Schedulable) agg.unavailable += 1;
    if (known && placeable(n) && (n.gpusFree ?? 0) > agg.largest) agg.largest = n.gpusFree ?? 0;
    map.set(p.key, agg);
  }
  return [...map.values()].sort((a, b) => b.gpus - a.gpus || a.key.localeCompare(b.key));
}

// The most free GPUs on one schedulable node: the largest single deploy that fits now.
export function largestFree(nodes: Node[], known: boolean): { free: number; names: string[] } {
  if (!known) return { free: 0, names: [] };
  let free = 0;
  let names: string[] = [];
  for (const n of nodes) {
    if (!placeable(n)) continue;
    const f = n.gpusFree ?? 0;
    if (f > free) {
      free = f;
      names = [n.Name];
    } else if (f === free && f > 0) names.push(n.Name);
  }
  return { free, names };
}

export function totals(nodes: Node[]) {
  let gpus = 0;
  let used = 0;
  let free = 0;
  let placeableFree = 0;
  let gpuNodes = 0;
  for (const n of nodes) {
    if (n.GPUs === 0) continue;
    gpuNodes += 1;
    gpus += n.GPUs;
    used += n.gpusUsed ?? 0;
    free += n.gpusFree ?? 0;
    if (placeable(n)) placeableFree += n.gpusFree ?? 0;
  }
  return { gpus, used, free, placeableFree, gpuNodes };
}

export type Tone = "success" | "warning" | "error" | "neutral";

export function nodeState(n: Node): { key: "ready" | "cordoned" | "notReady"; tone: Tone } {
  if (!n.Ready) return { key: "notReady", tone: "error" };
  if (!n.Schedulable) return { key: "cordoned", tone: "warning" };
  return { key: "ready", tone: "success" };
}

export function conditionTone(c: NodeCondition): Tone {
  const problem = c.Type !== "Ready";
  if (c.Status === "True") return problem ? "warning" : "success";
  if (c.Status === "False") return problem ? "neutral" : "error";
  return "neutral";
}

export function taintTone(t: string): Tone {
  if (t.endsWith(":NoExecute")) return "error";
  if (t.endsWith(":NoSchedule")) return "warning";
  return "neutral";
}
