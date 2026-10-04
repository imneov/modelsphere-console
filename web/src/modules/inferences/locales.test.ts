import { describe, expect, it } from "vitest";
import { IntlMessageFormat } from "intl-messageformat";
import zh from "@/modules/inferences/locales/zh-CN.json";
import en from "@/modules/inferences/locales/en-US.json";

function leaves(o: unknown, path = ""): [string, string][] {
  if (typeof o === "string") return [[path, o]];
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
}

describe("inferences strings", () => {
  for (const [locale, bundle] of [["zh-CN", zh], ["en-US", en]] as const) {
    it(`${locale} parses as ICU`, () => {
      const bad = leaves(bundle).filter(([, msg]) => {
        try {
          new IntlMessageFormat(msg, locale);
          return false;
        } catch {
          return true;
        }
      });
      expect(bad.map(([k]) => k)).toEqual([]);
    });
  }
  it("en-US has every zh-CN key", () => {
    const enKeys = new Set(leaves(en).map(([k]) => k));
    expect(leaves(zh).map(([k]) => k).filter((k) => !enKeys.has(k))).toEqual([]);
  });
});
