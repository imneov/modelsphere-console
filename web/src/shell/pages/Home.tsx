import { Card, CardContent, CardHeader, CardTitle, PageHeader } from "@riseaicloud/ui";
import { LayoutDashboard } from "lucide-react";
import { useAuth } from "@/shell/auth";
import { ModuleProvider, type ConsoleModule } from "@/shell/module";

export function Home({ modules }: { modules: ConsoleModule[] }) {
  const { me } = useAuth();

  return (
    <div className="space-y-6">
      <PageHeader title="概览" icon={<LayoutDashboard className="h-5 w-5" />} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((m) => {
          const Overview = m.overview;
          return Overview ? (
            <ModuleProvider key={m.id} module={m}>
              <Overview />
            </ModuleProvider>
          ) : null;
        })}
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
