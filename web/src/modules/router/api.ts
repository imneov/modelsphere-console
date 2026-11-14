import { request } from "@/shell";

export interface ApiKey {
  user?: string;
  principalUID?: string;
  creator?: string;
  keyMasked: string;
  status: "enabled" | "disabled" | "system-disabled";
  billingState?: string;
  disabled: boolean;
  disabledReason?: string;
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
  user?: string;
  principalUID?: string;
  name: string;
  description?: string;
  // 0 is never.
  expiresInDays: number;
  // Absent is every model.
  models?: string[];
}

export interface KeyOwner {
  name: string;
  uid: string;
  displayName?: string;
}
export interface OwnerMapping {
  user: string;
  principalUID: string;
}
export interface MigrationInfo {
  phase: string;
  operationID: string;
  owners: Record<string, OwnerMapping>;
}
export interface KeyList {
  items: ApiKey[];
  keySource: "secret" | "crd";
  migrationAvailable: boolean;
  migration: MigrationInfo | null;
}

export const api = {
  listKeys: () => request<KeyList>("GET", "/api/router/apikeys"),
  owners: () => request<{ items: KeyOwner[] }>("GET", "/api/router/users"),
  importKeys: (operationID: string, owners: Record<string, OwnerMapping>) =>
    request<{ status: string }>("POST", "/api/router/apikeys/import", {
      operationID,
      owners,
    }),
  migrationOwners: () =>
    request<{ items: KeyOwner[] }>(
      "GET",
      "/api/router/users?includeInactive=true",
    ),
  setStatus: (id: string, status: "enabled" | "disabled") =>
    request<void>(
      "PUT",
      `/api/router/apikeys/${encodeURIComponent(id)}/status`,
      { status },
    ),
  // value is the plaintext key, returned by this response only.
  createKey: (k: ApiKeyInput) =>
    request<ApiKey & { key: string }>("POST", "/api/router/apikeys", k),
  deleteKey: (id: string) =>
    request<void>("DELETE", `/api/router/apikeys/${encodeURIComponent(id)}`),
  // What a key can be limited to: the models the router's backend serves.
  models: async () =>
    (await request<{ data?: { id: string }[] }>("GET", "/api/llm/v1/models"))
      .data ?? [],
};
