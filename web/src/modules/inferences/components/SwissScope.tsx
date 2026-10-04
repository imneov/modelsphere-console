import type { ReactNode } from "react";
import { ModuleProvider } from "@/shell";
import { swissModule } from "@/modules/swiss";
import { Gate } from "@swiss/components/Session";
import { ToastProvider } from "@swiss/components/ui/toast";

// swiss's gate owns the swissd session. It runs in this module's context, so an
// uninitialised site lands on this module's setup page.
export function SwissScope({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <Gate>{children}</Gate>
    </ToastProvider>
  );
}

// swiss's panels write their links as swiss paths ("/catalog"); rendered here
// they resolve against swiss's mount point.
export function InSwiss({ children }: { children: ReactNode }) {
  return <ModuleProvider module={swissModule}>{children}</ModuleProvider>;
}
