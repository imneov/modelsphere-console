import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Checkbox,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type ResourceColumn,
  type ResourceRowAction,
} from "@modelsphere/ui";
import { ShieldCheck } from "lucide-react";
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
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["roles"], queryFn: api.listRoles });
  const [createOpen, setCreateOpen] = useState(false);
  const [membersRole, setMembersRole] = useState<Role | null>(null);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<Role | null>(null);

  const del = useMutation({
    mutationFn: (name: string) => api.deleteRole(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["roles"] }),
  });

  const query = search.trim().toLowerCase();
  const rows = (data?.items ?? []).filter((r) => !query || r.name.toLowerCase().includes(query));

  const columns: ResourceColumn<Role>[] = [
    { key: "name", title: t("roles.table.name"), width: 220, hideable: false, render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "rules", title: t("roles.table.permissions"), render: (r) => <span className="text-muted-foreground">{summarize(t, r.rules)}</span> },
  ];

  const rowActions: ResourceRowAction<Role>[] = [
    { key: "members", label: t("roles.members.action"), onClick: setMembersRole },
    { key: "delete", label: t("common:actions.delete"), danger: true, onClick: setDeleting },
  ];

  return (
    <div className="flex h-full flex-col">
      <PageBanner title={t("roles.title")} icon={<ShieldCheck className="size-5" />} />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
        <ResourceTable<Role>
          height="fill"
          toolbarLayout="inline"
          data={rows}
          loading={isLoading}
          error={error}
          onRetry={() => void refetch()}
          rowKey="name"
          columns={columns}
          showRefresh
          onRefresh={() => qc.invalidateQueries({ queryKey: ["roles"] })}
          rowActions={me?.isAdmin ? rowActions : undefined}
          toolbarLeft={me?.isAdmin ? <Button onClick={() => setCreateOpen(true)}>{t("roles.create")}</Button> : undefined}
          filters={
            <div className="w-52 shrink-0">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("roles.search")} className="w-full" />
            </div>
          }
          activeFilters={query ? [{ key: "search", label: t("roles.table.name"), display: search.trim() }] : []}
          onRemoveFilter={() => setSearch("")}
        />
      </div>
      <CreateRoleDialog open={createOpen} onOpenChange={setCreateOpen} />
      <MembersDialog role={membersRole} onClose={() => setMembersRole(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => {
          if (o) return;
          setDeleting(null);
          del.reset();
        }}
        title={t("roles.delete.title")}
        description={deleting ? t("roles.delete.confirm", { name: deleting.name }) : undefined}
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
    onError: (e) => setErr(e.message),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    create.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t("roles.form.title")}</DialogTitle>
            <DialogDescription>{t("roles.form.description")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="role-name">{t("roles.form.name")}</Label>
              <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("roles.form.resource")}</TableHead>
                    {VERBS.map((v) => (
                      <TableHead key={v} className="text-center">
                        {t(`roles.verbs.${v}`)}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {RESOURCES.map((res) => (
                    <TableRow key={res}>
                      <TableCell>{t(`roles.resources.${res}`)}</TableCell>
                      {VERBS.map((v) => (
                        <TableCell key={v} className="text-center">
                          <Checkbox
                            className="mx-auto"
                            checked={matrix[res]?.has(v) ?? false}
                            onCheckedChange={() => toggle(res, v)}
                            aria-label={`${t(`roles.resources.${res}`)} · ${t(`roles.verbs.${v}`)}`}
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>{t("common:actions.cancel")}</DialogClose>
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("roles.members.title", { role: role?.name ?? "" })}</DialogTitle>
          <DialogDescription>{t("roles.members.description")}</DialogDescription>
        </DialogHeader>
        <div className="max-h-80 space-y-1 overflow-y-auto py-2">
          {users.data?.items.map((u) => (
            <label key={u.name} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent">
              <Checkbox
                checked={boundUsers.has(u.name)}
                onCheckedChange={(checked) => toggle.mutate({ user: u.name, checked })}
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
