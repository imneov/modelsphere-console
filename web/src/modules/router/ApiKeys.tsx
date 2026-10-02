import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  Checkbox,
  type ColumnDef,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@riseaicloud/ui";
import { KeyRound, Plus, TriangleAlert } from "lucide-react";
import { CopyButton, formatDateTime, tNodes } from "@/shell";
import { api, type ApiKey } from "@/modules/router/api";
import { useT } from "@/modules/router/i18n";

const EXPIRY_OPTIONS = [
  { days: 7, labelKey: "apiKeys.form.expiryOptions.days7" },
  { days: 30, labelKey: "apiKeys.form.expiryOptions.month1" },
  { days: 180, labelKey: "apiKeys.form.expiryOptions.months6" },
  { days: 0, labelKey: "apiKeys.form.expiryOptions.never" },
];

const MAX_MODEL_BADGES = 3;

export function ApiKeys() {
  const t = useT();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["router", "apikeys"], queryFn: api.listKeys });
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteErr, setDeleteErr] = useState("");
  const err = deleteErr || (error as Error | null)?.message;

  const columns: ColumnDef<ApiKey>[] = [
    {
      key: "name",
      title: t("apiKeys.table.name"),
      searchable: true,
      render: (k) => (
        <div className="min-w-0">
          <div className="font-medium">{k.name}</div>
          {k.description && <div className="truncate text-xs text-muted-foreground" title={k.description}>{k.description}</div>}
        </div>
      ),
    },
    { key: "maskedValue", title: t("apiKeys.table.key"), width: 120, render: (k) => <span className="font-mono text-sm">{k.maskedValue}</span> },
    {
      key: "models",
      title: t("apiKeys.table.models"),
      render: (k) =>
        k.models?.length ? (
          <div className="flex flex-wrap gap-1" title={k.models.join("\n")}>
            {k.models.slice(0, MAX_MODEL_BADGES).map((m) => (
              <Badge key={m} variant="secondary" className="font-normal">
                {m}
              </Badge>
            ))}
            {k.models.length > MAX_MODEL_BADGES && <Badge variant="outline">+{k.models.length - MAX_MODEL_BADGES}</Badge>}
          </div>
        ) : (
          <span className="text-muted-foreground">{t("apiKeys.allModels")}</span>
        ),
    },
    {
      key: "expiresAt",
      title: t("apiKeys.table.expiresAt"),
      width: 190,
      render: (k) => (
        <div className="flex items-center gap-2">
          <span>{k.expiresAt ? formatDateTime(k.expiresAt) : t("apiKeys.neverExpires")}</span>
          {k.expired && <Badge className="bg-red-100 text-red-800">{t("apiKeys.expired")}</Badge>}
        </div>
      ),
    },
    { key: "createdBy", title: t("apiKeys.table.createdBy"), width: 90 },
    { key: "createdAt", title: t("apiKeys.table.createdAt"), width: 160, render: (k) => formatDateTime(k.createdAt) },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("apiKeys.title")}
        icon={<KeyRound className="h-5 w-5" />}
        extra={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            {t("apiKeys.create")}
          </Button>
        }
      />
      {err && <p className="text-sm text-destructive">{err}</p>}
      <DataTable<ApiKey>
        data={data?.items ?? []}
        loading={isLoading}
        rowKey="id"
        columns={columns}
        totalItems={data?.items.length ?? 0}
        showRefresh
        onRefresh={() => qc.invalidateQueries({ queryKey: ["router", "apikeys"] })}
        emptyText={t("apiKeys.empty")}
        minWidth={900}
        deleteConfig={{
          rowNameKey: "name",
          buttonText: t("common:actions.delete"),
          confirmTitle: t("apiKeys.delete.title"),
          confirmText: (k) => t("apiKeys.delete.confirm", { name: k.name }),
          onDelete: async (k) => {
            setDeleteErr("");
            try {
              await api.deleteKey(k.id);
            } catch (e) {
              setDeleteErr((e as Error).message);
            }
            qc.invalidateQueries({ queryKey: ["router", "apikeys"] });
          },
        }}
      />
      <CreateApiKeyDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

type Created = ApiKey & { value: string };

function CreateApiKeyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [created, setCreated] = useState<Created | null>(null);

  const close = () => {
    if (created) qc.invalidateQueries({ queryKey: ["router", "apikeys"] });
    setCreated(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      {/* An outside click must not discard a key that is never shown again. */}
      <DialogContent className="max-w-xl [&>*]:min-w-0" onInteractOutside={(e) => created && e.preventDefault()}>
        {created ? <CreatedKey apiKey={created} onDone={close} /> : <CreateForm onCreated={setCreated} />}
      </DialogContent>
    </Dialog>
  );
}

