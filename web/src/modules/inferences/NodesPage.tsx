import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  AlertDescription,
  Badge,
  Card,
  CardContent,
  FilterSelect,
  Input,
  PageBanner,
  PropertyList,
  ResourceTable,
  StatusIndicator,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
  type ResourceColumn,
} from "@modelsphere/ui";
import { Server, TriangleAlert } from "lucide-react";
import { api, type Node } from "@swiss/lib/api";
import { useT } from "@/modules/inferences/i18n";
import { FOCUSES, byInventory, conditionTone, countByFocus, largestFree, matchesFocus, matchesQuery, nodeState, productOf, productsOf, taintTone, totals, type Focus } from "@/modules/inferences/nodes-lib";

const BADGE = { success: "success", warning: "warning", error: "destructive", neutral: "secondary" } as const;

export function NodesPage() {
  const t = useT();
  const nodes = useQuery({ queryKey: ["nodes"], queryFn: api.nodes, refetchInterval: 30_000 });
  const [focus, setFocus] = useState<Focus>("all");
  const [product, setProduct] = useState("");
  const [q, setQ] = useState("");

  const all = nodes.data?.nodes ?? [];
  const known = !!nodes.data && !nodes.data.usageError;
  const counts = countByFocus(all, known);
  const sum = totals(all);
  const largest = largestFree(all, known);
  const products = productsOf(all, known);
  const shown = all.filter((n) => matchesFocus(n, focus, known) && matchesQuery(n, q.trim()) && (!product || productOf(n).key === product)).sort(byInventory(focus));

  const columns: ResourceColumn<Node>[] = [
    {
      key: "Name",
      title: t("nodes.columns.name"),
      hideable: false,
      render: (n) => (
        <div className="min-w-0">
          <div className="truncate font-medium">{n.Name}</div>
          {n.InternalIP && <div className="truncate font-mono text-xs text-muted-foreground">{n.InternalIP}</div>}
        </div>
      ),
    },
    { key: "GPUProduct", title: t("nodes.columns.gpuType"), render: (n) => (n.GPUs > 0 ? productOf(n).key : "-") },
    { key: "GPUs", title: t("nodes.columns.gpus"), width: 70, render: (n) => <span className="tabular-nums">{n.GPUs || "-"}</span> },
    { key: "free", title: t("nodes.columns.free"), width: 70, render: (n) => <span className="tabular-nums">{n.GPUs > 0 && known ? (n.gpusFree ?? 0) : "-"}</span> },
    { key: "used", title: t("nodes.columns.used"), width: 160, render: (n) => (n.GPUs > 0 && known ? <Usage used={n.gpusUsed ?? 0} total={n.GPUs} /> : "-") },
    {
      key: "state",
      title: t("nodes.columns.state"),
      width: 110,
      render: (n) => {
        const s = nodeState(n);
        return <StatusIndicator variant={s.tone} label={t(`nodes.state.${s.key}`)} />;
      },
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <PageBanner title={t("nodes.title")} description={t("nodes.description")} icon={<Server className="size-5" />} />
      <div className="min-h-0 flex-1 space-y-4 overflow-auto bg-surface-page p-4">
        {nodes.data?.usageError && (
          <Alert variant="warning">
            <TriangleAlert />
            <AlertDescription>{t("nodes.usageError", { error: nodes.data.usageError })}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi
            label={t("nodes.kpi.free")}
            value={known ? sum.free : "-"}
            hint={!known ? t("nodes.kpi.notMeasured") : sum.placeableFree !== sum.free ? (sum.placeableFree ? t("nodes.kpi.schedulable", { n: sum.placeableFree }) : t("nodes.kpi.noneSchedulable")) : t("nodes.kpi.ofAllocatable", { n: sum.gpus })}
            warn={known && sum.free > 0 && sum.placeableFree === 0}
          />
          <Kpi
            label={t("nodes.kpi.largest")}
            value={known ? largest.free : "-"}
            hint={!known || !sum.gpuNodes ? undefined : largest.free === 0 ? t("nodes.kpi.noRoom") : largest.names.length === 1 ? largest.names[0] : t("nodes.kpi.onNodes", { n: largest.names.length })}
          />
          <Kpi label={t("nodes.kpi.gpuNodes")} value={counts.gpu} hint={counts.unavailable ? t("nodes.kpi.unavailable", { n: counts.unavailable }) : undefined} warn={counts.unavailable > 0} />
          <Kpi label={t("nodes.kpi.used")} value={known ? sum.used : "-"} hint={known ? t("nodes.kpi.ofAllocatable", { n: sum.gpus }) : t("nodes.kpi.notMeasured")} />
        </div>

        {products.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {products.map((pr) => (
              <button
                key={pr.key}
                type="button"
                aria-pressed={product === pr.key}
                onClick={() => setProduct(product === pr.key ? "" : pr.key)}
                className={cn("rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/40", product === pr.key && "border-primary ring-1 ring-primary/30")}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium">{pr.unlabelled ? `${pr.key}` : pr.key}</span>
                  <span className="text-sm tabular-nums text-muted-foreground">{known ? `${pr.free} / ${pr.gpus}` : pr.gpus}</span>
                </div>
                {known && <Usage used={pr.used} total={pr.gpus} className="mt-2" />}
                <div className="mt-2 text-xs text-muted-foreground">
                  {[t("nodes.product.nodes", { n: pr.nodes }), known && pr.largest > 0 ? t("nodes.product.largest", { n: pr.largest }) : known ? t("nodes.kpi.noRoom") : "", pr.unavailable ? t("nodes.kpi.unavailable", { n: pr.unavailable }) : ""].filter(Boolean).join(" · ")}
                </div>
              </button>
            ))}
          </div>
        )}

        <ResourceTable<Node>
          toolbarLayout="inline"
          data={shown}
          loading={nodes.isPending}
          error={nodes.error}
          onRetry={() => void nodes.refetch()}
          rowKey="Name"
          columns={columns}
          showRefresh
          onRefresh={() => void nodes.refetch()}
          filters={
            <>
              <div className="w-64 shrink-0">
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("nodes.search")} className="w-full" />
              </div>
              <FilterSelect
                title={t("nodes.columns.state")}
                options={FOCUSES.filter((f) => f !== "all").map((f) => ({ value: f, label: t(`nodes.focus.${f}`), description: String(counts[f as Exclude<Focus, "all">]) }))}
                value={focus === "all" ? "" : focus}
                onValueChange={(v) => setFocus((v || "all") as Focus)}
              />
            </>
          }
          activeFilters={product ? [{ key: "product", label: t("nodes.columns.gpuType"), display: product }] : []}
          onRemoveFilter={() => setProduct("")}
          expandable={{ render: (n) => <NodeDetail n={n} /> }}
          emptyTitle={t("nodes.empty")}
        />
      </div>
    </div>
  );
}

function Kpi({ label, value, hint, warn }: { label: string; value: number | string; hint?: string; warn?: boolean }) {
  return (
    <Card className="py-4">
      <CardContent className="space-y-1">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        <div className={cn("truncate text-xs", warn ? "text-warning" : "text-muted-foreground")}>{hint ?? " "}</div>
      </CardContent>
    </Card>
  );
}

function Usage({ used, total, className }: { used: number; total: number; className?: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  return (
    <div className={cn("flex items-center gap-2", className)} role="img" aria-label={`${used}/${total}`}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", used >= total && total > 0 ? "bg-warning" : "bg-success")} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
        {used}/{total}
      </span>
    </div>
  );
}

function NodeDetail({ n }: { n: Node }) {
  const t = useT();
  return (
    <Tabs defaultValue="pods" className="gap-3">
      <TabsList>
        <TabsTrigger value="pods">
          {t("nodes.detail.pods")} {n.gpuPods?.length ? <span className="text-xs text-muted-foreground">{n.gpuPods.length}</span> : null}
        </TabsTrigger>
        <TabsTrigger value="node">{t("nodes.detail.node")}</TabsTrigger>
      </TabsList>
      <TabsContent value="pods">
        {n.gpuPods?.length ? (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 font-normal">{t("nodes.detail.pod")}</th>
                <th className="py-1 font-normal">{t("nodes.detail.namespace")}</th>
                <th className="py-1 text-right font-normal">GPU</th>
              </tr>
            </thead>
            <tbody>
              {n.gpuPods.map((p) => (
                <tr key={`${p.namespace}/${p.name}`} className="border-t">
                  <td className="py-1.5 font-mono text-xs">{p.name}</td>
                  <td className="py-1.5">{p.namespace}</td>
                  <td className="py-1.5 text-right tabular-nums">{p.gpus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted-foreground">{t("nodes.detail.noPods")}</p>
        )}
      </TabsContent>
      <TabsContent value="node" className="space-y-3">
        <PropertyList
          columns={2}
          items={[
            { label: t("nodes.detail.kubelet"), value: n.Kubelet || "-" },
            { label: t("nodes.detail.internalIP"), value: n.InternalIP || "-" },
            { label: t("nodes.detail.externalIP"), value: n.ExternalIP || "-" },
            { label: t("nodes.detail.resource"), value: n.GPUResource || "-" },
          ]}
        />
        {!!n.Taints?.length && (
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">{t("nodes.detail.taints")}:</span>
            {n.Taints.map((x) => (
              <Badge key={x} variant={BADGE[taintTone(x)]} className="font-mono font-normal">
                {x}
              </Badge>
            ))}
          </div>
        )}
        {!!n.Conditions?.length && (
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-muted-foreground">{t("nodes.detail.conditions")}:</span>
            {n.Conditions.map((c) => (
              <Badge key={c.Type} variant={BADGE[conditionTone(c)]} title={[c.Reason, c.Message].filter(Boolean).join(" — ") || undefined} className="font-normal">
                {c.Type}={c.Status}
              </Badge>
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
