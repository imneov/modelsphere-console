import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Badge,
  ResourceTable,
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  type ResourceColumn,
} from "@modelsphere/ui";
import { formatDateTime } from "@/shell";
import {
  api,
  requestState,
  type BillingFilters,
  type BillingRequest,
  type LedgerEntry,
} from "./api";
import { RequestDetails } from "./RequestDetails";
import { LedgerDetails } from "./LedgerDetails";
import { formatMoney, isPositiveMoney } from "./money";
import { useT } from "./i18n";

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
  const [selectedID, setSelectedID] = useState("");
  const query = useQuery({
    queryKey: ["billing", "usage", filters],
    queryFn: () => api.usage(filters),
    placeholderData: (previous) => previous,
  });
  const selected = query.data?.items.find(
    (row) => row.requestID === selectedID,
  );
  const columns = useUsageColumns();
  return (
    <>
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
        emptyTitle={t("emptyUsage")}
        emptyDescription={t("emptyFilterHint")}
        onRowClick={(row) => setSelectedID(row.requestID)}
      />
      <Sheet
        dismissible
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelectedID("");
        }}
      >
        <SheetContent size="md">
          <SheetHeader>
            <SheetTitle>{t("requestDetails")}</SheetTitle>
            <SheetDescription>{selected?.model}</SheetDescription>
          </SheetHeader>
          <SheetBody className="pb-6">
            {selected && (
              <RequestDetails
                request={selected}
                ownerUID={filters.ownerUserID}
                onLedger={onLedger}
              />
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}

export function LedgerTable({ filters, onChange }: TableProps) {
  const t = useT();
  const [selectedID, setSelectedID] = useState("");
  const query = useQuery({
    queryKey: ["billing", "ledger", filters],
    queryFn: () => api.ledger(filters),
    placeholderData: (previous) => previous,
  });
  const selected = query.data?.items.find(
    (row) => row.operationID === selectedID,
  );
  const columns = useLedgerColumns();
  return (
    <>
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
        emptyTitle={t("emptyLedger")}
        emptyDescription={t("emptyFilterHint")}
        onRowClick={(row) => setSelectedID(row.operationID)}
      />
      <Sheet
        dismissible
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelectedID("");
        }}
      >
        <SheetContent size="md">
          <SheetHeader>
            <SheetTitle>{t("ledgerDetails")}</SheetTitle>
            <SheetDescription>{t("ledgerDescription")}</SheetDescription>
          </SheetHeader>
          <SheetBody className="pb-6">
            {selected && <LedgerDetails entry={selected} />}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}

function useLedgerColumns(): ResourceColumn<LedgerEntry>[] {
  const t = useT();
  return [
    {
      key: "occurredAt",
      title: t("at"),
      render: (row) => formatDateTime(row.occurredAt),
    },
    {
      key: "kind",
      title: t("kind"),
      render: (row) => (
        <Badge variant="outline">
          {t(row.kind === "charge" ? "debit" : row.kind, {
            defaultValue: row.kind,
          })}
        </Badge>
      ),
    },
    {
      key: "amount",
      title: t("amount"),
      align: "right",
      render: (row) => {
        const positive = isPositiveMoney(row.amount);
        return (
          <span
            className={`font-medium tabular-nums ${positive ? "text-primary" : ""}`}
          >
            {positive ? "+ " : ""}
            {formatMoney(row.amount, row.currency)}
          </span>
        );
      },
    },
    { key: "actor", title: t("actor") },
    {
      key: "operationID",
      title: t("operation"),
      render: (row) => (
        <span
          className="font-mono text-xs text-muted-foreground"
          title={row.operationID}
        >
          {row.operationID.length > 20
            ? `${row.operationID.slice(0, 16)}…`
            : row.operationID}
        </span>
      ),
    },
  ];
}

function useUsageColumns(): ResourceColumn<BillingRequest>[] {
  const t = useT();
  return [
    {
      key: "model",
      title: t("model"),
      render: (row) => (
        <div className="space-y-1">
          <span className="font-medium">{row.model || "—"}</span>
          <p
            className="font-mono text-xs text-muted-foreground"
            title={row.requestID}
          >
            {row.requestID.slice(0, 12)}…
          </p>
        </div>
      ),
    },
    {
      key: "startedAt",
      title: t("at"),
      render: (row) =>
        row.startedAt || row.terminalAt
          ? formatDateTime((row.startedAt || row.terminalAt)!)
          : "—",
    },
    {
      key: "tokens",
      title: t("tokens"),
      render: (row) =>
        row.usage.complete ? (
          <div className="space-y-1 text-xs tabular-nums">
            <p>
              {t("input")}: {row.usage.inputTokens.toLocaleString()}
            </p>
            <p className="text-muted-foreground">
              {t("output")}: {row.usage.outputTokens.toLocaleString()}
            </p>
          </div>
        ) : (
          t(row.terminalAt ? "incomplete" : "started")
        ),
    },
    {
      key: "charge",
      title: t("cost"),
      align: "right",
      render: (row) => (
        <span className="font-medium tabular-nums">
          {row.charge
            ? formatMoney(row.charge.amount, row.charge.currency)
            : "—"}
        </span>
      ),
    },
    {
      key: "state",
      title: t("state"),
      render: (row) => (
        <Badge
          variant={row.charge?.state === "settled" ? "secondary" : "outline"}
        >
          {t(requestState(row))}
        </Badge>
      ),
    },
    {
      key: "identitySource",
      title: t("source"),
      render: (row) => t(row.identitySource),
    },
  ];
}
