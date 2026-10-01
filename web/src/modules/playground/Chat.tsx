import { useEffect, useMemo, useState } from "react";
import { Button, Card, CardContent, CardHeader, CardTitle, Label, PageHeader } from "@riseaicloud/ui";
import { Eraser, FlaskConical } from "lucide-react";
import { buildPayload } from "@/modules/playground/api";
import { Composer } from "@/modules/playground/components/Composer";
import { ModelSelect, useModels } from "@/modules/playground/components/ModelSelect";
import { ParamsPanel } from "@/modules/playground/components/ParamsPanel";
import { Transcript } from "@/modules/playground/components/Transcript";
import { ViewCode } from "@/modules/playground/components/ViewCode";
import { DEFAULT_FORM, toChatParams, type ParamsForm } from "@/modules/playground/params";
import { historyOf, modelsHint, useChat } from "@/modules/playground/useChat";

export function Chat() {
  const models = useModels();
  const [model, setModel] = useState("");
  const [form, setForm] = useState<ParamsForm>(DEFAULT_FORM);
  const params = useMemo(() => toChatParams(model, form), [model, form]);
  const chat = useChat(params);

  useEffect(() => {
    const first = models.data?.[0]?.id;
    if (!model && first) setModel(first);
  }, [models.data, model]);

  const payload = () => buildPayload(historyOf(chat.turns), params);

  return (
    <div className="space-y-4">
      <PageHeader
        title="对话"
        icon={<FlaskConical className="h-5 w-5" />}
        extra={
          <div className="flex items-center gap-2">
            <ViewCode payload={payload} disabled={!model} />
            <Button variant="outline" onClick={chat.clear} disabled={!chat.turns.length}>
              <Eraser className="mr-1 h-4 w-4" />
              新建对话
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="h-fit lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto">
          <CardHeader>
            <CardTitle className="text-base">参数</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pg-model">模型</Label>
              <ModelSelect id="pg-model" value={model} onChange={setModel} />
              {models.error ? (
                <p className="text-xs text-destructive">{modelsHint(models.error)}</p>
              ) : (
                <p className="text-xs text-muted-foreground">网关当前的模型列表（GET /v1/models）。</p>
              )}
            </div>
            <ParamsPanel form={form} onChange={setForm} idPrefix="pg" />
            <p className="text-xs text-muted-foreground">同一个对话使用固定的 X-Session-Id：网关把整段对话固定在同一个推理实例上，前缀缓存因此保持命中。</p>
          </CardContent>
        </Card>

        <Card className="flex h-[calc(100vh-14rem)] min-h-[520px] flex-col">
          <CardHeader className="border-b border-border">
            <CardTitle className="text-base">
              对话
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
                  {model ? (
                    <>
                      在下方输入消息，开始与 <span className="font-mono text-foreground">{model}</span> 对话。
                    </>
                  ) : (
                    "选择一个模型开始对话。"
                  )}
                </p>
                <p className="max-w-md text-xs text-muted-foreground">请求经 console 转到推理网关，网关密钥保存在服务端，不下发到浏览器。</p>
              </div>
            }
          />
          <Composer
            disabled={!model}
            streaming={chat.streaming}
            pendingUser={chat.turns.at(-1)?.role === "user"}
            onSend={chat.send}
            onAdd={chat.add}
            onStop={chat.stop}
            status={chat.streaming ? "生成中…" : `${chat.turns.length} 条消息`}
          />
        </Card>
      </div>
    </div>
  );
}
