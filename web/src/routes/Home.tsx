import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, PageHeader } from "@riseaicloud/ui";
import { LayoutDashboard, ShieldCheck, Users as UsersIcon } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/auth";

function Stat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="rounded-lg bg-primary/10 p-3 text-primary">
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <div className="text-2xl font-semibold">{value}</div>
          <div className="text-sm text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export function Home() {
  const { me } = useAuth();
  const users = useQuery({ queryKey: ["users"], queryFn: api.listUsers });
  const roles = useQuery({ queryKey: ["roles"], queryFn: api.listRoles });

  return (
    <div className="space-y-6">
      <PageHeader title="概览" icon={<LayoutDashboard className="h-5 w-5" />} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat icon={UsersIcon} label="用户" value={users.data?.items.length ?? "—"} />
        <Stat icon={ShieldCheck} label="角色" value={roles.data?.items.length ?? "—"} />
      </div>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="text-base">当前会话</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div>
            <span className="text-muted-foreground">用户：</span>
            {me?.name}
          </div>
          {me?.email && (
            <div>
              <span className="text-muted-foreground">邮箱：</span>
              {me.email}
            </div>
          )}
          <div>
            <span className="text-muted-foreground">分组：</span>
            {me?.groups?.join(", ")}
          </div>
          <div>
            <span className="text-muted-foreground">角色：</span>
            {me?.isAdmin ? "管理员" : "普通用户"}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
