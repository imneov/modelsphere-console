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

export const api = {
  listKeys: () => request<{ items: ApiKey[] }>("GET", "/api/router/apikeys"),
  // value is the plaintext key, returned by this response only.
  createKey: (k: ApiKeyInput) => request<ApiKey & { value: string }>("POST", "/api/router/apikeys", k),
  deleteKey: (id: string) => request<void>("DELETE", `/api/router/apikeys/${encodeURIComponent(id)}`),
  // What a key can be limited to: the models the router's backend serves.
  models: async () => (await request<{ data?: { id: string }[] }>("GET", "/api/llm/v1/models")).data ?? [],
};

export function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}
