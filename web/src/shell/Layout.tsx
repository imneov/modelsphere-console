import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router";
import {
  Avatar,
  AvatarFallback,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@riseaicloud/ui";
import { LogOut, Boxes, KeyRound, ChevronRight, PanelLeft } from "lucide-react";
import { useAuth } from "@/shell/auth";
import { usePermissions } from "@/shell/permissions";
import { ChangePasswordDialog } from "@/shell/ChangePasswordDialog";
import { navGroups, type ConsoleModule, type NavGroup, type NavItem } from "@/shell/module";

// Rise Global's factory layout ("minimal"): a gradient canvas, the sidebar sitting
// transparent on it, and one white rounded board holding the top bar and the page.
// Sizes and classes follow rise-global console/src/components/layout
// (app-shell, scoped-sidebar-layout, top-nav) so the two read as one product.
export function Layout({ modules, children }: { modules: ConsoleModule[]; children: ReactNode }) {
  const { has } = usePermissions();
  const [collapsed, setCollapsed] = useState(false);
  const groups = navGroups(modules, has);

  return (
    <div className="flex h-screen bg-[var(--shell-canvas)] [background-image:var(--shell-canvas-image)]">
      <aside className={`shrink-0 overflow-y-auto transition-[width] duration-200 ${collapsed ? "w-16" : "w-64"}`}>
        <nav className={collapsed ? "px-1 pb-1 pt-4" : "p-4"}>
          <Sidebar groups={groups} collapsed={collapsed} />
        </nav>
      </aside>

      <div className="m-2 ml-0 flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-card shadow-[0_1px_3px_0_rgb(0_0_0/0.1),0_1px_2px_-1px_rgb(0_0_0/0.1)]">
        <TopBar onToggleSidebar={() => setCollapsed((c) => !c)} collapsed={collapsed} />
        <main className="relative min-h-0 flex-1 overflow-auto bg-surface-page p-6">{children}</main>
      </div>
    </div>
  );
}

function TopBar({ onToggleSidebar, collapsed }: { onToggleSidebar: () => void; collapsed: boolean }) {
  const { me, logout } = useAuth();
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const initial = me?.name?.[0]?.toUpperCase() ?? "?";

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-card px-4 text-[var(--shell-foreground)]">
      <button
        type="button"
        onClick={onToggleSidebar}
        aria-label={collapsed ? "展开侧边栏" : "折叠侧边栏"}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <PanelLeft className="h-4 w-4" />
      </button>
      <NavLink to="/" className="flex items-center gap-2.5">
        <Boxes className="h-[26px] w-[26px] shrink-0 text-primary" />
        <span className="text-sm font-semibold">ModelSphere</span>
      </NavLink>

      <div className="ml-auto">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="flex items-center gap-2 rounded-md px-2 py-1 transition-colors hover:bg-accent">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-primary/10 text-[13px] font-semibold text-primary">{initial}</AvatarFallback>
              </Avatar>
              <span className="text-[13px] font-medium">{me?.name}</span>
            </button>
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
      <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
    </header>
  );
}

// Global's board-surface menu item: 14px, medium weight, 10px vertical padding.
const ITEM = "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors";
const ITEM_IDLE = "text-foreground/80 hover:bg-accent hover:text-foreground";
const ITEM_ACTIVE = "bg-primary/10 text-primary";

function isUnder(pathname: string, item: NavItem): boolean {
  return item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(item.to + "/");
}

// Accordion like Global's sidebar: one group open at a time, starting with the
// group that holds the current page.
function Sidebar({ groups, collapsed }: { groups: NavGroup[]; collapsed: boolean }) {
  const { pathname } = useLocation();
  const activeGroup = groups.find((g) => g.title && g.items.some((i) => isUnder(pathname, i)))?.title;
  const [open, setOpen] = useState<string | undefined>(activeGroup ?? groups.find((g) => g.title)?.title);
  const shown = open ?? activeGroup;
  // Navigating into another module (a link, the back button) opens its group.
  useEffect(() => {
    if (activeGroup) setOpen(activeGroup);
  }, [activeGroup]);

  if (collapsed) {
    return (
      <div className="space-y-1">
        {groups.flatMap((g) => g.items).map((item) => (
          <MenuLink key={item.to} item={item} iconOnly />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {groups.map((g, i) =>
        !g.title ? (
          <div key={i} className="mb-1 space-y-0.5">
            {g.items.map((item) => (
              <MenuLink key={item.to} item={item} />
            ))}
          </div>
        ) : (
          <div key={g.title} className="mb-1">
            <button
              type="button"
              onClick={() => setOpen(shown === g.title ? "" : g.title)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent ${
                g.title === activeGroup ? "text-primary" : "text-foreground/80"
              }`}
            >
              <span>{g.title}</span>
              <ChevronRight
                className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${shown === g.title ? "rotate-90" : ""}`}
              />
            </button>
            <div
              className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
                shown === g.title ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
              }`}
              inert={shown !== g.title}
            >
              <div className="overflow-hidden">
                <div className="pl-4">
                  {g.items.map((item) => (
                    <MenuLink key={item.to} item={item} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        ),
      )}
    </div>
  );
}

function MenuLink({ item, iconOnly = false }: { item: NavItem; iconOnly?: boolean }) {
  const { to, label, icon: Icon, end } = item;
  return (
    <NavLink
      to={to}
      end={end}
      title={iconOnly ? label : undefined}
      className={({ isActive }) =>
        iconOnly
          ? `flex h-10 items-center justify-center rounded-lg transition-colors ${isActive ? ITEM_ACTIVE : ITEM_IDLE}`
          : `${ITEM} ${isActive ? ITEM_ACTIVE : ITEM_IDLE}`
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
          {!iconOnly && <span className="truncate">{label}</span>}
        </>
      )}
    </NavLink>
  );
}
