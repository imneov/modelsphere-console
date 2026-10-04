import type { SiteProfile } from "@swiss/lib/api";

export interface Row {
  key: string;
  value: string;
}

export function toRows(r?: Record<string, string>): Row[] {
  return Object.entries(r ?? {}).map(([key, value]) => ({ key, value }));
}

// A row without a key is one being typed, not a value: it is left out, and an
// empty table is no table at all.
export function fromRows(rows: Row[]): Record<string, string> | undefined {
  const kept = rows.filter((r) => r.key.trim());
  return kept.length ? Object.fromEntries(kept.map((r) => [r.key.trim(), r.value])) : undefined;
}

export function profileErrors(p: SiteProfile): ("name" | "pathTemplate")[] {
  const errs: ("name" | "pathTemplate")[] = [];
  if (!p.name?.trim()) errs.push("name");
  if (!p.model?.pathTemplate?.trim()) errs.push("pathTemplate");
  return errs;
}

// One catalog marked default at most: marking one clears the others.
export function markDefault(catalogs: NonNullable<SiteProfile["catalogs"]>, index: number, on: boolean) {
  return catalogs.map((c, i) => ({ ...c, default: i === index ? on : on ? false : c.default }));
}
