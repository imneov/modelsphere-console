import { Label } from "@modelsphere/ui";

export { Input } from "@modelsphere/ui";

// No kit equivalent: a labelled box with an optional note under it. Built on
// the kit's Label so the <label> is the one the library styles and associates.
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <Label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs font-normal text-muted-foreground">{hint}</span>}
    </Label>
  );
}
