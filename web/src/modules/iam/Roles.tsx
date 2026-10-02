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
import { useAuth, type TFn } from "@/shell";
import { useT } from "@/modules/iam/i18n";

const IAM_GROUP = "iam.theriseunion.io";

const RESOURCES = ["users", "iamroles", "iamrolebindings"];
const VERBS = ["get", "list", "create", "update", "delete"];

function summarize(t: TFn, rules: PolicyRule[] | undefined): string {
  const parts: string[] = [];
  for (const r of rules ?? []) {
    const resources = r.resources ?? [];
    const verbs = r.verbs ?? [];
    const res = resources.length
      ? resources.map((x) => (RESOURCES.includes(x) ? t(`roles.resources.${x}`) : x)).join("/")
      : t("roles.summary.other");
    const vs = verbs.includes("*")
      ? t("roles.summary.allVerbs")
      : verbs.map((v) => (VERBS.includes(v) ? t(`roles.verbs.${v}`) : v)).join(", ");
    parts.push(`${res}: ${vs}`);
  }
  return parts.join(" · ") || t("roles.summary.none");
}

export function Roles() {
  const t = useT();
  const { me } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["roles"], queryFn: api.listRoles });
  const [createOpen, setCreateOpen] = useState(false);
  const [membersRole, setMembersRole] = useState<Role | null>(null);

  const columns: ColumnDef<Role>[] = [
    { key: "name", title: t("roles.table.name"), searchable: true, width: 220, render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "rules", title: t("roles.table.permissions"), render: (r) => <span className="text-sm text-muted-foreground">{summarize(t, r.rules)}</span> },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("roles.title")}
        icon={<ShieldCheck className="h-5 w-5" />}
        extra={
          me?.isAdmin ? (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              {t("roles.create")}
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
            ? [{ label: t("roles.members.action"), onClick: (r) => setMembersRole(r) }]
            : undefined
        }
        deleteConfig={
          me?.isAdmin
            ? {
                rowNameKey: "name",
                confirmTitle: t("roles.delete.title"),
                buttonText: t("common:actions.delete"),
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
  const t = useT();
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
      const rules: PolicyRule[] = RESOURCES.flatMap((key) => {
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
            <DialogTitle>{t("roles.form.title")}</DialogTitle>
            <DialogDescription>{t("roles.form.description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="role-name">{t("roles.form.name")}</Label>
              <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-muted-foreground">
                    <th className="p-2 text-left font-normal">{t("roles.form.resource")}</th>
                    {VERBS.map((v) => (
                      <th key={v} className="p-2 font-normal">
                        {t(`roles.verbs.${v}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {RESOURCES.map((res) => (
                    <tr key={res} className="border-t">
                      <td className="p-2">{t(`roles.resources.${res}`)}</td>
                      {VERBS.map((v) => (
                        <td key={v} className="p-2 text-center">
                          <Checkbox
                            checked={matrix[res]?.has(v) ?? false}
                            onCheckedChange={() => toggle(res, v)}
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
              {t(create.isPending ? "roles.form.submitting" : "roles.form.submit")}
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
  const t = useT();
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
          <DialogTitle>{t("roles.members.title", { role: role?.name ?? "" })}</DialogTitle>
          <DialogDescription>{t("roles.members.description")}</DialogDescription>
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
