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
import { PasswordStrength, passwordMeetsRequirements } from "@/shell/PasswordStrength";

export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
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
      setError("新密码不符合复杂度要求");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致");
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
      setError(err instanceof Error ? err.message : "修改密码失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>修改密码</DialogTitle>
          <DialogDescription>输入当前密码并设置符合复杂度要求的新密码。</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="change-current-password">当前密码</Label>
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
            <Label htmlFor="change-new-password">新密码</Label>
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
          <div className="space-y-2">
            <Label htmlFor="change-confirm-password">确认新密码</Label>
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
          {succeeded && <p className="text-sm text-emerald-700">密码已更新。</p>}
          <DialogFooter>
            {succeeded ? (
              <Button type="button" onClick={() => handleOpenChange(false)}>
                完成
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
                  取消
                </Button>
                <Button
                  type="submit"
                  disabled={busy || !oldPassword || !passwordMeetsRequirements(newPassword) || newPassword !== confirmPassword}
                >
                  {busy ? "提交中..." : "修改密码"}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
