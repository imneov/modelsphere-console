import { request } from "@/shell";

export interface ApiKey {
  id: string;
  name: string;
  description?: string;
  maskedValue: string;
  models?: string[];
  createdBy: string;
  createdAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
  expired: boolean;
}

export interface ApiKeyInput {
  name: string;
  description?: string;
  // 0 is never.
  expiresInDays: number;
  // Absent is every model.
  models?: string[];
}

export const keysApi = {
  list: () => request<{ items: ApiKey[] }>("GET", "/api/iam/apikeys"),
  // value is the plaintext key, returned by this response only.
  create: (k: ApiKeyInput) => request<ApiKey & { value: string }>("POST", "/api/iam/apikeys", k),
  remove: (id: string) => request<void>("DELETE", `/api/iam/apikeys/${encodeURIComponent(id)}`),
};

export function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}
