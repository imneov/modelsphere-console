import { isScalar, parseDocument, stringify, visit } from "yaml";
import type { Variant } from "@swiss/lib/api";
import type { TemplateInput } from "@/modules/inferences/localTemplatesApi";

export interface TemplateForm {
  name: string; displayName: string; description: string; hf: string; family: string; tags: string;
  version: string; servedName: string; variantId: string; engine: "sglang" | "vllm";
  chartVersion: string; imageRepository: string; imageTag: string; imageDigest: string;
  gpus: string; nodes: string; minGpuMemoryGiB: string; vendor: string; gpuProducts: string; topology: string; rdma: boolean; valuesYAML: string;
}
export const EMPTY_TEMPLATE: TemplateForm = {
  name: "", displayName: "", description: "", hf: "", family: "", tags: "", version: "1.0.0", servedName: "", variantId: "default", engine: "sglang",
  chartVersion: "", imageRepository: "", imageTag: "", imageDigest: "", gpus: "1", nodes: "", minGpuMemoryGiB: "", vendor: "nvidia", gpuProducts: "", topology: "", rdma: false, valuesYAML: "{}\n",
};
export class TemplateFormError extends Error {
  constructor(public code: "required" | "name" | "hardware" | "values") { super(code); }
}
const optional = (value: string) => value.trim() || undefined;
const list = (value: string) => [...new Set(value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean))];
const count = (value: string) => /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0;

function templateValues(text: string): Record<string, unknown> {
  if (new TextEncoder().encode(text).length > 128 << 10) throw new TemplateFormError("values");
  const document = parseDocument(text.trim() ? text : "{}", { intAsBigInt: true, uniqueKeys: true });
  if (document.errors.length || document.warnings.length) throw new TemplateFormError("values");
  visit(document, { Alias() { throw new TemplateFormError("values"); }, Pair(_, pair) { if (!isScalar(pair.key) || typeof pair.key.value !== "string") throw new TemplateFormError("values"); } });
  let tree: unknown;
  try { tree = document.toJS({ maxAliasCount: 50 }); } catch { throw new TemplateFormError("values"); }
  if (!tree || typeof tree !== "object" || Array.isArray(tree)) throw new TemplateFormError("values");
  const seen = new Set<object>();
  let nodes = 0;
  const check = (value: unknown, depth: number) => {
    if (++nodes > 50_000 || depth > 64 || typeof value === "number" && !Number.isFinite(value)) throw new TemplateFormError("values");
    if (value && typeof value === "object") {
      if (seen.has(value)) throw new TemplateFormError("values");
      seen.add(value);
      for (const child of Object.values(value)) check(child, depth + 1);
      seen.delete(value);
    }
  };
  check(tree, 0);
  return tree as Record<string, unknown>;
}

export function templateInput(form: TemplateForm): TemplateInput {
  if (![form.name, form.hf, form.version, form.variantId, form.chartVersion, form.imageRepository, form.imageTag].every((value) => value.trim())) throw new TemplateFormError("required");
  if (!/^[a-z0-9][a-z0-9._-]{0,62}$/.test(form.name.trim()) || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(form.variantId.trim())) throw new TemplateFormError("name");
  if (!count(form.gpus) || form.nodes && !count(form.nodes) || form.minGpuMemoryGiB.trim() && (!Number.isFinite(Number(form.minGpuMemoryGiB)) || Number(form.minGpuMemoryGiB) < 0)) throw new TemplateFormError("hardware");
  const products = list(form.gpuProducts);
  return {
    metadata: { name: form.name.trim(), displayName: optional(form.displayName), description: optional(form.description), family: optional(form.family), tags: list(form.tags), source: { hf: form.hf.trim() } },
    recipeYAML: stringify({
      apiVersion: "catalog.swiss/v1", name: form.name.trim(), version: form.version.trim(), servedName: optional(form.servedName),
      variants: [{ id: form.variantId.trim(), engine: form.engine, default: true, chart: { name: form.engine, version: form.chartVersion.trim() }, image: { repository: form.imageRepository.trim(), tag: form.imageTag.trim(), digest: optional(form.imageDigest) }, requires: { gpus: Number(form.gpus), nodes: form.nodes ? Number(form.nodes) : undefined, minGpuMemoryGiB: form.minGpuMemoryGiB.trim() ? Number(form.minGpuMemoryGiB) : undefined, vendor: form.vendor, gpuProduct: products.length ? products : undefined, topology: optional(form.topology), rdma: form.rdma || undefined }, values: templateValues(form.valuesYAML) }],
    }, { lineWidth: 0 }),
  };
}

export function fromTemplateVariant(variant: Variant): Partial<TemplateForm> {
  if (variant.engine !== "sglang" && variant.engine !== "vllm") throw new Error("Unsupported reference engine");
  const memory = (variant.requires as typeof variant.requires & { minGpuMemoryGiB?: number }).minGpuMemoryGiB;
  return { variantId: variant.id, engine: variant.engine, chartVersion: variant.chart.version, imageRepository: variant.image?.repository ?? "", imageTag: variant.image?.tag ?? "", imageDigest: variant.image?.digest ?? "", gpus: String(variant.requires.gpus), nodes: variant.requires.nodes ? String(variant.requires.nodes) : "", minGpuMemoryGiB: memory == null ? "" : String(memory), vendor: variant.requires.vendor ?? "nvidia", gpuProducts: variant.requires.gpuProduct?.join(", ") ?? "", topology: variant.requires.topology ?? "", rdma: !!variant.requires.rdma, valuesYAML: stringify(variant.values ?? {}, { lineWidth: 0 }) };
}
