import { useState, type FormEvent } from "react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@modelsphere/ui";
import { KeyRound } from "lucide-react";
import { PasswordStrength, SamePasswordHint, passwordMeetsRequirements } from "@/shell/PasswordStrength";
import { api } from "@/shell/api";
import { useT } from "@/shell/i18n";

export function ChangePassword() {
  const t = useT("shell");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (!passwordMeetsRequirements(newPassword)) {
      setError(t("password.tooWeak"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("password.mismatch"));
      return;
    }
    setBusy(true);
    try {
      await api.changePassword({ oldPassword, newPassword });
      window.location.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("password.failed"));
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-full items-center justify-center bg-surface-page p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="space-y-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <CardTitle>{t("password.resetTitle")}</CardTitle>
            <CardDescription className="mt-1.5">{t("password.resetDescription")}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">{t("password.current")}</Label>
              <Input
                id="current-password"
                type="password"
                autoComplete="current-password"
                value={oldPassword}
                onChange={(event) => setOldPassword(event.target.value)}
                disabled={busy}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">{t("password.new")}</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                disabled={busy}
              />
            </div>
            <PasswordStrength password={newPassword} />
            <SamePasswordHint current={oldPassword} next={newPassword} />
            <div className="space-y-2">
              <Label htmlFor="confirm-password">{t("password.confirm")}</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                disabled={busy}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button
              type="submit"
              className="w-full"
              disabled={busy || !oldPassword || !passwordMeetsRequirements(newPassword) || newPassword !== confirmPassword}
            >
              {busy ? t("common:status.submitting") : t("password.resetSubmit")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
