import { useQuery } from "@tanstack/react-query";
import { Button, DataSelect, Input, Label } from "@modelsphere/ui";
import { api, type BillingFilters, type Owner } from "@/modules/billing/api";
import { useT } from "@/modules/billing/i18n";

type ChangeFilters = (patch: Partial<BillingFilters>) => void;
type Field = "model" | "apiKeyID" | "requestID" | "from" | "until";
const labels: Record<Field, string> = {
  model: "model",
  apiKeyID: "key",
  requestID: "request",
  from: "from",
  until: "until",
};

export function BillingFiltersForm({
  filters,
  onChange,
  admin,
}: {
  filters: BillingFilters;
  onChange: ChangeFilters;
  admin: boolean;
}) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-end gap-3">
      {admin && (
        <OwnerFilter
          value={filters.ownerUserID}
          onChange={(ownerUserID) => onChange({ ownerUserID })}
        />
      )}
      {(Object.keys(labels) as Field[]).map((field) => (
        <FilterInput
          key={field}
          field={field}
          value={filters[field]}
          onChange={onChange}
        />
      ))}
      <Button
        variant="ghost"
        onClick={() =>
          onChange({
            model: "",
            apiKeyID: "",
            requestID: "",
            from: "",
            until: "",
          })
        }
      >
        {t("clear")}
      </Button>
    </div>
  );
}

function FilterInput({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: string;
  onChange: ChangeFilters;
}) {
  const t = useT();
  return (
    <div className="w-48 space-y-1">
      <Label htmlFor={`billing-${field}`}>{t(labels[field])}</Label>
      <Input
        id={`billing-${field}`}
        type={field === "from" || field === "until" ? "datetime-local" : "text"}
        value={value}
        onChange={(event) => onChange({ [field]: event.target.value })}
      />
    </div>
  );
}

function OwnerFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useT();
  const owners = useQuery({
    queryKey: ["billing", "owners"],
    queryFn: api.owners,
  });
  const options = [
    { value: "self", label: t("self") },
    ...(owners.data?.items ?? []).map(ownerOption),
  ];
  return (
    <div className="w-48 space-y-1">
      <Label htmlFor="billing-owner">{t("owner")}</Label>
      <DataSelect
        id="billing-owner"
        value={value || "self"}
        onValueChange={(selected) =>
          onChange(selected === "self" ? "" : selected)
        }
        options={options}
      />
      {owners.error && (
        <p role="alert" className="text-sm text-destructive">
          {owners.error.message}
        </p>
      )}
    </div>
  );
}

function ownerOption(owner: Owner) {
  return {
    value: owner.uid,
    label: owner.displayName
      ? `${owner.displayName} (${owner.name})`
      : owner.name,
  };
}
