import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  AlertDescription,
  Button,
  DataSelect,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@modelsphere/ui";
import { CheckCircle2, Plus } from "lucide-react";
import { ApiError } from "@/shell";
import { api, type Credit, type Owner, type Wallet } from "./api";
import { parseMoney, formatMoney } from "./money";
import { ownerLabel } from "./OwnerSelector";
import { useT } from "./i18n";

type Draft = {
  owner: Owner;
  wallet: Wallet;
  operationID: string;
  amount: string;
  kind: Credit["kind"];
  submitted?: Credit;
};

export function creditInput(
  draft: Pick<Draft, "owner" | "wallet" | "operationID" | "amount" | "kind">,
): Credit {
  const amount = parseMoney(draft.amount);
  if (BigInt(amount) === 0n || (draft.kind === "topup" && BigInt(amount) < 0n))
    throw new Error("amountInvalid");
  return {
    operationID: draft.operationID,
    user: draft.owner.name,
    principalUID: draft.owner.uid,
    currency: draft.wallet.currency,
    amount,
    kind: draft.kind,
  };
}

/** `crypto.randomUUID` is limited to secure contexts; LAN HTTP deployments are not. */
function operationID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
    return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function useCreditOperation(
  wallet?: Wallet,
  owner?: Owner,
  openInitially = false,
  onClosed?: () => void,
) {
  const [open, setOpen] = useState(openInitially);
  const [draft, setDraft] = useState<Draft | null>(() =>
    openInitially && wallet && owner
      ? {
          owner,
          wallet,
          operationID: operationID(),
          amount: "",
          kind: "topup",
        }
      : null,
  );
  const [invalid, setInvalid] = useState(false);
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: api.credit,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["billing", "wallet"] });
      void client.invalidateQueries({ queryKey: ["billing", "ledger"] });
      void client.invalidateQueries({ queryKey: ["billing", "admin-customers"] });
    },
    // A conflicting operation reference means an earlier attempt already landed:
    // refresh the balance so the dialog's stale figure is not trusted.
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        void client.invalidateQueries({ queryKey: ["billing", "wallet"] });
        void client.invalidateQueries({ queryKey: ["billing", "ledger"] });
        void client.invalidateQueries({
          queryKey: ["billing", "admin-customers"],
        });
      }
    },
  });
  const conflict =
    mutation.error instanceof ApiError && mutation.error.status === 409;
  const onOpenChange = (next: boolean) => {
    if (mutation.isPending) return;
    // Every open starts a new movement. Reusing a failed draft is what made the dialog
    // a dead end: the amount stayed read-only and a 409 could never be retried past.
    if (next) {
      if (!wallet || !owner) return;
      setDraft({
        owner,
        wallet,
        operationID: operationID(),
        amount: "",
        kind: "topup",
      });
      setInvalid(false);
      mutation.reset();
    }
    setOpen(next);
    if (!next) onClosed?.();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft || mutation.isPending || mutation.isSuccess) return;
    try {
      const input = draft.submitted ?? creditInput(draft);
      setInvalid(false);
      setDraft({ ...draft, submitted: input });
      mutation.mutate(input);
    } catch {
      setInvalid(true);
    }
  };
  return {
    open,
    draft,
    setDraft,
    invalid,
    mutation,
    conflict,
    onOpenChange,
    submit,
  };
}

export function CreditDialog({
  wallet,
  owner,
  openInitially = false,
  onClosed,
  showTrigger = true,
}: {
  wallet?: Wallet;
  owner?: Owner;
  openInitially?: boolean;
  onClosed?: () => void;
  showTrigger?: boolean;
}) {
  const t = useT();
  const operation = useCreditOperation(wallet, owner, openInitially, onClosed);
  const { draft, mutation, onOpenChange } = operation;
  return (
    <>
      {showTrigger && (
        <Button disabled={!wallet || !owner} onClick={() => onOpenChange(true)}>
          <Plus className="size-4" />
          {t("credit")}
        </Button>
      )}
      <Dialog open={operation.open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("newCredit")}</DialogTitle>
            <DialogDescription>{t("creditDescription")}</DialogDescription>
          </DialogHeader>
          {draft &&
            (mutation.isSuccess ? (
              <CreditSuccess operation={operation} />
            ) : (
              <CreditFields operation={operation} />
            ))}
        </DialogContent>
      </Dialog>
    </>
  );
}

