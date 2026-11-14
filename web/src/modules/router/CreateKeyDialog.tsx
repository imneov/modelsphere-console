import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  AlertDescription,
  Button,
  Checkbox,
  DataSelect,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from "@modelsphere/ui";
import { TriangleAlert } from "lucide-react";
import { CopyButton, tNodes } from "@/shell";
import {
  api,
  type ApiKey,
  type ApiKeyInput,
  type KeyOwner,
} from "@/modules/router/api";
import { useT } from "@/modules/router/i18n";

type Created = ApiKey & { key: string };
const EXPIRY_OPTIONS = [
  { days: 7, labelKey: "apiKeys.form.expiryOptions.days7" },
  { days: 30, labelKey: "apiKeys.form.expiryOptions.month1" },
  { days: 180, labelKey: "apiKeys.form.expiryOptions.months6" },
  { days: 0, labelKey: "apiKeys.form.expiryOptions.never" },
];
interface KeyDraft {
  name: string;
  description: string;
  ownerUID: string;
  expiresInDays: number;
  scope: "all" | "some";
  models: string[];
}

export function CreateApiKeyDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [created, setCreated] = useState<Created | null>(null);

  const close = () => {
    if (created) qc.invalidateQueries({ queryKey: ["router", "apikeys"] });
    setCreated(null);
    onOpenChange(false);
  };

  return (
    // An outside click must not discard a key that is never shown again.
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close()}
      disablePointerDismissal={created !== null}
    >
      <DialogContent className="sm:max-w-xl [&>*]:min-w-0">
        {created ? (
          <CreatedKey apiKey={created} onDone={close} />
        ) : (
          <CreateForm onCreated={setCreated} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function useCreateForm(onCreated: (key: Created) => void) {
  const t = useT();
  const catalog = useKeyCatalog();
  const [draft, setDraft] = useState<KeyDraft>({
    name: "",
    description: "",
    ownerUID: "",
    expiresInDays: 30,
    scope: "all",
    models: [],
  });
  const [error, setError] = useState("");
  const change = (patch: Partial<KeyDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));
  const create = useMutation({
    mutationFn: api.createKey,
    onSuccess: onCreated,
    onError: (error) => setError(error.message),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (catalog.needsOwner && !draft.ownerUID) {
      setError(t("apiKeys.form.pickOwner"));
      return;
    }
    if (draft.scope === "some" && draft.models.length === 0) {
      setError(t("apiKeys.form.pickModel"));
      return;
    }
    create.mutate(keyInput(draft, catalog.owners.data?.items ?? []));
  };
  return {
    ...catalog,
    draft,
    change,
    error,
    create,
    submit,
  };
}
type KeyForm = ReturnType<typeof useCreateForm>;

function keyInput(draft: KeyDraft, owners: KeyOwner[]): ApiKeyInput {
  return {
    name: draft.name.trim(),
    description: draft.description.trim() || undefined,
    expiresInDays: draft.expiresInDays,
    user: owners.find((owner) => owner.uid === draft.ownerUID)?.name,
    principalUID: draft.ownerUID || undefined,
    models: draft.scope === "some" ? draft.models : undefined,
  };
}

function CreateForm({ onCreated }: { onCreated: (key: Created) => void }) {
  const t = useT();
  const form = useCreateForm(onCreated);
  const disabled =
    form.create.isPending ||
    form.keys.isPending ||
    (form.needsOwner && (!form.draft.ownerUID || form.owners.isPending));
  return (
    <form onSubmit={form.submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>{t("apiKeys.form.title")}</DialogTitle>
        <DialogDescription>{t("apiKeys.form.description")}</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <KeyOwnerPicker form={form} />
        <KeyTextFields form={form} />
        <KeyExpiryPicker form={form} />
        <KeyScopePicker form={form} />
        {form.error && (
          <p role="alert" className="text-sm text-destructive">
            {form.error}
          </p>
        )}
      </div>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>
          {t("common:actions.cancel")}
        </DialogClose>
        <Button type="submit" disabled={disabled}>
          {t(
            form.create.isPending
              ? "apiKeys.form.submitting"
              : "apiKeys.form.submit",
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}

function KeyOwnerPicker({ form }: { form: KeyForm }) {
  const t = useT();
  if (!form.needsOwner) return null;
  const options = (form.owners.data?.items ?? []).map((owner) => ({
    value: owner.uid,
    label: owner.displayName
      ? `${owner.displayName} (${owner.name})`
      : owner.name,
  }));
  return (
    <div className="space-y-2">
      <Label htmlFor="apikey-owner">{t("apiKeys.form.owner")}</Label>
      <DataSelect
        id="apikey-owner"
        value={form.draft.ownerUID}
        onValueChange={(ownerUID) => form.change({ ownerUID })}
        options={options}
      />
      {form.owners.error && (
        <p role="alert" className="text-sm text-destructive">
          {form.owners.error.message}
        </p>
      )}
    </div>
  );
}

function KeyTextFields({ form }: { form: KeyForm }) {
  const t = useT();
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="apikey-name">{t("apiKeys.form.name")}</Label>
        <Input
          id="apikey-name"
          value={form.draft.name}
          onChange={(event) => form.change({ name: event.target.value })}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="apikey-description">
          {t("apiKeys.form.descriptionLabel")}
        </Label>
        <Textarea
          id="apikey-description"
          rows={2}
          value={form.draft.description}
          onChange={(event) => form.change({ description: event.target.value })}
          placeholder={t("apiKeys.form.optional")}
        />
      </div>
    </>
  );
}

function KeyExpiryPicker({ form }: { form: KeyForm }) {
  const t = useT();
  return (
    <div className="space-y-2">
      <Label htmlFor="apikey-expiry">{t("apiKeys.form.expiry")}</Label>
      <DataSelect
        id="apikey-expiry"
        value={String(form.draft.expiresInDays)}
        onValueChange={(value) => form.change({ expiresInDays: Number(value) })}
        options={EXPIRY_OPTIONS.map((option) => ({
          value: String(option.days),
          label: t(option.labelKey),
        }))}
      />
    </div>
  );
}

function KeyScopePicker({ form }: { form: KeyForm }) {
  const t = useT();
  const canPick = Boolean(form.models.data?.length);
  return (
    <div className="space-y-2">
      <Label htmlFor="apikey-scope">{t("apiKeys.form.scope")}</Label>
      <DataSelect
        id="apikey-scope"
        value={form.draft.scope}
        onValueChange={(value) =>
          form.change({ scope: value === "some" ? "some" : "all" })
        }
        options={[
          { value: "all", label: t("apiKeys.form.scopeAll") },
          {
            value: "some",
            label: t("apiKeys.form.scopeSome"),
            disabled: !canPick,
          },
        ]}
      />
      {form.models.isLoading && (
        <p className="text-xs text-muted-foreground">
          {t("apiKeys.form.loadingModels")}
        </p>
      )}
      {!form.models.isLoading && !canPick && (
        <p className="text-xs text-muted-foreground">
          {t(
            form.models.isError
              ? "apiKeys.form.modelsFailed"
              : "apiKeys.form.noModels",
          )}
        </p>
      )}
      {form.draft.scope === "some" && canPick && (
        <ModelCheckboxes form={form} />
      )}
    </div>
  );
}

function ModelCheckboxes({ form }: { form: KeyForm }) {
  const toggle = (model: string, checked: boolean) => {
    const selected = new Set(form.draft.models);
    checked ? selected.add(model) : selected.delete(model);
    form.change({ models: [...selected] });
  };
  return (
    <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-1">
      {(form.models.data ?? []).map((model) => (
        <label
          key={model.id}
          className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent"
        >
          <Checkbox
            checked={form.draft.models.includes(model.id)}
            onCheckedChange={(checked) => toggle(model.id, checked)}
          />
          <span className="font-mono text-sm">{model.id}</span>
        </label>
      ))}
    </div>
  );
}

function CreatedKey({
  apiKey,
  onDone,
}: {
  apiKey: Created;
  onDone: () => void;
}) {
  const t = useT();
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("apiKeys.created.title")}</DialogTitle>
        <DialogDescription>{apiKey.name}</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <Alert variant="warning">
          <TriangleAlert />
          <AlertDescription>{t("apiKeys.created.warning")}</AlertDescription>
        </Alert>
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2">
          <code className="flex-1 break-all font-mono text-sm select-all">
            {apiKey.key}
          </code>
          <CopyButton text={apiKey.key} label={t("common:actions.copy")} />
        </div>
        <KeyUsage apiKey={apiKey} />
      </div>
      <DialogFooter>
        <Button type="button" onClick={onDone}>
          {t("apiKeys.created.done")}
        </Button>
      </DialogFooter>
    </>
  );
}

function useKeyCatalog() {
  const models = useQuery({
    queryKey: ["router", "models"],
    queryFn: api.models,
    retry: false,
  });
  const keys = useQuery({
    queryKey: ["router", "apikeys"],
    queryFn: api.listKeys,
  });
  const needsOwner = keys.data?.keySource === "crd";
  const owners = useQuery({
    queryKey: ["router", "owners"],
    queryFn: api.owners,
    enabled: needsOwner,
  });
  return { models, keys, needsOwner, owners };
}

function KeyUsage({ apiKey }: { apiKey: Created }) {
  const t = useT();
  const baseURL = `${window.location.origin}/v1`;
  const example = `curl ${baseURL}/models \\\n  -H "Authorization: Bearer ${apiKey.key}"`;
  return (
    <div className="space-y-2 text-sm">
      <div className="text-muted-foreground">
        {tNodes(t, "apiKeys.created.usage", {
          baseURL: <code className="font-mono text-foreground">{baseURL}</code>,
          header: (
            <code className="font-mono text-foreground">
              Authorization: Bearer &lt;
              {t("apiKeys.created.keyPlaceholder")}&gt;
            </code>
          ),
        })}
      </div>
      <div className="relative">
        <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 pr-10 font-mono text-xs">
          {example}
        </pre>
        <CopyButton text={example} className="absolute right-1 top-1" />
      </div>
    </div>
  );
}
