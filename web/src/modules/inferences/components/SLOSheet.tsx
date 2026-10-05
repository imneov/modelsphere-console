import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@modelsphere/ui";
import { SLOCard } from "@swiss/components/SLOCard";
import { useT } from "@/modules/inferences/i18n";
import { InSwiss } from "@/modules/inferences/components/SwissScope";

export interface SLOTarget {
  namespace: string;
  release: string;
}

// The cluster resources tab shows the stored SLO; editing it is an action, so
// the form opens here from the header rather than as a tab of its own.
export function SLOSheet({ target, canEdit, onClose }: { target: SLOTarget | null; canEdit: boolean; onClose: () => void }) {
  const t = useT();
  if (!target) return null;
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()} dismissible>
      <SheetContent size="md" className="gap-0">
        <SheetHeader className="border-b px-5 py-3.5">
          <SheetTitle>{t("slo.title", { release: target.release })}</SheetTitle>
          <SheetDescription>{t("slo.description")}</SheetDescription>
        </SheetHeader>
        <SheetBody className="min-h-0 flex-1 overflow-auto bg-surface-page px-5 py-4">
          <InSwiss>
            <SLOCard namespace={target.namespace} release={target.release} canEdit={canEdit} />
          </InSwiss>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
