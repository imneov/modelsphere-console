import { Link, useNavigate } from "react-router";
import { Alert, AlertDescription, AlertTitle, Button } from "@modelsphere/ui";
import { usePermissions } from "@/shell";
import { BillingPage, BillingRefresh } from "./BillingPage";
import { BillingFiltersForm } from "./Filters";
import { UsageStats } from "./Stats";
import { useUsageSummary } from "./summary";
import { UsageStateTabs } from "./UsageStateTabs";
import { UsageTable } from "./Tables";
import type { BillingFilters } from "./api";
import { useBillingFilters } from "./filterState";
import { useT } from "./i18n";

export function Requests() {
  const t = useT();
  const { filters, change } = useBillingFilters();
  const navigate = useNavigate();
  const ledger = (requestID: string) => {
    const query = new URLSearchParams({ requestID });
    if (filters.ownerUserID) query.set("ownerUserID", filters.ownerUserID);
    navigate(`/billing/ledger?${query}`);
  };
  return (
    <BillingPage
      title={t("usage")}
      description={t("usageDescription")}
      actions={<BillingRefresh />}
    >
      <UsageStats filters={filters} />
      <UnpricedNotice filters={filters} onChange={change} />
      <BillingFiltersForm filters={filters} onChange={change} usage />
      <div className="space-y-3">
        <UsageStateTabs filters={filters} onChange={change} />
        <UsageTable
          key={filters.ownerUserID}
          filters={filters}
          onChange={change}
          onLedger={ledger}
        />
      </div>
    </BillingPage>
  );
}

/**
 * Requests that terminated without a charge are money the ledger never saw:
 * either the model has no price or the usage was incomplete. Global and
 * Langfuse both surface this instead of leaving it to be discovered.
 */
function UnpricedNotice({
  filters,
  onChange,
}: {
  filters: BillingFilters;
  onChange: (patch: Partial<BillingFilters>) => void;
}) {
  const t = useT();
  const { has } = usePermissions();
  const summary = useUsageSummary(filters);
  const failed = summary.data?.states.failed ?? 0;
  if (failed === 0) return null;
  return (
    <Alert>
      <AlertTitle>{t("unpricedNoticeTitle", { value: failed.toLocaleString() })}</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-x-2">
        {t("unpricedNoticeBody")}
        <Button variant="link" size="sm" onClick={() => onChange({ state: "failed", page: 1 })}>
          {t("unpricedNoticeAction")}
        </Button>
        {has("billing.manage") && (
          <Link
            to="/system/prices"
            className="text-sm text-primary hover:underline"
          >
            {t("unpricedNoticePrices")}
          </Link>
        )}
      </AlertDescription>
    </Alert>
  );
}
