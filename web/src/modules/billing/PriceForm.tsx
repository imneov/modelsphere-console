import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  AlertDescription,
  Button,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@modelsphere/ui";
import { api, type Price } from "@/modules/billing/api";
import { parseMoney } from "@/modules/billing/money";
import { useT } from "@/modules/billing/i18n";

type PriceDraft = {
  model: string;
  version: string;
  unit: string;
  inputRate: string;
  cacheRate: string;
  outputRate: string;
};

function usePriceForm(currency: string) {
  const t = useT();
  const client = useQueryClient();
  const [draft, setDraft] = useState<PriceDraft>({
    model: "",
    version: "",
    unit: "1000000",
    inputRate: "",
    cacheRate: "",
    outputRate: "",
  });
  const [error, setError] = useState("");
  const mutation = useMutation({
    mutationFn: (price: Price) => api.publishPrice(price),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["billing", "prices"] }),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      mutation.mutate(priceInput(draft, currency));
    } catch {
      setError(t("priceInvalid"));
    }
  };
  return { draft, setDraft, mutation, error, submit };
}

export function PriceForm({ currency }: { currency: string }) {
  const t = useT();
  const { draft, setDraft, mutation, error, submit } = usePriceForm(currency);
  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{t("publish")}</DialogTitle>
      </DialogHeader>
      {mutation.isSuccess ? (
        <Alert>
          <AlertDescription>{t("priceSaved")}</AlertDescription>
        </Alert>
      ) : (
        <>
          <PriceFields
            draft={draft}
            onChange={(patch) =>
              setDraft((current) => ({ ...current, ...patch }))
            }
            currency={currency}
          />
          {(error || mutation.error) && (
            <p role="alert" className="text-sm text-destructive">
              {error || mutation.error?.message}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {t("publish")}
            </Button>
          </DialogFooter>
        </>
      )}
    </form>
  );
}

function PriceFields({
  draft,
  onChange,
  currency,
}: {
  draft: PriceDraft;
  onChange: (patch: Partial<PriceDraft>) => void;
  currency: string;
}) {
  const t = useT();
  const labels = {
    model: "model",
    version: "version",
    unit: "unit",
    inputRate: "inputRate",
    cacheRate: "cacheRate",
    outputRate: "outputRate",
  };
  return (
    <>
      {(Object.keys(labels) as (keyof PriceDraft)[]).map((field) => (
        <div key={field} className="space-y-1">
          <Label htmlFor={`price-${field}`}>
            {t(labels[field])}
            {field.endsWith("Rate") ? ` (${currency})` : ""}
          </Label>
          <Input
            id={`price-${field}`}
            required
            inputMode={
              field === "unit"
                ? "numeric"
                : field.endsWith("Rate")
                  ? "decimal"
                  : "text"
            }
            value={draft[field]}
            onChange={(event) => onChange({ [field]: event.target.value })}
          />
        </div>
      ))}
    </>
  );
}

function priceInput(draft: PriceDraft, currency: string): Price {
  const unitTokens = Number(draft.unit);
  const rates = {
    inputRate: parseMoney(draft.inputRate),
    cacheRate: parseMoney(draft.cacheRate),
    outputRate: parseMoney(draft.outputRate),
  };
  if (
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
