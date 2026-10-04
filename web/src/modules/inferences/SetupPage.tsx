import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Alert, AlertDescription, PageBanner, Skeleton } from "@modelsphere/ui";
import { Settings2, TriangleAlert } from "lucide-react";
import { useModulePath } from "@/shell";
import { api, type ProfileResponse } from "@swiss/lib/api";
import { useT } from "@/modules/inferences/i18n";
import { ProfileEditorBody, SaveButton, useProfileEditor } from "@/modules/inferences/components/ProfileEditor";

export function SetupPage() {
  const t = useT();
  const existing = useQuery({ queryKey: ["profile"], queryFn: api.profile, retry: false });
  const template = useQuery({ queryKey: ["profile-template"], queryFn: api.profileTemplate, enabled: existing.isSuccess && !existing.data.profile });
  const start = existing.data?.profile ? existing.data : template.data;
  return (
    <div className="flex h-full flex-col">
      <PageBanner title={t("profile.setup.title")} description={t("profile.setup.description")} icon={<Settings2 className="size-5" />} />
      <div className="min-h-0 flex-1 overflow-auto bg-surface-page p-4">
        <div className="mx-auto max-w-4xl space-y-4">
          {existing.data?.error && (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertDescription>{t("profile.parseError", { error: existing.data.error })}</AlertDescription>
            </Alert>
          )}
          {start?.profile ? <Setup start={start} saveLabel={t(existing.data?.profile ? "profile.setup.saveExisting" : "profile.setup.save")} /> : <Skeleton className="h-96 w-full" />}
        </div>
      </div>
    </div>
  );
}

function Setup({ start, saveLabel }: { start: ProfileResponse; saveLabel: string }) {
  const p = useModulePath();
  const navigate = useNavigate();
  const editor = useProfileEditor(start.profile!, start.yaml ?? "", () => navigate(p(""), { replace: true }));
  return (
    <>
      <ProfileEditorBody editor={editor} />
      <div className="flex justify-end">
        <SaveButton editor={editor} label={saveLabel} />
      </div>
    </>
  );
}
