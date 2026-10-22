import { describe, expect, it } from "vitest";
import { FALLBACK_ROUTE_OPTIONS, demote, routeDirectives, runtimeValue, type RouteDirective } from "./routeOptions";

describe("legacy catalog", () => {
  it("does not infer legacy support from pending or failed query data", () => {
    expect(routeDirectives()).toEqual([]);
    expect(routeDirectives(undefined)).toEqual([]);
    expect(routeDirectives(null)).toEqual([...FALLBACK_ROUTE_OPTIONS.directives, ...FALLBACK_ROUTE_OPTIONS.advanced]);
  });

  it("keeps a successful empty catalog distinct from legacy fallback", () => {
    expect(routeDirectives({ route: "model", directives: [], advanced: [] })).toEqual([]);
  });

  it("contains all 15 common and 25 advanced options without asserting engine defaults or route values", () => {
    expect(FALLBACK_ROUTE_OPTIONS.directives).toHaveLength(15);
    expect(FALLBACK_ROUTE_OPTIONS.advanced).toHaveLength(25);
    for (const d of routeDirectives(null)) {
      expect(d.fallback).toBe("");
      expect(d.value).toBeUndefined();
      expect(d.set).toBeUndefined();
    }
  });
  it("keeps null, false and zero distinct", () => {
    expect([null, false, true, 0, "the floor"].map(runtimeValue)).toEqual(["-", "off", "on", "0", "the floor"]);
  });
});

describe("default_max", () => {
  const peerMax: RouteDirective = { key: "default_max", label: "Default peer maximum", group: "Capacity & failover", kind: "number", fallback: "20", detail: "", value: 20, set: false };
  const tries: RouteDirective = { ...peerMax, key: "max_more_tries", label: "Retry budget" };

  it("is only an advanced option, live or bundled", () => {
    expect(demote({ route: "model", directives: [peerMax, tries], advanced: [] })).toEqual({ route: "model", directives: [tries], advanced: [peerMax] });
    expect(FALLBACK_ROUTE_OPTIONS.directives.map((d) => d.key)).not.toContain("default_max");
    expect(FALLBACK_ROUTE_OPTIONS.advanced.map((d) => d.key)).toContain("default_max");
  });
});
