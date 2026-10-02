import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from "@modelsphere/ui";
import { RotateCcw } from "lucide-react";
import type { ReasoningEffort } from "@/modules/playground/api";
import { useT } from "@/modules/playground/i18n";
import { DEFAULT_FORM, REASONING_EFFORTS, type ParamsForm } from "@/modules/playground/params";

export function ParamsPanel({ form, onChange, idPrefix }: { form: ParamsForm; onChange: (form: ParamsForm) => void; idPrefix: string }) {
  const t = useT();
  const set = <K extends keyof ParamsForm>(key: K, value: ParamsForm[K]) => onChange({ ...form, [key]: value });
  const id = (name: string) => `${idPrefix}-${name}`;
  // The null item is "leave it to the engine"; items gives the trigger its label.
  const efforts = [{ value: null, label: t("params.effortUnset") }, ...REASONING_EFFORTS.filter(Boolean).map((e) => ({ value: e, label: e }))];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={id("system")}>{t("params.system")}</Label>
        <Textarea id={id("system")} rows={4} value={form.system} onChange={(e) => set("system", e.target.value)} placeholder={t("params.systemPlaceholder")} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field id={id("temp")} label="Temperature" value={form.temperature} onChange={(v) => set("temperature", v)} placeholder="0–2" />
        <Field id={id("topp")} label="Top P" value={form.topP} onChange={(v) => set("topP", v)} placeholder="0–1" />
      </div>
      <Field id={id("max")} label={t("params.maxTokens")} value={form.maxTokens} onChange={(v) => set("maxTokens", v)} numeric />

      <details className="group space-y-3">
        <summary className="cursor-pointer select-none text-sm font-medium">{t("params.more")}</summary>
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field id={id("freq")} label="Frequency penalty" value={form.frequencyPenalty} onChange={(v) => set("frequencyPenalty", v)} placeholder="-2–2" />
            <Field id={id("pres")} label="Presence penalty" value={form.presencePenalty} onChange={(v) => set("presencePenalty", v)} placeholder="-2–2" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field id={id("seed")} label="Seed" value={form.seed} onChange={(v) => set("seed", v)} placeholder={t("params.seedPlaceholder")} numeric />
            <div className="space-y-2">
              <Label htmlFor={id("effort")}>Reasoning effort</Label>
              <Select<ReasoningEffort> items={efforts} value={form.reasoningEffort || null} onValueChange={(v) => set("reasoningEffort", v ?? "")}>
                <SelectTrigger id={id("effort")} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {efforts.map((e) => (
                    <SelectItem key={e.label} value={e.value}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor={id("stop")}>Stop</Label>
            <Textarea id={id("stop")} rows={2} value={form.stop} onChange={(e) => set("stop", e.target.value)} placeholder={t("params.stopPlaceholder")} />
          </div>
        </div>
      </details>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{t("params.blankHint")}</p>
        <Button variant="ghost" size="icon-sm" onClick={() => onChange({ ...DEFAULT_FORM, system: form.system })} title={t("params.reset")}>
          <RotateCcw />
        </Button>
      </div>
    </div>
  );
}

function Field({ id, label, value, onChange, placeholder, numeric }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; numeric?: boolean }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} inputMode={numeric ? "numeric" : "decimal"} />
    </div>
  );
}
