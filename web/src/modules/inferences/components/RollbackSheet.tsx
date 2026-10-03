import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription, Button, Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, Spinner } from "@modelsphere/ui";
import { TriangleAlert } from "lucide-react";
import { api, deployApi } from "@swiss/lib/api";
import { useT } from "@/modules/inferences/i18n";
import { pipelineState } from "@/modules/inferences/deploy-lib";
import { Review } from "@/modules/inferences/components/DeploySheet";

export interface RollbackTarget {
  namespace: string;
  release: string;
  revision: number;
}

const REFRESH = [["status"], ["revisions"], ["releasePlan"], ["release-plan"], ["runs"], ["deployments"], ["objects"]];

export function RollbackSheet({ target, onClose }: { target: RollbackTarget | null; onClose: () => void }) {
  return target ? <Body key={`${target.namespace}/${target.release}@${target.revision}`} target={target} onClose={onClose} /> : null;
}

function Body({ target, onClose }: { target: RollbackTarget; onClose: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const { namespace, release, revision } = target;
  const [note, setNote] = useState("");
  const current = useQuery({ queryKey: ["releasePlan", namespace, release], queryFn: () => api.releasePlan(namespace, release), retry: false });
  const archived = useQuery({ queryKey: ["revision-plan", namespace, release, revision], queryFn: () => api.revisionPlan(namespace, release, revision), staleTime: Infinity });
  const live = useQuery({ queryKey: ["status", namespace, release], queryFn: () => api.status(namespace, release) });
  const diff = useMutation({ mutationFn: () => deployApi.diffRevision(namespace, release, revision) });
  useEffect(() => diff.mutate(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const state = pipelineState({ rollback: true, diff: diff.data ?? null, exists: live.data?.exists, applied: false });
  const run = useMutation({
    mutationFn: () => deployApi.rollback(namespace, release, revision, diff.data?.revision ?? live.data?.revision ?? 0, note.trim()),
    onSuccess: () => {
      for (const key of REFRESH) qc.invalidateQueries({ queryKey: key });
      onClose();
    },
  });
  const error = archived.error ?? run.error;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} dismissible>
      <SheetContent size="2xl" className="gap-0">
        <SheetHeader className="border-b px-5 py-3.5">
          <SheetTitle>{t("deploy.rollbackSheet.title", { release, revision })}</SheetTitle>
          <SheetDescription>{t("deploy.rollbackSheet.description")}</SheetDescription>
        </SheetHeader>
        <SheetBody className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto bg-surface-page px-5 py-4">
          {error && (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}
          {archived.isPending ? (
            <div className="flex justify-center py-16">
              <Spinner size="lg" />
            </div>
          ) : (
            archived.data && (
              <Review
                upgrade={false}
                rollback
                current={current.data}
                plan={archived.data}
                diff={diff.data ?? null}
                diffing={diff.isPending}
                diffError={diff.error?.message}
                state={state}
                note={note}
                onNote={setNote}
                force={false}
                onForce={() => {}}
              />
            )
          )}
        </SheetBody>
        <SheetFooter className="flex-row justify-end border-t">
          <Button variant="outline" onClick={onClose} disabled={run.isPending}>
            {t("common:actions.cancel")}
          </Button>
          <Button onClick={() => run.mutate()} disabled={!state.canApply || run.isPending}>
            {run.isPending ? t("deploy.review.busy") : t("deploy.review.rollback")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
