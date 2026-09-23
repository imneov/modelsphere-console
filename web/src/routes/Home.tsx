import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@riseaicloud/ui";
import { useAuth } from "@/auth";

export function Home() {
  const { me } = useAuth();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">概览</h1>
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>已登录</CardTitle>
          <CardDescription>当前会话信息</CardDescription>
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
