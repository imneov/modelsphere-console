import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Plan, PlanRequest } from "@swiss/lib/api";
import { EMPTY, formFromPlan, planRequest } from "./deployment-settings";
import { composeAdaptivePlan } from "./adaptive-concurrency";
import { DeployForm } from "./components/DeployForm";
import { RecoveryFields } from "./components/RecoveryFields";
import { mergeValues, planValues, recoveryError, recoverySettings, withRecovery } from "./recovery";

const plan = (layers: Plan["layers"], chart = { name: "sglang", version: "0.8.11" }): Plan => ({
  apiVersion: "swiss.modelsphere.dev/v1alpha1", release: { name: "model", namespace: "models" },
  source: { model: "weights", variant: "default" }, chart, engine: chart.name, profile: "site", layers, hash: "hash",
});
const enabled = {
  cart: { enabled: true }, modelRoute: { enabled: true },
  continuationGateway: { enabled: true, config: { continuationModel: "glm-5.3", stallIdleTimeoutSeconds: 30 } },
};

describe("generation recovery deployment", () => {
  it("accepts an empty legacy plan whose response omits layers", () => {
    expect(recoverySettings(planValues({}))).toMatchObject({ enabled: false, configured: false });
  });
  it("leaves old charts untouched until recovery is configured", () => {
    const request = planRequest(EMPTY, { model: "weights" });
    expect(withRecovery(request, recoverySettings())).toBe(request);
    expect(recoveryError(plan({ form: request.overrides! }, { name: "sglang", version: "0.8.0" }))).toBeUndefined();
  });

  it("writes actual model identity, positive timeout and execution settings through the existing plan endpoint", () => {
    const form = { ...EMPTY, modelRoute: true, cart: true };
    const settings = { ...recoverySettings(), enabled: true, model: " glm-5.3 ", idleTimeout: "45", bufferToolCalls: false };
    const request = withRecovery(planRequest(form, { model: "arbitrary-client-name" }), settings);
    expect(request.overrides?.continuationGateway).toEqual({ enabled: true, config: {
      continuationModel: "glm-5.3", continuationEnabled: true, stallIdleTimeoutSeconds: 45, bufferToolCalls: false,
    } });
    expect(recoveryError(plan({ form: request.overrides! }))).toBeUndefined();
  });

  it("seeds upgrades in merge order and preserves gateway values outside the form", () => {
    const current = plan({
      catalog: enabled,
      site: { continuationGateway: { replicas: 3, config: { stallIdleTimeoutSeconds: 60 } } },
      form: { continuationGateway: { config: { bufferToolCalls: false, continuationEnabled: false } } },
      edit: { continuationGateway: { config: { continuationModel: "kimi-k3" } } },
    });
    const settings = recoverySettings(planValues(current));
    expect(settings).toMatchObject({ enabled: true, configured: true, model: "kimi-k3", idleTimeout: "60", bufferToolCalls: false, resumeEnabled: false });
    const values = mergeValues(planValues(current), withRecovery({}, settings).overrides);
    expect(values.continuationGateway).toMatchObject({ replicas: 3, config: { continuationEnabled: false } });
  });

  it("explicitly disables a previously configured gateway without emitting active settings", () => {
    const settings = { ...recoverySettings(enabled), enabled: false };
    expect(withRecovery({}, settings).overrides?.continuationGateway).toEqual({ enabled: false });
  });

  it.each([
    ["sglang", "0.8.8", "chart"], ["sglang", "0.8.10", "chart"],
    ["vllm", "0.8.8", "chart"], ["other", "1.0.0", "chart"],
    ["sglang", "0.8.11", undefined], ["sglang", "0.9.22", undefined], ["vllm", "0.8.9", undefined],
  ])("checks the resolved %s %s chart", (name, version, error) => {
    expect(recoveryError(plan({ form: enabled }, { name, version }))).toBe(error);
  });

  it.each([
    [{ cart: { enabled: false } }, "cart"],
    [{ modelRoute: { enabled: false } }, "route"],
    [{ continuationGateway: { config: { continuationModel: " " } } }, "model"],
    [{ continuationGateway: { config: { stallIdleTimeoutSeconds: 0 } } }, "timeout"],
    [{ continuationGateway: { config: { stallIdleTimeoutSeconds: -1 } } }, "timeout"],
    [{ continuationGateway: { config: { stallIdleTimeoutSeconds: Infinity } } }, "timeout"],
    [{ continuationGateway: { config: { continuationEngine: "vllm" } } }, "engine"],
  ])("validates the final plan including higher-priority YAML overrides", (edit, error) => {
    expect(recoveryError(plan({ form: enabled, edit }))).toBe(error);
  });

  it("does not replace the chart timeout when the input is empty", () => {
    const request = withRecovery({}, { ...recoverySettings(enabled), idleTimeout: "" });
    expect(request.overrides?.continuationGateway).toMatchObject({ config: { continuationModel: "glm-5.3" } });
    expect((request.overrides?.continuationGateway as { config: object }).config).not.toHaveProperty("stallIdleTimeoutSeconds");
  });

  it("preserves request gateway settings and cache/site monitor decisions without mutating the request", () => {
    const base = planRequest({ ...EMPTY, cart: true, modelRoute: true, cache: true, cacheMaxSlots: "6" }, { model: "weights" }, { name: "site", model: { pathTemplate: "/models/{{name}}" }, route: { monitorConfigMap: "monitor/config" } });
    const request = { ...base, overrides: mergeValues(base.overrides, { continuationGateway: {
      replicas: 3, downstream: { url: "http://router.example.com:8071" },
      config: { connectTimeoutSeconds: 120 }, extraEnv: [{ name: "CUSTOM", value: "keep" }],
    } }) };
    const before = structuredClone(request);
    const result = withRecovery(request, recoverySettings(enabled));
    expect(result.overrides?.continuationGateway).toMatchObject({ replicas: 3, downstream: { url: "http://router.example.com:8071" }, config: { connectTimeoutSeconds: 120, continuationModel: "glm-5.3" }, extraEnv: [{ name: "CUSTOM", value: "keep" }] });
    expect(result.overrides?.cache).toEqual({ enabled: true, maxSlotsPerNode: 6 });
    expect(result.overrides?.modelRoute).toMatchObject({ monitor: { enabled: true } });
    expect(request).toEqual(before);
    const unsupported = withRecovery(planRequest({ ...EMPTY, cache: true }, { model: "weights", cacheUnsupported: true }), recoverySettings(enabled));
    expect(unsupported.overrides).not.toHaveProperty("cache");
  });

  it("lets final Advanced YAML enable, repair or disable recovery", () => {
    const request = withRecovery({}, { ...recoverySettings(), enabled: true, idleTimeout: "invalid" });
    const form = JSON.parse(JSON.stringify(request.overrides));
    expect(recoveryError(plan({ form }))).toBe("cart");
    const repaired = plan({ form: mergeValues(enabled, form), edit: enabled });
    expect(recoveryError(repaired)).toBeUndefined();
    expect(recoveryError(plan({ edit: enabled }))).toBeUndefined();
    expect(recoveryError(plan({ form: enabled, edit: { continuationGateway: { enabled: false } } }, { name: "other", version: "0.1.0" }))).toBeUndefined();
  });

  it("checks the plan engine and accepts the chart's case-insensitive explicit engine", () => {
    expect(recoveryError({ ...plan({ form: enabled }), engine: "vllm" })).toBe("engine");
    expect(recoveryError(plan({ form: enabled, edit: { continuationGateway: { config: { continuationEngine: "SGLang" } } } }))).toBeUndefined();
  });

  it("keeps model input open for unverified combinations without inferring it from a served name", () => {
    expect(recoverySettings().model).toBe("");
    expect(recoveryError(plan({ form: mergeValues(enabled, { continuationGateway: { config: { continuationModel: "custom-weights" } } }) }))).toBeUndefined();
  });

  it("merges maps while replacing arrays and scalars in plan order", () => {
    expect(mergeValues({ list: [1], nested: { keep: true }, replace: { before: true } }, { list: [2], nested: { next: true }, replace: null })).toEqual({ list: [2], nested: { keep: true, next: true }, replace: null });
    expect(recoverySettings(mergeValues(enabled, { continuationGateway: { config: { continuationModel: "site-model" } } })).model).toBe("site-model");
    expect(planValues(plan({ form: { replicaCount: 1 }, autoscale: { replicaCount: 3 } })).replicaCount).toBe(3);
  });

  it("preserves recorded gateway settings through the upgrade's adaptive cleanup composition", async () => {
    const current = plan({
      form: mergeValues(enabled, {
        serviceId: "model",
        continuationGateway: { replicas: 3, config: { connectTimeoutSeconds: 120 } },
        modelRoute: { nginx: { values: { adaptive_cc: "false", adaptive_cc_init: "4" } } },
      }),
      edit: { continuationGateway: { config: { stallIdleTimeoutSeconds: 75 } } },
    });
    const form = formFromPlan(current);
    const request = withRecovery(planRequest(form, { model: "weights", fromRelease: "model" }), recoverySettings(planValues(current)));
    const requests: PlanRequest[] = [];
    const result = await composeAdaptivePlan(request, form, undefined, async (input) => {
      requests.push(input);
      return plan({ form: input.fromRelease ? mergeValues(current.layers.form, input.overrides) : input.overrides!, edit: current.layers.edit });
    });
    expect(requests).toHaveLength(2);
    expect(requests[0].fromRelease).toBe("model");
    expect(requests[1].fromRelease).toBeUndefined();
    expect(planValues(result).continuationGateway).toMatchObject({ replicas: 3, config: { connectTimeoutSeconds: 120, stallIdleTimeoutSeconds: 75, continuationModel: "glm-5.3" } });
    expect(recoveryError(result)).toBeUndefined();
  });

  it("places recovery controls beside CART in the routing form", () => {
    const html = renderToStaticMarkup(<DeployForm
      form={EMPTY} onChange={() => {}} submitted={false} target={null} defaults={{}} gpuOptions={[]}
      expanded={{ basic: false, resources: false, routing: true, advanced: false }} onExpand={() => {}} idPrefix="test-"
      recovery={<RecoveryFields settings={recoverySettings(enabled)} onChange={() => {}} />}
    />);
    expect(html).toContain("生成中断恢复");
    expect(html.indexOf("CART")).toBeLessThan(html.indexOf("生成中断恢复"));
  });

  it("shows model identity and recovery controls only when enabled", () => {
    const off = renderToStaticMarkup(<RecoveryFields settings={recoverySettings()} onChange={() => {}} />);
    expect(off).toContain("生成中断恢复");
    expect(off).not.toContain("实际模型");
    const on = renderToStaticMarkup(<RecoveryFields settings={recoverySettings(enabled)} onChange={() => {}} />);
    expect(on).toContain("实际模型");
    expect(on).toContain('value="glm-5.3"');
    expect(on).toContain("缓冲工具调用");
  });
});
