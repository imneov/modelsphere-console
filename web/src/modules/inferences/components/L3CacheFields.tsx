import { FieldInput, FieldSelect, FieldTextarea, FloatingField, Switch } from "@modelsphere/ui";
import { useT } from "../i18n";
import { L3_BACKENDS, L3_FIELDS, l3Supported, type L3FieldName, type L3Patch, type L3Settings } from "../l3-cache";

export function L3CacheFields({ settings, onChange, chart, engine, localEnabled = false }: {
  settings: L3Settings;
  onChange: (patch: L3Patch) => void;
  chart: { name?: string; version?: string };
  engine?: string;
  localEnabled?: boolean;
}) {
  const t = useT();
  const f = (key: string) => t(`deploy.l3.${key}`);
  const supported = l3Supported(chart, engine);
  const fields = (names: L3FieldName[]) => names.map((name) => {
    const definition = L3_FIELDS[name];
    const choices = "choices" in definition ? definition.choices : undefined;
    return <FloatingField key={name} label={f(name)} hint={f(`${name}Hint`)} multiline={name === "extraConfig"}>
      {choices ? <FieldSelect value={settings[name] || "__default"} onValueChange={(value) => onChange({ [name]: value === "__default" ? "" : value })}
        options={[{ value: "__default", label: f("engineDefault") }, ...choices.map((value) => ({ value, label: value }))]} aria-label={f(name)} />
        : name === "extraConfig" ? <FieldTextarea value={settings[name]} onChange={(event) => onChange({ [name]: event.target.value })} rows={3} spellCheck={false} className="font-mono text-xs" aria-label={f(name)} />
        : <FieldInput value={settings[name]} onChange={(event) => onChange({ [name]: event.target.value })} inputMode={"number" in definition ? "decimal" : undefined} aria-label={f(name)} />}
    </FloatingField>;
  });
  return <FloatingField layout="inline" label={f("title")} hint={f("hint")}
    description={!supported ? f(chart.name === "vllm" ? "vllmUnsupported" : "unsupported") : f("requirements")}
    expanded={settings.enabled}
    expandedContent={settings.enabled ? <fieldset disabled={!supported} className="min-w-0 space-y-3 pb-3">
      {localEnabled && <p role="alert" className="text-sm text-destructive">{f("errors.localConflict")}</p>}
      <FloatingField label={f("storageBackend")} required hint={f("storageBackendHint")}>
        <FieldSelect value={settings.storageBackend || "__choose"} onValueChange={(value) => onChange({ storageBackend: value === "__choose" ? "" : value })}
          options={[{ value: "__choose", label: f("chooseBackend") }, ...L3_BACKENDS.map((value) => ({ value, label: value === "sim" ? f("simulation") : value }))]} aria-label={f("storageBackend")} />
      </FloatingField>
      <div className="grid grid-cols-2 gap-3">{fields(["hostMode", "size", "ratio", "memoryFraction"])}</div>
      {fields(["extraConfig"])}
      {settings.storageBackend === "mooncake" && <div className="space-y-3 rounded-lg border bg-background p-3">
        <p className="text-sm font-medium">Mooncake</p>
        <p className="text-xs text-muted-foreground">{f("mooncakeSetup")}</p>
        {fields(["master", "metadata"])}
        <div className="grid grid-cols-2 gap-3">{fields(["protocol", "device"])}</div>
        {fields(["segmentSize"])}
      </div>}
      <details className="rounded-lg border bg-background p-3">
        <summary className="cursor-pointer text-sm font-medium">{f("advanced")}</summary>
        <div className="mt-3 grid grid-cols-2 gap-3">{fields(["writePolicy", "ioBackend", "layout", "prefetchPolicy", "retryInterval", "retryAttempts"])}</div>
      </details>
      <p className="text-xs text-muted-foreground">{f("verification")}</p>
    </fieldset> : undefined}>
    <Switch aria-label={f("title")} checked={settings.enabled} disabled={!supported && !settings.enabled} onCheckedChange={(enabled) => onChange({ enabled })} />
  </FloatingField>;
}
