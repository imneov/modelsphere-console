import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@riseaicloud/ui";
import { ApiError } from "@/shell";
import { Check, Copy, Eraser, FlaskConical, RefreshCw, Send, Square } from "lucide-react";
import { api, type ChatMessage, type ChatParams, type Delta, type Model, type StreamResult } from "@/modules/playground/api";

interface Stats {
  ttftMs?: number;
  ms: number;
  promptTokens?: number;
  completionTokens?: number;
}

interface Turn {
  role: "user" | "assistant";
  content: string;
  reasoning: string;
  stats?: Stats;
  error?: string;
  pending?: boolean;
  stopped?: boolean;
}

const DEFAULTS = { temperature: "0.7", topP: "0.95", maxTokens: "1024" };

export function Playground() {
  const models = useQuery({ queryKey: ["playground", "models"], queryFn: api.models, retry: false });

  const [model, setModel] = useState("");
  const [system, setSystem] = useState("");
  const [temperature, setTemperature] = useState(DEFAULTS.temperature);
  const [topP, setTopP] = useState(DEFAULTS.topP);
  const [maxTokens, setMaxTokens] = useState(DEFAULTS.maxTokens);

  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [sessionId, setSessionId] = useState(newSessionId);

  const abortRef = useRef<AbortController | null>(null);
  const bufferRef = useRef({ text: "", reasoning: "" });
  const frameRef = useRef(0);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    const first = models.data?.[0]?.id;
    if (!model && first) setModel(first);
  }, [models.data, model]);

  // Deltas arrive far faster than a screen refreshes; appending each one to the
  // transcript would re-render the whole conversation per token. They accumulate
  // in the ref and land once per frame -- or immediately, when the stream ends.
  const commit = useCallback(() => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    }
    const { text, reasoning } = bufferRef.current;
    bufferRef.current = { text: "", reasoning: "" };
    if (!text && !reasoning) return;
    setTurns((prev) => replaceLast(prev, (turn) => ({ ...turn, content: turn.content + text, reasoning: turn.reasoning + reasoning })));
  }, []);

  const pushDelta = useCallback(
    (delta: Delta) => {
      bufferRef.current.text += delta.text ?? "";
      bufferRef.current.reasoning += delta.reasoning ?? "";
      if (!frameRef.current) frameRef.current = requestAnimationFrame(commit);
    },
    [commit],
  );

  const params = useMemo<ChatParams>(
    () => ({
      model,
      system: system.trim(),
      temperature: numberOr(temperature, 0.7),
      topP: numberOr(topP, 0.95),
      maxTokens: Math.max(0, Math.round(numberOr(maxTokens, 1024))),
    }),
    [model, system, temperature, topP, maxTokens],
  );

  const run = useCallback(
    async (history: Turn[]) => {
      if (!params.model) return;
      const controller = new AbortController();
      abortRef.current = controller;
      setStreaming(true);
      setTurns([...history, { role: "assistant", content: "", reasoning: "", pending: true }]);

      // The system prompt travels separately, so only the conversation is here.
      const messages: ChatMessage[] = history.map(({ role, content }) => ({ role, content }));
      try {
        const result: StreamResult = await api.streamChat({
          messages,
          params,
          sessionId,
          signal: controller.signal,
          onDelta: pushDelta,
        });
        commit();
        setTurns((prev) => replaceLast(prev, (turn) => ({ ...turn, pending: false, stopped: result.aborted, stats: statsOf(result) })));
      } catch (err) {
        commit();
        const message = err instanceof ApiError ? gatewayHint(err.status, err.message) : String(err);
        setTurns((prev) => replaceLast(prev, (turn) => ({ ...turn, pending: false, error: message })));
      } finally {
        abortRef.current = null;
        setStreaming(false);
      }
    },
    [commit, params, pushDelta, sessionId],
  );

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || streaming || !params.model) return;
    setInput("");
    void run([...turns, { role: "user", content: text, reasoning: "" }]);
  }, [input, params.model, run, streaming, turns]);

  const regenerate = useCallback(() => {
    if (streaming) return;
    // Drop the answer being replaced, and anything after it.
    let last = -1;
    for (let i = turns.length - 1; i >= 0; i--) {
      if (turns[i].role === "user") {
        last = i;
        break;
      }
    }
    if (last === -1) return;
    void run(turns.slice(0, last + 1));
  }, [run, streaming, turns]);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    commit();
    setTurns([]);
    setInput("");
    setSessionId(newSessionId());
  }, [commit]);

  useEffect(() => {
    if (!stickRef.current) return;
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Playground"
        icon={<FlaskConical className="h-5 w-5" />}
        extra={
          <Button variant="outline" onClick={newChat} disabled={!turns.length}>
            <Eraser className="mr-1 h-4 w-4" />
            新建对话
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">参数</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pg-model">模型</Label>
              <Select value={model} onValueChange={setModel} disabled={!models.data?.length}>
                <SelectTrigger id="pg-model">
                  <SelectValue placeholder={models.isLoading ? "加载中…" : "无可用模型"} />
                </SelectTrigger>
                <SelectContent>
                  {(models.data ?? []).map((m: Model) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {models.error ? (
                <p className="text-xs text-destructive">{modelsHint(models.error)}</p>
              ) : (
                <p className="text-xs text-muted-foreground">网关当前的模型列表（GET /v1/models）。</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="pg-system">系统提示词</Label>
              <Textarea
                id="pg-system"
                rows={5}
                value={system}
                onChange={(e) => setSystem(e.target.value)}
                placeholder="可选。发送时作为 messages 里的 system。"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="pg-temp">Temperature</Label>
                <Input id="pg-temp" value={temperature} onChange={(e) => setTemperature(e.target.value)} inputMode="decimal" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pg-topp">Top P</Label>
                <Input id="pg-topp" value={topP} onChange={(e) => setTopP(e.target.value)} inputMode="decimal" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pg-max">最大输出 tokens</Label>
              <Input id="pg-max" value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} inputMode="numeric" />
            </div>

            <p className="text-xs text-muted-foreground">
              同一个对话使用固定的 X-Session-Id：网关把这一轮对话固定在同一个推理实例上，前缀缓存因此保持命中。
            </p>
          </CardContent>
        </Card>

        <Card className="flex min-h-[70vh] flex-col">
          <CardHeader className="border-b border-border">
            <CardTitle className="text-base">
              对话
              {sessionId ? <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">{sessionId.slice(0, 8)}</span> : null}
            </CardTitle>
          </CardHeader>

          <div
            ref={scrollerRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            }}
            className="flex-1 space-y-4 overflow-y-auto p-4"
          >
            {turns.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center">
                <FlaskConical className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">选择一个模型开始对话。</p>
                <p className="max-w-md text-xs text-muted-foreground">
                  请求经 console 转到推理网关，网关密钥保存在服务端，不下发到浏览器。
                </p>
              </div>
            ) : (
              turns.map((turn, i) => <Bubble key={i} turn={turn} onRegenerate={i === turns.length - 1 ? regenerate : undefined} />)
            )}
          </div>

          <div className="space-y-2 border-t border-border p-4">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={3}
              placeholder="Enter 发送，Shift+Enter 换行"
              disabled={!params.model}
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{streaming ? "生成中…" : `${turns.length} 条消息`}</span>
              {streaming ? (
                <Button variant="outline" onClick={stop}>
                  <Square className="mr-1 h-4 w-4" />
                  停止
                </Button>
              ) : (
                <Button onClick={send} disabled={!input.trim() || !params.model}>
                  <Send className="mr-1 h-4 w-4" />
                  发送
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Bubble({ turn, onRegenerate }: { turn: Turn; onRegenerate?: () => void }) {
  const [copied, setCopied] = useState(false);

  // The console is commonly served over plain http on a node port, where the
  // clipboard API does not exist. Copying is a convenience, not a feature.
  const copy = useCallback(() => {
    void navigator.clipboard
      ?.writeText(turn.content)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }, [turn.content]);

  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">{turn.content}</div>
      </div>
    );
  }

  const empty = !turn.content && !turn.reasoning;
  return (
    <div className="max-w-[95%] space-y-2">
      <div className="text-xs font-medium text-muted-foreground">助手</div>

      {turn.reasoning ? (
        <details className="rounded-md border border-border bg-muted/40 px-3 py-2">
          <summary className="cursor-pointer text-xs text-muted-foreground">思考过程</summary>
          <div className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{turn.reasoning}</div>
        </details>
      ) : null}

      {turn.content ? <div className="whitespace-pre-wrap text-sm">{turn.content}</div> : null}

      {empty && turn.pending ? <div className="text-sm text-muted-foreground">…</div> : null}

      {turn.error ? <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{turn.error}</div> : null}

      <div className="flex items-center gap-3">
        {turn.stats ? (
          <span className="text-xs text-muted-foreground">
            {statsText(turn.stats)}
            {turn.stopped ? " · 已停止" : ""}
          </span>
        ) : null}
        {!turn.pending && turn.content ? (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={copy}>
              {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
              复制
            </Button>
            {onRegenerate ? (
              <Button variant="ghost" size="sm" onClick={onRegenerate}>
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
                重新生成
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function replaceLast(turns: Turn[], update: (turn: Turn) => Turn): Turn[] {
  if (!turns.length) return turns;
  return [...turns.slice(0, -1), update(turns[turns.length - 1])];
}

function statsOf(result: StreamResult): Stats {
  return { ttftMs: result.ttftMs, ms: result.ms, promptTokens: result.promptTokens, completionTokens: result.completionTokens };
}

function statsText(stats: Stats): string {
  const parts: string[] = [];
  if (stats.ttftMs !== undefined) parts.push(`首字 ${Math.round(stats.ttftMs)} ms`);
  parts.push(`用时 ${(stats.ms / 1000).toFixed(1)} s`);
  if (stats.promptTokens !== undefined) parts.push(`输入 ${stats.promptTokens} tok`);
  if (stats.completionTokens !== undefined) {
    parts.push(`输出 ${stats.completionTokens} tok`);
    // tok/s over the decoding window, so the numbers add up with 首字.
    const span = stats.ms - (stats.ttftMs ?? 0);
    if (span > 0 && stats.completionTokens > 0) parts.push(`${((stats.completionTokens * 1000) / span).toFixed(1)} tok/s`);
  }
  return parts.join(" · ");
}

function newSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `pg-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function numberOr(value: string, fallback: number): number {
  const n = Number(value);
  return value.trim() === "" || Number.isNaN(n) ? fallback : n;
}

// Every failure here is a wiring problem an operator has to fix, and the status
// is what says which one.
function wiringProblem(status: number): string {
  switch (status) {
    case 401:
      return "网关拒绝了凭据：检查 backends.llm 的 apiKeyEnv 指向的环境变量";
    case 403:
      return "没有 llm 后端的权限：角色需要在 backends/llm 上授予 get 和 create";
    case 502:
      return "网关不可达：检查 backends.llm.url 指向的服务和路由名";
    default:
      return "";
  }
}

function gatewayHint(status: number, message: string): string {
  const why = wiringProblem(status);
  return why ? `${why}（${message}）` : message;
}

function modelsHint(error: unknown): string {
  if (!(error instanceof ApiError)) return `无法获取模型列表：${String(error)}`;
  const why = wiringProblem(error.status);
  return why ? `无法获取模型列表——${why}` : `无法获取模型列表（${error.status}）：${error.message}`;
}
