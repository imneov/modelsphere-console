import { request } from "@/shell";

export interface Wallet {
  admissionState?: "allowed" | "blocked" | "unknown";
  admissionRevision?: number;
  ownerUserID: string;
  currency: string;
  balance: string;
  ledgerBalance: string;
  revision: number;
  billingState: "allowed" | "blocked";
}
export interface Usage {
  inputTokens: number;
  cacheTokens: number;
  outputTokens: number;
  complete: boolean;
  source: string;
}
export interface Price {
  ruleID: string;
  priceVersion: string;
  model: string;
  currency: string;
  unitTokens: number;
  inputRate: string;
  cacheRate: string;
  outputRate: string;
}
export interface Charge {
  chargeRevision: number;
  id: string;
  amount: string;
  currency: string;
  price: Price;
  usage: Usage;
  state: "pending" | "settled";
  createdAt: string;
  settledAt?: string;
}
export interface BillingRequest {
  attempts?: { id: string; reason: string }[];
  requestID: string;
  ownerUserID: string;
  walletID: string;
  apiKeyID: string;
  identitySource: "sdk" | "session";
  model: string;
  upstream: string;
  attemptID: string;
  upstreamRequestID?: string;
  startedAt?: string;
  terminalAt?: string;
  reason: string;
  usage: Usage;
  pricingError?: string;
  charge?: Charge;
}
export interface LedgerEntry {
  operationID: string;
  ownerUserID: string;
  currency: string;
  amount: string;
  kind: string;
  actor: string;
  chargeID?: string;
  revision: number;
  occurredAt: string;
}
export interface BillingFilters {
  ownerUserID: string;
  model: string;
  apiKeyID: string;
  requestID: string;
  state: UsageState | "";
  from: string;
  until: string;
  page: number;
  limit: number;
}
/** Settlement filters the requests endpoint understands, mirroring `requestState`. */
export type UsageState = "settled" | "pending" | "started" | "failed";
export interface UsageStates {
  settled: number;
  pending: number;
  started: number;
  failed: number;
}
export interface UsageSummary {
  requests: number;
  inputTokens: number;
  cacheTokens: number;
  outputTokens: number;
  states: UsageStates;
}
export interface LedgerSummary {
  topups: string;
  charges: string;
  adjustments: string;
  net: string;
}
export interface Page<T> {
  items: T[];
  totalItems: number;
  page: number;
  limit: number;
  filters: BillingFilters;
}
export interface Owner {
  name: string;
  uid: string;
  displayName?: string;
}
export interface AdminCustomer extends Owner {
  ownerUserID: string;
  currency: string;
  balance: string;
  revision: number;
  billingState: "allowed" | "blocked";
  topups: string;
  charges: string;
  adjustments: string;
  net: string;
}
export interface PriceRule {
  metadata: { name: string };
  spec: Price;
  status?: { observedVersion?: string; observedAt?: string; error?: string };
}
export interface Credit {
  operationID: string;
  user: string;
  principalUID: string;
  currency: string;
  amount: string;
  kind: "topup" | "adjustment";
}

/** Settlement label shared by the request table and the request detail view. */
export function requestState(request: BillingRequest) {
  return (
    request.charge?.state ??
    (!request.terminalAt
      ? "started"
      : request.usage.complete
        ? "unpriced"
        : "incomplete")
  );
}

function parameters(filters: Partial<BillingFilters>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === "" || value === undefined) continue;
    if (key === "from" || key === "until") {
      const date = new Date(String(value));
      if (Number.isNaN(date.getTime())) continue;
      query.set(key, date.toISOString());
      continue;
    }
    query.set(key, String(value));
  }
  return `?${query}`;
}

/** Wallet movements have no settlement state; sending one would filter them out. */
function ledgerFilters(filters: Partial<BillingFilters>) {
  const { state: _state, ...scope } = filters;
  return parameters(scope);
}

export const api = {
  wallet: (ownerUserID: string) =>
    request<Wallet>("GET", `/api/billing/wallet${parameters({ ownerUserID })}`),
  reconcile: (ownerUserID: string) =>
    request<Wallet>(
      "GET",
      `/api/billing/wallet/reconciliation${parameters({ ownerUserID })}`,
    ),
  usage: (filters: BillingFilters) =>
    request<Page<BillingRequest>>(
      "GET",
      `/api/billing/usage${parameters(filters)}`,
    ),
  usageSummary: (filters: BillingFilters) =>
    request<UsageSummary>(
      "GET",
      `/api/billing/usage/summary${parameters(filters)}`,
    ),
  ledger: (filters: BillingFilters) =>
    request<Page<LedgerEntry>>(
      "GET",
      `/api/billing/ledger${ledgerFilters(filters)}`,
    ),
  ledgerSummary: (filters: BillingFilters) =>
    request<LedgerSummary>(
      "GET",
      `/api/billing/ledger/summary${ledgerFilters(filters)}`,
    ),
  adminCustomers: (from: string, until: string) =>
    request<{ items: AdminCustomer[] }>(
      "GET",
      `/api/billing/admin/customers${parameters({ from, until })}`,
    ),
  owners: () => request<{ items: Owner[] }>("GET", "/api/billing/users"),
  credit: (input: Credit) =>
    request<{ operationID: string; wallet: Wallet }>(
      "POST",
      "/api/billing/credits",
      input,
    ),
  prices: () => request<{ items: PriceRule[] }>("GET", "/api/billing/prices"),
  priceHistory: (model: string, page: number, limit: number) =>
    request<Page<Price>>(
      "GET",
      `/api/billing/prices/history${parameters({ model, page, limit })}`,
    ),
  publishPrice: (price: Price) =>
    request<void>("PUT", "/api/billing/prices", price),
  supplement: (requestID: string, ownerUserID: string) =>
    request<void>(
      "POST",
      `/api/billing/usage/${encodeURIComponent(requestID)}/reconcile${parameters({ ownerUserID })}`,
    ),
};
