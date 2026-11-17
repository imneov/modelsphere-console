import { Tabs, TabsList, TabsTrigger } from "@modelsphere/ui";
import type { BillingFilters, UsageState } from "./api";
import { useUsageSummary } from "./summary";
import { useT } from "./i18n";

type TabValue = "all" | UsageState;

const tabLabels: Record<TabValue, string> = {
  all: "allStates",
  settled: "settledTab",
  pending: "pendingTab",
  started: "startedTab",
  failed: "failedTab",
};

/** Settlement tabs with the row count each one would show. */
export function UsageStateTabs({
  filters,
  onChange,
}: {
  filters: BillingFilters;
  onChange: (patch: Partial<BillingFilters>) => void;
}) {
  const t = useT();
  const summary = useUsageSummary(filters);
  const counts: Record<TabValue, number | undefined> = {
    all: summary.data?.requests,
    settled: summary.data?.states.settled,
    pending: summary.data?.states.pending,
    started: summary.data?.states.started,
    failed: summary.data?.states.failed,
  };
  const tabs: TabValue[] = ["all", "settled", "pending", "started", "failed"];
  return (
    <Tabs
      value={filters.state || "all"}
      onValueChange={(value) =>
        onChange({ state: value === "all" ? "" : (value as UsageState), page: 1 })
      }
    >
      <TabsList className="max-w-full overflow-x-auto">
        {tabs.map((tab) => (
          <TabsTrigger key={tab} value={tab}>
            {t(tabLabels[tab])}
            <Count value={counts[tab]} />
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

function Count({ value }: { value?: number }) {
  return (
    <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
      {value === undefined ? "—" : value.toLocaleString()}
    </span>
  );
}
