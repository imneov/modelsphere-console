import { ApiError, request } from "@/shell/api";
import type { CatalogResponse } from "@swiss/lib/api";
import { normalizeCatalog } from "./catalog-api";

export interface TemplateMetadata {
  name: string;
  displayName?: string;
  description?: string;
  family?: string;
  tags?: string[];
  source: { hf: string };
}
export interface TemplateInput { metadata: TemplateMetadata; recipeYAML: string }
export interface TemplateResult {
  created?: boolean;
  model?: string;
  version?: string;
  catalogName: string;
  generation: number;
  catalogURL: string;
  ready: boolean;
  registeredGeneration: number | null;
  reason?: string;
}
export interface LocalTemplates {
  enabled: boolean;
  catalogName: string;
  catalogURL: string;
  generation: number;
  registeredGeneration: number | null;
  registrationError?: string;
  modelGenerations: Record<string, number>;
  catalog: CatalogResponse;
}

export function disabledTemplates(): LocalTemplates {
  return { enabled: false, catalogName: "console-local", catalogURL: "", generation: 0, registeredGeneration: null, modelGenerations: {}, catalog: { name: "console-local", ref: "", source: "", schema: "v1", models: [] } };
}

export async function readLocalTemplates(): Promise<LocalTemplates> {
  let body: Omit<LocalTemplates, "catalog"> & { index?: unknown };
  try {
    body = await request("GET", "/api/model-templates");
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return disabledTemplates();
    throw error;
  }
  if (!body.enabled) return disabledTemplates();
  return { ...body, modelGenerations: body.modelGenerations ?? {}, catalog: normalizeCatalog({ name: body.catalogName, ref: `generation:${body.generation}`, source: body.catalogURL, index: body.index }) };
}

export const checkTemplate = (input: TemplateInput) => request<{ valid: boolean; model: string; version: string; variantCount: number }>("POST", "/api/model-templates/check", input);
export const createTemplate = (input: TemplateInput) => request<TemplateResult>("POST", "/api/model-templates", input);
export const publishTemplates = () => request<TemplateResult>("POST", "/api/model-templates/publish", {});

export function templateReady(data: LocalTemplates, name: string): boolean {
  const generation = data.modelGenerations[name];
  return Number.isSafeInteger(generation) && generation > 0 && data.registeredGeneration !== null && generation <= data.registeredGeneration;
}
