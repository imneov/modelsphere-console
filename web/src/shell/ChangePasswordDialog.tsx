import { useState, type FormEvent } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@riseaicloud/ui";
import { api } from "@/shell/api";
import { PasswordStrength, SamePasswordHint, passwordMeetsRequirements } from "@/shell/PasswordStrength";
import { useT } from "@/shell/i18n";

export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT("shell");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  const reset = () => {
    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setError("");
    setSucceeded(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) reset();
  };

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
      setSucceeded(true);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("password.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("password.changeTitle")}</DialogTitle>
          <DialogDescription>{t("password.changeDescription")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="change-current-password">{t("password.current")}</Label>
            <Input
              id="change-current-password"
              type="password"
              autoComplete="current-password"
              value={oldPassword}
              onChange={(event) => setOldPassword(event.target.value)}
              disabled={busy || succeeded}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="change-new-password">{t("password.new")}</Label>
            <Input
              id="change-new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              disabled={busy || succeeded}
            />
          </div>
          <PasswordStrength password={newPassword} />
          <SamePasswordHint current={oldPassword} next={newPassword} />
          <div className="space-y-2">
            <Label htmlFor="change-confirm-password">{t("password.confirm")}</Label>
            <Input
              id="change-confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              disabled={busy || succeeded}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          {succeeded && <p className="text-sm text-emerald-700">{t("password.updated")}</p>}
          <DialogFooter>
            {succeeded ? (
              <Button type="button" onClick={() => handleOpenChange(false)}>
                {t("common:actions.done")}
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
                  {t("common:actions.cancel")}
                </Button>
                <Button
                  type="submit"
                  disabled={busy || !oldPassword || !passwordMeetsRequirements(newPassword) || newPassword !== confirmPassword}
                >
                  {busy ? t("common:status.submitting") : t("password.changeSubmit")}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
