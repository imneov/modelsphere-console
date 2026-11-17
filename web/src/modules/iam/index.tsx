import { Navigate } from "react-router";
import type { ConsoleModule } from "@/shell";

// Keep bookmarked /iam links working after administration moved to /system.
export const iamModule: ConsoleModule = {
  id: "iam",
  title: "访问控制",
  basePath: "/iam",
  frame: "flush",
  pages: [
    { path: "users", element: <Navigate to="/system/users" replace /> },
    { path: "roles", element: <Navigate to="/system/roles" replace /> },
    {
      path: "login-history",
      element: <Navigate to="/system/login-history" replace />,
    },
  ],
};
