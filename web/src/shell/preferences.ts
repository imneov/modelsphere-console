import { useSyncExternalStore } from "react";

// Shell layout, chosen in the preferences panel. A subset of Rise Global's
// preferences: same localStorage key and schema version, and only
// `theme.layout` is read or written — every other field is left as found, so a
// user's choice carries over unchanged when the install is upgraded to Global.
export type Layout = "mixed-nav" | "classic" | "minimal";

// Labels and hints are Global's (PreferencesPanel LAYOUTS), in Global's order.
export const LAYOUTS: { value: Layout; label: string; hint: string }[] = [
  { value: "mixed-nav", label: "混合导航", hint: "顶部通栏，侧边一列菜单" },
  { value: "classic", label: "经典", hint: "同混合导航，但侧边栏是浮动卡片" },
  { value: "minimal", label: "极简", hint: "侧边一列通高到顶；顶栏与内容合成一块圆角板，层次靠圆角和间隙而非边框" },
];

// Global's factory default (rise-global lib/preferences/defaults.ts).
export const DEFAULT_LAYOUT: Layout = "minimal";

export const STORAGE_KEY = "rise-preferences";
const SCHEMA_VERSION = 4;

function isLayout(v: unknown): v is Layout {
  return LAYOUTS.some((l) => l.value === v);
}

function parse(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {};
  } catch {
    return {};
  }
}

// readLayout falls back to the default for anything this console does not
// render, including Global layouts it does not have.
export function readLayout(storage: Pick<Storage, "getItem">): Layout {
  const theme = parse(storage.getItem(STORAGE_KEY)).theme as Record<string, unknown> | undefined;
  return isLayout(theme?.layout) ? theme.layout : DEFAULT_LAYOUT;
}

export function writeLayout(storage: Pick<Storage, "getItem" | "setItem">, layout: Layout): void {
  const prefs = parse(storage.getItem(STORAGE_KEY));
  const theme = (prefs.theme && typeof prefs.theme === "object" ? prefs.theme : {}) as Record<string, unknown>;
  storage.setItem(STORAGE_KEY, JSON.stringify({ ...prefs, v: prefs.v ?? SCHEMA_VERSION, theme: { ...theme, layout } }));
}

// ── Store ──────────────────────────────────────────────────────────────────
// Module-level so every consumer sees one value; the <html data-layout> mirror
// lets CSS scope the per-layout surface tokens (src/index.css).

const listeners = new Set<() => void>();
let current: Layout = typeof localStorage === "undefined" ? DEFAULT_LAYOUT : readLayout(localStorage);

function apply(layout: Layout) {
  if (typeof document !== "undefined") document.documentElement.dataset.layout = layout;
}
apply(current);

export function setLayout(layout: Layout): void {
  if (layout === current) return;
  current = layout;
  writeLayout(localStorage, layout);
  apply(layout);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab changed it: follow.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY) return;
    const next = readLayout(localStorage);
    if (next !== current) {
      current = next;
      apply(next);
      listeners.forEach((l) => l());
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useLayout(): Layout {
  return useSyncExternalStore(subscribe, () => current, () => DEFAULT_LAYOUT);
}
