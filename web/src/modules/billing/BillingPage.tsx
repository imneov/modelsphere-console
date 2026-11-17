import type { ReactNode } from "react";
import { Button, PageBanner } from "@modelsphere/ui";
import { RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useT } from "./i18n";

export function BillingPage({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageBanner title={title} description={description} actions={actions} />
      <div className="min-h-0 flex-1 overflow-auto bg-surface-page p-4 sm:p-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-5">{children}</div>
      </div>
    </div>
  );
}

export function BillingRefresh() {
  const t = useT();
  const client = useQueryClient();
  return (
    <Button
      variant="outline"
      onClick={() =>
        void client.invalidateQueries({
          queryKey: ["billing"],
          // The owner list is large and changes rarely; a balance refresh must not
          // pull it again on every click.
          predicate: (query) => query.queryKey[1] !== "owners",
        })
      }
    >
      <RefreshCw className="size-4" />
      {t("refresh")}
    </Button>
  );
}
