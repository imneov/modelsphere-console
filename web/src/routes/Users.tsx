import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
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
import { Trash2 } from "lucide-react";
import { api, type UserInput } from "@/lib/api";
import { useAuth } from "@/auth";

export function Users() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["users"], queryFn: api.listUsers });

  const del = useMutation({
    mutationFn: (name: string) => api.deleteUser(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">用户</h1>
        {me?.isAdmin && <CreateUserDialog />}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">加载中…</p>}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

      {data && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>用户名</TableHead>
              <TableHead>显示名</TableHead>
              <TableHead>邮箱</TableHead>
              <TableHead>分组</TableHead>
              <TableHead>状态</TableHead>
              {me?.isAdmin && <TableHead className="w-16" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((u) => (
              <TableRow key={u.name}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell>{u.displayName}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>{u.groups?.join(", ")}</TableCell>
                <TableCell>{u.state || "Active"}</TableCell>
                {me?.isAdmin && (
                  <TableCell>
                    {u.name !== me.name && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => del.mutate(u.name)}
                        title="删除用户"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
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

function CreateUserDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<UserInput>({ name: "", password: "" });
  const [err, setErr] = useState("");

  const create = useMutation({
    mutationFn: (u: UserInput) => api.createUser(u),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      setOpen(false);
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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>新建用户</Button>
      </DialogTrigger>
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
