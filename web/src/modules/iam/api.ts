import { request } from "@/shell";

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
