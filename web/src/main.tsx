import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import { AuthProvider, useAuth } from "@/auth";
import { Layout } from "@/components/Layout";
import { PermissionGuard, PermissionsProvider } from "@/permissions";
import { Login } from "@/routes/Login";
import { Home } from "@/routes/Home";
import { Users } from "@/routes/Users";
import { Roles } from "@/routes/Roles";
import { LoginHistory } from "@/routes/LoginHistory";
import { ChangePassword } from "@/routes/ChangePassword";

const queryClient = new QueryClient();

function RequireAuth() {
  const { me, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!me) return <Navigate to="/login" replace />;
  if (me.requirePasswordReset && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }
  if (!me.requirePasswordReset && location.pathname === "/change-password") {
    return <Navigate to="/" replace />;
  }
  if (location.pathname === "/change-password") return <Outlet />;
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PermissionsProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route element={<RequireAuth />}>
                <Route path="/change-password" element={<ChangePassword />} />
                <Route path="/" element={<Home />} />
                <Route
                  path="/users"
                  element={
                    <PermissionGuard permission="users.view">
                      <Users />
                    </PermissionGuard>
                  }
                />
                <Route
                  path="/roles"
                  element={
                    <PermissionGuard permission="roles.view">
                      <Roles />
                    </PermissionGuard>
                  }
                />
                <Route
                  path="/login-history"
                  element={
                    <PermissionGuard permission="loginrecords.view">
                      <LoginHistory />
                    </PermissionGuard>
                  }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </PermissionsProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
