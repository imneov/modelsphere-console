import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { api } from "@swiss/lib/api";
import { Gate } from "@swiss/components/Session";
import { ToastProvider } from "@swiss/components/ui/toast";

// swissd's own problems (site profile or a catalog failing to load), above every
// page as swiss's layout shows them.
function ClusterWarnings() {
  const { data } = useQuery({ queryKey: ["cluster"], queryFn: api.cluster });
  if (!data?.warnings?.length) return null;
  return (
    <div className="space-y-1 px-4 pt-4">
      {data.warnings.map((w) => (
        <div key={w} className="flex items-center gap-2 rounded-md bg-warning/10 px-3 py-2 text-xs text-warning">
          <AlertTriangle className="size-3.5 shrink-0" />
          {w}
        </div>
      ))}
    </div>
  );
}

// swiss's gate owns the swissd session. It runs in this module's context, so an
// uninitialised site lands on this module's setup page.
export function SwissScope({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <Gate>
        <div className="flex h-full flex-col">
          <ClusterWarnings />
          <div className="min-h-0 flex-1">{children}</div>
        </div>
      </Gate>
    </ToastProvider>
  );
}
