import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import {
  Avatar,
  AvatarFallback,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@riseaicloud/ui";
import { LogOut, Users as UsersIcon, LayoutDashboard, ShieldCheck, Boxes, History } from "lucide-react";
import { useAuth } from "@/auth";
import { usePermissions } from "@/permissions";

const nav = [
  { to: "/", label: "概览", icon: LayoutDashboard, end: true },
  { to: "/users", label: "用户", icon: UsersIcon, end: false, permission: "users.view" },
  { to: "/login-history", label: "登录历史", icon: History, end: false, permission: "loginrecords.view" },
  { to: "/roles", label: "角色", icon: ShieldCheck, end: false, permission: "roles.view" },
];

// The console shell: a full-width top bar over a left nav rail and the content
// column — the vertical-two-column layout Rise Global's console uses, on the
// tokens surface scale (grey page, white chrome).
export function Layout({ children }: { children: ReactNode }) {
  const { me, logout } = useAuth();
  const { has } = usePermissions();
  const initial = me?.name?.[0]?.toUpperCase() ?? "?";

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-4">
        <Boxes className="h-5 w-5 text-primary" />
        <span className="font-semibold">ModelSphere</span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">推理平台</span>
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 px-2">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="bg-primary/10 text-primary">{initial}</AvatarFallback>
                </Avatar>
                <span className="text-sm">{me?.name}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>
                {me?.name}
                {me?.isAdmin ? " · 管理员" : ""}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout}>
                <LogOut className="mr-2 h-4 w-4" />
                退出登录
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-52 shrink-0 border-r bg-card p-3">
          <nav className="flex flex-col gap-1">
            {nav.filter(({ permission }) => !permission || has(permission)).map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? "bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 overflow-auto bg-surface-page p-6">{children}</main>
      </div>
    </div>
  );
}