type Operation = ReturnType<typeof useCreditOperation>;

function CreditFields({ operation }: { operation: Operation }) {
  const t = useT();
  const { draft, setDraft, mutation, submit, invalid } = operation;
  if (!draft) return null;
  const locked = Boolean(draft.submitted);
  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="rounded-lg border bg-surface-section p-4">
        <p className="text-xs text-muted-foreground">{t("owner")}</p>
        <p className="mt-1 font-medium">{ownerLabel(draft.owner)}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("balance")}:{" "}
          {formatMoney(draft.wallet.balance, draft.wallet.currency)}
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="credit-kind">{t("kind")}</Label>
        <DataSelect
          id="credit-kind"
          disabled={locked}
          value={draft.kind}
          onValueChange={(kind) =>
            setDraft({
              ...draft,
              kind: kind === "adjustment" ? "adjustment" : "topup",
            })
          }
          options={[
            { value: "topup", label: t("topup") },
            { value: "adjustment", label: t("adjustment") },
          ]}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="credit-amount">
          {t("amount")} · {draft.wallet.currency}
        </Label>
        <Input
          id="credit-amount"
          autoFocus
          inputMode="decimal"
          required
          readOnly={locked}
          value={draft.amount}
          onChange={(event) =>
            setDraft({ ...draft, amount: event.target.value })
          }
          className="h-12 text-lg tabular-nums"
        />
        <p className="text-xs text-muted-foreground">
          {t(draft.kind === "adjustment" ? "adjustmentHint" : "topupHint")}
        </p>
      </div>
      <BalancePreview draft={draft} />
      {invalid && (
        <p role="alert" className="text-sm text-destructive">
          {t("amountInvalid")}
        </p>
      )}
      {operation.conflict ? (
        <Alert>
          <AlertDescription>{t("creditExists")}</AlertDescription>
        </Alert>
      ) : (
        mutation.error && (
          <Alert variant="destructive">
            <AlertDescription>
              {mutation.error.message}
              <p className="mt-2">{t("retryCreditHint")}</p>
            </AlertDescription>
          </Alert>
        )
      )}
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={mutation.isPending}
          onClick={() => operation.onOpenChange(false)}
        >
          {t("close")}
        </Button>
        <Button
          type="submit"
          disabled={mutation.isPending || operation.conflict}
        >
          {t(
            mutation.isPending
              ? "submitting"
              : mutation.error
                ? "retry"
                : "submit",
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}

function BalancePreview({ draft }: { draft: Draft }) {
  const t = useT();
  let balance: string | undefined;
  try {
    balance = (
      BigInt(draft.wallet.balance) + BigInt(creditInput(draft).amount)
    ).toString();
  } catch {
    balance = undefined;
  }
  return (
    <div className="flex items-center justify-between gap-3 border-t pt-4 text-sm">
      <span className="text-muted-foreground">{t("estimatedBalance")}</span>
      <span className="font-medium tabular-nums">
        {balance ? formatMoney(balance, draft.wallet.currency) : "—"}
      </span>
    </div>
  );
}

function CreditSuccess({ operation }: { operation: Operation }) {
  const t = useT();
  const result = operation.mutation.data;
  if (!result) return null;
  return (
    <div className="space-y-5">
      <div
        role="status"
        className="space-y-2 rounded-lg border bg-surface-section p-5"
      >
        <CheckCircle2 className="size-6 text-primary" />
        <p className="font-medium">{t("saved")}</p>
        <p className="text-sm text-muted-foreground">
          {operation.draft && ownerLabel(operation.draft.owner)}
        </p>
        <p className="text-2xl font-semibold tabular-nums">
          {formatMoney(result.wallet.balance, result.wallet.currency)}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("balance")} · {t("admissionPending")}
        </p>
      </div>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">{t("operation")}</summary>
        <p className="mt-2 break-all font-mono">{result.operationID}</p>
      </details>
      <DialogFooter>
        <Button onClick={() => operation.onOpenChange(false)}>
          {t("done")}
        </Button>
      </DialogFooter>
    </div>
  );
}
