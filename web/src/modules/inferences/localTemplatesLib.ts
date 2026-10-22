import type { CatalogInfo, CatalogModel, CatalogResponse } from "@swiss/lib/api";
import { templateReady, type LocalTemplates } from "@/modules/inferences/localTemplatesApi";

export interface LibraryModel { catalog: string; model: CatalogModel; custom: boolean; ready: boolean }
type CatalogLocation = Pick<CatalogInfo, "name"> & Partial<Pick<CatalogInfo, "url" | "source">>;

function publicationIdentity(value: string | undefined): string | undefined {
  if (!value) return;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return;
    const suffix = /\/g\/(?:0|[1-9]\d*)\/index\.json$/.exec(url.pathname);
    if (suffix) return url.origin + url.pathname.slice(0, suffix.index);
  } catch { return; }
}

export function ownsTemplateCatalog(local: LocalTemplates | undefined, catalog: CatalogLocation | undefined): boolean {
  if (!local?.enabled || !catalog || catalog.name !== local.catalogName || local.registrationError === "catalog_name_conflict") return false;
  const expected = publicationIdentity(local.catalogURL);
  return expected !== undefined && expected === publicationIdentity(catalog.source || catalog.url);
}

export function libraryModels(remote: CatalogResponse | undefined, local: LocalTemplates | undefined, selected: string, named: string, configured?: CatalogLocation): LibraryModel[] {
  const custom = local?.enabled ? local.catalog.models.map((model) => ({ catalog: local.catalogName, model, custom: true, ready: templateReady(local, model.name) })) : [];
  if (selected === local?.catalogName && ownsTemplateCatalog(local, configured ?? remote)) return custom;
  const published = remote?.models.map((model) => ({ catalog: remote.name || selected, model, custom: false, ready: true })) ?? [];
  return named ? published : [...published, ...custom];
}
