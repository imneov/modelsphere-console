import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/shell";
import { api, type ChatMessage, type ChatParams, type Delta } from "@/modules/playground/api";
import { statsOf, type Stats } from "@/modules/playground/stats";
import { splitThink } from "@/modules/playground/think";

export type Role = "user" | "assistant";

export interface Turn {
  id: string;
  role: Role;
  content: string;
  reasoning: string;
  stats?: Stats;
  error?: string;
  pending?: boolean;
  stopped?: boolean;
}

export interface Chat {
  turns: Turn[];
  streaming: boolean;
  sessionId: string;
  // send appends text as a turn of role (user by default) and asks for an
  // answer; with no text it answers the conversation as it stands.
  send: (text?: string, role?: Role) => void;
  add: (role: Role, text: string) => void;
  edit: (id: string, content: string) => void;
  remove: (id: string) => void;
  regenerate: () => void;
  stop: () => void;
  clear: () => void;
  canSend: boolean;
}

export function useChat(params: ChatParams): Chat {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [sessionId, setSessionId] = useState(newId);

  const paramsRef = useRef(params);
  paramsRef.current = params;
  const turnsRef = useRef(turns);
  turnsRef.current = turns;
  const streamingRef = useRef(false);

  const abortRef = useRef<AbortController | null>(null);
  const bufferRef = useRef({ text: "", reasoning: "" });
  const frameRef = useRef(0);

  // Deltas arrive far faster than a screen refreshes; they accumulate here and
  // land once per frame, or immediately when the stream ends.
  const commit = useCallback(() => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    }
    const { text, reasoning } = bufferRef.current;
    bufferRef.current = { text: "", reasoning: "" };
    if (!text && !reasoning) return;
    setTurns((prev) => replaceLast(prev, (t) => ({ ...t, content: t.content + text, reasoning: t.reasoning + reasoning })));
  }, []);

  const pushDelta = useCallback(
    (delta: Delta) => {
      bufferRef.current.text += delta.text ?? "";
      bufferRef.current.reasoning += delta.reasoning ?? "";
      if (!frameRef.current) frameRef.current = requestAnimationFrame(commit);
    },
    [commit],
  );

  const run = useCallback(
    async (history: Turn[]) => {
      const current = paramsRef.current;
      if (!current.model || streamingRef.current) return;
      const controller = new AbortController();
      abortRef.current = controller;
      streamingRef.current = true;
      setStreaming(true);
      setTurns([...history, { id: newId(), role: "assistant", content: "", reasoning: "", pending: true }]);

      const messages = historyOf(history);
      try {
        const result = await api.streamChat({ messages, params: current, sessionId, signal: controller.signal, onDelta: pushDelta });
        commit();
        setTurns((prev) => replaceLast(prev, (t) => ({ ...t, pending: false, stopped: result.aborted, stats: statsOf(result) })));
      } catch (err) {
        commit();
        const message = err instanceof ApiError ? gatewayHint(err.status, err.message) : String(err);
        setTurns((prev) => replaceLast(prev, (t) => ({ ...t, pending: false, error: message })));
      } finally {
        abortRef.current = null;
        streamingRef.current = false;
        setStreaming(false);
      }
    },
    [commit, pushDelta, sessionId],
  );

  const send = useCallback(
    (text?: string, role: Role = "user") => {
      const body = text?.trim() ?? "";
      const history = turnsRef.current;
      if (body) void run([...history, { id: newId(), role, content: body, reasoning: "" }]);
      else if (history.at(-1)?.role === "user") void run(history);
    },
    [run],
  );

  const add = useCallback((role: Role, text: string) => {
    const body = text.trim();
    if (!body || streamingRef.current) return;
    setTurns((prev) => [...prev, { id: newId(), role, content: body, reasoning: "" }]);
  }, []);

  const edit = useCallback((id: string, content: string) => {
    setTurns((prev) => prev.map((t) => (t.id === id ? { ...t, content, error: undefined } : t)));
  }, []);

  const remove = useCallback((id: string) => {
    if (streamingRef.current) return;
    setTurns((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const regenerate = useCallback(() => {
    const history = turnsRef.current;
    let last = -1;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === "user") {
        last = i;
        break;
      }
    }
    if (last !== -1) void run(history.slice(0, last + 1));
  }, [run]);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    commit();
    setTurns([]);
    setSessionId(newId());
  }, [commit]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return {
    turns,
    streaming,
    sessionId,
    send,
    add,
    edit,
    remove,
    regenerate,
    stop,
    clear,
    canSend: !!params.model && !streaming,
  };
}

// historyOf is what goes back to the model: finished turns only, and an answer's
// reasoning stays behind -- it was never meant to be part of the context.
export function historyOf(turns: Turn[]): ChatMessage[] {
  return turns
    .filter((t) => !t.pending)
    .map(({ role, content }) => ({ role, content: role === "assistant" ? splitThink(content).answer : content }));
}

function replaceLast(turns: Turn[], update: (turn: Turn) => Turn): Turn[] {
  if (!turns.length) return turns;
  return [...turns.slice(0, -1), update(turns[turns.length - 1])];
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `pg-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

// Every failure here is a wiring problem an operator has to fix, and the status
// is what says which one.
export function wiringProblem(status: number): string {
  switch (status) {
    case 404:
      return "这个 console 没有配置 llm 后端：chart 里设置 playground.gateway 的 profile 或 configMap";
    case 401:
      return "网关拒绝了凭据：检查 site profile 里 route.auth.secretRef 指向的 Secret";
    case 403:
      return "没有 llm 后端的权限：角色需要在 backends/llm 上授予 get 和 create";
    case 502:
      return "网关不可达或没解析出来：检查 backends.llm.gateway 指向的 profile / ConfigMap / Service";
    default:
      return "";
  }
}

function gatewayHint(status: number, message: string): string {
  const why = wiringProblem(status);
  return why ? `${why}（${message}）` : message;
}

export function modelsHint(error: unknown): string {
  if (!(error instanceof ApiError)) return `无法获取模型列表：${String(error)}`;
  const why = wiringProblem(error.status);
  return why ? `无法获取模型列表——${why}` : `无法获取模型列表（${error.status}）：${error.message}`;
}
