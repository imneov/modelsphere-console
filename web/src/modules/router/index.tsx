import { lazy, Suspense } from "react";
import { KeyRound } from "lucide-react";
import type { ConsoleModule } from "@/shell";
import { useT } from "@/modules/router/i18n";

const ApiKeys = lazy(() => import("@/modules/router/ApiKeys").then((m) => ({ default: m.ApiKeys })));

function Loading() {
  const t = useT();
  return <div className="p-6 text-sm text-muted-foreground">{t("common:status.loading")}</div>;
}

// The router is /v1, the entrypoint programs call models through; this module
// manages the API keys that open it.
export const routerModule: ConsoleModule = {
  id: "router",
  title: "路由",
  basePath: "/router",
  frame: "flush",
  pages: [
    {
      path: "api-keys",
      element: (
        <Suspense fallback={<Loading />}>
          <ApiKeys />
        </Suspense>
      ),
      permission: "apikeys.view",
      menu: { label: "API 密钥", icon: KeyRound },
    },
  ],
};
