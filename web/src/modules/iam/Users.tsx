import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
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
} from "@riseaicloud/ui";
import { Plus, Users as UsersIcon } from "lucide-react";
import { api, type User, type UserInput } from "@/modules/iam/api";
import { useAuth } from "@/shell";
import { useT } from "@/modules/iam/i18n";

const stateBadge: Record<string, { labelKey: string; className: string }> = {
  Active: { labelKey: "users.state.active", className: "bg-green-100 text-green-800" },
  Disabled: { labelKey: "users.state.disabled", className: "bg-gray-100 text-gray-800" },
  Pending: { labelKey: "users.state.pending", className: "bg-yellow-100 text-yellow-800" },
};

export function Users() {
  const t = useT();
  const { me } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["users"], queryFn: api.listUsers });
  const [createOpen, setCreateOpen] = useState(false);

  const columns: ColumnDef<User>[] = [
    { key: "name", title: t("users.table.name"), searchable: true, render: (u) => <span className="font-medium">{u.name}</span> },
    { key: "displayName", title: t("users.table.displayName"), render: (u) => u.displayName || "-" },
    { key: "email", title: t("users.table.email"), render: (u) => u.email || "-" },
    { key: "groups", title: t("users.table.groups"), render: (u) => (u.groups?.length ? u.groups.join(", ") : "-") },
    {
      key: "state",
      title: t("users.table.state"),
      width: 100,
      render: (u) => {
        const s = stateBadge[u.state || "Active"] ?? stateBadge.Active;
        return <Badge className={s.className}>{t(s.labelKey)}</Badge>;
      },
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("users.title")}
        icon={<UsersIcon className="h-5 w-5" />}
        extra={
          me?.isAdmin ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              {t("users.create")}
            </Button>
          ) : null
        }
      />
      <DataTable<User>
        data={data?.items ?? []}
        loading={isLoading}
        rowKey="name"
        columns={columns}
        totalItems={data?.items.length ?? 0}
        showRefresh
        onRefresh={() => qc.invalidateQueries({ queryKey: ["users"] })}
        deleteConfig={
          me?.isAdmin
            ? {
                rowNameKey: "name",
                confirmTitle: t("users.delete.title"),
                buttonText: t("common:actions.delete"),
                hidden: (u) => u.name === me?.name,
                onDelete: async (u) => {
                  await api.deleteUser(u.name);
                  qc.invalidateQueries({ queryKey: ["users"] });
                },
              }
            : undefined
        }
      />
      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />
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
    onError: (e) => setErr((e as Error).message),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    create.mutate(form);
  };
  const set = (k: keyof UserInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{t("users.form.title")}</DialogTitle>
            <DialogDescription>{t("users.form.description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
            <Button type="submit" disabled={create.isPending}>
              {t(create.isPending ? "users.form.submitting" : "users.form.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
