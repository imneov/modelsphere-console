import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@riseaicloud/ui";
import { useAuth } from "@/shell/auth";
import { useT } from "@/shell/i18n";
import { LocaleSwitch } from "@/shell/LocaleSwitch";

export function Login() {
  const { me, login } = useAuth();
  const navigate = useNavigate();
  const t = useT("shell");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (me) {
    navigate("/", { replace: true });
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(username, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("login.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-full items-center justify-center bg-surface-page p-4">
      <LocaleSwitch className="absolute top-4 right-4 w-32" />
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>ModelSphere</CardTitle>
          <CardDescription>{t("login.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">{t("login.username")}</Label>
              <Input
                id="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("login.password")}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy}>
              {t(busy ? "login.submitting" : "login.submit")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
