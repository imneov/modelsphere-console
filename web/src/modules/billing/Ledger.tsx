import { useQuery } from "@tanstack/react-query";
import { Button } from "@modelsphere/ui";
import { usePermissions } from "@/shell";
import { api } from "./api";
import { BillingPage, BillingRefresh } from "./BillingPage";
import { BillingFiltersForm } from "./Filters";
import { LedgerTable } from "./Tables";
import { WalletPanel } from "./WalletPanel";
import { useBillingFilters } from "./filterState";
import { useT } from "./i18n";

export function Ledger() {
  const t = useT();
  const { has } = usePermissions();
  const { filters, change } = useBillingFilters();
  const wallet = useQuery({
    queryKey: ["billing", "wallet", filters.ownerUserID],
    queryFn: () => api.wallet(filters.ownerUserID),
  });
  const linkedScope = filters.requestID || filters.model || filters.apiKeyID;
  return (
    <BillingPage
      title={t("ledger")}
      description={t("ledgerDescription")}
      actions={<BillingRefresh />}
    >
      <WalletPanel
        filters={filters}
        wallet={wallet.data}
        error={wallet.error}
        showReconciliation={has("billing.manage")}
      />
      {linkedScope && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3 text-sm">
          <span className="break-all">
            {t("linkedLedger")}: {linkedScope}
          </span>
          <Button
            variant="ghost"
            onClick={() => change({ requestID: "", model: "", apiKeyID: "" })}
          >
            {t("allMovements")}
          </Button>
        </div>
      )}
      <BillingFiltersForm filters={filters} onChange={change} />
      <LedgerTable
        key={filters.ownerUserID}
        filters={filters}
        onChange={change}
      />
    </BillingPage>
  );
}
