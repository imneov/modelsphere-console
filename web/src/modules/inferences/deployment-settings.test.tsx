import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Plan } from "@swiss/lib/api";
import { EMPTY as SWISS_EMPTY } from "@swiss/components/DeploySettings";
import { EMPTY, formFromPlan, planRequest } from "./deployment-settings";
import { DeployForm } from "./components/DeployForm";
import { ProfileForm } from "./components/ProfileForm";

function renderDeploy(form = EMPTY) {
  return renderToStaticMarkup(<DeployForm form={form} onChange={() => {}} submitted={false} target={null} defaults={{}} gpuOptions={[]} expanded={{ basic: false, resources: false, routing: true, advanced: false }} onExpand={() => {}} idPrefix="test-" />);
}

describe("public Monitor availability", () => {
  it("defaults Monitor off while retaining the independent ServiceMonitor default", () => {
    expect(EMPTY.monitor).toBe(false);
    expect(EMPTY.serviceMonitor).toBe(SWISS_EMPTY.serviceMonitor);
  });

  it("disables Monitor and excludes its inputs from deploy requests even for legacy form state", () => {
    const form = { ...SWISS_EMPTY, monitor: true, monitorModel: "unpublished-model", monitorGpuType: "unpublished-gpu" };
    const request = planRequest(form, { model: "model" });
    expect(request.overrides?.modelRoute).toMatchObject({ monitor: { enabled: false } });
    expect((request.overrides?.modelRoute as Record<string, unknown>).monitor).toEqual({ enabled: false });
    expect(request.overrides?.serviceMonitor).toEqual({ enabled: true });
    expect(form.monitor).toBe(true);
  });

  it("seeds upgrades with Monitor off without clearing the ServiceMonitor decision", () => {
    const plan = { release: { name: "model", namespace: "models" }, layers: { form: { modelRoute: { monitor: { enabled: true, model: "old", gpuType: "old" } }, serviceMonitor: { enabled: false } } } } as unknown as Plan;
    expect(formFromPlan(plan)).toMatchObject({ monitor: false, monitorModel: "", monitorGpuType: "", serviceMonitor: false });
  });

  it("hides Monitor controls but keeps ServiceMonitor visible", () => {
    const html = renderDeploy({ ...SWISS_EMPTY, monitorModel: "unpublished-model", monitorGpuType: "unpublished-gpu" });
    expect(html).not.toContain('aria-label="监控"');
    expect(html).not.toContain("unpublished-model");
    expect(html).not.toContain("unpublished-gpu");
    expect(html).toContain('aria-label="ServiceMonitor"');
  });

  it("hides Monitor profile configuration while preserving nginx route fields", () => {
    const html = renderToStaticMarkup(<ProfileForm value={{ name: "site", model: { pathTemplate: "/models/{{name}}" }, route: { monitorConfigMap: "models/unpublished-monitor", nginxConfigMap: "models/routes" } }} onChange={() => {}} submitted={false} />);
    expect(html).not.toContain("models/unpublished-monitor");
    expect(html).toContain("models/routes");
  });
});
