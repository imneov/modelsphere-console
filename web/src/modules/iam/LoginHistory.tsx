import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Input, PageBanner, ResourceTable, type ResourceColumn } from "@modelsphere/ui";
import { History } from "lucide-react";
import { formatDateTime } from "@/shell";
import { api, type LoginRecord } from "@/modules/iam/api";
import { useT } from "@/modules/iam/i18n";

export function LoginHistory() {
  const t = useT();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["loginrecords"], queryFn: () => api.listLoginRecords() });
  const [search, setSearch] = useState("");

  const query = search.trim().toLowerCase();
  const rows = (data?.items ?? []).filter((r) => !query || (r.user ?? "").toLowerCase().includes(query));

  const columns: ResourceColumn<LoginRecord>[] = [
    { key: "time", title: t("loginHistory.table.time"), width: 190, render: (record) => formatDateTime(record.time) },
    {
      key: "user",
      title: t("loginHistory.table.user"),
      render: (record) => <span className="font-medium">{record.user || "-"}</span>,
    },
    {
      key: "success",
      title: t("loginHistory.table.status"),
      width: 220,
      render: (record) =>
        record.success ? (
          <Badge variant="success">{t("loginHistory.status.success")}</Badge>
        ) : (
          <div className="flex items-center gap-2">
            <Badge variant="destructive">{t("loginHistory.status.failure")}</Badge>
            <span className="truncate text-sm text-muted-foreground" title={record.reason}>
              {record.reason || "-"}
            </span>
          </div>
        ),
    },
    { key: "sourceIP", title: t("loginHistory.table.ip"), width: 150, render: (record) => record.sourceIP || "-" },
    {
      key: "userAgent",
      title: t("loginHistory.table.userAgent"),
      render: (record) => (
        <span className="block truncate text-muted-foreground" title={record.userAgent}>
          {record.userAgent || "-"}
        </span>
      ),
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <PageBanner title={t("loginHistory.title")} icon={<History className="size-5" />} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
        <ResourceTable<LoginRecord>
          height="fill"
          toolbarLayout="inline"
          data={rows}
          loading={isLoading}
          error={error}
          onRetry={() => void refetch()}
          rowKey="name"
          columns={columns}
          showRefresh
          onRefresh={() => qc.invalidateQueries({ queryKey: ["loginrecords"] })}
          filters={
            <div className="w-52 shrink-0">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("loginHistory.search")} className="w-full" />
            </div>
          }
          activeFilters={query ? [{ key: "search", label: t("loginHistory.table.user"), display: search.trim() }] : []}
          onRemoveFilter={() => setSearch("")}
        />
      </div>
    </div>
  );
}
