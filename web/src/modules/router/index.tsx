import { lazy, Suspense } from "react";
import { KeyRound } from "lucide-react";
import type { ConsoleModule } from "@/shell";

const ApiKeys = lazy(() => import("@/modules/router/ApiKeys").then((m) => ({ default: m.ApiKeys })));

// The router is /v1, the entrypoint programs call models through; this module
// manages the API keys that open it.
export const routerModule: ConsoleModule = {
  id: "router",
  title: "路由",
  basePath: "/router",
  pages: [
    {
      path: "api-keys",
      element: (
        <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">加载中…</div>}>
          <ApiKeys />
        </Suspense>
      ),
      permission: "apikeys.view",
      menu: { label: "API 密钥", icon: KeyRound },
    },
  ],
};
