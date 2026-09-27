import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, STORAGE_KEY, readLayout, writeLayout } from "@/shell/preferences";

function memoryStorage(initial?: unknown) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(STORAGE_KEY, typeof initial === "string" ? initial : JSON.stringify(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    saved: () => JSON.parse(data.get(STORAGE_KEY) ?? "null"),
  };
}

describe("readLayout", () => {
  it("defaults to Global's factory layout when nothing is stored", () => {
    expect(readLayout(memoryStorage())).toBe(DEFAULT_LAYOUT);
    expect(DEFAULT_LAYOUT).toBe("minimal");
  });

  it("reads a layout Global wrote", () => {
    expect(readLayout(memoryStorage({ v: 4, theme: { layout: "classic", primary: "blue" } }))).toBe("classic");
  });

  it("falls back for a Global layout this console does not render", () => {
    expect(readLayout(memoryStorage({ v: 4, theme: { layout: "sidebar-mixed-nav" } }))).toBe(DEFAULT_LAYOUT);
  });

  it("survives corrupt storage", () => {
    expect(readLayout(memoryStorage("{not json"))).toBe(DEFAULT_LAYOUT);
    expect(readLayout(memoryStorage("[]"))).toBe(DEFAULT_LAYOUT);
  });
});

describe("writeLayout", () => {
  it("writes Global's schema when nothing is stored", () => {
    const s = memoryStorage();
    writeLayout(s, "mixed-nav");
    expect(s.saved()).toEqual({ v: 4, theme: { layout: "mixed-nav" } });
  });

  it("keeps every other preference untouched, so an upgrade to Global loses nothing", () => {
    const s = memoryStorage({ v: 4, theme: { layout: "minimal", primary: "violet", radius: 0.75 }, sidebar: { width: 280 } });
    writeLayout(s, "classic");
    expect(s.saved()).toEqual({ v: 4, theme: { layout: "classic", primary: "violet", radius: 0.75 }, sidebar: { width: 280 } });
  });

  it("round-trips", () => {
    const s = memoryStorage();
    writeLayout(s, "classic");
    expect(readLayout(s)).toBe("classic");
  });
});
