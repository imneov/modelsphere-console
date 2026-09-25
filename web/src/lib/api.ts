// The API client. Same-origin: consoled serves this SPA and its API. The token
// lives in a cookie (so a reload stays logged in and the server can read it on
// navigations) and is also sent as a Bearer header.

const TOKEN_COOKIE = "token";

export function getToken(): string {
  const m = document.cookie.match(/(?:^|;\s*)token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

export function setToken(token: string) {
  document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(token)}; path=/; SameSite=Lax`;
}

export function clearToken() {
  document.cookie = `${TOKEN_COOKIE}=; path=/; Max-Age=0; SameSite=Lax`;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(path, {
    method,
    headers,
    credentials: "include",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      if (j?.error) msg = j.error;
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface Me {
  name: string;
  groups: string[];
  email?: string;
  isAdmin: boolean;
  permissions: string[];
  requirePasswordReset: boolean;
}

export interface ChangePasswordInput {
  oldPassword: string;
  newPassword: string;
}

export interface User {
  name: string;
  email?: string;
  displayName?: string;
  description?: string;
  groups?: string[];
  state?: string;
  lastLoginTime?: string;
}

export interface UserInput {
  name: string;
  email?: string;
  displayName?: string;
  description?: string;
  groups?: string[];
  password?: string;
}

// login exchanges credentials for a token at the OAuth2 password-grant endpoint
// (form-encoded, exactly as Rise Global expects) and stores it.
export async function login(username: string, password: string): Promise<void> {
  const form = new URLSearchParams({ grant_type: "password", username, password });
  const res = await fetch("/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!res.ok) {
    throw new ApiError(res.status, "用户名或密码错误");
  }
  const tok = (await res.json()) as { access_token: string };
  setToken(tok.access_token);
}

export interface PolicyRule {
  verbs: string[];
  apiGroups: string[];
  resources: string[];
  resourceNames?: string[];
}

export interface Role {
  name: string;
  rules: PolicyRule[];
  uiPermissions?: string[];
}

export interface Subject {
  kind: string;
  name: string;
  apiGroup?: string;
}

export interface Binding {
  name: string;
  role: string;
  subjects: Subject[];
}

export interface LoginRecord {
  name: string;
  time: string;
  user: string;
  type?: string;
  provider?: string;
  sourceIP?: string;
  success: boolean;
  reason?: string;
  userAgent?: string;
}

export const api = {
  me: () => request<Me>("GET", "/api/me"),
  changePassword: (passwords: ChangePasswordInput) =>
    request<{ status: string }>("POST", "/api/me/password", passwords),
  listUsers: () => request<{ items: User[] }>("GET", "/api/iam/users"),
  getUser: (name: string) => request<User>("GET", `/api/iam/users/${name}`),
  createUser: (u: UserInput) => request<User>("POST", "/api/iam/users", u),
  updateUser: (name: string, u: UserInput) => request<User>("PUT", `/api/iam/users/${name}`, u),
  deleteUser: (name: string) => request<void>("DELETE", `/api/iam/users/${name}`),

  listRoles: () => request<{ items: Role[] }>("GET", "/api/iam/roles"),
  createRole: (r: { name: string; rules: PolicyRule[]; uiPermissions?: string[] }) =>
    request<Role>("POST", "/api/iam/roles", r),
  deleteRole: (name: string) => request<void>("DELETE", `/api/iam/roles/${name}`),

  listBindings: () => request<{ items: Binding[] }>("GET", "/api/iam/rolebindings"),
  createBinding: (b: { name: string; role: string; subjects: Subject[] }) =>
    request<Binding>("POST", "/api/iam/rolebindings", b),
  deleteBinding: (name: string) => request<void>("DELETE", `/api/iam/rolebindings/${name}`),

  listLoginRecords: (user?: string) =>
    request<{ items: LoginRecord[] }>(
      "GET",
      `/api/iam/loginrecords${user ? `?user=${encodeURIComponent(user)}` : ""}`,
    ),
};
