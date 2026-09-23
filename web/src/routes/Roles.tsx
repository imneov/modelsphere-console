import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@riseaicloud/ui";
import { Trash2, Users as UsersIcon } from "lucide-react";
import { api, type PolicyRule, type Role } from "@/lib/api";
import { useAuth } from "@/auth";

const IAM_GROUP = "iam.theriseunion.io";

// The resources and verbs the console's RBAC covers. The permission editor is a
// matrix over these; each checked (resource, verbs) row becomes one PolicyRule.
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
  const { data, isLoading, error } = useQuery({ queryKey: ["roles"], queryFn: api.listRoles });
  const del = useMutation({
    mutationFn: (name: string) => api.deleteRole(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roles"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">角色</h1>
        {me?.isAdmin && <CreateRoleDialog />}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">加载中…</p>}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

      {data && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>权限</TableHead>
              {me?.isAdmin && <TableHead className="w-28" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((role) => (
              <TableRow key={role.name}>
                <TableCell className="font-medium">{role.name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{summarize(role.rules)}</TableCell>
                {me?.isAdmin && (
                  <TableCell className="flex items-center gap-1">
                    <MembersDialog role={role} />
                    <Button variant="ghost" size="icon" onClick={() => del.mutate(role.name)} title="删除角色">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function CreateRoleDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
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
      setOpen(false);
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>新建角色</Button>
      </DialogTrigger>
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="p-2 text-left">资源</th>
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
function MembersDialog({ role }: { role: Role }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const users = useQuery({ queryKey: ["users"], queryFn: api.listUsers, enabled: open });
  const bindings = useQuery({ queryKey: ["bindings"], queryFn: api.listBindings, enabled: open });

  const boundUsers = useMemo(() => {
    const set = new Set<string>();
    for (const b of bindings.data?.items ?? []) {
      if (b.role !== role.name) continue;
      for (const s of b.subjects) if (s.kind === "User") set.add(s.name);
    }
    return set;
  }, [bindings.data, role.name]);

  const bindingName = (user: string) => `${role.name}--${user}`;

  const toggle = useMutation({
    mutationFn: async ({ user, checked }: { user: string; checked: boolean }) => {
      if (checked) {
        await api.createBinding({ name: bindingName(user), role: role.name, subjects: [{ kind: "User", name: user }] });
      } else {
        await api.deleteBinding(bindingName(user));
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bindings"] }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="成员">
          <UsersIcon className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{role.name} · 成员</DialogTitle>
          <DialogDescription>勾选拥有该角色的用户。</DialogDescription>
        </DialogHeader>
        <div className="max-h-80 space-y-2 overflow-y-auto py-2">
          {users.data?.items.map((u) => (
            <label key={u.name} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent/50">
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
