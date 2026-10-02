import type { ComponentType } from "react";
import { Card, CardContent } from "@modelsphere/ui";

// One number on the home page. Modules render these from their `overview`.
export function StatCard({ icon: Icon, label, value }: { icon: ComponentType<{ className?: string }>; label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="rounded-lg bg-primary/10 p-3 text-primary">
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <div className="text-2xl font-semibold">{value}</div>
          <div className="text-sm text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}
