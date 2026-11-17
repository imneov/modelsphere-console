import { useRef } from "react";
import { useSearchParams } from "react-router";
import type { BillingFilters, UsageState } from "./api";

const textFields = [
  "ownerUserID",
  "model",
  "apiKeyID",
  "requestID",
  "from",
  "until",
] as const;

/** Settlement tabs; the server rejects anything else with a 400. */
export const usageStates: readonly UsageState[] = [
  "settled",
  "pending",
  "started",
  "failed",
];

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
/** Bounds enforced by `billingFilter` on the server; anything else is a 400. */
const MAX_PAGE = 10_000_000;
const MAX_PAGE_SIZE = 200;

export function readFilters(params: URLSearchParams): BillingFilters {
  const fields = Object.fromEntries(
    textFields.map((field) => [field, textValue(field, params.get(field))]),
  );
  return {
    ...fields,
    state: usageState(params.get("state")),
    page: boundedInteger(params.get("page"), DEFAULT_PAGE, MAX_PAGE),
    limit: boundedInteger(
      params.get("limit"),
      DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    ),
  } as BillingFilters;
}

export function updateFilters(
  params: URLSearchParams,
  patch: Partial<BillingFilters>,
): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete("page");
  for (const [field, value] of Object.entries(patch)) {
    if (value === "") next.delete(field);
    else next.set(field, String(value));
  }
  return next;
}

/**
 * Drops values `readFilters` already refuses, so a shared link carrying a bad
 * `from` or an out-of-range `limit` is rewritten the first time the user changes
 * anything instead of keeping a URL that disagrees with the screen.
 */
export function sanitizeParams(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  const filters = readFilters(params);
  for (const field of textFields) if (!filters[field]) next.delete(field);
  if (!filters.state) next.delete("state");
  if (!integerInRange(params.get("page"), MAX_PAGE)) next.delete("page");
  if (!integerInRange(params.get("limit"), MAX_PAGE_SIZE)) next.delete("limit");
  return next;
}

/** KPI cards and tab counts cover the whole scope, not just the open tab. */
export function summaryScope(filters: BillingFilters): BillingFilters {
  return { ...filters, state: "", page: DEFAULT_PAGE };
}

/** Quick ranges mirroring Global's usage overview. */
export type RangeKey = "1h" | "24h" | "7d" | "30d";

const RANGE_MS: Record<RangeKey, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

/** Patch that narrows the query to the last `key` of activity. */
export function rangePatch(
  key: RangeKey,
  now = new Date(),
): Pick<BillingFilters, "from" | "until" | "page"> {
  const from = new Date(now.getTime() - RANGE_MS[key]);
  return { from: toDateTimeInput(from), until: toDateTimeInput(now), page: 1 };
}

/** Range whose window still matches the applied timestamps, if any. */
export function activeRange(
  filters: BillingFilters,
  now = new Date(),
): RangeKey | "" {
  if (!filters.from || !filters.until) return "";
  const from = Date.parse(filters.from);
  const until = Date.parse(filters.until);
  if (Number.isNaN(from) || Number.isNaN(until)) return "";
  // Presets keep a minute of precision, so compare the window with slack.
  if (Math.abs(now.getTime() - until) > 2 * 60 * 1000) return "";
  return (
    (Object.keys(RANGE_MS) as RangeKey[]).find(
      (key) => Math.abs(until - from - RANGE_MS[key]) < 90 * 1000,
    ) ?? ""
  );
}

/** `datetime-local` value in local time, the format the inputs round-trip. */
export function toDateTimeInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Criteria that belong to the previously selected account must not follow it. */
export function ownerSwitchPatch(ownerUserID: string): Partial<BillingFilters> {
  return { ownerUserID, model: "", apiKeyID: "", requestID: "" };
}

export function useBillingFilters() {
  const [params, setParams] = useSearchParams();
  // ResourceTable reports a page-size change as two synchronous calls (new size, then
  // page 1). react-router evaluates the functional updater against the params captured
  // at render, so the second call would rewrite the URL without the new size. Keep the
  // in-flight URL here so both calls compose.
  const pending = useRef(params);
  pending.current = params;
  const change = (patch: Partial<BillingFilters>) => {
    const next = updateFilters(sanitizeParams(pending.current), patch);
    pending.current = next;
    setParams(next, { replace: true });
  };
  return { filters: readFilters(params), change };
}

function textValue(
  field: (typeof textFields)[number],
  value: string | null,
): string {
  if (!value) return "";
  if (field === "from" || field === "until") return timestamp(value);
  return value;
}

/** Unknown settlement values fall back to "all" instead of failing the query. */
function usageState(value: string | null): UsageState | "" {
  return usageStates.find((state) => state === value) ?? "";
}

/** Malformed timestamps fall back to no filter instead of failing the request. */
function timestamp(value: string): string {
  return Number.isNaN(Date.parse(value)) ? "" : value;
}

/** Parsed value when it is an integer the server accepts, otherwise null. */
function integerInRange(value: string | null, max: number): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= max
    ? parsed
    : null;
}

function boundedInteger(
  value: string | null,
  fallback: number,
  max: number,
): number {
  return integerInRange(value, max) ?? fallback;
}
