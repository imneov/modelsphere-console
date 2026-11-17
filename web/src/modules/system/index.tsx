import { lazy, Suspense, type ReactNode } from "react";
import {
  History,
  Settings2,
  ShieldCheck,
  Tags,
  Users,
  Wallet,
} from "lucide-react";
import { Navigate } from "react-router";
import type { ConsoleModule } from "@/shell";
import { LoginHistory } from "@/modules/iam/LoginHistory";
import { Roles } from "@/modules/iam/Roles";
import { Users as UsersPage } from "@/modules/iam/Users";
import { SwissScope } from "@/modules/inferences/components/SwissScope";
import { useT } from "./i18n";

const Customers = lazy(() =>
  import("@/modules/billing/Customers").then((module) => ({
    default: module.Customers,
  })),
);
const Prices = lazy(() =>
  import("@/modules/billing/Prices").then((module) => ({
    default: module.Prices,
  })),
);
const SiteProfilePage = lazy(() =>
  import("@/modules/inferences/SiteProfilePage").then((module) => ({
    default: module.SiteProfilePage,
  })),
);
const SetupPage = lazy(() =>
  import("@/modules/inferences/SetupPage").then((module) => ({
    default: module.SetupPage,
  })),
);

function Loading() {
  const t = useT();
  return <div className="p-6">{t("common:status.loading")}</div>;
}

function page(node: ReactNode) {
  return <Suspense fallback={<Loading />}>{node}</Suspense>;
}

function swissPage(node: ReactNode) {
  return page(<SwissScope>{node}</SwissScope>);
}

// One entry point for platform operations. Product pages stay in their own
// modules; anything an administrator operates belongs here.
export const systemModule: ConsoleModule = {
  id: "system",
  title: "系统管理",
  basePath: "/system",
  frame: "flush",
  pages: [
    {
      path: "",
      element: <Navigate to="/system/site-profile" replace />,
      permission: "swiss.view",
    },
    {
      path: "users",
      element: <UsersPage />,
      permission: "users.view",
      menu: { label: "用户管理", icon: Users },
    },
    {
      path: "roles",
      element: <Roles />,
      permission: "roles.view",
      menu: { label: "角色权限", icon: ShieldCheck },
    },
    {
      path: "login-history",
      element: <LoginHistory />,
      permission: "loginrecords.view",
      menu: { label: "登录历史", icon: History },
    },
    {
      path: "site-profile",
      element: swissPage(<SiteProfilePage />),
      permission: "swiss.view",
      menu: { label: "站点配置", icon: Settings2 },
    },
    {
      path: "setup",
      element: swissPage(<SetupPage />),
      permission: "swiss.view",
    },
    {
      path: "customers",
      element: page(<Customers />),
      permission: "billing.manage",
      menu: { label: "客户账务", icon: Wallet },
    },
    {
      path: "prices",
      element: page(<Prices />),
      permission: "billing.manage",
      menu: { label: "模型价格", icon: Tags },
    },
  ],
};
