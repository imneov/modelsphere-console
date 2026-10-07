import { describe, expect, it } from "vitest";
import type { Deployment } from "@swiss/lib/api";
import { joinTargets } from "@/modules/playground/targets";

const dep = (release: string, route?: string): Deployment => ({ release, namespace: "ns", revision: 1, model: "qwen3.6-35b-a3b", version: "1.1.0", route });

describe("joinTargets", () => {
  const routes = [
    { route: "qwen-a", models: ["qwen"] },
    { route: "qwen-b", models: ["qwen"] },
    { route: "cold", models: [], error: "GET /cold/v1/models: 502 Bad Gateway" },
    { route: "someone-elses", models: ["other"] },
  ];

  it("lists deployments only, ready first, each by its own route", () => {
    const got = joinTargets([dep("cold", "cold"), dep("a", "qwen-a"), dep("b", "qwen-b")], routes);
    expect(got.map((t) => [t.id, t.model, t.ready])).toEqual([
      ["qwen-a", "qwen", true],
      ["qwen-b", "qwen", true],
      ["cold", "", false],
    ]);
  });

  it("says why a deployment cannot be talked to", () => {
    const got = joinTargets([dep("cold", "cold"), dep("new", "not-yet"), dep("off")], routes);
    expect(got.map((t) => t.reason?.kind)).toEqual(["notServing", "notPublished", "noRoute"]);
    expect(got[2].id).toBe("ns/off");
  });

  it("is empty with no deployment, whatever the gateway serves", () => {
    expect(joinTargets([], routes)).toEqual([]);
  });
});
