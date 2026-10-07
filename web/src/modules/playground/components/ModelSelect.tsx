import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@modelsphere/ui";
import { api } from "@/modules/playground/api";
import { useT } from "@/modules/playground/i18n";
import type { NotReady, Target } from "@/modules/playground/targets";

// useModels lists the deployments, ready ones first; a target's id is its route.
export function useModels() {
  return useQuery({ queryKey: ["playground", "targets"], queryFn: api.targets, retry: false });
}

// useTarget is the deployment an id names, while it is still listed and ready.
export function useTarget(id: string): Target | undefined {
  const models = useModels();
  return models.data?.find((m) => m.id === id && m.ready);
}

function catalogLine(m: Target): string {
  if (!m.catalogModel) return "";
  return [m.catalogModel + (m.version ? ` v${m.version}` : ""), m.variant].filter(Boolean).join(" · ");
}

export function ModelSelect({ id, value, onChange, className }: { id?: string; value: string; onChange: (model: string) => void; className?: string }) {
  const t = useT();
  const models = useModels();
  const list = models.data ?? [];
  const anyReady = list.some((m) => m.ready);
  const items = list.map((m) => ({ value: m.id, label: m.ready ? `${m.release} · ${m.model}` : m.release }));
  const placeholder = models.isLoading
    ? t("common:status.loading")
    : !list.length
      ? t("modelSelect.none")
      : anyReady
        ? t("modelSelect.placeholder")
        : t("modelSelect.noneReady");
  return (
    // null, not "", is what makes Base UI show the placeholder.
    <Select<string> items={items} value={value || null} onValueChange={(v) => v && onChange(v)} disabled={!list.length}>
      <SelectTrigger id={id} className={`w-full ${className ?? ""}`}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {list.map((m) => (
          <SelectItem key={m.id} value={m.id} disabled={!m.ready}>
            <div className="flex min-w-0 flex-col">
              <span className="truncate">
                {m.release}
                {m.ready ? <span className="ml-1.5 font-mono text-xs text-muted-foreground">model={m.model}</span> : null}
              </span>
              <span className="truncate text-xs text-muted-foreground">{catalogLine(m)}</span>
              {m.ready ? null : <span className="text-xs text-muted-foreground">{reasonText(t, m.reason)}</span>}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function reasonText(t: ReturnType<typeof useT>, r?: NotReady): string {
  switch (r?.kind) {
    case "noRoute":
      return t("modelSelect.reason.noRoute");
    case "notPublished":
      return t("modelSelect.reason.notPublished", { route: r.route });
    case "notServing":
      return t("modelSelect.reason.notServing", { route: r.route });
    default:
      return "";
  }
}

// NoModels explains a list with nothing to talk to: no deployment yet, or none
// ready -- each not-ready one named with why, linked to its own page. A failed
// request is modelsHint's to explain.
export function NoModels({ className }: { className?: string }) {
  const t = useT();
  const models = useModels();
  if (!models.isSuccess || models.data.some((m) => m.ready)) return null;
  if (!models.data.length) {
    return (
      <p className={`text-xs text-muted-foreground ${className ?? ""}`}>
        {t("modelSelect.noneHint")}{" "}
        <Link to="/inferences" className="text-primary underline-offset-4 hover:underline">
          {t("modelSelect.deploy")}
        </Link>
      </p>
    );
  }
  return (
    <div className={`space-y-1 text-xs text-muted-foreground ${className ?? ""}`}>
      <p>{t("modelSelect.noneReadyHint")}</p>
      <ul className="space-y-0.5">
        {models.data.map((m) => (
          <li key={m.id}>
            <Link to={detailPath(m)} className="text-primary underline-offset-4 hover:underline">
              {m.release}
            </Link>
            {": "}
            {reasonText(t, m.reason)}
          </li>
        ))}
      </ul>
    </div>
  );
}

// The deployment's page in Model Serving (modules/inferences).
function detailPath(m: Target): string {
  return `/inferences/${encodeURIComponent(m.release)}/details?${new URLSearchParams({ namespace: m.namespace })}`;
}
