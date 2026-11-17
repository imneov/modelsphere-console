import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Badge,
  Input,
  ResourceTable,
  type ResourceColumn,
  type ResourceRowAction,
} from "@modelsphere/ui";
import { useNavigate } from "react-router";
import {
  api,
  type AdminCustomer,
  type Owner,
  type Wallet,
} from "./api";
import { BillingPage, BillingRefresh } from "./BillingPage";
import { CreditDialog } from "./CreditDialog";
import { formatMoney } from "./money";
import { StatCard, StatRow } from "./Stats";
import { count } from "./summary";
import { useT } from "./i18n";

type AmountField =
  | "balance"
  | "topups"
  | "charges"
  | "adjustments"
  | "net";

export function Customers() {
  const t = useT();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [crediting, setCrediting] = useState<AdminCustomer | null>(null);
  const window = useMemo(() => localDayWindow(), []);
  const query = useQuery({
    queryKey: ["billing", "admin-customers", window],
    queryFn: () => api.adminCustomers(window.from, window.until),
  });
  const items = query.data?.items ?? [];
  const currency = items[0]?.currency ?? "";
  const needle = search.trim().toLowerCase();
  const rows = items.filter(
    (item) =>
      !needle ||
      item.name.toLowerCase().includes(needle) ||
      item.displayName?.toLowerCase().includes(needle),
  );
  const openWithOwner = (path: "account" | "ledger", ownerUID: string) => {
    const query = new URLSearchParams({ ownerUserID: ownerUID });
    navigate(`/billing/${path}?${query}`);
  };
  const actions = (row: AdminCustomer): ResourceRowAction<AdminCustomer>[] => [
    {
      key: "credit",
      label: t("credit"),
      onClick: () => setCrediting(row),
    },
    {
      key: "wallet",
      label: t("viewWallet"),
      onClick: () => openWithOwner("account", row.ownerUserID),
    },
    {
      key: "ledger",
      label: t("ledger"),
      onClick: () => openWithOwner("ledger", row.ownerUserID),
    },
  ];
  const columns: ResourceColumn<AdminCustomer>[] = [
    {
      key: "customer",
      title: t("customer"),
      hideable: false,
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">
            {row.displayName || row.name}
          </p>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {row.name} · {row.ownerUserID}
          </p>
        </div>
      ),
    },
    {
      key: "balance",
      title: t("availableBalance"),
      align: "right",
      render: (row) => (
        <span className="font-medium tabular-nums">
          {money(row.balance, row.currency)}
        </span>
      ),
    },
    {
      key: "billingState",
      title: t("accountStatus"),
      render: (row) => (
        <Badge variant={row.billingState === "allowed" ? "secondary" : "outline"}>
          {t(row.billingState)}
        </Badge>
      ),
    },
    {
      key: "topups",
      title: t("todayTopup"),
      align: "right",
      render: (row) => (
        <span className="tabular-nums">
          {money(row.topups, row.currency)}
        </span>
      ),
    },
    {
      key: "charges",
      title: t("todaySpend"),
      align: "right",
      render: (row) => (
        <span className="tabular-nums">
          {money(spend(row.charges), row.currency)}
        </span>
      ),
    },
  ];
  return (
    <BillingPage
      title={t("customersTitle")}
      description={t("customersDescription")}
      actions={<BillingRefresh />}
    >
      <StatRow>
        <StatCard
          label={t("customerCount")}
          value={count(items.length)}
          hint={t("customerCountHint")}
        />
        <StatCard
          label={t("totalBalance")}
          value={money(total(items, "balance"), currency)}
          hint={t("totalBalanceHint")}
        />
        <StatCard
          label={t("todayTopup")}
          value={money(total(items, "topups"), currency)}
          hint={t("todayTopupHint")}
        />
        <StatCard
          label={t("todaySpend")}
          value={money(spend(total(items, "charges")), currency)}
          hint={t("todaySpendHint")}
        />
      </StatRow>
      <ResourceTable<AdminCustomer>
        toolbarLayout="inline"
        data={rows}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        rowKey="ownerUserID"
        columns={columns}
        rowActions={actions}
        filters={
          <div className="w-64 shrink-0">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("searchCustomer")}
              className="w-full"
            />
          </div>
        }
        activeFilters={
          needle
            ? [
                {
                  key: "search",
                  label: t("customer"),
                  display: search.trim(),
                },
              ]
            : []
        }
        onRemoveFilter={() => setSearch("")}
        emptyTitle={t("emptyCustomers")}
        emptyDescription={t("emptyCustomersHint")}
        onRowClick={(row) => openWithOwner("account", row.ownerUserID)}
      />
      {crediting && (
        <CreditDialog
          key={crediting.ownerUserID}
          wallet={walletFor(crediting)}
          owner={ownerFor(crediting)}
          openInitially
          showTrigger={false}
          onClosed={() => setCrediting(null)}
        />
      )}
    </BillingPage>
  );
}

function localDayWindow(): { from: string; until: string } {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return { from: start.toISOString(), until: now.toISOString() };
}

function total(items: AdminCustomer[], field: AmountField): string {
  let amount = 0n;
  for (const item of items) amount += BigInt(item[field]);
  return amount.toString();
}

/** Charges and spend totals are negative in the ledger; present spend as a positive number. */
function spend(amount: string): string {
  return amount.startsWith("-") ? amount.slice(1) : amount;
}

function money(amount: string, currency: string): string {
  return currency ? formatMoney(amount, currency) : "—";
}

function ownerFor(customer: AdminCustomer): Owner {
  return {
    name: customer.name,
    uid: customer.ownerUserID,
    displayName: customer.displayName,
  };
}

function walletFor(customer: AdminCustomer): Wallet {
  return {
    ownerUserID: customer.ownerUserID,
    currency: customer.currency,
    balance: customer.balance,
    ledgerBalance: customer.balance,
    revision: customer.revision,
    billingState: customer.billingState,
  };
}
