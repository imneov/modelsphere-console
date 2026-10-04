import { describe, expect, it } from "vitest";
import type { Node } from "@swiss/lib/api";
import { byInventory, conditionTone, countByFocus, largestFree, matchesFocus, matchesQuery, nodeState, productsOf, taintTone, totals } from "@/modules/inferences/nodes-lib";

const node = (over: Partial<Node>): Node => ({ Name: "n", GPUProduct: "H100", GPUs: 8, Schedulable: true, Ready: true, gpusUsed: 0, gpusFree: 8, ...over });

const nodes = [
  node({ Name: "a", gpusUsed: 8, gpusFree: 0 }),
  node({ Name: "b", gpusUsed: 2, gpusFree: 6 }),
  node({ Name: "c", Schedulable: false, gpusFree: 8 }),
  node({ Name: "d", GPUs: 0, GPUProduct: "", gpusFree: 0 }),
  node({ Name: "e", GPUProduct: "", GPUResource: "huawei.com/Ascend910", GPUs: 4, gpusFree: 4 }),
];

describe("focus", () => {
  it("counts each bucket, room and full only among placeable GPU nodes", () => {
    expect(countByFocus(nodes, true)).toEqual({ gpu: 4, room: 2, full: 1, unavailable: 1, cpu: 1 });
  });
  it("cannot tell room from full when usage is unknown", () => {
    expect(countByFocus(nodes, false)).toMatchObject({ room: 0, full: 0 });
    expect(matchesFocus(nodes[1]!, "room", false)).toBe(false);
  });
  it("searches names, taints and the pods a node holds", () => {
    expect(matchesQuery(node({ Taints: ["gpu=true:NoSchedule"] }), "NOSCHED")).toBe(true);
    expect(matchesQuery(node({ gpuPods: [{ namespace: "ai", name: "qwen-0", gpus: 1 }] }), "qwen")).toBe(true);
    expect(matchesQuery(node({}), "x")).toBe(false);
  });
});

describe("inventory", () => {
  it("sorts by free GPUs when looking for room", () => {
    expect([...nodes].sort(byInventory("room")).map((n) => n.Name).slice(0, 3)).toEqual(["c", "b", "e"]);
  });
  it("groups GPUs by product, unlabelled ones by resource", () => {
    const p = productsOf(nodes, true);
    expect(p.map((x) => [x.key, x.gpus, x.largest, x.unavailable])).toEqual([
      ["H100", 24, 6, 1],
      ["huawei.com/Ascend910 (unlabelled)", 4, 4, 0],
    ]);
  });
  it("finds the largest room on one schedulable node", () => {
    expect(largestFree(nodes, true)).toEqual({ free: 6, names: ["b"] });
    expect(largestFree(nodes, false)).toEqual({ free: 0, names: [] });
  });
  it("totals free GPUs, and those on schedulable nodes apart", () => {
    expect(totals(nodes)).toEqual({ gpus: 28, used: 10, free: 18, placeableFree: 10, gpuNodes: 4 });
  });
});

describe("tones", () => {
  it("reads node, condition and taint state", () => {
    expect(nodeState(node({ Ready: false })).key).toBe("notReady");
    expect(nodeState(node({ Schedulable: false })).key).toBe("cordoned");
    expect(conditionTone({ Type: "Ready", Status: "False" })).toBe("error");
    expect(conditionTone({ Type: "MemoryPressure", Status: "True" })).toBe("warning");
    expect(taintTone("a=b:NoExecute")).toBe("error");
  });
});
