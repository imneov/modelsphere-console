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

const stateBadge: Record<string, { label: string; className: string }> = {
  Active: { label: "活跃", className: "bg-green-100 text-green-800" },
  Disabled: { label: "禁用", className: "bg-gray-100 text-gray-800" },
  Pending: { label: "待激活", className: "bg-yellow-100 text-yellow-800" },
};

export function Users() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["users"], queryFn: api.listUsers });
  const [createOpen, setCreateOpen] = useState(false);

  const columns: ColumnDef<User>[] = [
    { key: "name", title: "用户名", searchable: true, render: (u) => <span className="font-medium">{u.name}</span> },
    { key: "displayName", title: "显示名", render: (u) => u.displayName || "-" },
    { key: "email", title: "邮箱", render: (u) => u.email || "-" },
    { key: "groups", title: "分组", render: (u) => (u.groups?.length ? u.groups.join(", ") : "-") },
    {
      key: "state",
      title: "状态",
      width: 100,
      render: (u) => {
        const s = stateBadge[u.state || "Active"] ?? stateBadge.Active;
        return <Badge className={s.className}>{s.label}</Badge>;
      },
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="用户"
        icon={<UsersIcon className="h-5 w-5" />}
        extra={
          me?.isAdmin ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              新建用户
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
                confirmTitle: "删除用户",
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
            <DialogTitle>新建用户</DialogTitle>
            <DialogDescription>创建一个可登录的平台用户。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">用户名</Label>
              <Input id="name" value={form.name} onChange={set("name")} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayName">显示名</Label>
              <Input id="displayName" value={form.displayName ?? ""} onChange={set("displayName")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input id="email" type="email" value={form.email ?? ""} onChange={set("email")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <Input id="password" type="password" value={form.password ?? ""} onChange={set("password")} required />
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "创建中…" : "创建"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
