import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { parse } from "yaml";
import type { CatalogResponse, Variant } from "@swiss/lib/api";
import { TemplateFields } from "./components/NewTemplateSheet";
import { createTemplate, publishTemplates, readLocalTemplates, templateReady } from "./local-templates-api";
import { libraryModels } from "./local-templates-lib";
import { EMPTY_TEMPLATE, fromTemplateVariant, templateInput, TemplateFormError } from "./template-form";

const form = { ...EMPTY_TEMPLATE, name: "private-model", displayName: "Private model", hf: "example/private-model", chartVersion: "0.7.1", imageRepository: "example/engine", imageTag: "v1", gpus: "2", gpuProducts: "H100, H100", tags: "private, fine-tuned", valuesYAML: 'env:\n  FLAG: "false"\nextraArgs:\n  - --custom\n' };
const input = templateInput(form);
const recipe = parse(input.recipeYAML);
const index = { apiVersion: "catalog.swiss/v1", count: 1, models: [{ ...input.metadata, latest: "1.0.0", versions: [{ version: "1.0.0", path: "models/private-model/private-model-1.0.0.yaml", digest: "sha256:recipe", variants: recipe.variants.map(({ image: _image, values: _values, ...variant }: Record<string, unknown>) => variant) }] }] };
const native = { enabled: true, catalogName: "console-local", catalogURL: "http://console.example/catalog/console/g/1/index.json", generation: 1, registeredGeneration: 1, modelGenerations: { "private-model": 1 }, index };
const fetchMock = vi.fn();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); vi.stubGlobal("document", { cookie: "token=operator" }); });
afterEach(() => vi.unstubAllGlobals());

describe("native model template authoring", () => {
  it("creates actual model metadata and a deployable v1 recipe rather than a release record", () => {
    expect(input.metadata).toMatchObject({ name: "private-model", source: { hf: "example/private-model" }, tags: ["private", "fine-tuned"] });
    expect(recipe).toMatchObject({ apiVersion: "catalog.swiss/v1", name: "private-model", version: "1.0.0", variants: [{ id: "default", engine: "sglang", chart: { name: "sglang", version: "0.7.1" }, image: { repository: "example/engine", tag: "v1" }, requires: { gpus: 2, gpuProduct: ["H100"] }, values: { env: { FLAG: "false" }, extraArgs: ["--custom"] } }] });
    expect(recipe).not.toHaveProperty("source");
    expect(recipe).not.toHaveProperty("release");
  });

  it("preserves copied runtime, image digest and multi-node hardware without replacing new model identity", () => {
    const variant = { id: "sglang-tp", version: "2.0.0", digest: "sha256:source-recipe", servedName: "source-model", engine: "sglang", chart: { name: "sglang", version: "0.7.1" }, image: { repository: "example/engine", tag: "v1", digest: `sha256:${"1".repeat(64)}` }, requires: { gpus: 16, nodes: 512, minGpuMemoryGiB: 80, vendor: "amd", gpuProduct: ["example-card"], topology: "lws", rdma: true }, values: { lws: { enabled: true, size: 512 }, extraArgs: ["--custom"] } } as Variant;
    const patch = fromTemplateVariant(variant);
    expect(patch).not.toHaveProperty("name");
    expect(patch).not.toHaveProperty("hf");
    const copied = templateInput({ ...form, ...patch });
    expect(copied.metadata.name).toBe("private-model");
    expect(parse(copied.recipeYAML).variants[0]).toMatchObject({ image: variant.image, requires: variant.requires, values: variant.values });
  });

  it("lets an empty parameter editor use chart defaults", () => {
    expect(parse(templateInput({ ...form, valuesYAML: "" }).recipeYAML).variants[0].values).toEqual({});
  });

  it.each(["extraArgs: [", "a: 1\na: 2", "[1, 2]", "a: &loop [*loop]", "a: &copy {value: 1}\nb: *copy", "a: .inf"])("rejects an invalid parameter document before saving: %s", (valuesYAML) => {
    expect(() => templateInput({ ...form, valuesYAML })).toThrow(TemplateFormError);
  });

  it("renders a visible model template form with weight source, image, GPU and runtime fields", () => {
    const html = renderToStaticMarkup(<TemplateFields form={form} onChange={() => {}} />);
    for (const label of ["模型标识", "权重来源", "推理引擎", "镜像仓库", "每节点 GPU 数", "运行参数 YAML"]) expect(html).toContain(label);
    expect(html).toContain("example/private-model");
  });

  it("keeps the existing library functional when an older Console lacks native storage", async () => {
    fetchMock.mockResolvedValue(json({ error: "not found" }, 404));
    expect(await readLocalTemplates()).toMatchObject({ enabled: false, catalog: { models: [] } });
  });

  it("authenticates native creation and does not send a storage namespace or publication target", async () => {
    fetchMock.mockResolvedValue(json({ created: true, ready: true, model: "private-model", generation: 1 }, 201));
    expect(await createTemplate(input)).toMatchObject({ created: true, ready: true });
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/model-templates");
    expect(options.method).toBe("POST");
    expect(new Headers(options.headers).get("Authorization")).toBe("Bearer operator");
    const body = JSON.parse(String(options.body));
    expect(body).toEqual(input);
    expect(body).not.toHaveProperty("namespace");
    expect(body).not.toHaveProperty("publishURL");
  });

  it("preserves a 202 saved-pending result and retries publication without creating again", async () => {
    fetchMock.mockResolvedValueOnce(json({ created: true, ready: false, model: "private-model", generation: 1, registeredGeneration: null }, 202)).mockResolvedValueOnce(json({ ready: true, generation: 1, registeredGeneration: 1 }));
    expect(await createTemplate(input)).toMatchObject({ created: true, ready: false });
    expect(await publishTemplates()).toMatchObject({ ready: true });
    expect(fetchMock.mock.calls[1][0]).toBe("/api/model-templates/publish");
    expect(JSON.parse(String(fetchMock.mock.calls[1][1].body))).toEqual({});
  });

  it("combines original and native cards in the default view without shadowing duplicate names", async () => {
    fetchMock.mockResolvedValue(json(native));
    const local = await readLocalTemplates();
    const remote: CatalogResponse = { ...local.catalog, name: "default", source: "https://catalog.example/index.json" };
    const rows = libraryModels(remote, local, "default", "");
    expect(rows.map((row) => [row.catalog, row.model.name])).toEqual([["default", "private-model"], ["console-local", "private-model"]]);
    expect(remote.models).toHaveLength(1);
    expect(libraryModels(remote, local, "default", "default")).toHaveLength(1);
    expect(libraryModels(remote, local, "console-local", "console-local")).toEqual([{ catalog: "console-local", model: local.catalog.models[0], custom: true, ready: true }]);
  });

  it("keeps older published templates deployable while a newer generation is pending", async () => {
    fetchMock.mockResolvedValue(json({ ...native, generation: 2, registeredGeneration: 1, modelGenerations: { "private-model": 1, "new-model": 2 } }));
    const local = await readLocalTemplates();
    expect(templateReady(local, "private-model")).toBe(true);
    expect(templateReady(local, "new-model")).toBe(false);
    expect(templateReady({ ...local, registeredGeneration: null }, "private-model")).toBe(false);
  });
});
