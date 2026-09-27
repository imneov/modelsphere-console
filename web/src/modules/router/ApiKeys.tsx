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
import { CopyButton } from "@/modules/playground/components/CopyButton";
import { useModels } from "@/modules/playground/components/ModelSelect";
import { formatTime, keysApi, type ApiKey } from "@/modules/playground/keys";

const EXPIRY_OPTIONS = [
  { days: 7, label: "7 天" },
  { days: 30, label: "1 个月" },
  { days: 180, label: "6 个月" },
  { days: 0, label: "永不过期" },
];

const MAX_MODEL_BADGES = 3;

export function ApiKeys() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["apikeys"], queryFn: keysApi.list });
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteErr, setDeleteErr] = useState("");
  const err = deleteErr || (error as Error | null)?.message;

  const columns: ColumnDef<ApiKey>[] = [
    {
      key: "name",
      title: "名称",
      searchable: true,
      render: (k) => (
        <div className="min-w-0">
          <div className="font-medium">{k.name}</div>
          {k.description && <div className="truncate text-xs text-muted-foreground" title={k.description}>{k.description}</div>}
        </div>
      ),
    },
    { key: "maskedValue", title: "密钥", width: 120, render: (k) => <span className="font-mono text-sm">{k.maskedValue}</span> },
    {
      key: "models",
      title: "可用模型",
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
          <span className="text-muted-foreground">全部模型</span>
        ),
    },
    {
      key: "expiresAt",
      title: "过期时间",
      width: 190,
      render: (k) => (
        <div className="flex items-center gap-2">
          <span>{k.expiresAt ? formatTime(k.expiresAt) : "永不过期"}</span>
          {k.expired && <Badge className="bg-red-100 text-red-800">已过期</Badge>}
        </div>
      ),
    },
    { key: "lastUsedAt", title: "最近使用", width: 160, render: (k) => (k.lastUsedAt ? formatTime(k.lastUsedAt) : <span className="text-muted-foreground">从未使用</span>) },
    { key: "createdBy", title: "创建者", width: 90 },
    { key: "createdAt", title: "创建时间", width: 160, render: (k) => formatTime(k.createdAt) },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="API 密钥"
        icon={<KeyRound className="h-5 w-5" />}
        extra={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            新建 API 密钥
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
        onRefresh={() => qc.invalidateQueries({ queryKey: ["apikeys"] })}
        emptyText="暂无 API 密钥，点击「新建 API 密钥」创建"
        minWidth={900}
        deleteConfig={{
          rowNameKey: "name",
          confirmTitle: "删除 API 密钥",
          confirmText: (k) => `删除「${k.name}」后，使用该密钥的程序将立即无法访问，且无法恢复。`,
          onDelete: async (k) => {
            setDeleteErr("");
            try {
              await keysApi.remove(k.id);
            } catch (e) {
              setDeleteErr((e as Error).message);
            }
            qc.invalidateQueries({ queryKey: ["apikeys"] });
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
    if (created) qc.invalidateQueries({ queryKey: ["apikeys"] });
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
  const models = useModels();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [scope, setScope] = useState<"all" | "some">("all");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [err, setErr] = useState("");

  const create = useMutation({
    mutationFn: () =>
      keysApi.create({
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
      setErr("请至少选择一个模型");
      return;
    }
    create.mutate();
  };

  const modelList = models.data ?? [];
  const canPick = modelList.length > 0;

  return (
    <form onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>新建 API 密钥</DialogTitle>
        <DialogDescription>用于通过 OpenAI 兼容接口调用模型。</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="apikey-name">名称</Label>
          <Input id="apikey-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="apikey-description">描述</Label>
          <Textarea id="apikey-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="可选" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="apikey-expiry">有效期</Label>
          <Select value={String(expiresInDays)} onValueChange={(v) => setExpiresInDays(Number(v))}>
            <SelectTrigger id="apikey-expiry">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPIRY_OPTIONS.map((o) => (
                <SelectItem key={o.days} value={String(o.days)}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="apikey-scope">可用模型</Label>
          <Select value={scope} onValueChange={(v) => setScope(v as "all" | "some")}>
            <SelectTrigger id="apikey-scope">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部模型</SelectItem>
              <SelectItem value="some" disabled={!canPick}>
                指定模型
              </SelectItem>
            </SelectContent>
          </Select>
          {models.isLoading && <p className="text-xs text-muted-foreground">正在加载模型列表…</p>}
          {!models.isLoading && !canPick && (
            <p className="text-xs text-muted-foreground">
              {models.isError ? "模型列表加载失败" : "暂无可用模型"}，只能创建可访问全部模型的密钥。
            </p>
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
          {create.isPending ? "创建中…" : "创建"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function CreatedKey({ apiKey, onDone }: { apiKey: Created; onDone: () => void }) {
  const baseURL = `${window.location.origin}/v1`;
  const example = `curl ${baseURL}/models \\\n  -H "Authorization: Bearer ${apiKey.value}"`;
  return (
    <>
      <DialogHeader>
        <DialogTitle>API 密钥已创建</DialogTitle>
        <DialogDescription>{apiKey.name}</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div className="flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-900">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>请立即复制并妥善保存，关闭后将无法再次查看。</span>
        </div>
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-2">
          <code className="flex-1 break-all font-mono text-sm select-all">{apiKey.value}</code>
          <CopyButton text={apiKey.value} label="复制" />
        </div>
        <div className="space-y-2 text-sm">
          <div className="text-muted-foreground">
            Base URL <code className="font-mono text-foreground">{baseURL}</code>，请求头{" "}
            <code className="font-mono text-foreground">Authorization: Bearer &lt;密钥&gt;</code>
          </div>
          <div className="relative">
            <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 pr-10 font-mono text-xs">{example}</pre>
            <CopyButton text={example} className="absolute right-1 top-1" />
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" onClick={onDone}>
          我已保存
        </Button>
      </DialogFooter>
    </>
  );
}
