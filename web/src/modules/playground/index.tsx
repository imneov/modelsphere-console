import { FlaskConical } from "lucide-react";
import type { ConsoleModule } from "@/shell";
import { Playground } from "@/modules/playground/Playground";

// Chat against the inference gateway behind console. The gateway key stays
// server-side (backends.llm.apiKeyEnv), so the page needs no credential of its
// own -- only playground.use and read access to the llm backend.
export const playgroundModule: ConsoleModule = {
  id: "playground",
  title: "Playground",
  basePath: "/playground",
  pages: [{ path: "", element: <Playground />, permission: "playground.use", menu: { label: "对话", icon: FlaskConical } }],
};
