import { useState } from "react";
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Tabs, TabsContent, TabsList, TabsTrigger } from "@riseaicloud/ui";
import { Code } from "lucide-react";
import { API_KEY_ENV, fenced, LANGUAGES, snippet, type Language } from "@/modules/playground/code";
import { Markdown } from "@/modules/playground/components/Markdown";

const FENCE: Record<Language, string> = { curl: "bash", python: "python", node: "javascript" };

// payload is read when the dialog opens, so it always shows the conversation and
// parameters as they are at that moment.
export function ViewCode({ payload, disabled, compact }: { payload: () => Record<string, unknown>; disabled?: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState<Record<string, unknown>>({});
  const baseURL = `${window.location.origin}/v1`;

  return (
    <>
      <Button
        variant={compact ? "ghost" : "outline"}
        size={compact ? "sm" : "default"}
        className={compact ? "h-7 px-2" : undefined}
        disabled={disabled}
        title="查看代码"
        onClick={() => {
          setBody(payload());
          setOpen(true);
        }}
      >
        <Code className={compact ? "h-3.5 w-3.5" : "mr-1 h-4 w-4"} />
        {compact ? null : "查看代码"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle>查看代码</DialogTitle>
            <DialogDescription>
              用当前的模型、参数和对话调用 OpenAI 兼容接口。先把环境变量 <code>{API_KEY_ENV}</code> 设为管理员发放的 API Key。
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="curl">
            <TabsList>
              {LANGUAGES.map((l) => (
                <TabsTrigger key={l.id} value={l.id}>
                  {l.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {LANGUAGES.map((l) => (
              <TabsContent key={l.id} value={l.id}>
                <Markdown text={fenced(FENCE[l.id], snippet(l.id, baseURL, body))} />
              </TabsContent>
            ))}
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
