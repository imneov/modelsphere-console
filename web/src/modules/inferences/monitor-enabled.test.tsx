import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EMPTY, planRequest } from "./deployment-settings";
import { ProfileForm } from "./components/ProfileForm";

vi.mock("./features", () => ({ ENABLE_MONITOR: true }));

it("retains Monitor behavior behind the single flag for a future public backend", () => {
  expect(EMPTY.monitor).toBe(true);
  expect(planRequest({ ...EMPTY, monitorModel: "model", monitorGpuType: "gpu" }, { model: "model" }).overrides?.modelRoute).toMatchObject({ monitor: { enabled: true, model: "model", gpuType: "gpu" } });
  const html = renderToStaticMarkup(<ProfileForm value={{ name: "site", model: { pathTemplate: "/models/{{name}}" }, route: { monitorConfigMap: "models/published-monitor" } }} onChange={() => {}} submitted={false} />);
  expect(html).toContain("models/published-monitor");
});
