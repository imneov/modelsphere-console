import { useEffect, useRef } from "react";
import { Link, NavLink, useParams } from "react-router";
import { PageBanner } from "@modelsphere/ui";
import { BookOpen, ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useModulePath } from "@/shell";
import { useT } from "@/modules/docs/i18n";
import { CHAPTERS, chapterText, chapterTitle, isChapter } from "@/modules/docs/chapters";
import { Markdown } from "@/modules/docs/Markdown";

export function DocsPage() {
  const t = useT();
  const p = useModulePath();
  const { locale } = useLocale();
  const { chapter = CHAPTERS[0] } = useParams();
  const scroller = useRef<HTMLDivElement>(null);
  const text = isChapter(chapter) ? chapterText(locale, chapter) : undefined;
  const index = CHAPTERS.indexOf(chapter as (typeof CHAPTERS)[number]);
  const prev = index > 0 ? CHAPTERS[index - 1] : undefined;
  const next = index >= 0 && index < CHAPTERS.length - 1 ? CHAPTERS[index + 1] : undefined;
  const title = (slug: string) => chapterTitle(chapterText(locale, slug) ?? "");

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [chapter]);

  return (
    <div className="flex h-full flex-col">
      <PageBanner title={t("title")} description={t("description")} icon={<BookOpen className="size-5" />} />
      <div className="flex min-h-0 flex-1 gap-4 p-4">
        <nav className="w-52 shrink-0 overflow-y-auto rounded-lg border bg-card p-2">
          <div className="px-2 pb-2 pt-1 text-xs font-medium text-muted-foreground">{t("chapters")}</div>
          {CHAPTERS.map((slug, i) => (
            <NavLink
              key={slug}
              to={p(`docs/${slug}`)}
              className={({ isActive }) =>
                `block rounded-md px-2 py-1.5 text-sm transition-colors ${
                  isActive || (i === 0 && chapter === slug) ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`
              }
            >
              {title(slug)}
            </NavLink>
          ))}
        </nav>
        <div ref={scroller} className="min-w-0 flex-1 overflow-y-auto rounded-lg border bg-card">
          <div className="mx-auto max-w-3xl px-8 py-6">
            {text ? <Markdown text={text} /> : <p className="text-sm text-muted-foreground">{t("notFound")}</p>}
            {text && (
              <div className="mt-10 flex justify-between gap-4 border-t pt-4 text-sm">
                {prev ? (
                  <Link to={p(`docs/${prev}`)} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
                    <ChevronLeft className="size-4" />
                    {t("prev")} · {title(prev)}
                  </Link>
                ) : (
                  <span />
                )}
                {next && (
                  <Link to={p(`docs/${next}`)} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
                    {t("next")} · {title(next)}
                    <ChevronRight className="size-4" />
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
