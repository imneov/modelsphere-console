import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { api, type ClusterInfo, type Deployment, type Plan, type ReleaseStatus } from "@swiss/lib/api";
import { ModuleProvider } from "@/shell/module";
import { L3CachePage } from "./L3CachePage";
import { L3_PAGE_SIZE, l3ConfigureBlocked, l3Overview, l3PageCounts, l3RowQueries } from "./l3-overview";

const cluster: ClusterInfo = { name: "site", profile: "site", catalog: "catalog", version: "1", allowDeploy: true };
const deployment = (release: string, extra: Partial<Deployment> = {}): Deployment => ({ release, namespace: "models", model: "weights", ...extra });
const plan = (layers: Plan["layers"] = {}): Plan => ({
  apiVersion: "swiss.modelsphere.dev/v1alpha1", release: { name: "service", namespace: "models" },
  source: { model: "weights", variant: "default" }, chart: { name: "sglang", version: "0.9.27" }, engine: "sglang", profile: "site", layers, hash: "hash",
});
const status: ReleaseStatus = { release: "service", namespace: "models", exists: true, revision: 1, pods: [], ready: 0, total: 0 };
const enabled = { storageKVOffload: { enabled: true, storage_backend: "mooncake", hicache: { size: 32, ratio: 2 } } };
const legacy = () => {
  const { layers: _layers, ...old } = plan();
  return old as Plan;
};
afterEach(() => vi.restoreAllMocks());

function render(rows: Deployment[], plans: Record<string, Plan | Error>, options: { readOnly?: boolean; total?: number } = {}) {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity } } });
  c.setQueryData(["cluster"], { ...cluster, allowDeploy: !options.readOnly });
  c.setQueryData(["deployments", "l3-overview", 1, L3_PAGE_SIZE], {
    cluster: "site", catalogRef: "r", deployments: rows, page: 1, perPage: L3_PAGE_SIZE, summary: { total: options.total ?? rows.length, catalogBehind: 0 },
  });
  for (const d of rows) {
    const value = plans[d.release];
    if (value instanceof Error) c.getQueryCache().build(c, { queryKey: ["releasePlan", d.namespace, d.release] }).setState({ status: "error", error: value });
    else if (value) c.setQueryData(["releasePlan", d.namespace, d.release], value);
    c.setQueryData(["status", d.namespace, d.release], status);
  }
  return renderToStaticMarkup(<QueryClientProvider client={c}><ModuleProvider module={{ id: "inferences", title: "模型服务", basePath: "/inferences", pages: [] }}><MemoryRouter><L3CachePage /></MemoryRouter></ModuleProvider></QueryClientProvider>);
}

function row(html: string, release: string) {
  return html.split(/<tr\b/).find((r) => r.includes(`>${release}</a>`)) ?? "";
}
function configureDisabled(html: string) {
  const button = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].find((match) => match[2].replace(/<[^>]+>/g, "").trim() === "配置");
  expect(button).toBeDefined();
  return /(?:^|\s)disabled(?:\s*=|\s|$)/.test(button![1]);
}

describe("L3 overview desired configuration", () => {
  it("distinguishes explicit on and off from absent, invalid and unreadable configuration", () => {
    expect(l3Overview(plan({ form: enabled })).state).toBe("on");
    expect(l3Overview(plan({ form: { storageKVOffload: { enabled: false } } })).state).toBe("off");
    expect(l3Overview(plan()).state).toBe("unknown");
    expect(l3Overview(plan({ form: { storageKVOffload: { enabled: "true" } } })).state).toBe("unknown");
    expect(l3Overview().state).toBe("unknown");
    expect(l3Overview(undefined, new Error("denied")).state).toBe("unreadable");
    expect(l3Overview(undefined, null, true).state).toBe("loading");
    expect(l3Overview(legacy()).state).toBe("unknown");
  });

  it("keeps legacy unsupported charts unknown while reporting unsupported chart and engine", () => {
    const historic = { ...legacy(), chart: { name: "glm", version: "0.1.0" }, engine: "glm" };
    expect(l3Overview(historic)).toMatchObject({ state: "unknown", support: "unsupported", chart: "glm 0.1.0", engine: "glm" });
    expect(l3Overview({ ...plan(), engine: "vllm" }).state).toBe("unsupported");
    expect(l3Overview({ ...plan(), chart: { name: "sglang", version: "0.9.26" } }).support).toBe("unsupported");
  });

  it("shows inherited effective host values without inventing backend or capacity defaults", () => {
    const p = plan({ catalog: enabled, site: { storageKVOffload: { hicache: { size: 64 } } }, edit: { storageKVOffload: { storage_backend: "file", hicache: { "host-memory-fraction": 0.5 } } } });
    expect(l3Overview(p)).toMatchObject({ state: "on", backend: "file", size: "64", ratio: "2", memoryFraction: "0.5" });
    expect(l3Overview(plan())).toMatchObject({ backend: "", size: "", ratio: "", memoryFraction: "" });
  });

  it("counts only supplied page rows and includes unreadable and loading in unknown", () => {
    const oldUnsupported = { ...legacy(), engine: "glm", chart: { name: "glm", version: "1.0.0" } };
    expect(l3PageCounts([l3Overview(plan({ form: enabled })), l3Overview(oldUnsupported), l3Overview(undefined, new Error("denied")), l3Overview(undefined, null, true)])).toEqual({ total: 4, on: 1, off: 0, unsupported: 0, unknown: 3 });
  });
});

