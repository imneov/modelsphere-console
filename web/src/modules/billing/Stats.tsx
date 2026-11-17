import type { ReactNode } from "react";
import type { BillingFilters } from "./api";
import { count, useUsageSummary } from "./summary";
import { useT } from "./i18n";

/** One line of headline figures above a table, as on Global's usage overview. */
export function StatRow({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
  );
}

type StatCardProps = {
  label: string;
  value: string;
  hint?: string;
  action?: ReactNode;
  footer?: ReactNode;
};

export function StatCard({
  label,
  value,
  hint,
  action,
  footer,
}: StatCardProps) {
  return (
    <div className="rounded-xl border bg-card px-5 py-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        {action}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {footer && <div className="mt-4 border-t pt-3">{footer}</div>}
    </div>
  );
}

/** Request count, token totals and in-flight/failed counts for the filter scope. */
export function UsageStats({ filters }: { filters: BillingFilters }) {
  const t = useT();
  const { data } = useUsageSummary(filters);
  return (
    <StatRow>
      <StatCard
        label={t("requestCount")}
        value={count(data?.requests)}
        hint={t("scopeHint")}
      />
      <StatCard
        label={t("input")}
        value={count(data?.inputTokens)}
        hint={t("cachedTokens", { value: count(data?.cacheTokens) })}
      />
      <StatCard label={t("output")} value={count(data?.outputTokens)} />
      <StatCard
        label={t("inFlight")}
        value={count(data?.states.started)}
        hint={t("failedCount", { value: count(data?.states.failed) })}
      />
    </StatRow>
  );
}
