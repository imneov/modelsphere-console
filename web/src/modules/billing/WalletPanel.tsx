import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, Badge, Button } from "@modelsphere/ui";
import { ShieldCheck, Wallet as WalletIcon } from "lucide-react";
import { api, type BillingFilters, type Wallet } from "./api";
import { useT } from "./i18n";
import { formatMoney, isPositiveMoney } from "./money";
import { StatCard, StatRow } from "./Stats";
import {
  ledgerAmount,
  ledgerSpend,
  todayFilters,
  useLedgerSummary,
} from "./summary";

/** Balance, today's movements and admission state in one row. */
export function WalletPanel({
  filters,
  wallet,
  error,
  showReconciliation,
  actions,
}: {
  filters: BillingFilters;
  wallet?: Wallet;
  error: Error | null;
  showReconciliation: boolean;
  actions?: ReactNode;
}) {
  const t = useT();
  const today = useLedgerSummary(todayFilters(filters));
  const currency = wallet?.currency ?? "";
  const summary = today.data;
  const net = summary === undefined ? "—" : signedMoney(summary.net, currency);
  return (
    <div className="space-y-3">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}
      <StatRow>
        <StatCard
          label={t("availableBalance")}
          value={wallet ? formatMoney(wallet.balance, wallet.currency) : "—"}
          hint={t("balanceHint")}
          action={
            actions ?? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <WalletIcon className="size-3.5" />
                {wallet?.currency}
              </span>
            )
          }
          footer={
            showReconciliation ? (
              <Reconciliation ownerUID={filters.ownerUserID} wallet={wallet} />
            ) : undefined
          }
        />
        <StatCard
          label={t("todaySpend")}
          value={ledgerSpend(summary, currency)}
          hint={t("todaySpendHint")}
        />
        <StatCard
          label={t("todayTopup")}
          value={ledgerAmount(summary, "topups", currency)}
          hint={t("todayTopupHint")}
        />
        <StatCard
          label={t("todayNet")}
          value={net}
          hint={t("todayNetHint")}
        />
      </StatRow>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-medium">
          <ShieldCheck className="size-4" />
          {t("accountStatus")}
          <Badge
            variant={
              (wallet?.admissionState ?? "unknown") === "allowed"
                ? "secondary"
                : "outline"
            }
          >
            {t(wallet?.admissionState ?? "unknown")}
          </Badge>
        </span>
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          {t("admissionHint")}
        </p>
        <AdmissionSync wallet={wallet} />
      </div>
    </div>
  );
}

/** Positive net movements read as income, so they keep the plus sign. */
function signedMoney(amount: string, currency: string): string {
  const formatted = formatMoney(amount, currency);
  return isPositiveMoney(amount) ? `+ ${formatted}` : formatted;
}

function Reconciliation({
  ownerUID,
  wallet,
}: {
  ownerUID: string;
  wallet?: Wallet;
}) {
  const t = useT();
  const check = useQuery({
    queryKey: ["billing", "reconciliation", ownerUID],
    queryFn: () => api.reconcile(ownerUID),
    enabled: false,
  });
  const currentCheck =
    check.data &&
    wallet &&
    check.data.revision === wallet.revision &&
    check.data.balance === wallet.balance;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Button
        variant="outline"
        size="sm"
        disabled={!wallet || check.isFetching}
        onClick={() => void check.refetch()}
      >
        {t("reconcile")}
      </Button>
      {check.error && (
        <span role="alert" className="text-destructive">
          {check.error.message}
        </span>
      )}
      {currentCheck && <ReconciliationResult wallet={check.data} />}
    </div>
  );
}

function ReconciliationResult({ wallet }: { wallet: Wallet }) {
  const t = useT();
  return (
    <span
      className={
        wallet.balance === wallet.ledgerBalance
          ? "text-muted-foreground"
          : "text-destructive"
      }
    >
      {t(
        wallet.balance === wallet.ledgerBalance ? "consistent" : "inconsistent",
      )}
    </span>
  );
}

function AdmissionSync({ wallet }: { wallet?: Wallet }) {
  const t = useT();
  if (
    !wallet?.admissionState ||
    wallet.admissionState === wallet.billingState ||
    (wallet.admissionState === "unknown" && wallet.billingState === "blocked")
  )
    return null;
  return (
    <p role="status" className="text-xs text-muted-foreground">
      {t("admissionPending")}
    </p>
  );
}
