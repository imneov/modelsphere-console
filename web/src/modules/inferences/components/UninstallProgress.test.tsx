import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReleaseStatus } from "@swiss/lib/api";
import { UninstallProgress } from "./UninstallProgress";

const status = (over: Partial<ReleaseStatus> = {}): ReleaseStatus => ({
  release: "qwen", namespace: "models", exists: false, revision: 0,
  pods: [{ name: "qwen-0", phase: "Running", ready: true, restarts: 0, ageSeconds: 30 }],
  ready: 1, total: 1, planStatus: { phase: "uninstalling" }, ...over,
});

describe("uninstall progress", () => {
  it("shows remaining pods even after Helm has removed the release", () => {
    const html = renderToStaticMarkup(<UninstallProgress status={status()} onViewInstances={() => {}} />);
    expect(html).toContain("还剩 1 个 Pod");
    expect(html).toContain("查看实例");
    expect(html).toContain('role="status"');
  });

  it("waits for backend confirmation when no pods remain", () => {
    const html = renderToStaticMarkup(<UninstallProgress status={status({ pods: [], total: 0, ready: 0 })} onViewInstances={() => {}} />);
    expect(html).toContain("Pod 已清空，等待后端确认资源清理完成");
    expect(html).not.toContain("查看实例");
    expect(html).not.toContain("卸载完成");
  });

  it("shows remaining pods for a deleting LLMService with ready pods", () => {
    const html = renderToStaticMarkup(<UninstallProgress status={status({ exists: true, planStatus: undefined, backend: "llmsvc", llmservice: { phase: "uninstalling" } })} />);
    expect(html).toContain("还剩 1 个 Pod");
    expect(html).not.toContain("查看实例");
  });

  it("prefers the operator's remaining count and shows its cleanup message", () => {
    const html = renderToStaticMarkup(<UninstallProgress status={status({ backend: "llmsvc", llmservice: { phase: "uninstalling", deletion: { podsRemaining: 3, message: "Waiting for worker shutdown" } } })} />);
    expect(html).toContain("还剩 3 个 Pod");
    expect(html).toContain("Waiting for worker shutdown");
  });

  it("does not claim pods are cleared when their status could not be read", () => {
    const html = renderToStaticMarkup(<UninstallProgress status={status({ pods: [], total: 0, ready: 0, warning: "pods forbidden" })} />);
    expect(html).toContain("暂时无法确认剩余 Pod");
    expect(html).not.toContain("Pod 已清空");
  });

  it("does not show teardown progress for a serving release", () => {
    expect(renderToStaticMarkup(<UninstallProgress status={status({ exists: true, planStatus: { phase: "applied" } })} />)).toBe("");
  });
});
