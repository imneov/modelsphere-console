import { describe, expect, it } from "vitest";
import { LOCALES } from "@/shell/i18n";
import { modules } from "@/modules";
import { joinPath } from "@/shell/module";
import { CHAPTERS, chapterText, chapterTitle } from "@/modules/docs/chapters";

const routes = modules.flatMap((m) => m.pages.map((p) => joinPath(m.basePath, p.path)));
const matches = (href: string) =>
  routes.some((r) => new RegExp(`^${r.replace(/:[^/]+/g, "[^/]+")}$`).test(href));

describe("user guide", () => {
  for (const { value: locale } of LOCALES) {
    for (const slug of CHAPTERS) {
      it(`${locale}/${slug} exists with a title`, () => {
        const text = chapterText(locale, slug);
        expect(text).toBeDefined();
        expect(chapterTitle(text!)).not.toBe("");
      });
      it(`${locale}/${slug} links only to console pages that exist`, () => {
        const links = [...(chapterText(locale, slug) ?? "").matchAll(/\]\((\/[^)]*)\)/g)].map((m) => m[1]);
        expect(links.filter((l) => !matches(l))).toEqual([]);
      });
    }
  }
});
