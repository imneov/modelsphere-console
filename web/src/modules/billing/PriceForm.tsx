import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  AlertDescription,
  Button,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@modelsphere/ui";
import { api, type Price } from "./api";
import { moneyDecimal, parseMoney } from "./money";
import { ApiError } from "@/shell";
import { useT } from "./i18n";

/** Default pricing unit offered for a new price rule. */
const DEFAULT_UNIT_TOKENS = 1_000_000;

export type PriceDraft = {
  model: string;
  version: string;
  unit: string;
  inputRate: string;
  cacheRate: string;
  outputRate: string;
};

export function priceDraft(initial?: Price): PriceDraft {
  return {
    model: initial?.model ?? "",
    version: "",
    unit: String(initial?.unitTokens ?? DEFAULT_UNIT_TOKENS),
    inputRate: initial ? moneyDecimal(initial.inputRate) : "",
    cacheRate: initial ? moneyDecimal(initial.cacheRate) : "",
    outputRate: initial ? moneyDecimal(initial.outputRate) : "",
  };
}

function usePriceForm(currency: string, initial?: Price) {
  const t = useT();
  const client = useQueryClient();
  const [draft, setDraft] = useState(() => priceDraft(initial));
  const [error, setError] = useState("");
  const mutation = useMutation({
    mutationFn: api.publishPrice,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["billing", "prices"] });
      void client.invalidateQueries({ queryKey: ["billing", "priceHistory"] });
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mutation.isPending || mutation.isSuccess) return;
    setError("");
    try {
      if (initial && initial.priceVersion === draft.version.trim())
        return setError(t("newVersionRequired"));
      mutation.mutate(priceInput(draft, currency));
    } catch {
      setError(t("priceInvalid"));
    }
  };
  return { draft, setDraft, mutation, error, submit };
}

export function PriceForm({
  currency,
  initial,
  onClose,
  onPendingChange,
}: {
  currency: string;
  initial?: Price;
  onClose: () => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const t = useT();
  const form = usePriceForm(currency, initial);
  useEffect(() => {
    onPendingChange(form.mutation.isPending);
    return () => onPendingChange(false);
  }, [form.mutation.isPending, onPendingChange]);
  // An archived version with the same number conflicts on the server, not locally.
  const conflict =
    form.mutation.error instanceof ApiError &&
    form.mutation.error.status === 409;
  return (
    <form onSubmit={form.submit} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{t(initial ? "publishVersion" : "publish")}</DialogTitle>
        <DialogDescription>{t("immutablePriceHint")}</DialogDescription>
      </DialogHeader>
      {form.mutation.isSuccess ? (
        <>
          <Alert>
            <AlertDescription>{t("priceSaved")}</AlertDescription>
          </Alert>
          <DialogFooter>
            <Button type="button" onClick={onClose}>
              {t("done")}
            </Button>
          </DialogFooter>
        </>
      ) : (
        <>
          <fieldset disabled={form.mutation.isPending} className="space-y-4">
            <PriceFields
              draft={form.draft}
              initial={initial}
              currency={currency}
              onChange={(patch) =>
                form.setDraft((current) => ({ ...current, ...patch }))
              }
            />
          </fieldset>
          {(form.error || form.mutation.error) && (
            <p role="alert" className="text-sm text-destructive">
              {form.error ||
                (conflict
                  ? t("priceVersionExists")
                  : form.mutation.error?.message)}
            </p>
          )}
          <PriceSubmit pending={form.mutation.isPending} onClose={onClose} />
        </>
      )}
    </form>
  );
}

function PriceSubmit({
  pending,
  onClose,
}: {
  pending: boolean;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <DialogFooter>
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={onClose}
      >
        {t("close")}
      </Button>
      <Button type="submit" disabled={pending}>
        {t(pending ? "submitting" : "publish")}
      </Button>
    </DialogFooter>
  );
}

function PriceFields({
  draft,
  initial,
  onChange,
  currency,
}: {
  draft: PriceDraft;
  initial?: Price;
  onChange: (patch: Partial<PriceDraft>) => void;
  currency: string;
}) {
  const t = useT();
  const labels: Record<keyof PriceDraft, string> = {
    model: "model",
    version: "version",
    unit: "unit",
    inputRate: "inputRate",
    cacheRate: "cacheRate",
    outputRate: "outputRate",
  };
  const field = (name: keyof PriceDraft) => (
    <div key={name} className="space-y-1.5">
      <Label htmlFor={`price-${name}`}>
        {t(labels[name])}
        {name.endsWith("Rate") ? ` · ${currency}` : ""}
      </Label>
      <Input
        id={`price-${name}`}
        required
        readOnly={name === "model" && Boolean(initial)}
        inputMode={
          name === "unit"
            ? "numeric"
            : name.endsWith("Rate")
              ? "decimal"
              : "text"
        }
        value={draft[name]}
        onChange={(event) => onChange({ [name]: event.target.value })}
      />
    </div>
  );
  return (
    <>
      {field("model")}
      <div className="grid grid-cols-2 gap-3">
        {field("version")}
        {field("unit")}
      </div>
      {initial && (
        <p className="text-xs text-muted-foreground">
          {t("previousVersion")}: {initial.priceVersion}
        </p>
      )}
      <div className="space-y-3 rounded-lg border bg-surface-section p-4">
        <p className="text-xs text-muted-foreground">
          {t("ratesPerUnit", { unit: draft.unit || "—" })}
        </p>
        {field("inputRate")}
        {field("cacheRate")}
        {field("outputRate")}
      </div>
    </>
  );
}

export function priceInput(draft: PriceDraft, currency: string): Price {
  const unit = draft.unit.trim();
  const unitTokens = /^\d+$/.test(unit) ? Number(unit) : Number.NaN;
  const rates = {
    inputRate: parseMoney(draft.inputRate),
    cacheRate: parseMoney(draft.cacheRate),
    outputRate: parseMoney(draft.outputRate),
  };
  if (
    !currency ||
    !draft.model.trim() ||
    !draft.version.trim() ||
    !Number.isSafeInteger(unitTokens) ||
    unitTokens < 1 ||
    Object.values(rates).some((rate) => BigInt(rate) < 0n)
  )
    throw new Error("Invalid price");
  return {
    ruleID: "",
    model: draft.model.trim(),
    priceVersion: draft.version.trim(),
    currency,
    unitTokens,
    ...rates,
  };
}