function CreateForm({ onCreated }: { onCreated: (k: Created) => void }) {
  const t = useT();
  const models = useQuery({ queryKey: ["router", "models"], queryFn: api.models, retry: false });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [scope, setScope] = useState<"all" | "some">("all");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [err, setErr] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api.createKey({
        name: name.trim(),
        description: description.trim() || undefined,
        expiresInDays,
        models: scope === "some" ? [...picked] : undefined,
      }),
    onSuccess: onCreated,
    onError: (e) => setErr((e as Error).message),
  });

  const toggle = (id: string, checked: boolean) =>
    setPicked((s) => {
      const next = new Set(s);
      checked ? next.add(id) : next.delete(id);
      return next;
    });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    if (scope === "some" && picked.size === 0) {
      setErr(t("apiKeys.form.pickModel"));
      return;
    }
    create.mutate();
  };

  const modelList = models.data ?? [];
  const canPick = modelList.length > 0;

  return (
    <form onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>{t("apiKeys.form.title")}</DialogTitle>
        <DialogDescription>{t("apiKeys.form.description")}</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="apikey-name">{t("apiKeys.form.name")}</Label>
          <Input id="apikey-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="apikey-description">{t("apiKeys.form.descriptionLabel")}</Label>
          <Textarea id="apikey-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("apiKeys.form.optional")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="apikey-expiry">{t("apiKeys.form.expiry")}</Label>
          <Select value={String(expiresInDays)} onValueChange={(v) => setExpiresInDays(Number(v))}>
            <SelectTrigger id="apikey-expiry">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPIRY_OPTIONS.map((o) => (
                <SelectItem key={o.days} value={String(o.days)}>
                  {t(o.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="apikey-scope">{t("apiKeys.form.scope")}</Label>
          <Select value={scope} onValueChange={(v) => setScope(v as "all" | "some")}>
            <SelectTrigger id="apikey-scope">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("apiKeys.form.scopeAll")}</SelectItem>
              <SelectItem value="some" disabled={!canPick}>
                {t("apiKeys.form.scopeSome")}
              </SelectItem>
            </SelectContent>
          </Select>
          {models.isLoading && <p className="text-xs text-muted-foreground">{t("apiKeys.form.loadingModels")}</p>}
          {!models.isLoading && !canPick && (
            <p className="text-xs text-muted-foreground">{t(models.isError ? "apiKeys.form.modelsFailed" : "apiKeys.form.noModels")}</p>
          )}
          {scope === "some" && canPick && (
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-1">
              {modelList.map((m) => (
                <label key={m.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent">
                  <Checkbox checked={picked.has(m.id)} onCheckedChange={(c) => toggle(m.id, c === true)} />
                  <span className="font-mono text-sm">{m.id}</span>
                </label>
              ))}
            </div>
          )}
        </div>
        {err && <p className="text-sm text-destructive">{err}</p>}
      </div>
      <DialogFooter>
        <Button type="submit" disabled={create.isPending}>
          {t(create.isPending ? "apiKeys.form.submitting" : "apiKeys.form.submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}

function CreatedKey({ apiKey, onDone }: { apiKey: Created; onDone: () => void }) {
  const t = useT();
  const baseURL = `${window.location.origin}/v1`;
  const example = `curl ${baseURL}/models \\\n  -H "Authorization: Bearer ${apiKey.value}"`;
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("apiKeys.created.title")}</DialogTitle>
        <DialogDescription>{apiKey.name}</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div className="flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t("apiKeys.created.warning")}</span>
        </div>
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2">
          <code className="flex-1 break-all font-mono text-sm select-all">{apiKey.value}</code>
          <CopyButton text={apiKey.value} label={t("common:actions.copy")} />
        </div>
        <div className="space-y-2 text-sm">
          <div className="text-muted-foreground">
            {tNodes(t, "apiKeys.created.usage", {
              baseURL: <code className="font-mono text-foreground">{baseURL}</code>,
              header: <code className="font-mono text-foreground">Authorization: Bearer &lt;{t("apiKeys.created.keyPlaceholder")}&gt;</code>,
            })}
          </div>
          <div className="relative">
            <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 pr-10 font-mono text-xs">{example}</pre>
            <CopyButton text={example} className="absolute right-1 top-1" />
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" onClick={onDone}>
          {t("apiKeys.created.done")}
        </Button>
      </DialogFooter>
    </>
  );
}
