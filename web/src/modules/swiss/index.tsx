import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, Boxes, Rocket, Server, SlidersHorizontal } from "lucide-react";
import type { ConsoleModule } from "@/shell";
import { api } from "@swiss/lib/api";
import { Gate } from "@swiss/components/Session";
import { ToastProvider } from "@swiss/components/ui/toast";

function load<K extends string>(name: K, loader: () => Promise<Record<K, ComponentType>>) {
  return lazy(() => loader().then((m) => ({ default: m[name] })));
}

const Deployments = load("Deployments", () => import("@swiss/routes/Deployments"));
const DeploymentDetail = load("DeploymentDetail", () => import("@swiss/routes/DeploymentDetail"));
const Catalog = load("Catalog", () => import("@swiss/routes/Catalog"));
const Model = load("Model", () => import("@swiss/routes/Model"));
const Deploy = load("Deploy", () => import("@swiss/routes/Deploy"));
const Upgrade = load("Upgrade", () => import("@swiss/routes/Upgrade"));
const Runs = load("Runs", () => import("@swiss/routes/Runs"));
const Nodes = load("Nodes", () => import("@swiss/routes/Nodes"));
const SiteProfile = load("SiteProfile", () => import("@swiss/routes/SiteProfile"));
const Setup = load("Setup", () => import("@swiss/routes/Setup"));

// What swiss's Layout drew around every page, minus the parts the console shell owns.
function ClusterWarnings() {
  const { data } = useQuery({ queryKey: ["cluster"], queryFn: api.cluster });
  if (!data?.warnings?.length) return null;
  return (
    <div className="mb-4 space-y-1">
      {data.warnings.map((w) => (
        <div key={w} className="flex items-center gap-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
          <AlertTriangle className="size-3.5 shrink-0" />
          {w}
        </div>
      ))}
    </div>
  );
}

const page = (node: ReactNode) => (
  <Suspense fallback={<div className="text-sm text-muted-foreground">加载中…</div>}>
    <ToastProvider>
      <Gate>
        <ClusterWarnings />
        {node}
      </Gate>
    </ToastProvider>
  </Suspense>
);

// The routes are swiss's main.tsx, one for one. console proxies /api/deploy to
// swissd (backends: swiss); swiss.view only shows the pages, the backend RBAC
// on backends/swiss decides what the calls may do.
export const swissModule: ConsoleModule = {
  id: "swiss",
  title: "模型部署",
  basePath: "/swiss",
  pages: [
    { path: "", element: page(<Deployments />), permission: "swiss.view", menu: { label: "部署", icon: Rocket } },
    { path: "deployments/:namespace/:release", element: page(<DeploymentDetail />), permission: "swiss.view" },
    { path: "catalog", element: page(<Catalog />), permission: "swiss.view", menu: { label: "模型目录", icon: Boxes } },
    { path: "catalog/:name", element: page(<Model />), permission: "swiss.view" },
    { path: "deploy/:name", element: page(<Deploy />), permission: "swiss.view" },
    { path: "upgrade/:namespace/:release", element: page(<Upgrade />), permission: "swiss.view" },
    { path: "nodes", element: page(<Nodes />), permission: "swiss.view", menu: { label: "节点", icon: Server } },
    { path: "runs", element: page(<Runs />), permission: "swiss.view", menu: { label: "操作记录", icon: Activity } },
    { path: "site-profile", element: page(<SiteProfile />), permission: "swiss.view", menu: { label: "站点配置", icon: SlidersHorizontal } },
    { path: "setup", element: page(<Setup />), permission: "swiss.view" },
  ],
};
