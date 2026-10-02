import { Switch as KitSwitch } from "@modelsphere/ui";

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return <KitSwitch checked={checked} onCheckedChange={(v) => onChange(v)} disabled={disabled} aria-label={label} />;
}
