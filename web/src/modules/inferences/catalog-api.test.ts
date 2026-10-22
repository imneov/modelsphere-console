import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onUnauthorized } from "@swiss/lib/api";
import { api, normalizeCatalog } from "./catalog-api";

const fetchMock = vi.fn();
const variant = { id: "gpu", engine: "sglang", default: true, chart: { name: "sglang", version: "0.7.1" }, requires: { gpus: 2 } };
const legacy = { name: "default", ref: "catalog-ref", source: "https://catalog.example/index.json", index: {
  apiVersion: "catalog.swiss/v1", site: "https://catalog.example/", count: 1, models: [{
    name: "model", displayName: "Example model", source: { hf: "example/model" }, latest: "1.1.0",
    versions: [{ version: "1.1.0", path: "models/model/model-1.1.0.yaml", digest: "sha256:new", variants: [variant] }, { version: "1.0.0", path: "models/model/model-1.0.0.yaml", digest: "sha256:old", variants: [variant] }],
    tuning: [{ version: "1.1.0", baseline: "gpu", optimized: "tuned", uplift: 10 }],
  }],
} };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("document", { cookie: "" });
});
afterEach(() => { vi.unstubAllGlobals(); onUnauthorized(null); });

describe("legacy and current catalog compatibility", () => {
  it("reads the deployed index envelope without changing template identity or GPU/chart choices", async () => {
    fetchMock.mockResolvedValue(json(legacy));
    const result = await api.catalog("default");
    expect(result).toMatchObject({ name: "default", ref: "catalog-ref", schema: "v1", source: legacy.source });
    expect(result.models[0]).toMatchObject({ name: "model", defaultVariant: "gpu", source: { hf: "example/model" }, variants: [{ ...variant, version: "1.1.0", digest: "sha256:new" }] });
    expect(result.models[0].tuning?.[0]).toMatchObject({ baseline: { id: "gpu", version: "1.1.0" }, optimized: { id: "tuned", version: "1.1.0" } });
  });

  it("preserves the current normalized API response", () => {
    const current = { name: "modern", ref: "ref", source: "https://catalog.example", schema: "v2", models: [] };
    expect(normalizeCatalog(current)).toBe(current);
  });

  it("loads the chosen legacy entry with its image, values, served name and site path", async () => {
    fetchMock.mockResolvedValueOnce(json({ ref: "entry-ref", localPath: "/models/model", pathTemplate: "/models/{{name}}", imageRepository: { gpu: "mirror.example/engine" }, entry: { name: "model", version: "1.0.0", digest: "sha256:old", servedName: "client-name", variants: [{ ...variant, image: { repository: "example/engine", tag: "v1" }, values: { extraArgs: ["--custom"] } }] } })).mockResolvedValueOnce(json(legacy));
    const result = await api.model("model", { catalog: "default", variant: "gpu", version: "1.0.0" });
    expect(result).toMatchObject({ schema: "v1", localPath: "/models/model", imageRepository: { gpu: "mirror.example/engine" }, variant: { id: "gpu", version: "1.0.0", digest: "sha256:old", servedName: "client-name", image: { tag: "v1" }, values: { extraArgs: ["--custom"] } } });
    expect(result.model.variants[0].version).toBe("1.1.0");
  });

  it("does not invent a selected variant absent from the legacy version", async () => {
    fetchMock.mockResolvedValueOnce(json({ entry: { name: "model", version: "1.0.0", variants: [variant] } })).mockResolvedValueOnce(json(legacy));
    await expect(api.model("model", { variant: "missing" })).rejects.toThrow("variant");
  });

  it("uses v1 versions when the deployed backend has no history endpoint", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: "not found" }, 404)).mockResolvedValueOnce(json(legacy));
    expect(await api.history("model", { catalog: "default", variant: "gpu" })).toMatchObject({ schema: "v1", model: "model", variant: "gpu", revisions: [{ version: "1.1.0", digest: "sha256:new", current: true }, { version: "1.0.0", digest: "sha256:old", current: false }] });
  });

  it("does not hide auth failures as an old API, and preserves session expiration handling", async () => {
    const expired = vi.fn();
    onUnauthorized(expired);
    fetchMock.mockResolvedValue(json({ error: "unauthenticated" }, 401));
    await expect(api.history("model")).rejects.toMatchObject({ status: 401 });
    expect(expired).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects an unsupported catalog response instead of showing a false empty model library", () => {
    expect(() => normalizeCatalog({})).toThrow("not supported");
  });
});
