import { lazy, Suspense } from "react";
import { Activity, FileText, Receipt } from "lucide-react";
import type { ConsoleModule } from "@/shell";
import { useT } from "@/modules/billing/i18n";
const Account = lazy(() =>
  import("@/modules/billing/Account").then((module) => ({
    default: module.Account,
  })),
);
const Requests = lazy(() =>
  import("./Requests").then((module) => ({ default: module.Requests })),
);
const Ledger = lazy(() =>
  import("./Ledger").then((module) => ({ default: module.Ledger })),
);
function Loading() {
  const t = useT();
  return <div className="p-6">{t("common:status.loading")}</div>;
}
export const billingModule: ConsoleModule = {
  id: "billing",
  capability: "billing",
  title: "用量与计费",
  basePath: "/billing",
  frame: "flush",
  pages: [
    {
      path: "account",
      element: (
        <Suspense fallback={<Loading />}>
          <Account />
        </Suspense>
      ),
      menu: { label: "总览", icon: Receipt },
    },
    {
      path: "requests",
      element: (
        <Suspense fallback={<Loading />}>
          <Requests />
        </Suspense>
      ),
      menu: { label: "用量统计", icon: Activity },
    },
    {
      path: "ledger",
      element: (
        <Suspense fallback={<Loading />}>
          <Ledger />
        </Suspense>
      ),
      menu: { label: "账单中心", icon: FileText },
    },
  ],
};
