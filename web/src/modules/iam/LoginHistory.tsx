import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, type ColumnDef, DataTable, PageHeader } from "@riseaicloud/ui";
import { History } from "lucide-react";
import { api, type LoginRecord } from "@/modules/iam/api";

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

export function LoginHistory() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["loginrecords"], queryFn: () => api.listLoginRecords() });

  const columns: ColumnDef<LoginRecord>[] = [
    { key: "time", title: "时间", width: 190, render: (record) => formatTime(record.time) },
    {
      key: "user",
      title: "用户",
      searchable: true,
      render: (record) => <span className="font-medium">{record.user || "-"}</span>,
    },
    {
      key: "success",
      title: "状态",
      width: 220,
      render: (record) =>
        record.success ? (
          <Badge className="bg-green-100 text-green-800">成功</Badge>
        ) : (
          <div className="flex items-center gap-2">
            <Badge className="bg-red-100 text-red-800">失败</Badge>
            <span className="text-sm text-muted-foreground">{record.reason || "-"}</span>
          </div>
        ),
    },
    { key: "sourceIP", title: "IP", width: 150, render: (record) => record.sourceIP || "-" },
    {
      key: "userAgent",
      title: "UserAgent",
      render: (record) => (
        <span className="block max-w-md truncate" title={record.userAgent}>
          {record.userAgent || "-"}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="登录历史" icon={<History className="h-5 w-5" />} />
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
