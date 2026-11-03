import { Button } from "@modelsphere/ui";
import { Loader2 } from "lucide-react";
import type { ReleaseStatus } from "@swiss/lib/api";
import { isUninstalling } from "@swiss/lib/phase";
import { useT } from "@/modules/inferences/i18n";

export function UninstallProgress({ status, onViewInstances }: { status: ReleaseStatus; onViewInstances?: () => void }) {
  const t = useT();
  if (!isUninstalling(status)) return null;
  const deletion = status.llmservice?.deletion;
  const remaining = deletion?.podsRemaining ?? status.pods.length;
  const message = status.warning && remaining === 0 ? t("uninstall.unknown") : remaining > 0 ? t("uninstall.remaining", { n: remaining }) : t("uninstall.confirming");
  return (
    <div role="status" className="flex flex-wrap items-start gap-3 rounded-md border border-warning/30 bg-warning/5 p-3">
      <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-warning" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium">{message}</p>
        <p className="text-sm text-muted-foreground">{t("overview.uninstallingHint")}</p>
        {deletion?.message && <p className="break-words text-sm text-muted-foreground">{deletion.message}</p>}
      </div>
      {remaining > 0 && onViewInstances && <Button variant="outline" size="sm" onClick={onViewInstances}>{t("overview.viewInstances")}</Button>}
    </div>
  );
}
