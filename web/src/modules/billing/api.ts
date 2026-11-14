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
  from: string;
  until: string;
  page: number;
  limit: number;
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

function parameters(filters: Partial<BillingFilters>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === "" || value === undefined) continue;
    query.set(
      key,
      key === "from" || key === "until"
        ? new Date(String(value)).toISOString()
        : String(value),
    );
  }
  return `?${query}`;
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
  ledger: (filters: BillingFilters) =>
    request<Page<LedgerEntry>>(
      "GET",
      `/api/billing/ledger${parameters(filters)}`,
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
