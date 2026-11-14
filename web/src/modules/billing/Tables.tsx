import { useQuery } from "@tanstack/react-query";
import { Badge, ResourceTable, type ResourceColumn } from "@modelsphere/ui";
import { formatDateTime } from "@/shell";
import {
  api,
  type BillingFilters,
  type BillingRequest,
  type LedgerEntry,
} from "@/modules/billing/api";
import { RequestDetails } from "@/modules/billing/RequestDetails";
import { formatMoney } from "@/modules/billing/money";
import { useT } from "@/modules/billing/i18n";

type TableProps = {
  filters: BillingFilters;
  onChange: (patch: Partial<BillingFilters>) => void;
};

export function UsageTable({
  filters,
  onChange,
  onLedger,
}: TableProps & { onLedger: (requestID: string) => void }) {
  const t = useT();
  const query = useQuery({
    queryKey: ["billing", "usage", filters],
    queryFn: () => api.usage(filters),
  });
  const columns = useUsageColumns();
  return (
    <ResourceTable<BillingRequest>
      mode="remote"
      data={query.data?.items ?? []}
      total={query.data?.totalItems ?? 0}
      page={query.data?.page ?? filters.page}
      pageSize={query.data?.limit ?? filters.limit}
      onPageChange={(page) => onChange({ page })}
      onPageSizeChange={(limit) => onChange({ limit, page: 1 })}
      rowKey="requestID"
      columns={columns}
      loading={query.isLoading}
      error={query.error}
      onRetry={() => void query.refetch()}
      emptyTitle={t("empty")}
      expandable={{
        render: (row) => (
          <RequestDetails
            request={row}
            ownerUID={filters.ownerUserID}
            onLedger={onLedger}
          />
        ),
      }}
    />
  );
}

export function LedgerTable({ filters, onChange }: TableProps) {
  const t = useT();
  const query = useQuery({
    queryKey: ["billing", "ledger", filters],
    queryFn: () => api.ledger(filters),
  });
  const columns: ResourceColumn<LedgerEntry>[] = [
    {
      key: "operationID",
      title: t("operation"),
      render: (row) => (
        <span className="font-mono text-xs">{row.operationID}</span>
      ),
    },
    {
      key: "kind",
      title: t("kind"),
      render: (row) => t(row.kind === "charge" ? "settled" : row.kind),
    },
    {
      key: "amount",
      title: t("amount"),
      render: (row) => formatMoney(row.amount, row.currency),
    },
    { key: "chargeID", title: t("cost"), render: (row) => row.chargeID || "—" },
    { key: "actor", title: t("actor") },
    {
      key: "occurredAt",
      title: t("at"),
      render: (row) => formatDateTime(row.occurredAt),
    },
  ];
  return (
    <ResourceTable<LedgerEntry>
      mode="remote"
      data={query.data?.items ?? []}
      total={query.data?.totalItems ?? 0}
      page={query.data?.page ?? filters.page}
      pageSize={query.data?.limit ?? filters.limit}
      onPageChange={(page) => onChange({ page })}
      onPageSizeChange={(limit) => onChange({ limit, page: 1 })}
      rowKey="operationID"
      columns={columns}
      loading={query.isLoading}
      error={query.error}
      onRetry={() => void query.refetch()}
      emptyTitle={t("empty")}
    />
  );
}

function useUsageColumns(): ResourceColumn<BillingRequest>[] {
  const t = useT();
  const columns: ResourceColumn<BillingRequest>[] = [
    {
      key: "requestID",
      title: t("request"),
      render: (row) => (
        <span className="font-mono text-xs">{row.requestID}</span>
      ),
    },
    { key: "model", title: t("model") },
    {
      key: "identitySource",
      title: t("source"),
      render: (row) => t(row.identitySource),
    },
    ...useUsageOutcomeColumns(),
  ];
  return columns;
}

function useUsageOutcomeColumns(): ResourceColumn<BillingRequest>[] {
  const t = useT();
  return [
    {
      key: "usage",
      title: t("usage"),
      render: (row) => (
        <span>
          {row.usage.complete
            ? `${row.usage.inputTokens} / ${row.usage.outputTokens}`
            : t(row.terminalAt ? "incomplete" : "started")}
        </span>
      ),
    },
    {
      key: "charge",
      title: t("cost"),
      render: (row) =>
        row.charge ? formatMoney(row.charge.amount, row.charge.currency) : "—",
    },
    {
      key: "state",
      title: t("state"),
      render: (row) => (
        <Badge
          variant={row.charge?.state === "settled" ? "secondary" : "outline"}
        >
          {t(
            row.charge?.state ??
              (row.usage.complete ? "unpriced" : "incomplete"),
          )}
        </Badge>
      ),
    },
    {
      key: "reason",
      title: t("reason"),
      render: (row) =>
        row.reason
          ? t(`reasons.${row.reason}`, { defaultValue: row.reason })
          : "—",
    },
    {
      key: "startedAt",
      title: t("at"),
      render: requestTime,
    },
  ];
}

function requestTime(request: BillingRequest) {
  return request.startedAt
    ? formatDateTime(request.startedAt)
    : request.terminalAt
      ? formatDateTime(request.terminalAt)
      : "—";
}
