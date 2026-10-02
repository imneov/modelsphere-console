import { useQuery } from "@tanstack/react-query";
import { History, ShieldCheck, Users as UsersIcon } from "lucide-react";
import { StatCard, type ConsoleModule } from "@/shell";
import { api } from "@/modules/iam/api";
import { useT } from "@/modules/iam/i18n";
import { Users } from "@/modules/iam/Users";
import { Roles } from "@/modules/iam/Roles";
import { LoginHistory } from "@/modules/iam/LoginHistory";

function Overview() {
  const t = useT();
  const users = useQuery({ queryKey: ["users"], queryFn: api.listUsers });
  const roles = useQuery({ queryKey: ["roles"], queryFn: api.listRoles });
  return (
    <>
      <StatCard icon={UsersIcon} label={t("overview.users")} value={users.data?.items.length ?? "—"} />
      <StatCard icon={ShieldCheck} label={t("overview.roles")} value={roles.data?.items.length ?? "—"} />
    </>
  );
}

export const iamModule: ConsoleModule = {
  id: "iam",
  title: "访问控制",
  basePath: "/iam",
  frame: "flush",
  overview: Overview,
  pages: [
    { path: "users", element: <Users />, permission: "users.view", menu: { label: "用户", icon: UsersIcon } },
    { path: "login-history", element: <LoginHistory />, permission: "loginrecords.view", menu: { label: "登录历史", icon: History } },
    { path: "roles", element: <Roles />, permission: "roles.view", menu: { label: "角色", icon: ShieldCheck } },
  ],
};
