import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { api, type Credit, type Owner } from "@/modules/billing/api";
import { parseMoney } from "@/modules/billing/money";
import { useT } from "@/modules/billing/i18n";

type Draft = {
  operationID: string;
  ownerUID: string;
  amount: string;
  kind: "topup" | "adjustment";
};

export function CreditDialog({
  open,
  onOpenChange,
  currency,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currency: string;
}) {
  const [draft, setDraft] = useState<Draft>(newDraft);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && (
          <CreditForm currency={currency} draft={draft} setDraft={setDraft} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function useCreditForm(currency: string, draft: Draft) {
  const t = useT();
  const client = useQueryClient();
  const owners = useQuery({
    queryKey: ["billing", "owners"],
    queryFn: api.owners,
  });

  const [error, setError] = useState("");
  const mutation = useMutation({
    mutationFn: (input: Credit) => api.credit(input),
    onSuccess: () => client.invalidateQueries({ queryKey: ["billing"] }),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      mutation.mutate(creditInput(draft, owners.data?.items ?? [], currency));
    } catch (error) {
      setError(t(error instanceof Error ? error.message : "amountInvalid"));
    }
  };
  return { owners, error, mutation, submit };
}

type CreditFormProps = {
  currency: string;
  draft: Draft;
  setDraft: (update: Draft | ((draft: Draft) => Draft)) => void;
};

function CreditForm({ currency, draft, setDraft }: CreditFormProps) {
  const t = useT();
  const { owners, error, mutation, submit } = useCreditForm(currency, draft);
  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{t("newCredit")}</DialogTitle>
        <DialogDescription>{currency}</DialogDescription>
      </DialogHeader>
      {mutation.isSuccess ? (
        <SavedCredit
          operationID={mutation.data.operationID}
          onNew={() => {
            setDraft(newDraft());
            mutation.reset();
          }}
        />
      ) : (
        <>
          <CreditFields
            draft={draft}
            onChange={(patch) =>
              setDraft((current) => ({ ...current, ...patch }))
            }
            owners={owners.data?.items ?? []}
          />
          {(error || mutation.error || owners.error) && (
            <p role="alert" className="text-sm text-destructive">
              {error || mutation.error?.message || owners.error?.message}
            </p>
          )}
          <DialogFooter>
            <Button
              type="submit"
              disabled={mutation.isPending || !currency || owners.isPending}
            >
              {t("submit")}
            </Button>
          </DialogFooter>
        </>
      )}
    </form>
  );
}

function CreditFields({
  draft,
  onChange,
  owners,
}: {
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
  owners: Owner[];
}) {
  const t = useT();
  return (
    <>
      <CreditOwner draft={draft} onChange={onChange} owners={owners} />
      <div className="space-y-2">
        <Label htmlFor="credit-operation">{t("operation")}</Label>
        <Input
          id="credit-operation"
          required
          value={draft.operationID}
          onChange={(event) => onChange({ operationID: event.target.value })}
        />
      </div>
      <CreditKind draft={draft} onChange={onChange} />
      <div className="space-y-2">
        <Label htmlFor="credit-amount">{t("amount")}</Label>
        <Input
          id="credit-amount"
          inputMode="decimal"
          required
          value={draft.amount}
          onChange={(event) => onChange({ amount: event.target.value })}
        />
      </div>
    </>
  );
}

function creditInput(draft: Draft, owners: Owner[], currency: string): Credit {
  const owner = owners.find((item) => item.uid === draft.ownerUID);
  if (!owner) throw new Error("ownerRequired");
  let amount: string;
  try {
    amount = parseMoney(draft.amount);
  } catch {
    throw new Error("amountInvalid");
  }
  if (BigInt(amount) === 0n || (draft.kind === "topup" && BigInt(amount) < 0n))
    throw new Error("amountInvalid");
  return {
    operationID: draft.operationID,
    user: owner.name,
    principalUID: owner.uid,
    currency,
    amount,
    kind: draft.kind,
  };
}

function CreditOwner({
  draft,
  onChange,
  owners,
}: {
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
  owners: Owner[];
}) {
  const t = useT();
  return (
    <div className="space-y-2">
      <Label htmlFor="credit-owner">{t("owner")}</Label>
      <DataSelect
        id="credit-owner"
        value={draft.ownerUID}
        onValueChange={(ownerUID) => onChange({ ownerUID })}
        options={owners.map((owner) => ({
          value: owner.uid,
          label: owner.displayName
            ? `${owner.displayName} (${owner.name})`
            : owner.name,
        }))}
      />
    </div>
  );
}
function CreditKind({
  draft,
  onChange,
}: {
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
}) {
  const t = useT();
  return (
    <div className="space-y-2">
      <Label htmlFor="credit-kind">{t("kind")}</Label>
      <DataSelect
        id="credit-kind"
        value={draft.kind}
        onValueChange={(value) =>
          onChange({ kind: value === "adjustment" ? "adjustment" : "topup" })
        }
        options={[
          { value: "topup", label: t("topup") },
          { value: "adjustment", label: t("adjustment") },
        ]}
      />
    </div>
  );
}

function newDraft(): Draft {
  return {
    operationID: crypto.randomUUID(),
    ownerUID: "",
    amount: "",
    kind: "topup",
  };
}

function SavedCredit({
  operationID,
  onNew,
}: {
  operationID: string;
  onNew: () => void;
}) {
  const t = useT();
  return (
    <div className="space-y-3">
      <Alert>
        <AlertDescription>
          {t("saved")}: {operationID}
        </AlertDescription>
      </Alert>
      <Button type="button" variant="outline" onClick={onNew}>
        {t("newOperation")}
      </Button>
    </div>
  );
}
