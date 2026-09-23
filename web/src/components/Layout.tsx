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
import { LogOut, Users as UsersIcon, LayoutDashboard } from "lucide-react";
import { useAuth } from "@/auth";

const nav = [
  { to: "/", label: "概览", icon: LayoutDashboard, end: true },
  { to: "/users", label: "用户", icon: UsersIcon, end: false },
];

export function Layout({ children }: { children: ReactNode }) {
  const { me, logout } = useAuth();
  const initial = me?.name?.[0]?.toUpperCase() ?? "?";

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex h-14 items-center gap-6 border-b bg-surface-toolbar px-4">
        <span className="font-semibold">ModelSphere</span>
        <nav className="flex items-center gap-1">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-md px-3 py-1.5 text-sm ${
                  isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50"
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 px-2">
                <Avatar className="h-7 w-7">
                  <AvatarFallback>{initial}</AvatarFallback>
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
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
