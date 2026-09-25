import { Check, X } from "lucide-react";

interface PasswordRequirement {
  id: string;
  label: string;
  test: (password: string) => boolean;
}

export const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  { id: "length", label: "至少 8 个字符", test: (password) => Array.from(password).length >= 8 },
  { id: "uppercase", label: "包含大写字母", test: (password) => /\p{Lu}/u.test(password) },
  { id: "lowercase", label: "包含小写字母", test: (password) => /\p{Ll}/u.test(password) },
  { id: "number", label: "包含数字", test: (password) => /\d/.test(password) },
  { id: "special", label: "包含特殊字符", test: (password) => /[\p{P}\p{S}]/u.test(password) },
];

export function passwordMeetsRequirements(password: string): boolean {
  return PASSWORD_REQUIREMENTS.every((requirement) => requirement.test(password));
}

export function PasswordStrength({ password }: { password: string }) {
  const results = PASSWORD_REQUIREMENTS.map((requirement) => ({
    ...requirement,
    met: requirement.test(password),
  }));
  const metCount = results.filter((requirement) => requirement.met).length;
  const strength = metCount === 5 ? "强" : metCount >= 3 ? "中" : "弱";
  const color = metCount === 5 ? "bg-emerald-500" : metCount >= 3 ? "bg-amber-500" : "bg-destructive";
  const textColor = metCount === 5 ? "text-emerald-700" : metCount >= 3 ? "text-amber-700" : "text-destructive";

  return (
    <div className="space-y-3" aria-live="polite">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">密码强度</span>
          <span className={`font-medium ${textColor}`}>{strength}</span>
        </div>
        <div
          className="grid h-1.5 grid-cols-5 gap-1"
          role="progressbar"
          aria-label="密码强度"
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
            <span>{requirement.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
