import { useEffect, useMemo, useState } from "react";
import { Button, Card, CardContent, CardHeader, CardTitle, Label, PageBanner } from "@modelsphere/ui";
import { Eraser, FlaskConical } from "lucide-react";
import { buildPayload } from "@/modules/playground/api";
import { Composer } from "@/modules/playground/components/Composer";
import { ModelSelect, NoModels, useModels, useTarget } from "@/modules/playground/components/ModelSelect";
import { ParamsPanel } from "@/modules/playground/components/ParamsPanel";
import { Transcript } from "@/modules/playground/components/Transcript";
import { ViewCode } from "@/modules/playground/components/ViewCode";
import { tNodes } from "@/shell";
import { useT } from "@/modules/playground/i18n";
import { DEFAULT_FORM, toChatParams, type ParamsForm } from "@/modules/playground/params";
import { historyOf, modelsHint, useChat } from "@/modules/playground/useChat";

export function Chat() {
  const t = useT();
  const models = useModels();
  const [model, setModel] = useState("");
  const [form, setForm] = useState<ParamsForm>(DEFAULT_FORM);
  // model is the picked deployment's route; target is that deployment while it
  // is still listed and ready.
  const target = useTarget(model);
  const params = useMemo(() => toChatParams(target?.model ?? "", form, target?.id), [target?.model, target?.id, form]);
  const chat = useChat(params);

  useEffect(() => {
    const first = models.data?.find((m) => m.ready)?.id;
    if (!model && first) setModel(first);
  }, [models.data, model]);

  const payload = () => buildPayload(historyOf(chat.turns), params);

  return (
    <div>
      <PageBanner
        title={t("chat.title")}
        icon={<FlaskConical className="size-5" />}
        actions={
          <div className="flex items-center gap-2">
            <ViewCode payload={payload} disabled={!target} />
            <Button variant="outline" onClick={chat.clear} disabled={!chat.turns.length}>
              <Eraser data-icon="inline-start" />
              {t("chat.newChat")}
            </Button>
          </div>
        }
      />

      <div className="space-y-4 p-4">
        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <Card className="h-fit lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto">
            <CardHeader>
              <CardTitle className="text-base">{t("chat.params")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pg-model">{t("chat.model")}</Label>
                <ModelSelect id="pg-model" value={model} onChange={setModel} />
                {models.error ? (
                  <p className="text-xs text-destructive">{modelsHint(t, models.error)}</p>
                ) : models.data && !models.data.some((m) => m.ready) ? (
                  <NoModels />
                ) : (
                  <p className="text-xs text-muted-foreground">{t("chat.modelsSource")}</p>
                )}
              </div>
              <ParamsPanel form={form} onChange={setForm} idPrefix="pg" />
              <p className="text-xs text-muted-foreground">{t("chat.sessionHint")}</p>
            </CardContent>
          </Card>

          <Card className="flex h-[calc(100vh-14rem)] min-h-[520px] flex-col gap-0 py-0">
            <CardHeader className="border-b border-border pt-4">
              <CardTitle className="text-base">
                {t("chat.transcript")}
                <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">{chat.sessionId.slice(0, 8)}</span>
              </CardTitle>
            </CardHeader>
            <Transcript
              chat={chat}
              className="flex-1"
              empty={
                <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center">
                  <FlaskConical className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {target ? tNodes(t, "chat.emptyWithModel", { model: <span className="font-mono text-foreground">{`${target.release} · ${target.model}`}</span> }) : t("chat.emptyTitle")}
                  </p>
                  <p className="max-w-md text-xs text-muted-foreground">{t("chat.emptyHint")}</p>
                </div>
              }
            />
            <Composer
              disabled={!target}
              streaming={chat.streaming}
              pendingUser={chat.turns.at(-1)?.role === "user"}
              onSend={chat.send}
              onAdd={chat.add}
              onStop={chat.stop}
              status={chat.streaming ? t("chat.generating") : t("chat.messages", { n: chat.turns.length })}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
