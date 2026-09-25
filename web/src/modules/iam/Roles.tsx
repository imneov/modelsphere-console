import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
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
} from "@riseaicloud/ui";
import { Plus, ShieldCheck } from "lucide-react";
import { api, type PolicyRule, type Role } from "@/modules/iam/api";
import { useAuth } from "@/shell";

const IAM_GROUP = "iam.theriseunion.io";

const RESOURCES = [
  { key: "users", label: "用户" },
  { key: "iamroles", label: "角色" },
  { key: "iamrolebindings", label: "角色绑定" },
];
const VERBS = [
  { key: "get", label: "查看" },
  { key: "list", label: "列表" },
  { key: "create", label: "创建" },
  { key: "update", label: "更新" },
  { key: "delete", label: "删除" },
];

function summarize(rules: PolicyRule[] | undefined): string {
  const parts: string[] = [];
  for (const r of rules ?? []) {
    const resources = r.resources ?? [];
    const verbs = r.verbs ?? [];
    const res = resources.length
      ? resources.map((x) => RESOURCES.find((R) => R.key === x)?.label ?? x).join("/")
      : "其他";
    const vs = verbs.includes("*") ? "全部" : verbs.map((v) => VERBS.find((V) => V.key === v)?.label ?? v).join(",");
    parts.push(`${res}: ${vs}`);
  }
  return parts.join(" · ") || "无权限";
}

export function Roles() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["roles"], queryFn: api.listRoles });
  const [createOpen, setCreateOpen] = useState(false);
  const [membersRole, setMembersRole] = useState<Role | null>(null);

  const columns: ColumnDef<Role>[] = [
    { key: "name", title: "名称", searchable: true, width: 220, render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "rules", title: "权限", render: (r) => <span className="text-sm text-muted-foreground">{summarize(r.rules)}</span> },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="角色"
        icon={<ShieldCheck className="h-5 w-5" />}
        extra={
          me?.isAdmin ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              新建角色
            </Button>
          ) : null
        }
      />
      <DataTable<Role>
        data={data?.items ?? []}
        loading={isLoading}
        rowKey="name"
        columns={columns}
        totalItems={data?.items.length ?? 0}
        showRefresh
        onRefresh={() => qc.invalidateQueries({ queryKey: ["roles"] })}
        rowActions={
          me?.isAdmin
            ? [{ label: "成员", onClick: (r) => setMembersRole(r) }]
            : undefined
        }
        deleteConfig={
          me?.isAdmin
            ? {
                rowNameKey: "name",
                confirmTitle: "删除角色",
                onDelete: async (r) => {
                  await api.deleteRole(r.name);
                  qc.invalidateQueries({ queryKey: ["roles"] });
                },
              }
            : undefined
        }
      />
      <CreateRoleDialog open={createOpen} onOpenChange={setCreateOpen} />
      <MembersDialog role={membersRole} onClose={() => setMembersRole(null)} />
    </div>
  );
}

function CreateRoleDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [matrix, setMatrix] = useState<Record<string, Set<string>>>({});
  const [err, setErr] = useState("");

  const toggle = (resource: string, verb: string) => {
    setMatrix((m) => {
      const next = { ...m };
      const set = new Set(next[resource] ?? []);
      set.has(verb) ? set.delete(verb) : set.add(verb);
      next[resource] = set;
      return next;
    });
  };

  const create = useMutation({
    mutationFn: () => {
      const rules: PolicyRule[] = RESOURCES.flatMap(({ key }) => {
        const verbs = [...(matrix[key] ?? [])];
        return verbs.length ? [{ verbs, apiGroups: [IAM_GROUP], resources: [key] }] : [];
      });
      return api.createRole({ name, rules });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roles"] });
      onOpenChange(false);
      setName("");
      setMatrix({});
    },
    onError: (e) => setErr((e as Error).message),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    create.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>新建角色</DialogTitle>
            <DialogDescription>勾选该角色允许的操作。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="role-name">角色名</Label>
              <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-muted-foreground">
                    <th className="p-2 text-left font-normal">资源</th>
                    {VERBS.map((v) => (
                      <th key={v.key} className="p-2 font-normal">
                        {v.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {RESOURCES.map((res) => (
                    <tr key={res.key} className="border-t">
                      <td className="p-2">{res.label}</td>
                      {VERBS.map((v) => (
                        <td key={v.key} className="p-2 text-center">
                          <Checkbox
                            checked={matrix[res.key]?.has(v.key) ?? false}
                            onCheckedChange={() => toggle(res.key, v.key)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
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

// MembersDialog manages which users hold a role, as IAMRoleBindings named
// `<role>--<user>`. Checking a user creates the binding; unchecking deletes it.
function MembersDialog({ role, onClose }: { role: Role | null; onClose: () => void }) {
  const qc = useQueryClient();
  const open = role !== null;
  const users = useQuery({ queryKey: ["users"], queryFn: api.listUsers, enabled: open });
  const bindings = useQuery({ queryKey: ["bindings"], queryFn: api.listBindings, enabled: open });

  const boundUsers = useMemo(() => {
    const set = new Set<string>();
    for (const b of bindings.data?.items ?? []) {
      if (b.role !== role?.name) continue;
      for (const s of b.subjects) if (s.kind === "User") set.add(s.name);
    }
    return set;
  }, [bindings.data, role]);

  const bindingName = (user: string) => `${role?.name}--${user}`;

  const toggle = useMutation({
    mutationFn: async ({ user, checked }: { user: string; checked: boolean }) => {
      if (!role) return;
      if (checked) {
        await api.createBinding({ name: bindingName(user), role: role.name, subjects: [{ kind: "User", name: user }] });
      } else {
        await api.deleteBinding(bindingName(user));
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bindings"] }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{role?.name} · 成员</DialogTitle>
          <DialogDescription>勾选拥有该角色的用户。</DialogDescription>
        </DialogHeader>
        <div className="max-h-80 space-y-1 overflow-y-auto py-2">
          {users.data?.items.map((u) => (
            <label key={u.name} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent">
              <Checkbox
                checked={boundUsers.has(u.name)}
                onCheckedChange={(c) => toggle.mutate({ user: u.name, checked: c === true })}
              />
              <span className="text-sm">{u.displayName || u.name}</span>
              <span className="text-xs text-muted-foreground">{u.name}</span>
            </label>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
