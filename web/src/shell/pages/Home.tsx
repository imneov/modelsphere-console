import { Card, CardContent, CardHeader, CardTitle, PageHeader } from "@riseaicloud/ui";
import { LayoutDashboard } from "lucide-react";
import { useAuth } from "@/shell/auth";
import { ModuleProvider, type ConsoleModule } from "@/shell/module";
import { useT } from "@/shell/i18n";

export function Home({ modules }: { modules: ConsoleModule[] }) {
  const { me } = useAuth();
  const t = useT("shell");

  return (
    <div className="space-y-6">
      <PageHeader title={t("home.title")} icon={<LayoutDashboard className="h-5 w-5" />} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((m) => {
          const Overview = m.overview;
          return Overview ? (
            <ModuleProvider key={m.id} module={m}>
              <Overview />
            </ModuleProvider>
          ) : null;
        })}
      </div>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="text-base">{t("home.session")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div>
            <span className="text-muted-foreground">{t("home.user")}</span>
            {me?.name}
          </div>
          {me?.email && (
            <div>
              <span className="text-muted-foreground">{t("home.email")}</span>
              {me.email}
            </div>
          )}
          <div>
            <span className="text-muted-foreground">{t("home.groups")}</span>
            {me?.groups?.join(", ")}
          </div>
          <div>
            <span className="text-muted-foreground">{t("home.role")}</span>
            {t(me?.isAdmin ? "home.admin" : "home.member")}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
