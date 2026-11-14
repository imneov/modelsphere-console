import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, Button } from "@modelsphere/ui";
import { Banknote, ShieldCheck, Wallet as WalletIcon } from "lucide-react";
import { StatCard } from "@/shell";
import { api, type Wallet } from "@/modules/billing/api";
import { useT } from "@/modules/billing/i18n";
import { formatMoney } from "@/modules/billing/money";

export function WalletPanel({
  ownerUID,
  wallet,
  error,
}: {
  ownerUID: string;
  wallet?: Wallet;
  error: Error | null;
}) {
  return (
    <div className="space-y-3">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}
      <WalletStats wallet={wallet} />
      <AdmissionSync wallet={wallet} />
      <Reconciliation ownerUID={ownerUID} wallet={wallet} />
    </div>
  );
}

function WalletStats({ wallet }: { wallet?: Wallet }) {
  const t = useT();
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <StatCard
        icon={WalletIcon}
        label={t("balance")}
        value={wallet ? formatMoney(wallet.balance, wallet.currency) : "—"}
      />
      <StatCard
        icon={ShieldCheck}
        label={t("admission")}
        value={wallet ? t(wallet.admissionState ?? wallet.billingState) : "—"}
      />
      <StatCard
        icon={Banknote}
        label={t("currency")}
        value={wallet?.currency ?? "—"}
      />
    </div>
  );
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
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <Button
        variant="outline"
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
    <p role="status" className="text-sm text-muted-foreground">
      {t("admissionPending")}
    </p>
  );
}
