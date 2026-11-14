import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  ConfirmDialog,
  Input,
  PageBanner,
  ResourceTable,
  type ResourceColumn,
  type ResourceRowAction,
} from "@modelsphere/ui";
import { KeyRound } from "lucide-react";
import { formatDateTime } from "@/shell";
import { api, type ApiKey } from "@/modules/router/api";
import { CreateApiKeyDialog } from "@/modules/router/CreateKeyDialog";
import { KeyMigration } from "@/modules/router/KeyMigration";
import { useT } from "@/modules/router/i18n";

const MAX_MODEL_BADGES = 3;

export function ApiKeys() {
  const t = useT();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleting, setDeleting] = useState<ApiKey | null>(null);
  return (
    <div className="flex h-full flex-col">
      <PageBanner
        title={t("apiKeys.title")}
        icon={<KeyRound className="size-5" />}
      />
      <KeyList onCreate={() => setCreateOpen(true)} onDelete={setDeleting} />
      <CreateApiKeyDialog open={createOpen} onOpenChange={setCreateOpen} />
      <DeleteKeyDialog deleting={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}

function useKeyList() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["router", "apikeys"],
    queryFn: api.listKeys,
  });
  const [search, setSearch] = useState("");
  const lifecycle = useMutation({
    mutationFn: (key: ApiKey) =>
      api.setStatus(key.id, key.disabled ? "enabled" : "disabled"),
    onSettled: () =>
      client.invalidateQueries({ queryKey: ["router", "apikeys"] }),
  });
  const needle = search.trim().toLowerCase();
  const rows = (query.data?.items ?? []).filter(
    (key) => !needle || key.name.toLowerCase().includes(needle),
  );
  return {
    query,
    search,
    setSearch,
    lifecycle,
    rows,
    frozen: Boolean(query.data?.migration?.phase),
  };
}

function KeyList({
  onCreate,
  onDelete,
}: {
  onCreate: () => void;
  onDelete: (key: ApiKey) => void;
}) {
  const t = useT();
  const state = useKeyList();
  const columns = useKeyColumns();
  const actions = useKeyActions(state, onDelete);
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4">
      {state.lifecycle.error && (
        <p role="alert" className="text-sm text-destructive">
          {state.lifecycle.error.message}
        </p>
      )}
      <ResourceTable<ApiKey>
        height="fill"
        toolbarLayout="inline"
        data={state.rows}
        loading={state.query.isLoading}
        error={state.query.error}
        onRetry={() => void state.query.refetch()}
        rowKey="id"
        columns={columns}
        showRefresh
        onRefresh={() => void state.query.refetch()}
        rowActions={actions}
        toolbarLeft={<KeyToolbar state={state} onCreate={onCreate} />}
        filters={<KeySearch state={state} />}
        activeFilters={
          state.search.trim()
            ? [
                {
                  key: "search",
                  label: t("apiKeys.table.name"),
                  display: state.search.trim(),
                },
              ]
            : []
        }
        onRemoveFilter={() => state.setSearch("")}
        emptyTitle={t("apiKeys.empty")}
        emptyAction={<KeyToolbar state={state} onCreate={onCreate} />}
      />
    </div>
  );
}

type KeyListState = ReturnType<typeof useKeyList>;
function KeyToolbar({
  state,
  onCreate,
}: {
  state: KeyListState;
  onCreate: () => void;
}) {
  const t = useT();
  return (
    <div className="flex gap-2">
      <Button disabled={state.frozen || !state.query.data} onClick={onCreate}>
        {t("apiKeys.create")}
      </Button>
      {state.query.data && <KeyMigration data={state.query.data} />}
    </div>
  );
}

function useKeyActions(
  state: KeyListState,
  onDelete: (key: ApiKey) => void,
): ResourceRowAction<ApiKey>[] {
  const t = useT();
  const actions: ResourceRowAction<ApiKey>[] = [
    {
      key: "delete",
      label: t("common:actions.delete"),
      danger: true,
      disabled: () => state.frozen,
      onClick: onDelete,
    },
  ];
  if (state.query.data?.keySource === "crd")
    actions.unshift(
      {
        key: "enable",
        label: t("apiKeys.enable"),
        disabled: (key) => !key.disabled || state.lifecycle.isPending,
        onClick: (key) => state.lifecycle.mutate(key),
      },
      {
        key: "disable",
        label: t("apiKeys.disable"),
        disabled: (key) => key.disabled || state.lifecycle.isPending,
        onClick: (key) => state.lifecycle.mutate(key),
      },
    );
  return actions;
}

