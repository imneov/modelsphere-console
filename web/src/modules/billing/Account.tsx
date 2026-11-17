import { useQuery } from "@tanstack/react-query";
import { usePermissions } from "@/shell";
import { api } from "./api";
import { useT } from "./i18n";
import { WalletPanel } from "./WalletPanel";
import { BillingPage, BillingRefresh } from "./BillingPage";
import { useBillingFilters } from "./filterState";

export function Account() {
  const t = useT();
  const { has } = usePermissions();
  const admin = has("billing.manage");
  const { filters } = useBillingFilters();
  const wallet = useQuery({
    queryKey: ["billing", "wallet", filters.ownerUserID],
    queryFn: () => api.wallet(filters.ownerUserID),
  });
  return (
    <BillingPage
      title={t("title")}
      description={t("walletDescription")}
      actions={<BillingRefresh />}
    >
      <WalletPanel
        filters={filters}
        wallet={wallet.data}
        error={wallet.error}
        showReconciliation={admin}
      />
    </BillingPage>
  );
}
