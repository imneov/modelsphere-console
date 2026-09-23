import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, clearToken, getToken, login as apiLogin, type Me } from "@/lib/api";

interface AuthState {
  me: Me | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount, if a token is present, resolve the current user. A stale or
  // invalid token simply resolves to logged-out.
  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then(setMe)
      .catch(() => {
        clearToken();
        setMe(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (username: string, password: string) => {
    await apiLogin(username, password);
    setMe(await api.me());
  };

  const logout = () => {
    clearToken();
    setMe(null);
  };

  return <AuthContext.Provider value={{ me, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
