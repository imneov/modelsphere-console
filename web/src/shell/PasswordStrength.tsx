import { Check, TriangleAlert, X } from "lucide-react";
import { useT } from "@/shell/i18n";

interface PasswordRequirement {
  id: "length" | "uppercase" | "lowercase" | "number" | "special";
  test: (password: string) => boolean;
}

export const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  { id: "length", test: (password) => Array.from(password).length >= 8 },
  { id: "uppercase", test: (password) => /\p{Lu}/u.test(password) },
  { id: "lowercase", test: (password) => /\p{Ll}/u.test(password) },
  { id: "number", test: (password) => /\d/.test(password) },
  { id: "special", test: (password) => /[\p{P}\p{S}]/u.test(password) },
];

export function passwordMeetsRequirements(password: string): boolean {
  return PASSWORD_REQUIREMENTS.every((requirement) => requirement.test(password));
}

// A reminder, not a rule: keeping the current password is allowed.
export function SamePasswordHint({ current, next }: { current: string; next: string }) {
  const t = useT("shell");
  if (!current || current !== next) return null;
  return (
    <p className="flex items-center gap-2 text-sm text-amber-700" role="status">
      <TriangleAlert className="h-4 w-4 shrink-0" />
      {t("password.same")}
    </p>
  );
}

export function PasswordStrength({ password }: { password: string }) {
  const t = useT("shell");
  const results = PASSWORD_REQUIREMENTS.map((requirement) => ({
    ...requirement,
    met: requirement.test(password),
  }));
  const metCount = results.filter((requirement) => requirement.met).length;
  const strength = t(metCount === 5 ? "strength.strong" : metCount >= 3 ? "strength.medium" : "strength.weak");
  const color = metCount === 5 ? "bg-emerald-500" : metCount >= 3 ? "bg-amber-500" : "bg-destructive";
  const textColor = metCount === 5 ? "text-emerald-700" : metCount >= 3 ? "text-amber-700" : "text-destructive";

  return (
    <div className="space-y-3" aria-live="polite">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{t("strength.label")}</span>
          <span className={`font-medium ${textColor}`}>{strength}</span>
        </div>
        <div
          className="grid h-1.5 grid-cols-5 gap-1"
          role="progressbar"
          aria-label={t("strength.label")}
          aria-valuemin={0}
          aria-valuemax={5}
          aria-valuenow={metCount}
        >
          {PASSWORD_REQUIREMENTS.map((requirement, index) => (
            <span key={requirement.id} className={`rounded-sm ${index < metCount ? color : "bg-muted"}`} />
          ))}
        </div>
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {results.map((requirement) => (
          <div
            key={requirement.id}
            className={`flex items-center gap-2 text-xs ${requirement.met ? "text-emerald-700" : "text-muted-foreground"}`}
          >
            {requirement.met ? <Check className="h-3.5 w-3.5 shrink-0" /> : <X className="h-3.5 w-3.5 shrink-0" />}
            <span>{t(`strength.${requirement.id}`)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