describe("L3 overview Configure guards", () => {
  it("opens configuration only for an installed supported service with readable configuration", () => {
    expect(l3ConfigureBlocked(deployment("service"), cluster, plan({ form: enabled }), status)).toBeUndefined();
    expect(l3ConfigureBlocked(deployment("service"), cluster, plan(), status)).toBeUndefined();
    expect(l3ConfigureBlocked(deployment("service", { model: undefined }), cluster, plan(), status)).toBeUndefined();
  });
  it.each([
    ["clusterUnknown", deployment("service"), undefined, plan(), status],
    ["readOnly", deployment("service"), { ...cluster, allowDeploy: false }, plan(), status],
    ["uninstalling", deployment("service", { phase: "uninstalling" }), cluster, plan(), status],
    ["uninstalling", deployment("service"), cluster, plan(), { ...status, llmservice: { phase: "uninstalling" } }],
    ["planUnknown", deployment("service"), cluster, legacy(), status],
    ["unsupported", deployment("service"), cluster, { ...plan(), engine: "vllm" }, status],
    ["statusUnknown", deployment("service"), cluster, plan(), undefined],
    ["notInstalled", deployment("service"), cluster, plan(), { ...status, exists: false }],
    ["untracked", deployment("service", { model: undefined }), cluster, undefined, status],
  ] as const)("blocks %s", (reason, d, site, stored, live) => {
    expect(l3ConfigureBlocked(d, site, stored, live)).toBe(reason);
  });
});

describe("L3 overview page query scope", () => {
  it("fetches plans and status only for the supplied paginated rows, including namespace identity", async () => {
    const page = [deployment("same"), deployment("same", { namespace: "other" })];
    const plans = vi.spyOn(api, "releasePlan").mockResolvedValue(plan());
    const statuses = vi.spyOn(api, "status").mockResolvedValue(status);
    const queries = l3RowQueries(page);
    expect(L3_PAGE_SIZE).toBe(25);
    expect(queries.plans.map((q) => q.queryKey)).toEqual([["releasePlan", "models", "same"], ["releasePlan", "other", "same"]]);
    await Promise.all([...queries.plans, ...queries.statuses].map((q) => q.queryFn()));
    expect(plans.mock.calls).toEqual([["models", "same"], ["other", "same"]]);
    expect(statuses.mock.calls).toEqual([["models", "same"], ["other", "same"]]);
    expect(l3RowQueries([])).toEqual({ plans: [], statuses: [] });
  });
});

describe("L3 overview rendered UI", () => {
  it("renders real query data, inherited capacity, page scope and navigation without cache-hit claims", () => {
    const html = render([deployment("active")], { active: plan({ form: enabled, edit: { storageKVOffload: { hicache: { size: 96 } } } }) }, { total: 51 });
    expect(html).toContain("L3 KV 缓存");
    expect(html).toContain("mooncake");
    expect(html).toContain("96 GB");
    expect(html).toContain("本页 1 个 · 共 51 个服务");
    expect(html).toContain("仅统计当前页");
    expect(html).toContain("期望配置，不代表实际缓存活动或命中率");
    expect(html).toContain("服务详情");
    expect(html).toContain("从模型库部署");
    expect(html).toContain('/inferences/active/details?namespace=models');
    expect(configureDisabled(row(html, "active"))).toBe(false);
  });

  it("renders historic plans and failed reads as unknown or unreadable rather than configured off", () => {
    const html = render([deployment("historic", { chart: "glm-0.1.0" }), deployment("denied")], { historic: { ...legacy(), chart: { name: "glm", version: "0.1.0" }, engine: "glm" }, denied: new Error("plan access denied") });
    expect(row(html, "historic")).toContain("未知");
    expect(row(html, "historic")).toContain("不支持");
    expect(row(html, "historic")).not.toContain("已配置关闭");
    expect(configureDisabled(row(html, "historic"))).toBe(true);
    expect(row(html, "denied")).toContain("读取失败");
    expect(row(html, "denied")).toContain("plan access denied");
  });

  it("disables Configure for read-only and uninstalling services and preserves service details", () => {
    const readOnly = render([deployment("readonly")], { readonly: plan({ form: enabled }) }, { readOnly: true });
    expect(configureDisabled(row(readOnly, "readonly"))).toBe(true);
    expect(readOnly).toContain("当前站点为只读模式");
    const tearingDown = render([deployment("removing", { phase: "uninstalling" })], { removing: plan({ form: enabled }) });
    expect(configureDisabled(row(tearingDown, "removing"))).toBe(true);
    expect(row(tearingDown, "removing")).toContain("卸载中");
    expect(row(tearingDown, "removing")).toContain("服务详情");
  });

  it("renders an empty state with an existing model-library deploy action", () => {
    const html = render([], {});
    expect(html).toContain("暂无推理服务");
    expect(html).toContain("从模型库部署");
  });
});
