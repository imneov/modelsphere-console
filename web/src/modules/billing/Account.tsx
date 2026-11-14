import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  PageBanner,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@modelsphere/ui";
import { Receipt } from "lucide-react";
import { usePermissions } from "@/shell";
import { api, type BillingFilters } from "@/modules/billing/api";
import { useT } from "@/modules/billing/i18n";
import { WalletPanel } from "@/modules/billing/WalletPanel";
import { BillingFiltersForm } from "@/modules/billing/Filters";
import { UsageTable, LedgerTable } from "@/modules/billing/Tables";
import { CreditDialog } from "@/modules/billing/CreditDialog";

const initialFilters: BillingFilters = {
  ownerUserID: "",
  model: "",
  apiKeyID: "",
  requestID: "",
  from: "",
  until: "",
  page: 1,
  limit: 20,
};

function useAccount() {
  const [filters, setFilters] = useState(initialFilters);
  const [tab, setTab] = useState("usage");
  const [creditOpen, setCreditOpen] = useState(false);
  const wallet = useQuery({
    queryKey: ["billing", "wallet", filters.ownerUserID],
    queryFn: () => api.wallet(filters.ownerUserID),
  });
  const change = (patch: Partial<BillingFilters>) =>
    setFilters((current) => ({ ...current, page: 1, ...patch }));
  const ledgerForRequest = (requestID: string) => {
    change({ requestID });
    setTab("ledger");
  };
  return {
    filters,
    tab,
    setTab,
    creditOpen,
    setCreditOpen,
    wallet,
    change,
    ledgerForRequest,
  };
}

export function Account() {
  const t = useT();
  const { has } = usePermissions();
  const account = useAccount();
  const { filters, tab, setTab, creditOpen, setCreditOpen, wallet, change } =
    account;
  return (
    <div className="flex h-full flex-col">
      <PageBanner title={t("title")} icon={<Receipt className="size-5" />} />
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
        <WalletPanel
          ownerUID={filters.ownerUserID}
          wallet={wallet.data}
          error={wallet.error}
        />
        <AccountToolbar
          tab={tab}
          onTab={(value) => {
            change({ page: 1 });
            setTab(value);
          }}
          canCredit={Boolean(wallet.data)}
          onCredit={() => setCreditOpen(true)}
        />
        <BillingFiltersForm
          filters={filters}
          onChange={change}
          admin={has("billing.manage")}
        />
        <div className="shrink-0">
          <AccountTable account={account} />
        </div>
      </div>
      <CreditDialog
        open={creditOpen}
        onOpenChange={setCreditOpen}
        currency={wallet.data?.currency ?? ""}
      />
    </div>
  );
}

function AccountToolbar({
  tab,
  onTab,
  canCredit,
  onCredit,
}: {
  tab: string;
  onTab: (value: string) => void;
  canCredit: boolean;
  onCredit: () => void;
}) {
  const t = useT();
  const { has } = usePermissions();
  const client = useQueryClient();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Tabs value={tab} onValueChange={onTab}>
        <TabsList>
          <TabsTrigger value="usage">{t("usage")}</TabsTrigger>
          <TabsTrigger value="ledger">{t("ledger")}</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() =>
            void client.invalidateQueries({ queryKey: ["billing"] })
          }
        >
          {t("refresh")}
        </Button>
        {has("billing.manage") && (
          <Button disabled={!canCredit} onClick={onCredit}>
            {t("credit")}
          </Button>
        )}
      </div>
    </div>
  );
}

function AccountTable({ account }: { account: ReturnType<typeof useAccount> }) {
  return account.tab === "usage" ? (
    <UsageTable
      filters={account.filters}
      onChange={account.change}
      onLedger={account.ledgerForRequest}
    />
  ) : (
    <LedgerTable filters={account.filters} onChange={account.change} />
  );
}
