import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription, Badge, Button, Card, CardContent, PageBanner, ResourceTable, SectionCard, type ResourceColumn, type ResourceRowAction } from "@modelsphere/ui";
import { Database, Plus, TriangleAlert } from "lucide-react";
import { useModulePath } from "@/shell";
import { api, type Deployment } from "@swiss/lib/api";
import { isUninstalling } from "@swiss/lib/phase";
import { useT } from "./i18n";
import { detailPath, modelLine } from "./lib";
import { L3_PAGE_SIZE, l3ConfigureBlocked, l3Overview, l3PageCounts, l3RowQueries, type L3Overview } from "./l3-overview";
import { DeploySheet, type DeployTarget } from "./components/DeploySheet";

const TONES = { on: "success", off: "secondary", unsupported: "secondary", unknown: "warning", unreadable: "warning", loading: "outline" } as const;
type Row = Deployment & { key: string; cache: L3Overview; planError?: Error | null; statusError?: Error | null; blocked?: string };

export function L3CachePage() {
  const t = useT();
  const p = useModulePath();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<DeployTarget | null>(null);
  const list = useQuery({
    queryKey: ["deployments", "l3-overview", page, L3_PAGE_SIZE],
    queryFn: () => api.deployments(page, L3_PAGE_SIZE),
    refetchInterval: (query) => query.state.data?.deployments.some(isUninstalling) ? 3_000 : 15_000,
  });
  const cluster = useQuery({ queryKey: ["cluster"], queryFn: api.cluster });
  const deployments = list.data?.deployments ?? [];
  const queries = l3RowQueries(deployments);
  const plans = useQueries({ queries: queries.plans });
  const statuses = useQueries({ queries: queries.statuses });
  const rows: Row[] = deployments.map((d, i) => ({
    ...d,
    key: `${d.namespace}/${d.release}`,
    cache: l3Overview(plans[i].data, plans[i].error, plans[i].isPending),
    planError: plans[i].error,
    statusError: statuses[i].error,
    blocked: l3ConfigureBlocked(d, cluster.error ? undefined : cluster.data, plans[i].error ? undefined : plans[i].data, statuses[i].error ? undefined : statuses[i].data),
  }));
  const counts = l3PageCounts(rows.map((r) => r.cache));
  const refresh = () => Promise.all(["deployments", "releasePlan", "status", "cluster"].map((key) => qc.invalidateQueries({ queryKey: [key] })));
  const columns: ResourceColumn<Row>[] = [
    {
      key: "release", title: t("l3Page.columns.service"), hideable: false, width: 210,
      render: (d) => <div className="min-w-0">
        <Link to={p(detailPath(d.release, d.namespace))} className="block truncate font-medium text-primary hover:underline">{d.release}</Link>
        <div className="truncate text-xs text-muted-foreground" title={modelLine(d)}>{modelLine(d) || t("l3Page.untracked")}</div>
        {isUninstalling(d) && <Badge variant="warning" className="mt-1">{t("l3Page.uninstalling")}</Badge>}
      </div>,
    },
    { key: "namespace", title: t("l3Page.columns.namespace"), width: 130 },
    {
      key: "cache", title: t("l3Page.columns.state"), width: 160,
      render: (d) => <div className="space-y-1">
        <Badge variant={TONES[d.cache.state]}>{t(`l3Page.state.${d.cache.state}`)}</Badge>
        {d.planError && <p className="max-w-56 truncate text-xs text-warning" title={d.planError.message}>{d.planError.message}</p>}
        {d.statusError && <p className="text-xs text-warning" title={d.statusError.message}>{t("l3Page.statusError")}</p>}
      </div>,
    },
    { key: "backend", title: t("l3Page.columns.backend"), width: 140, render: (d) => <span className="font-mono text-xs">{d.cache.backend || t("l3Page.notRecorded")}</span> },
    {
      key: "capacity", title: t("l3Page.columns.capacity"), width: 190,
      render: (d) => <div className="space-y-1 text-xs">
        {d.cache.size && <p>{t("l3Page.capacitySize", { value: d.cache.size })}</p>}
        {d.cache.ratio && <p>{t("l3Page.capacityRatio", { value: d.cache.ratio })}</p>}
        {d.cache.memoryFraction && <p>{t("l3Page.capacityFraction", { value: d.cache.memoryFraction })}</p>}
        {!d.cache.size && !d.cache.ratio && !d.cache.memoryFraction && <span className="text-muted-foreground">{t("l3Page.notRecorded")}</span>}
      </div>,
    },
    {
      key: "support", title: t("l3Page.columns.support"), width: 220,
      render: (d) => <div className="space-y-1 text-xs">
        <p className="font-medium">{d.cache.chart || d.chart || t("l3Page.notRecorded")}</p>
        <p className="text-muted-foreground">{t("l3Page.engine", { value: d.cache.engine || t("l3Page.notRecorded") })}</p>
        <Badge variant={d.cache.support === "supported" ? "outline" : "secondary"}>{t(`l3Page.support.${d.cache.support}`)}</Badge>
      </div>,
    },
  ];
  const rowActions: ResourceRowAction<Row>[] = [
    {
      key: "configure", label: t("l3Page.configure"),
      onClick: (d) => setTarget({ kind: "upgrade", namespace: d.namespace, release: d.release, section: "l3" }),
      disabled: (d) => d.blocked ? t(`l3Page.blocked.${d.blocked}`) : false,
    },
    { key: "details", label: t("l3Page.details"), onClick: (d) => navigate(p(detailPath(d.release, d.namespace))) },
  ];
  const deploy = <Button onClick={() => navigate(p("catalog"))}><Plus className="size-4" />{t("l3Page.deploy")}</Button>;
  const countKnown = !!list.data && !list.error;

  return <div className="flex h-full flex-col">
    <PageBanner title={t("l3Page.title")} description={t("l3Page.description")} icon={<Database className="size-5" />} actions={deploy} />
    <div className="min-h-0 flex-1 space-y-4 overflow-auto bg-surface-page p-4">
      {cluster.error && <Alert variant="warning"><TriangleAlert /><AlertDescription>{t("l3Page.clusterError", { error: cluster.error.message })}</AlertDescription></Alert>}
      {cluster.data && !cluster.data.allowDeploy && <Alert><AlertDescription>{t("l3Page.readOnly")}</AlertDescription></Alert>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(["on", "off", "unsupported", "unknown"] as const).map((key) => <Card key={key} className="py-4">
          <CardContent className="space-y-1">
            <p className="text-sm text-muted-foreground">{t(`l3Page.summary.${key}`)}</p>
            <p className="text-2xl font-semibold tabular-nums">{countKnown ? counts[key] : "—"}</p>
            <p className="text-xs text-muted-foreground">{t("l3Page.pageScope")}</p>
          </CardContent>
        </Card>)}
      </div>
      <SectionCard title={t("l3Page.tableTitle")} summary={list.data && t("l3Page.scope", { shown: rows.length, total: list.data.summary.total })} padded={false} headerDivider={false}>
        <div className="border-b px-4 py-3 text-xs text-muted-foreground">{t("l3Page.desiredNotice")}</div>
        <ResourceTable<Row>
          toolbarLayout="inline" mode="remote" data={rows} loading={list.isPending} error={list.error} onRetry={() => void list.refetch()}
          rowKey="key" columns={columns} page={page} pageSize={L3_PAGE_SIZE} total={list.data?.summary.total ?? 0} pageSizeOptions={[L3_PAGE_SIZE]} onPageChange={setPage}
          showRefresh onRefresh={() => void refresh()} rowActions={rowActions}
          emptyTitle={t("l3Page.empty")} emptyDescription={t("l3Page.emptyDescription")} emptyAction={deploy}
        />
      </SectionCard>
      <p className="px-1 text-xs text-muted-foreground">{t("l3Page.supportNotice")}</p>
    </div>
    <DeploySheet target={target} onClose={() => setTarget(null)} />
  </div>;
}
