import { useQuery } from "@tanstack/react-query";
import { api, type BillingFilters, type LedgerSummary } from "./api";
import { summaryScope, toDateTimeInput } from "./filterState";
import { formatMoney } from "./money";

/** Scope for the KPI row: the selected window without the active status tab. */
export function useUsageSummary(filters: BillingFilters) {
  const scope = summaryScope(filters);
  return useQuery({
    queryKey: ["billing", "usage-summary", scope],
    queryFn: () => api.usageSummary(scope),
    placeholderData: (previous) => previous,
  });
}

/** Wallet movements in a time window, matching the ledger table's scope. */
export function useLedgerSummary(filters: BillingFilters) {
  return useQuery({
    queryKey: ["billing", "ledger-summary", { ...filters, page: 1, state: "" }],
    queryFn: () => api.ledgerSummary(filters),
    placeholderData: (previous) => previous,
  });
}

/** Local midnight-to-now window used by the account page's daily figures. */
export function todayFilters(
  filters: BillingFilters,
  now = new Date(),
): BillingFilters {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return {
    ...filters,
    from: toDateTimeInput(start),
    until: toDateTimeInput(now),
    page: 1,
    state: "",
  };
}

export function ledgerAmount(
  summary: LedgerSummary | undefined,
  field: keyof LedgerSummary,
  currency: string,
): string {
  if (!summary) return "—";
  return formatMoney(summary[field], currency);
}

/** Charges leave the wallet; spending reads as a positive figure. */
export function ledgerSpend(
  summary: LedgerSummary | undefined,
  currency: string,
): string {
  if (!summary) return "—";
  const charges = summary.charges.startsWith("-")
    ? summary.charges.slice(1)
    : summary.charges;
  return formatMoney(charges, currency);
}

export function count(value: number | undefined): string {
  return value === undefined ? "—" : value.toLocaleString();
}
