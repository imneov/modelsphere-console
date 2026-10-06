import { lazy, Suspense, type ReactNode } from "react";
import { BookOpen } from "lucide-react";
import type { ConsoleModule } from "@/shell";
import { useT } from "@/modules/docs/i18n";

const DocsPage = lazy(() => import("@/modules/docs/DocsPage").then((m) => ({ default: m.DocsPage })));

function Loading() {
  const t = useT();
  return <div className="p-6 text-sm text-muted-foreground">{t("common:status.loading")}</div>;
}

const page = (node: ReactNode) => <Suspense fallback={<Loading />}>{node}</Suspense>;

// The user guide ships with the console, so it describes the pages of this build.
// No permission: every signed-in user may read it.
export const docsModule: ConsoleModule = {
  id: "docs",
  title: "帮助",
  basePath: "/help",
  frame: "flush",
  pages: [
    { path: "docs", element: page(<DocsPage />), menu: { label: "使用文档", icon: BookOpen } },
    { path: "docs/:chapter", element: page(<DocsPage />) },
  ],
};
