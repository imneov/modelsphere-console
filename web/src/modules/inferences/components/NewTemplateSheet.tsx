import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Alert, AlertDescription, Button, FieldInput, FieldSelect, FieldTextarea, FloatingField, FormSection, Sheet, SheetBody, SheetCancelButton, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, Switch, useDirty } from "@modelsphere/ui";
import { CircleCheck, TriangleAlert } from "lucide-react";
import type { CatalogModel } from "@swiss/lib/api";
import { api } from "@/modules/inferences/catalogApi";
import { useT } from "@/modules/inferences/i18n";
import { checkTemplate, createTemplate, type TemplateResult } from "@/modules/inferences/localTemplatesApi";
import { EMPTY_TEMPLATE, fromTemplateVariant, templateInput, TemplateFormError, type TemplateForm } from "@/modules/inferences/templateForm";

export interface TemplateReference { catalog: string; model: CatalogModel }

export function NewTemplateSheet({ references, onClose, onSaved }: { references: TemplateReference[]; onClose: () => void; onSaved: (result: TemplateResult) => void }) {
  const t = useT();
  const [form, setForm] = useState({ ...EMPTY_TEMPLATE });
  const [reference, setReference] = useState("__none");
  const dirty = useDirty(form, EMPTY_TEMPLATE);
  const check = useMutation({ mutationFn: () => checkTemplate(templateInput(form)) });
  const save = useMutation({ mutationFn: () => createTemplate(templateInput(form)), onSuccess: onSaved });
  const clone = useMutation({
    mutationFn: ({ catalog, model, variant, version }: { catalog: string; model: string; variant: string; version: string }) => api.model(model, { catalog, variant, version }),
    onSuccess: (result) => setForm((previous) => ({ ...previous, ...fromTemplateVariant(result.variant) })),
  });
  const busy = check.isPending || save.isPending || clone.isPending;
  const change = (patch: Partial<TemplateForm>) => { setForm((previous) => ({ ...previous, ...patch })); check.reset(); save.reset(); clone.reset(); };
  const choices = references.flatMap(({ catalog, model }) => model.variants.map((variant) => ({ value: JSON.stringify([catalog, model.name, variant.id, variant.version]), label: `${model.displayName || model.name} · ${variant.id}`, catalog, model: model.name, variant: variant.id, version: variant.version })));
  const error = save.error ?? check.error ?? clone.error;
  const message = error instanceof TemplateFormError ? t(`localTemplates.errors.${error.code}`) : error?.message;

  return (
    <Sheet open onOpenChange={(open) => !open && !busy && onClose()} dirty={dirty && !busy} onDiscard={onClose}>
      <SheetContent size="2xl" className="gap-0">
        <SheetHeader className="border-b px-5 py-3.5"><SheetTitle>{t("localTemplates.createTitle")}</SheetTitle><SheetDescription>{t("localTemplates.createDescription")}</SheetDescription></SheetHeader>
        <SheetBody className="min-h-0 flex-1 space-y-4 overflow-auto bg-surface-page px-5 py-4">
          {error && <Alert variant="destructive"><TriangleAlert /><AlertDescription>{message}</AlertDescription></Alert>}
          {check.data?.valid && <Alert><CircleCheck /><AlertDescription>{t("localTemplates.checked")}</AlertDescription></Alert>}
          <fieldset disabled={busy} className="space-y-4">
            <FloatingField label={t("localTemplates.reference")} hint={t("localTemplates.referenceHint")}>
              <FieldSelect value={reference} onValueChange={(value) => { setReference(value); check.reset(); save.reset(); const selected = choices.find((choice) => choice.value === value); if (selected) clone.mutate(selected); }} options={[{ value: "__none", label: t("localTemplates.noReference") }, ...choices]} />
            </FloatingField>
            {clone.isPending && <p role="status" className="text-sm text-muted-foreground">{t("localTemplates.loadingReference")}</p>}
            <TemplateFields form={form} onChange={change} />
          </fieldset>
        </SheetBody>
        <SheetFooter className="flex-row justify-end border-t">
          <SheetCancelButton disabled={busy} />
          <Button variant="outline" onClick={() => check.mutate()} disabled={busy}>{check.isPending ? t("localTemplates.checking") : t("localTemplates.check")}</Button>
          <Button onClick={() => save.mutate()} disabled={busy}>{save.isPending ? t("localTemplates.saving") : t("localTemplates.save")}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function TemplateFields({ form, onChange }: { form: TemplateForm; onChange: (patch: Partial<TemplateForm>) => void }) {
  const t = useT();
  type TextField = Exclude<keyof TemplateForm, "engine" | "rdma">;
  const input = (key: TextField, required = false, hint?: string) => (
    <FloatingField label={t(`localTemplates.fields.${key}`)} required={required} hint={hint && t(`localTemplates.hints.${hint}`)}>
      <FieldInput value={form[key]} onChange={(event) => onChange({ [key]: key === "gpus" || key === "nodes" ? event.target.value.replace(/\D/g, "") : event.target.value, ...(key === "imageRepository" || key === "imageTag" ? { imageDigest: "" } : {}) })} inputMode={key === "gpus" || key === "nodes" ? "numeric" : undefined} />
    </FloatingField>
  );
  return <>
    <FormSection title={t("localTemplates.sections.model")}><div className="grid gap-3 sm:grid-cols-2">
      {input("name", true, "name")}{input("displayName")}{input("hf", true, "hf")}{input("servedName", false, "servedName")}{input("family")}{input("tags", false, "tags")}
      <FloatingField label={t("localTemplates.fields.description")} multiline className="sm:col-span-2"><FieldTextarea value={form.description} onChange={(event) => onChange({ description: event.target.value })} rows={2} /></FloatingField>
    </div></FormSection>
    <FormSection title={t("localTemplates.sections.recipe")}><div className="grid gap-3 sm:grid-cols-2">
      {input("version", true)}{input("variantId", true)}
      <FloatingField label={t("localTemplates.fields.engine")} required hint={t("localTemplates.hints.engine")}><FieldSelect value={form.engine} onValueChange={(engine) => onChange({ engine: engine as TemplateForm["engine"], chartVersion: "", imageRepository: "", imageTag: "", imageDigest: "" })} options={[{ value: "sglang", label: "SGLang" }, { value: "vllm", label: "vLLM" }]} /></FloatingField>
      {input("chartVersion", true, "chartVersion")}{input("imageRepository", true)}{input("imageTag", true)}{input("imageDigest", false, "imageDigest")}
    </div></FormSection>
    <FormSection title={t("localTemplates.sections.hardware")}><div className="grid gap-3 sm:grid-cols-2">
      {input("gpus", true)}{input("nodes")}{input("minGpuMemoryGiB")}
      <FloatingField label={t("localTemplates.fields.vendor")}><FieldSelect value={form.vendor} onValueChange={(vendor) => onChange({ vendor })} options={[{ value: "nvidia", label: "NVIDIA" }, { value: "amd", label: "AMD" }, { value: "ascend", label: "Ascend" }, { value: "cambricon", label: "Cambricon" }, { value: "hygon", label: "Hygon" }]} /></FloatingField>
      {input("gpuProducts", false, "tags")}
      <FloatingField label={t("localTemplates.fields.topology")} hint={t("localTemplates.hints.topology")}><FieldSelect value={form.topology || "__none"} onValueChange={(topology) => onChange({ topology: topology === "__none" ? "" : topology })} options={[{ value: "__none", label: t("localTemplates.topologyDefault") }, { value: "single-node", label: t("localTemplates.singleNode") }, { value: "lws", label: t("localTemplates.multiNode") }]} /></FloatingField>
      <FloatingField layout="inline" label={t("localTemplates.fields.rdma")}><Switch aria-label={t("localTemplates.fields.rdma")} checked={form.rdma} onCheckedChange={(rdma) => onChange({ rdma })} /></FloatingField>
    </div></FormSection>
    <FormSection title={t("localTemplates.sections.values")}><FloatingField label={t("localTemplates.fields.valuesYAML")} hint={t("localTemplates.hints.values")} multiline><FieldTextarea value={form.valuesYAML} onChange={(event) => onChange({ valuesYAML: event.target.value })} rows={12} spellCheck={false} className="font-mono text-xs" /></FloatingField></FormSection>
  </>;
}
