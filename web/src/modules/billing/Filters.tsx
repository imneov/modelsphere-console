import { useState, type FormEvent } from "react";
import { Button, Input, Label } from "@modelsphere/ui";
import { Search, SlidersHorizontal } from "lucide-react";
import type { BillingFilters } from "./api";
import { activeRange, rangePatch, type RangeKey } from "./filterState";
import { useT } from "./i18n";

type Props = {
  filters: BillingFilters;
  onChange: (patch: Partial<BillingFilters>) => void;
  usage?: boolean;
};
type Field = "model" | "apiKeyID" | "requestID" | "from" | "until";
const labels: Record<Field, string> = {
  model: "model",
  apiKeyID: "key",
  requestID: "request",
  from: "from",
  until: "until",
};
const ranges: RangeKey[] = ["1h", "24h", "7d", "30d"];
const rangeLabels: Record<RangeKey, string> = {
  "1h": "lastHour",
  "24h": "lastDay",
  "7d": "lastWeek",
  "30d": "lastMonth",
};

export function BillingFiltersForm(props: Props) {
  const { page: _page, limit: _limit, ...criteria } = props.filters;
  return <FilterFields key={JSON.stringify(criteria)} {...props} />;
}

function FilterFields({ filters, onChange, usage }: Props) {
  const t = useT();
  const [draft, setDraft] = useState(filters);
  const [advanced, setAdvanced] = useState(
    Boolean(filters.apiKeyID || filters.requestID),
  );
  const [error, setError] = useState("");
  const range = activeRange(filters);
  // Clearing must empty the draft too: when the applied query is already blank,
  // the criteria key stays the same and the fields would keep stale values.
  const clear = () => {
    const empty = {
      model: "",
      apiKeyID: "",
      requestID: "",
      from: "",
      until: "",
    };
    setDraft({ ...draft, ...empty });
    setError("");
    onChange(empty);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (
      draft.from &&
      draft.until &&
      new Date(draft.from) >= new Date(draft.until)
    )
      return setError(t("invalidRange"));
    setError("");
    onChange({
      model: draft.model.trim(),
      apiKeyID: draft.apiKeyID.trim(),
      requestID: draft.requestID.trim(),
      from: draft.from,
      until: draft.until,
    });
  };
  const field = (name: Field) => (
    <div key={name} className="min-w-0 space-y-1.5">
      <Label htmlFor={`billing-${name}`}>{t(labels[name])}</Label>
      <Input
        id={`billing-${name}`}
        type={name === "from" || name === "until" ? "datetime-local" : "text"}
        className="w-full"
        value={draft[name]}
        onChange={(event) => setDraft({ ...draft, [name]: event.target.value })}
      />
    </div>
  );
  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border bg-card p-4">
      {usage && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-muted-foreground">
            {t("timeRange")}
          </span>
          {ranges.map((key) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={range === key ? "secondary" : "ghost"}
              onClick={() => onChange(rangePatch(key))}
            >
              {t(rangeLabels[key])}
            </Button>
          ))}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {usage && field("model")}
        {field("from")}
        {field("until")}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="outline">
          <Search className="size-4" />
          {t("search")}
        </Button>
        {usage && (
          <Button
            type="button"
            variant="ghost"
            aria-expanded={advanced}
            aria-controls="billing-advanced"
            onClick={() => setAdvanced(!advanced)}
          >
            <SlidersHorizontal className="size-4" />
            {t("advanced")}
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={clear}>
          {t("clear")}
        </Button>
      </div>
      {usage && advanced && (
        <div
          id="billing-advanced"
          className="grid gap-3 border-t pt-3 sm:grid-cols-2"
        >
          {field("apiKeyID")}
          {field("requestID")}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
