import { Badge, ResourceTable, type ResourceColumn, type ResourceRowAction } from "@modelsphere/ui";
import type { Pod, ReleaseStatus } from "@swiss/lib/api";
import { useT } from "@/modules/inferences/i18n";
import { age } from "@/modules/inferences/lib";
import { LoadHint } from "@/modules/inferences/components/LoadHint";

// The release's pods, from the status read the page already polls.
export function Instances({ status: s, onLogs }: { status: ReleaseStatus; onLogs: (pod: string) => void }) {
  const t = useT();
  const columns: ResourceColumn<Pod>[] = [
    {
      key: "name",
      title: t("instances.columns.name"),
      hideable: false,
      render: (pod) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{pod.name}</div>
          {pod.message && <div className="truncate text-xs text-muted-foreground" title={pod.message}>{pod.message}</div>}
        </div>
      ),
    },
    { key: "phase", title: t("instances.columns.phase"), width: 110 },
    {
      key: "ready",
      title: t("instances.columns.ready"),
      width: 100,
      render: (pod) => <Badge variant={pod.ready ? "success" : "secondary"}>{t(pod.ready ? "instances.ready" : "instances.notReady")}</Badge>,
    },
    { key: "restarts", title: t("instances.columns.restarts"), width: 100, align: "right", render: (pod) => <span className="tabular-nums">{pod.restarts}</span> },
    { key: "node", title: t("instances.columns.node"), width: 200, render: (pod) => pod.node || "-" },
    { key: "ageSeconds", title: t("instances.columns.age"), width: 100, render: (pod) => <span className="tabular-nums">{age(pod.ageSeconds)}</span> },
  ];

  const rowActions: ResourceRowAction<Pod>[] = [{ key: "logs", label: t("actions.logs"), onClick: (pod) => onLogs(pod.name) }];
  return (
    <div className="space-y-3">
      <LoadHint status={s} />
      {s.warning && <p className="text-sm text-warning">{s.warning}</p>}
      <ResourceTable<Pod> showColumnToggle={false} rowActions={rowActions} data={s.pods} columns={columns} rowKey="name" emptyTitle={t("instances.empty")} />
    </div>
  );
}
