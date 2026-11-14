import { lazy, Suspense } from "react";
import { Receipt, Tags } from "lucide-react";
import type { ConsoleModule } from "@/shell";
import { useT } from "@/modules/billing/i18n";
const Account = lazy(() =>
  import("@/modules/billing/Account").then((module) => ({
    default: module.Account,
  })),
);
const Prices = lazy(() =>
  import("@/modules/billing/Prices").then((module) => ({
    default: module.Prices,
  })),
);
function Loading() {
  const t = useT();
  return <div className="p-6">{t("common:status.loading")}</div>;
}
export const billingModule: ConsoleModule = {
  id: "billing",
  capability: "billing",
  title: "账务",
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
      menu: { label: "用量与钱包", icon: Receipt },
    },
    {
      path: "prices",
      element: (
        <Suspense fallback={<Loading />}>
          <Prices />
        </Suspense>
      ),
      permission: "billing.manage",
      menu: { label: "模型价格", icon: Tags },
    },
  ],
};
