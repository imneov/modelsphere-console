import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, type ColumnDef, DataTable, PageHeader } from "@riseaicloud/ui";
import { History } from "lucide-react";
import { formatDateTime } from "@/shell";
import { api, type LoginRecord } from "@/modules/iam/api";
import { useT } from "@/modules/iam/i18n";

export function LoginHistory() {
  const t = useT();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["loginrecords"], queryFn: () => api.listLoginRecords() });

  const columns: ColumnDef<LoginRecord>[] = [
    { key: "time", title: t("loginHistory.table.time"), width: 190, render: (record) => formatDateTime(record.time) },
    {
      key: "user",
      title: t("loginHistory.table.user"),
      searchable: true,
      render: (record) => <span className="font-medium">{record.user || "-"}</span>,
    },
    {
      key: "success",
      title: t("loginHistory.table.status"),
      width: 220,
      render: (record) =>
        record.success ? (
          <Badge className="bg-green-100 text-green-800">{t("loginHistory.status.success")}</Badge>
        ) : (
          <div className="flex items-center gap-2">
            <Badge className="bg-red-100 text-red-800">{t("loginHistory.status.failure")}</Badge>
            <span className="text-sm text-muted-foreground">{record.reason || "-"}</span>
          </div>
        ),
    },
    { key: "sourceIP", title: t("loginHistory.table.ip"), width: 150, render: (record) => record.sourceIP || "-" },
    {
      key: "userAgent",
      title: t("loginHistory.table.userAgent"),
      render: (record) => (
        <span className="block max-w-md truncate" title={record.userAgent}>
          {record.userAgent || "-"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title={t("loginHistory.title")} icon={<History className="h-5 w-5" />} />
      <DataTable<LoginRecord>
        data={data?.items ?? []}
        loading={isLoading}
        rowKey="name"
        columns={columns}
        totalItems={data?.items.length ?? 0}
        showRefresh
        onRefresh={() => qc.invalidateQueries({ queryKey: ["loginrecords"] })}
        minWidth={1000}
      />
    </div>
  );
}
