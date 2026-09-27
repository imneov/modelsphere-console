import { lazy, Suspense, type ReactNode } from "react";
import { Columns2, MessageSquare } from "lucide-react";
import type { ConsoleModule } from "@/shell";

// Loaded on first visit: Markdown and syntax highlighting are most of the
// module's weight, and no other page needs them.
const Chat = lazy(() => import("@/modules/playground/Chat").then((m) => ({ default: m.Chat })));
const Compare = lazy(() => import("@/modules/playground/Compare").then((m) => ({ default: m.Compare })));

const page = (node: ReactNode) => <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">加载中…</div>}>{node}</Suspense>;

// The gateway key stays server-side, so the pages need no credential of their
// own -- only playground.use and access to the llm backend.
export const playgroundModule: ConsoleModule = {
  id: "playground",
  title: "Playground",
  basePath: "/playground",
  pages: [
    { path: "", element: page(<Chat />), permission: "playground.use", menu: { label: "对话", icon: MessageSquare } },
    { path: "compare", element: page(<Compare />), permission: "playground.use", menu: { label: "多模型对比", icon: Columns2 } },
  ],
};
