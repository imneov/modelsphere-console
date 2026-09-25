import { useState, type ReactNode } from "react";
import { NavLink } from "react-router";
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
import { LogOut, Boxes, KeyRound } from "lucide-react";
import { useAuth } from "@/shell/auth";
import { usePermissions } from "@/shell/permissions";
import { ChangePasswordDialog } from "@/shell/ChangePasswordDialog";
import { navGroups, type ConsoleModule } from "@/shell/module";

// The console shell: a full-width top bar over a left nav rail and the content
// column — the vertical-two-column layout Rise Global's console uses, on the
// tokens surface scale (grey page, white chrome).
export function Layout({ modules, children }: { modules: ConsoleModule[]; children: ReactNode }) {
  const { me, logout } = useAuth();
  const { has } = usePermissions();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
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
              <DropdownMenuItem onClick={() => setChangePasswordOpen(true)}>
                <KeyRound className="mr-2 h-4 w-4" />
                修改密码
              </DropdownMenuItem>
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
          <nav className="flex flex-col gap-4">
            {navGroups(modules, has).map((group, i) => (
              <div key={group.title ?? i} className="flex flex-col gap-1">
                {group.title && <div className="px-3 pb-1 text-xs font-medium text-muted-foreground">{group.title}</div>}
                {group.items.map(({ to, label, icon: Icon, end }) => (
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
              </div>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 overflow-auto bg-surface-page p-6">{children}</main>
      </div>
      <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
    </div>
  );
}
