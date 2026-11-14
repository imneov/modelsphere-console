import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  DataSelect,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
} from "@modelsphere/ui";
import { api, type KeyList, type OwnerMapping } from "@/modules/router/api";
import { useT } from "@/modules/router/i18n";

export function KeyMigration({ data }: { data: KeyList }) {
  const [open, setOpen] = useState(false);
  const t = useT();
  if (!data.migrationAvailable) return null;
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        {t("apiKeys.migration.open")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <MigrationForm data={data} onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function MigrationForm({
  data,
  onDone,
}: {
  data: KeyList;
  onDone: () => void;
}) {
  const t = useT();
  const { owners, operationID, mapping, setMapping, mutation, complete } =
    useMigration(data);
  return (
    <div className="grid gap-4">
      <MigrationHeading operationID={operationID} />
      {complete ? (
        <p role="status">{t("apiKeys.migration.complete")}</p>
      ) : (
        <MappingFields
          data={data}
          owners={owners.data?.items ?? []}
          mapping={mapping}
          setMapping={setMapping}
        />
      )}
      {(owners.error || mutation.error) && (
        <p role="alert" className="text-sm text-destructive">
          {(owners.error || mutation.error)?.message}
        </p>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          {t("common:actions.close")}
        </Button>
        {!complete && (
          <Button
            disabled={
              mutation.isPending ||
              owners.isPending ||
              data.items.some((key) => !mapping[key.id])
            }
            onClick={() => mutation.mutate()}
          >
            {t("apiKeys.migration.submit")}
          </Button>
        )}
      </DialogFooter>
    </div>
  );
}

function MappingFields({
  data,
  owners,
  mapping,
  setMapping,
}: {
  data: KeyList;
  owners: { name: string; uid: string }[];
  mapping: Record<string, OwnerMapping>;
  setMapping: (value: Record<string, OwnerMapping>) => void;
}) {
  return (
    <div className="max-h-96 space-y-3 overflow-y-auto">
      {data.items.map((key) => (
        <div key={key.id} className="space-y-1">
          <Label htmlFor={`migrate-${key.id}`}>
            {key.name} · {key.keyMasked}
          </Label>
          <DataSelect
            id={`migrate-${key.id}`}
            value={mapping[key.id]?.principalUID ?? ""}
            options={owners.map((owner) => ({
              value: owner.uid,
              label: owner.name,
            }))}
            onValueChange={(uid) => {
              const owner = owners.find((item) => item.uid === uid);
              if (owner)
                setMapping({
                  ...mapping,
                  [key.id]: { user: owner.name, principalUID: uid },
                });
            }}
          />
        </div>
      ))}
    </div>
  );
}

function useMigration(data: KeyList) {
  const client = useQueryClient();
  const owners = useQuery({
    queryKey: ["router", "migrationOwners"],
    queryFn: api.migrationOwners,
  });
  const [operationID] = useState(
    () => data.migration?.operationID || crypto.randomUUID(),
  );
  const [mapping, setMapping] = useState<Record<string, OwnerMapping>>(
    data.migration?.owners ?? {},
  );
  const mutation = useMutation({
    mutationFn: () => api.importKeys(operationID, mapping),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["router", "apikeys"] }),
  });
  const complete = data.migration?.phase === "complete" || mutation.isSuccess;
  return { owners, operationID, mapping, setMapping, mutation, complete };
}

function MigrationHeading({ operationID }: { operationID: string }) {
  const t = useT();
  return (
    <>
      {" "}
      <DialogHeader>
        <DialogTitle>{t("apiKeys.migration.open")}</DialogTitle>
        <DialogDescription>
          {t("apiKeys.migration.description")}
        </DialogDescription>
      </DialogHeader>
      <p className="break-all text-xs text-muted-foreground">
        {t("apiKeys.migration.operation")}: {operationID}
      </p>
    </>
  );
}
