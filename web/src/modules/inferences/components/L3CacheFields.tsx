import { Badge, Button, FieldInput, FieldSelect, FieldTextarea, FloatingField, SectionCard, Switch } from "@modelsphere/ui";
import { ArrowRight, Cpu, Database, MemoryStick } from "lucide-react";
import { useT } from "../i18n";
import { L3_FIELDS, l3Supported, type L3FieldName, type L3Patch, type L3Settings } from "../l3-cache";

const UI_BACKEND = "mooncake";

export function L3CacheFields({ settings, onChange, chart, engine, localEnabled = false, onChooseTarget, onAdvanced }: {
  settings: L3Settings;
  onChange: (patch: L3Patch) => void;
  chart: { name?: string; version?: string };
  engine?: string;
  localEnabled?: boolean;
  onChooseTarget?: () => void;
  onAdvanced?: () => void;
}) {
  const t = useT();
  const f = (key: string) => t(`deploy.l3.${key}`);
  const supported = l3Supported(chart, engine);
  const externalBackend = !!settings.storageBackend && settings.storageBackend !== UI_BACKEND;
  const fields = (names: L3FieldName[]) => names.map((name) => {
    const definition = L3_FIELDS[name];
    const choices = "choices" in definition ? definition.choices : undefined;
    return <FloatingField key={name} label={f(name)} hint={f(`${name}Hint`)} multiline={name === "extraConfig"}>
      {choices ? <FieldSelect value={settings[name] || "__default"} onValueChange={(value) => onChange({ [name]: value === "__default" ? "" : value })}
        options={[{ value: "__default", label: f("engineDefault") }, ...choices.map((value) => ({ value, label: value }))]} />
        : name === "extraConfig" ? <FieldTextarea value={settings[name]} onChange={(event) => onChange({ [name]: event.target.value })} rows={3} spellCheck={false} className="font-mono text-xs" aria-label={f(name)} />
        : <FieldInput value={settings[name]} onChange={(event) => onChange({ [name]: event.target.value })} inputMode={"number" in definition ? "decimal" : undefined} aria-label={f(name)} />}
    </FloatingField>;
  });
  const tiers = [
    { level: "L1", title: f("gpuTier"), detail: f("gpuTierHint"), icon: Cpu },
    { level: "L2", title: f("hostTier"), detail: settings.size ? t("deploy.l3.capacity", { n: settings.size }) : f("inheritedCapacity"), icon: MemoryStick },
    { level: "L3", title: f("storageTier"), detail: settings.storageBackend || "Mooncake", icon: Database },
  ];

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-primary/20 bg-primary/5 p-5">
        <div className="flex items-start justify-between gap-5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Database className="size-5" /></span>
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">{f("title")}</h2>
                <Badge variant={externalBackend ? "outline" : settings.enabled ? "success" : "outline"}>{f(externalBackend ? "externalConfig" : settings.enabled ? "configuredOn" : "configuredOff")}</Badge>
              </div>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{f("purpose")}</p>
            </div>
          </div>
          <Switch aria-label={f("title")} checked={settings.enabled} disabled={externalBackend || (!supported && !settings.enabled)} onCheckedChange={(enabled) => onChange(enabled ? { enabled: true, storageBackend: settings.storageBackend || UI_BACKEND } : { enabled: false })} />
        </div>
        <p className="mt-4 border-t border-primary/10 pt-3 text-xs text-muted-foreground">{f("scope")}</p>
      </section>

      <div className="grid grid-cols-3 gap-3" aria-label={f("tiers")}>
        {tiers.map(({ level, title, detail, icon: Icon }, index) => (
          <div key={level} className="relative min-w-0 rounded-lg border bg-card p-3 sm:p-4">
            <div className="mb-2 flex items-center gap-2 text-muted-foreground"><Icon className="size-4 shrink-0" /><span className="text-xs font-medium">{level}</span></div>
            <p className="text-sm font-medium">{title}</p>
            <p className="mt-1 break-words text-xs text-muted-foreground">{detail}</p>
            {index < 2 && <ArrowRight className="absolute -right-2 top-1/2 z-10 size-4 -translate-y-1/2 bg-surface-page text-muted-foreground" aria-hidden="true" />}
          </div>
        ))}
      </div>

      {!supported ? (
        <SectionCard title={f("compatibilityTitle")}>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{f(chart.name === "vllm" ? "vllmUnsupported" : "unsupported")}</p>
            {onChooseTarget && <Button variant="outline" size="sm" onClick={onChooseTarget}>{f("chooseTarget")}</Button>}
          </div>
        </SectionCard>
      ) : externalBackend ? (
        <SectionCard title={f("externalConfig")}>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("deploy.l3.externalBackend", { backend: settings.storageBackend })}</p>
            <FloatingField label={f("storageBackend")}><FieldInput value={settings.storageBackend} readOnly aria-label={f("storageBackend")} /></FloatingField>
            {onAdvanced && <Button variant="outline" size="sm" onClick={onAdvanced}>{f("editAdvanced")}</Button>}
          </div>
        </SectionCard>
      ) : (
        <>
          {!settings.enabled && <p className="text-sm text-muted-foreground">{f("enableToConfigure")}</p>}
          {settings.enabled && localEnabled && <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{f("errors.localConflict")}</p>}
          <fieldset disabled={!settings.enabled} className="min-w-0 space-y-4 disabled:opacity-60">
            <SectionCard title={f("backendSection")} summary={f("backendSectionHint")}>
              <div className="space-y-3">
                <FloatingField label={f("storageBackend")} hint={f("storageBackendHint")}>
                  <FieldInput value="Mooncake" readOnly aria-label={f("storageBackend")} />
                </FloatingField>
                {fields(["extraConfig"])}
              </div>
            </SectionCard>
            <SectionCard title={f("policySection")} summary={f("policySectionHint")}>
              <div className="grid gap-3 sm:grid-cols-2">{fields(["hostMode", "size", "ratio", "memoryFraction"])}</div>
            </SectionCard>
            <SectionCard title={f("connectionSection")} summary="Mooncake">
              <div className="space-y-3">
                <p className="text-xs leading-relaxed text-muted-foreground">{f("mooncakeSetup")}</p>
                {fields(["master", "metadata"])}
                <div className="grid gap-3 sm:grid-cols-2">{fields(["protocol", "device"])}</div>
                {fields(["segmentSize"])}
              </div>
            </SectionCard>
            <details className="rounded-lg border bg-card p-4">
              <summary className="cursor-pointer text-sm font-medium">{f("advanced")}</summary>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">{fields(["writePolicy", "ioBackend", "layout", "prefetchPolicy", "retryInterval", "retryAttempts"])}</div>
            </details>
          </fieldset>
          <p className="text-xs leading-relaxed text-muted-foreground">{f("verification")}</p>
        </>
      )}
    </div>
  );
}
