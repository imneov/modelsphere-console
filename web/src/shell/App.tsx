import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/shell/auth";
import { PermissionGuard, PermissionsProvider } from "@/shell/permissions";
import { Layout } from "@/shell/Layout";
import { ModuleProvider, joinPath, validateModules, type ConsoleModule } from "@/shell/module";
import { Login } from "@/shell/pages/Login";
import { Home } from "@/shell/pages/Home";
import { ChangePassword } from "@/shell/pages/ChangePassword";

const queryClient = new QueryClient();

function RequireAuth({ modules }: { modules: ConsoleModule[] }) {
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
    <Layout modules={modules}>
      <Outlet />
    </Layout>
  );
}

export function App({ modules }: { modules: ConsoleModule[] }) {
  validateModules(modules);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PermissionsProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route element={<RequireAuth modules={modules} />}>
                <Route path="/change-password" element={<ChangePassword />} />
                <Route path="/" element={<Home modules={modules} />} />
                {modules.flatMap((m) =>
                  m.pages.map((p) => (
                    <Route
                      key={`${m.id}:${p.path}`}
                      path={joinPath(m.basePath, p.path)}
                      element={
                        <ModuleProvider module={m}>
                          {p.permission ? <PermissionGuard permission={p.permission}>{p.element}</PermissionGuard> : p.element}
                        </ModuleProvider>
                      }
                    />
                  )),
                )}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </PermissionsProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
