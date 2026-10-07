import type { Locale } from "@/shell";

// Sidebar order. Each slug is content/{locale}/{slug}.md; its first "# " line is the title.
export const CHAPTERS = ["getting-started", "deploy", "playground", "api", "access-control", "faq"] as const;
export type Chapter = (typeof CHAPTERS)[number];

const files = import.meta.glob<string>("./content/*/*.md", { query: "?raw", import: "default", eager: true });

export function chapterText(locale: Locale, slug: string): string | undefined {
  return files[`./content/${locale}/${slug}.md`];
}

export function chapterTitle(text: string): string {
  return /^#\s+(.+)$/m.exec(text)?.[1].trim() ?? "";
}

export function isChapter(slug: string | undefined): slug is Chapter {
  return CHAPTERS.includes(slug as Chapter);
}
