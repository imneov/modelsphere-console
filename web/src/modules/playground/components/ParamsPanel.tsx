import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea } from "@riseaicloud/ui";
import { RotateCcw } from "lucide-react";
import type { ReasoningEffort } from "@/modules/playground/api";
import { DEFAULT_FORM, REASONING_EFFORTS, type ParamsForm } from "@/modules/playground/params";

// Radix Select cannot hold "" as an item value.
const UNSET = "unset";

export function ParamsPanel({ form, onChange, idPrefix }: { form: ParamsForm; onChange: (form: ParamsForm) => void; idPrefix: string }) {
  const set = <K extends keyof ParamsForm>(key: K, value: ParamsForm[K]) => onChange({ ...form, [key]: value });
  const id = (name: string) => `${idPrefix}-${name}`;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={id("system")}>系统提示词</Label>
        <Textarea id={id("system")} rows={4} value={form.system} onChange={(e) => set("system", e.target.value)} placeholder="可选。发送时作为 messages 里的 system。" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field id={id("temp")} label="Temperature" value={form.temperature} onChange={(v) => set("temperature", v)} placeholder="0–2" />
        <Field id={id("topp")} label="Top P" value={form.topP} onChange={(v) => set("topP", v)} placeholder="0–1" />
      </div>
      <Field id={id("max")} label="最大输出 tokens" value={form.maxTokens} onChange={(v) => set("maxTokens", v)} numeric />

      <details className="group space-y-3">
        <summary className="cursor-pointer select-none text-sm font-medium">更多参数</summary>
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field id={id("freq")} label="Frequency penalty" value={form.frequencyPenalty} onChange={(v) => set("frequencyPenalty", v)} placeholder="-2–2" />
            <Field id={id("pres")} label="Presence penalty" value={form.presencePenalty} onChange={(v) => set("presencePenalty", v)} placeholder="-2–2" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field id={id("seed")} label="Seed" value={form.seed} onChange={(v) => set("seed", v)} placeholder="随机" numeric />
            <div className="space-y-2">
              <Label htmlFor={id("effort")}>Reasoning effort</Label>
              <Select value={form.reasoningEffort || UNSET} onValueChange={(v) => set("reasoningEffort", (v === UNSET ? "" : v) as ReasoningEffort)}>
                <SelectTrigger id={id("effort")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNSET}>不设置</SelectItem>
                  {REASONING_EFFORTS.filter(Boolean).map((e) => (
                    <SelectItem key={e} value={e}>
                      {e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor={id("stop")}>Stop</Label>
            <Textarea id={id("stop")} rows={2} value={form.stop} onChange={(e) => set("stop", e.target.value)} placeholder="每行一个停止序列" />
          </div>
        </div>
      </details>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">留空的参数不发送，由引擎用自己的默认值。</p>
        <Button variant="ghost" size="sm" onClick={() => onChange({ ...DEFAULT_FORM, system: form.system })} title="恢复默认参数（保留系统提示词）">
          <RotateCcw className="h-3.5 w-3.5" />
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
