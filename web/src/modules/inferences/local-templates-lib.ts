import type { CatalogModel, CatalogResponse } from "@swiss/lib/api";
import { templateReady, type LocalTemplates } from "./local-templates-api";

export interface LibraryModel { catalog: string; model: CatalogModel; custom: boolean; ready: boolean }

export function libraryModels(remote: CatalogResponse | undefined, local: LocalTemplates | undefined, selected: string, named: string): LibraryModel[] {
  const custom = local?.enabled ? local.catalog.models.map((model) => ({ catalog: local.catalogName, model, custom: true, ready: templateReady(local, model.name) })) : [];
  if (local?.enabled && selected === local.catalogName) return custom;
  const published = remote?.models.map((model) => ({ catalog: remote.name || selected, model, custom: false, ready: true })) ?? [];
  return named ? published : [...published, ...custom];
}