function DeleteKeyDialog({
  deleting,
  onClose,
}: {
  deleting: ApiKey | null;
  onClose: () => void;
}) {
  const t = useT();
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: api.deleteKey,
    onSettled: () =>
      client.invalidateQueries({ queryKey: ["router", "apikeys"] }),
  });
  return (
    <ConfirmDialog
      open={deleting !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          mutation.reset();
        }
      }}
      title={t("apiKeys.delete.title")}
      description={
        deleting
          ? t("apiKeys.delete.confirm", { name: deleting.name })
          : undefined
      }
      action={t("common:actions.delete")}
      tone="destructive"
      items={deleting ? [deleting.name] : []}
      error={mutation.error?.message}
      loading={mutation.isPending}
      onConfirm={async () => {
        if (deleting) await mutation.mutateAsync(deleting.id);
      }}
    />
  );
}

function useKeyColumns(): ResourceColumn<ApiKey>[] {
  const t = useT();
  return [
    {
      key: "name",
      title: t("apiKeys.table.name"),
      hideable: false,
      render: (key) => <KeyName value={key} />,
    },
    {
      key: "keyMasked",
      title: t("apiKeys.table.key"),
      width: 160,
      render: (key) => (
        <span className="font-mono text-sm">{key.keyMasked}</span>
      ),
    },
    {
      key: "user",
      title: t("apiKeys.table.user"),
      render: (key) => key.user || t("apiKeys.unmapped"),
    },
    {
      key: "status",
      title: t("apiKeys.table.status"),
      render: (key) => (
        <span>
          {t(`apiKeys.status.${key.status}`)}
          {key.disabledReason && (
            <span className="block text-xs text-muted-foreground">
              {t(`apiKeys.reason.${key.disabledReason}`)}
            </span>
          )}
        </span>
      ),
    },
    ...useKeyAccessColumns(),
  ];
}

function KeyModels({ models }: { models?: string[] }) {
  const t = useT();
  if (!models?.length)
    return (
      <span className="text-muted-foreground">{t("apiKeys.allModels")}</span>
    );
  return (
    <div className="flex flex-wrap gap-1" title={models.join("\n")}>
      {models.slice(0, MAX_MODEL_BADGES).map((model) => (
        <Badge key={model} variant="secondary" className="font-normal">
          {model}
        </Badge>
      ))}
      {models.length > MAX_MODEL_BADGES && (
        <Badge variant="outline">+{models.length - MAX_MODEL_BADGES}</Badge>
      )}
    </div>
  );
}

function KeyExpiry({ value }: { value: ApiKey }) {
  const t = useT();
  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <span>
        {value.expiresAt
          ? formatDateTime(value.expiresAt)
          : t("apiKeys.neverExpires")}
      </span>
      {value.expired && (
        <Badge variant="destructive">{t("apiKeys.expired")}</Badge>
      )}
    </div>
  );
}

function KeySearch({ state }: { state: KeyListState }) {
  const t = useT();
  return (
    <div className="w-52 shrink-0">
      <Input
        value={state.search}
        onChange={(event) => state.setSearch(event.target.value)}
        placeholder={t("apiKeys.search")}
      />
    </div>
  );
}

function useKeyAccessColumns(): ResourceColumn<ApiKey>[] {
  const t = useT();
  return [
    {
      key: "models",
      title: t("apiKeys.table.models"),
      render: (key) => <KeyModels models={key.models} />,
    },
    {
      key: "expiresAt",
      title: t("apiKeys.table.expiresAt"),
      width: 240,
      render: (key) => <KeyExpiry value={key} />,
    },
    { key: "createdBy", title: t("apiKeys.table.createdBy"), width: 100 },
    {
      key: "createdAt",
      title: t("apiKeys.table.createdAt"),
      width: 160,
      render: (key) => formatDateTime(key.createdAt),
    },
  ];
}

function KeyName({ value }: { value: ApiKey }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-medium">{value.name}</div>
      {value.description && (
        <div
          className="truncate text-xs text-muted-foreground"
          title={value.description}
        >
          {value.description}
        </div>
      )}
    </div>
  );
}
