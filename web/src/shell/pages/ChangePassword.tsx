import { useState, type FormEvent } from "react";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@riseaicloud/ui";
import { KeyRound } from "lucide-react";
import { PasswordStrength, SamePasswordHint, passwordMeetsRequirements } from "@/shell/PasswordStrength";
import { api } from "@/shell/api";

export function ChangePassword() {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
      window.location.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "修改密码失败");
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
            <CardTitle>设置新密码</CardTitle>
            <CardDescription className="mt-1.5">首次登录请设置密码后继续使用控制台，建议不要沿用初始密码。</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">当前密码</Label>
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
              <Label htmlFor="new-password">新密码</Label>
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
              <Label htmlFor="confirm-password">确认新密码</Label>
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
              {busy ? "提交中..." : "设置新密码"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
