import { useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  DataSelect,
  DetailHeader,
  Empty,
  EmptyHeader,
  EmptyTitle,
  PanelTabs,
  PropertyList,
  SectionCard,
  Skeleton,
  Tabs,
  TabsContent,
  cn,
} from "@modelsphere/ui";
import { TriangleAlert } from "lucide-react";
import { useModulePath } from "@/shell";
import { api, type Node, type Variant } from "@swiss/lib/api";
import { comparison, formatUplift, httpLink, reportLink, variantKind, workloadSummary, type Kind } from "@swiss/lib/catalog";
import { gpuModels, vendorLabel } from "@swiss/lib/gpu";
import { useCatalogChoice } from "@swiss/components/CatalogChoice";
import { useT } from "@/modules/inferences/i18n";
import { catalogPath, fitness } from "@/modules/inferences/catalog-lib";

export function ModelPage({ onDeploy }: { onDeploy?: (target: { model: string; catalog: string; version?: string; variant?: string }) => void }) {
  const t = useT();
  const p = useModulePath();
  const navigate = useNavigate();
  const { name = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const version = params.get("version") ?? undefined;
  const tab = params.get("tab") === "info" ? "info" : "variants";
  const choice = useCatalogChoice();
  const model = useQuery({
    queryKey: ["model", name, version, choice.selected],
    queryFn: () => api.model(name, version, choice.selected),
    enabled: !!choice.selected,
  });
  const index = useQuery({ queryKey: ["catalog", choice.selected], queryFn: () => api.catalog(choice.selected), enabled: !!choice.selected });
  const nodes = useQuery({ queryKey: ["nodes"], queryFn: api.nodes, retry: false });

  const setParam = (k: string, v?: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (v) next.set(k, v);
      else next.delete(k);
      return next;
    }, { replace: true });

  const back = () => navigate(p(catalogPath(choice.selected)));
  const page = (body: React.ReactNode) => (
    <div className="h-full overflow-auto bg-surface-page">
      <div className="flex flex-col gap-4 p-4">{body}</div>
    </div>
  );

  if (model.isPending || choice.isPending) return page(<Skeleton className="h-40 w-full" />);
  if (model.error || !model.data) {
    return page(
      <Alert variant="destructive">
        <TriangleAlert />
        <AlertDescription>{String(model.error?.message ?? choice.error?.message ?? "")}</AlertDescription>
      </Alert>,
    );
  }

  const e = model.data.entry;
  const im = index.data?.index.models.find((m) => m.name === name);
  const versions = im?.versions.map((v) => v.version) ?? [e.version];
  const deprecated = im?.deprecated;
  const cmp = comparison(e.variants, e.version, im?.tuning);
  const site = index.data?.index.site;
  const variants = [...e.variants].sort((a, b) => Number(!!b.default) - Number(!!a.default));

  return page(
    <Tabs value={tab} onValueChange={(v) => setParam("tab", v === "info" ? "info" : undefined)} className="flex-col gap-4">
      <DetailHeader
        onBack={back}
        backLabel={t("model.back")}
        title={e.displayName || e.name}
        subtitle={e.description}
        notice={deprecated ? { tone: "warning", title: t("model.deprecated", { reason: typeof deprecated === "string" ? deprecated : "" }) } : undefined}
        actions={
          onDeploy
            ? [{ key: "deploy", label: t("model.deploy"), onClick: () => onDeploy({ model: name, catalog: choice.selected, version }) }]
            : undefined
        }
        meta={[
          { label: t("model.fields.family"), value: e.family || "-" },
          { label: t("model.fields.source"), value: <span title={e.source.hf}>{e.source.hf}</span> },
          { label: t("model.fields.license"), value: e.license || "-" },
          {
            label: t("model.fields.version"),
            value:
              versions.length > 1 ? (
                <DataSelect
                  className="h-7 w-32"
                  value={e.version}
                  onValueChange={(v) => setParam("version", v === im?.latest ? undefined : v)}
                  options={versions.map((v) => ({ value: v, label: v === im?.latest ? `${v} (${t("model.latest")})` : v }))}
                />
              ) : (
                e.version
              ),
          },
        ]}
        metaColumns={4}
      />
      <PanelTabs
        items={[
          { value: "variants", label: t("model.tabs.variants"), count: variants.length },
          { value: "info", label: t("model.tabs.info") },
        ]}
      />

      <TabsContent value="variants" className="p-0">
        {variants.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t("model.noVariants")}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {variants.map((v) => (
              <VariantCard
                key={v.id}
                v={v}
                kind={variantKind(v, im?.tuning)}
                uplift={cmp && cmp.optimized === v.id ? cmp : null}
                report={cmp && cmp.optimized === v.id ? reportLink(site, name, cmp.report) : undefined}
                nodes={nodes.data?.nodes}
                onDeploy={onDeploy ? () => onDeploy({ model: name, catalog: choice.selected, version, variant: v.id }) : undefined}
              />
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="info" className="p-0">
        <SectionCard title={t("model.tabs.info")}>
          <PropertyList
            columns={1}
            labelClassName="w-28 shrink-0"
            items={[
              { label: t("model.fields.source"), value: [e.source.hf, e.source.revision].filter(Boolean).join(" @ ") },
              { label: t("model.fields.servedName"), value: e.servedName },
              { label: t("model.fields.license"), value: e.license },
              { label: t("model.fields.version"), value: e.version },
              { label: t("model.fields.digest"), value: e.digest && <code className="font-mono text-xs break-all">{e.digest}</code> },
              { label: t("model.fields.tags"), value: e.tags?.length ? e.tags.join(", ") : undefined },
              { label: t("model.fields.sizeLabel"), value: e.source.sizeGiB ? t("model.fields.size", { n: e.source.sizeGiB }) : undefined },
            ].filter((i) => i.value)}
          />
        </SectionCard>
      </TabsContent>
    </Tabs>,
  );
}

function VariantCard({
  v,
  kind,
  uplift,
  report,
  nodes,
  onDeploy,
}: {
  v: Variant;
  kind: Kind;
  uplift: ReturnType<typeof comparison>;
  report?: string;
  nodes?: Node[];
  onDeploy?: () => void;
}) {
  const t = useT();
  const r = v.requires;
  const fit = fitness(v, nodes);
  const docs = httpLink(v.link);
  return (
    <SectionCard
      title={
        <span className="inline-flex flex-wrap items-center gap-2">
          <span className="font-mono">{v.id}</span>
          {v.default && <Badge variant="secondary">{t("model.default")}</Badge>}
          {kind.optimized && <Badge variant="success">{t("model.optimized")}</Badge>}
          {kind.baseline && <Badge variant="outline">{t("model.baseline")}</Badge>}
          <Badge variant="outline">{v.engine}</Badge>
        </span>
      }
      actions={onDeploy && <Button size="sm" onClick={onDeploy}>{t("model.deploy")}</Button>}
    >
      <div className="space-y-3 text-sm">
        {v.description && <p className="text-muted-foreground">{v.description}</p>}
        <PropertyList
          columns={2}
          items={[
            { label: "GPU", value: r.nodes && r.nodes > 1 ? t("model.gpusNodes", { n: r.gpus, nodes: r.nodes }) : t("model.gpus", { n: r.gpus }) },
            { label: t("model.runsOn"), value: r.gpuProduct?.length ? gpuModels(r).join(" / ") : t("model.anyGpu", { vendor: vendorLabel(r.vendor) }) },
            { label: t("model.topology"), value: r.topology || "-" },
            { label: t("model.chart"), value: `${v.chart.name}-${v.chart.version}` },
            ...(r.rdma ? [{ label: t("model.rdma"), value: "✓" }] : []),
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          {uplift?.uplift != null && (
            <Badge variant="success" title={workloadSummary(uplift)}>
              {t("catalog.uplift", { pct: formatUplift(uplift.uplift) })}
            </Badge>
          )}
          <span className={cn("text-xs", fit ? (fit.ok ? "text-success" : "text-warning") : "text-muted-foreground")}>
            {fit ? t(fit.ok ? "model.fitOk" : "model.fitBad", { n: fit.matching, needed: fit.needed }) : t("model.fitUnknown")}
          </span>
          <span className="ms-auto flex gap-3 text-xs">
            {report && (
              <a href={report} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                {t("model.report")}
              </a>
            )}
            {docs && (
              <a href={docs} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                {t("model.docs")}
              </a>
            )}
          </span>
        </div>
      </div>
    </SectionCard>
  );
}
