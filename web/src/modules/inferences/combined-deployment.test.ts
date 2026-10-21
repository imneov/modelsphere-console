import { expect, it, vi } from "vitest";
import { parse } from "yaml";
import type { Plan, PlanRequest } from "@swiss/lib/api";
import { EMPTY, planRequest } from "./deployment-settings";
import { composeAdaptivePlan } from "./adaptive-concurrency";
import { recoveryError, recoverySettings, withRecovery } from "./recovery";
import { upgradeEditsYAML } from "./upgrade-values";

it("combines current-value edits, recovery, adaptive cleanup and public Monitor defaults in one upgrade", async () => {
  const originalValues = 'image:\n  tag: v1\nresources:\n  limits:\n    cpu: "4"\n';
  const form = { ...EMPTY, serviceId: "model", namespace: "models", modelRoute: true, cart: true, adaptiveCc: false };
  const request = withRecovery(planRequest({ ...form, edits: upgradeEditsYAML(originalValues, originalValues.replace('"4"', '"6"')) }, { model: "weights", fromRelease: "model" }), {
    ...recoverySettings(), enabled: true, model: "glm-5.3", idleTimeout: "45",
  });
  const compose = vi.fn<(request: PlanRequest) => Promise<Plan>>().mockImplementation(async (input) => {
    const overrides = structuredClone(input.overrides!);
    if (input.fromRelease) {
      const values = (overrides.modelRoute as { nginx: { values: Record<string, unknown> } }).nginx.values;
      values.adaptive_cc_min_frac = "0.6";
      values.adaptive_cc_init = "80";
    }
    return {
      apiVersion: "plan.swiss/v1", release: { name: "model", namespace: "models" },
      source: { catalogName: "private", model: "weights", variant: "sglang", version: "2.0.0", digest: "sha256:target" },
      chart: { name: "sglang", version: "0.9.22" }, engine: "sglang", profile: "site", hash: "test",
      layers: { catalog: { image: { tag: "v2" } }, form: overrides, edit: parse(input.editsYAML!) },
    };
  });
  const result = await composeAdaptivePlan(request, form, null, compose, "private");
  expect(compose).toHaveBeenCalledTimes(2);
  const final = compose.mock.calls[1][0];
  expect(final).toMatchObject({ catalog: "private", version: "2.0.0", chartVersion: "0.9.22", fromRelease: undefined });
  expect(final.overrides?.continuationGateway).toMatchObject({ enabled: true, config: { continuationModel: "glm-5.3", stallIdleTimeoutSeconds: 45 } });
  expect(final.overrides?.modelRoute).toMatchObject({ monitor: { enabled: false }, nginx: { values: { adaptive_cc: "false" } } });
  expect((final.overrides?.modelRoute as { nginx: { values: object } }).nginx.values).not.toHaveProperty("adaptive_cc_min_frac");
  expect((final.overrides?.modelRoute as { nginx: { values: object } }).nginx.values).not.toHaveProperty("adaptive_cc_init");
  expect(parse(final.editsYAML!)).toEqual({ resources: { limits: { cpu: "6" } } });
  expect(final.overrides).not.toHaveProperty("image");
  expect(result.layers.catalog.image).toEqual({ tag: "v2" });
  expect(recoveryError(result)).toBeUndefined();
});
