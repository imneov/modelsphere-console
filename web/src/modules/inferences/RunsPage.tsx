import { useSearchParams } from "react-router";
import { FilterSelect, PageBanner } from "@modelsphere/ui";
import { Activity } from "lucide-react";
import { useT } from "@/modules/inferences/i18n";
import { RunsTable } from "@/modules/inferences/components/RunsTable";

const ACTIONS = ["install", "apply", "rollback", "uninstall"];

export function RunsPage() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const namespace = params.get("namespace") ?? "";
  const release = params.get("release") ?? "";
  const action = params.get("action") ?? "";
  const set = (patch: Record<string, string>) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) v ? next.set(k, v) : next.delete(k);
      return next;
    }, { replace: true });

  return (
    <div className="flex h-full flex-col">
      <PageBanner title={t("runsPage.title")} description={t("runsPage.description")} icon={<Activity className="size-5" />} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
        <RunsTable
          fill
          showService
          namespace={namespace || undefined}
          release={release || undefined}
          action={action || undefined}
          filters={<FilterSelect title={t("runsPage.action")} options={ACTIONS.map((a) => ({ value: a, label: t(`runsPage.actions.${a}`) }))} value={action} onValueChange={(v) => set({ action: v })} />}
          activeFilters={release ? [{ key: "service", label: t("runsPage.service"), display: `${release} · ${namespace}` }] : []}
          onRemoveFilter={() => set({ namespace: "", release: "" })}
        />
      </div>
    </div>
  );
}
