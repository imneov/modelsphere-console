import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  PageBanner,
  ResourceTable,
  type ResourceColumn,
  type ResourceRowAction,
} from "@modelsphere/ui";
import { Users as UsersIcon } from "lucide-react";
import { api, type User, type UserInput } from "@/modules/iam/api";
import { useAuth } from "@/shell";
import { useT } from "@/modules/iam/i18n";

const stateBadge: Record<string, { labelKey: string; variant: "success" | "secondary" | "warning" }> = {
  Active: { labelKey: "users.state.active", variant: "success" },
  Disabled: { labelKey: "users.state.disabled", variant: "secondary" },
  Pending: { labelKey: "users.state.pending", variant: "warning" },
};

export function Users() {
  const t = useT();
  const { me } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["users"], queryFn: api.listUsers });
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<User | null>(null);

  const del = useMutation({
    mutationFn: (name: string) => api.deleteUser(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  const query = search.trim().toLowerCase();
  const rows = (data?.items ?? []).filter((u) => !query || u.name.toLowerCase().includes(query));

  const columns: ResourceColumn<User>[] = [
    { key: "name", title: t("users.table.name"), hideable: false, render: (u) => <span className="font-medium">{u.name}</span> },
    { key: "displayName", title: t("users.table.displayName"), render: (u) => u.displayName || "-" },
    { key: "email", title: t("users.table.email"), render: (u) => <span className="text-muted-foreground">{u.email || "-"}</span> },
    { key: "groups", title: t("users.table.groups"), render: (u) => (u.groups?.length ? u.groups.join(", ") : "-") },
    {
      key: "state",
      title: t("users.table.state"),
      width: 100,
      align: "center",
      render: (u) => {
        const s = stateBadge[u.state || "Active"] ?? stateBadge.Active;
        return <Badge variant={s.variant}>{t(s.labelKey)}</Badge>;
      },
    },
  ];

  const rowActions: ResourceRowAction<User>[] = [
    {
      key: "delete",
      label: t("common:actions.delete"),
      danger: true,
      disabled: (u) => (u.name === me?.name ? t("users.delete.self") : false),
      onClick: setDeleting,
    },
  ];

  return (
    <div className="flex h-full flex-col">
      <PageBanner title={t("users.title")} icon={<UsersIcon className="size-5" />} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
        <ResourceTable<User>
          height="fill"
          toolbarLayout="inline"
          data={rows}
          loading={isLoading}
          error={error}
          onRetry={() => void refetch()}
          rowKey="name"
          columns={columns}
          showRefresh
          onRefresh={() => qc.invalidateQueries({ queryKey: ["users"] })}
          rowActions={me?.isAdmin ? rowActions : undefined}
          toolbarLeft={me?.isAdmin ? <Button onClick={() => setCreateOpen(true)}>{t("users.create")}</Button> : undefined}
          filters={
            <div className="w-52 shrink-0">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("users.search")} className="w-full" />
            </div>
          }
          activeFilters={query ? [{ key: "search", label: t("users.table.name"), display: search.trim() }] : []}
          onRemoveFilter={() => setSearch("")}
        />
      </div>
      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (o) return;
          setDeleting(null);
          del.reset();
        }}
        title={t("users.delete.title")}
        description={deleting ? t("users.delete.confirm", { name: deleting.name }) : undefined}
        action={t("common:actions.delete")}
        tone="destructive"
        items={deleting ? [deleting.name] : []}
        error={del.error?.message}
        loading={del.isPending}
        onConfirm={async () => {
          if (deleting) await del.mutateAsync(deleting.name);
        }}
      />
    </div>
  );
}

function CreateUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT();
  const qc = useQueryClient();
  const [form, setForm] = useState<UserInput>({ name: "", password: "" });
  const [err, setErr] = useState("");

  const create = useMutation({
    mutationFn: (u: UserInput) => api.createUser(u),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      onOpenChange(false);
      setForm({ name: "", password: "" });
    },
    onError: (e) => setErr(e.message),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    create.mutate(form);
  };
  const set = (k: keyof UserInput) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t("users.form.title")}</DialogTitle>
            <DialogDescription>{t("users.form.description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t("users.form.name")}</Label>
              <Input id="name" value={form.name} onChange={set("name")} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayName">{t("users.form.displayName")}</Label>
              <Input id="displayName" value={form.displayName ?? ""} onChange={set("displayName")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t("users.form.email")}</Label>
              <Input id="email" type="email" value={form.email ?? ""} onChange={set("email")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("users.form.password")}</Label>
              <Input id="password" type="password" value={form.password ?? ""} onChange={set("password")} required />
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>{t("common:actions.cancel")}</DialogClose>
            <Button type="submit" disabled={create.isPending}>
              {t(create.isPending ? "users.form.submitting" : "users.form.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
