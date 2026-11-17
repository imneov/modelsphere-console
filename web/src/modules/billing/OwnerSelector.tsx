import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { DataSelect, Label } from "@modelsphere/ui";
import { api, type Owner } from "./api";
import { useT } from "./i18n";

/** The account list is large and changes rarely; refetching it per page is waste. */
const OWNERS_STALE_MS = 5 * 60_000;

export function ownerLabel(owner: Owner) {
  return owner.displayName
    ? `${owner.displayName} (${owner.name})`
    : owner.name;
}

export function useOwners(enabled: boolean) {
  return useQuery({
    queryKey: ["billing", "owners"],
    queryFn: api.owners,
    enabled,
    staleTime: OWNERS_STALE_MS,
  });
}

export function OwnerSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useT();
  const owners = useOwners(true);
  const options = useMemo(
    () => [
      { value: "self", label: t("self") },
      ...(owners.data?.items ?? []).map((owner) => ({
        value: owner.uid,
        label: ownerLabel(owner),
      })),
    ],
    [owners.data, t],
  );
  return (
    <div className="w-full space-y-1.5 sm:w-72">
      <Label htmlFor="billing-owner">{t("owner")}</Label>
      <DataSelect
        id="billing-owner"
        searchable
        loading={owners.isPending}
        value={value || "self"}
        onValueChange={(selected) =>
          onChange(selected === "self" ? "" : selected)
        }
        searchPlaceholder={t("searchOwner")}
        className="w-full"
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
