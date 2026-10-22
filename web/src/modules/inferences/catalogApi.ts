import { api as swissApi, ApiError, type CatalogModel, type CatalogResponse, type HistoryResponse, type ModelResponse, type ModelVariant, type Tuning, type Variant } from "@swiss/lib/api";

type LegacyVariant = Omit<ModelVariant, "version" | "digest"> & { image?: Variant["image"]; values?: Variant["values"] };
interface LegacyVersion { version: string; digest: string; path: string; variants: LegacyVariant[] }
interface LegacyModel extends Omit<CatalogModel, "defaultVariant" | "variants" | "tuning"> {
  latest: string;
  versions: LegacyVersion[];
  tuning?: { version: string; baseline: string; optimized: string; uplift?: number; workloads?: Tuning["workloads"]; report?: string }[];
}
interface LegacyCatalog {
  name: string;
  ref: string;
  source: string;
  index: { apiVersion: string; site?: string; count: number; models: LegacyModel[] };
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const legacy = (value: unknown): value is LegacyCatalog => object(value) && object(value.index) && Array.isArray(value.index.models);

function legacyModel(model: LegacyModel): CatalogModel {
  const latest = model.versions.find((version) => version.version === model.latest);
  if (!latest || !Array.isArray(latest.variants)) throw new Error("Catalog model has no readable latest version");
  return {
    name: model.name, displayName: model.displayName, description: model.description, family: model.family,
    tags: model.tags, deprecated: model.deprecated, source: model.source,
    defaultVariant: (latest.variants.find((variant) => variant.default) ?? latest.variants[0])?.id ?? "",
    variants: latest.variants.map((variant) => ({ ...variant, version: latest.version, digest: latest.digest })),
    tuning: model.tuning?.map((tuning) => ({ ...tuning, baseline: { id: tuning.baseline, version: tuning.version }, optimized: { id: tuning.optimized, version: tuning.version } })),
  };
}

export function normalizeCatalog(value: unknown): CatalogResponse {
  if (legacy(value)) return { name: value.name, ref: value.ref, source: value.source, site: value.index.site, schema: "v1", models: value.index.models.map(legacyModel) };
  if (object(value) && (value.schema === "v1" || value.schema === "v2") && Array.isArray(value.models)) return value as unknown as CatalogResponse;
  throw new Error("Catalog response is not supported");
}

async function catalog(name?: string): Promise<CatalogResponse> {
  return normalizeCatalog(await swissApi.catalog(name));
}

async function model(name: string, options: Parameters<typeof swissApi.model>[1] = {}): Promise<ModelResponse> {
  const body = await swissApi.model(name, options) as unknown;
  if (object(body) && object(body.model) && object(body.variant)) return body as unknown as ModelResponse;
  if (!object(body) || !object(body.entry) || !Array.isArray(body.entry.variants)) throw new Error("Model response is not supported");
  const entry = body.entry as unknown as { name: string; version: string; digest?: string; servedName?: string; variants: LegacyVariant[] };
  const index = await catalog(options.catalog);
  const metadata = index.models.find((candidate) => candidate.name === name);
  if (!metadata || entry.name !== name) throw new Error("Model is not present in the selected catalog");
  const variant = options.variant ? entry.variants.find((candidate) => candidate.id === options.variant) : entry.variants.find((candidate) => candidate.default) ?? entry.variants[0];
  if (!variant) throw new Error("Model variant is not present in the selected version");
  return {
    ref: String(body.ref ?? index.ref), schema: "v1", model: metadata,
    variant: { ...variant, version: entry.version, digest: entry.digest ?? metadata.variants.find((candidate) => candidate.id === variant.id)?.digest ?? "", servedName: entry.servedName || entry.name },
    localPath: typeof body.localPath === "string" ? body.localPath : undefined,
    pathTemplate: typeof body.pathTemplate === "string" ? body.pathTemplate : undefined,
    imageRepository: object(body.imageRepository) ? body.imageRepository as Record<string, string> : undefined,
  };
}

async function history(name: string, options: Parameters<typeof swissApi.history>[1] = {}): Promise<HistoryResponse> {
  try {
    return await swissApi.history(name, options);
  } catch (error) {
    if (!(error instanceof ApiError) || ![404, 405].includes(error.status)) throw error;
    const body = await swissApi.catalog(options.catalog) as unknown;
    if (!legacy(body)) throw error;
    const indexed = body.index.models.find((candidate) => candidate.name === name);
    if (!indexed) throw error;
    const current = legacyModel(indexed);
    const variant = options.variant || current.defaultVariant;
    return { ref: body.ref, schema: "v1", model: name, variant, revisions: indexed.versions.filter((version) => version.variants.some((candidate) => candidate.id === variant)).map((version) => ({ version: version.version, digest: version.digest, current: version.version === indexed.latest })) };
  }
}

export const api = { ...swissApi, catalog, model, history };
