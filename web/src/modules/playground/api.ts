import { apiFetch, ApiError, request } from "@/shell";
import { SSEParser } from "@/modules/playground/sse";

// console proxies this prefix to llm-openresty's route (console.yaml backends:
// llm), adding the gateway key it holds. The browser never sees that key.
const BASE = "/api/llm/v1";

export interface Model {
  id: string;
  owned_by?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type ReasoningEffort = "" | "none" | "minimal" | "low" | "medium" | "high";

export interface ChatParams {
  model: string;
  system: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  // Optional: NaN, empty or absent means the request does not carry it, so the
  // engine's own default applies.
  seed?: number;
  stop?: string[];
  frequencyPenalty?: number;
  presencePenalty?: number;
  reasoningEffort?: ReasoningEffort;
}

export interface Delta {
  text?: string;
  reasoning?: string;
}

export interface StreamResult {
  text: string;
  reasoning: string;
  // Time to the first token, and the whole request. Both from performance.now()
  // in this tab, so they include the proxy hop -- which is part of what a
  // playground is for.
  ttftMs?: number;
  ms: number;
  promptTokens?: number;
  completionTokens?: number;
  // Prompt tokens served from the engine's prefix cache, when the engine reports
  // usage.prompt_tokens_details.
  cachedTokens?: number;
  aborted: boolean;
}

interface Chunk {
  choices?: { delta?: { content?: string; reasoning_content?: string } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number } | null;
  } | null;
  error?: { message?: string } | string;
}

export const api = {
  // llm-openresty answers this from the route's own model list, behind the same
  // key as inference (lua/access.lua: serve_models after the key check).
  models: async (): Promise<Model[]> => {
    const body = await request<{ data?: Model[] }>("GET", `${BASE}/models`);
    return body.data ?? [];
  },

  // streamChat posts one turn and reports deltas as they arrive. The
  // conversation id rides X-Session-Id, which the gateway pins to a backend:
  // every turn of a conversation hits the same engine, so its prefix cache is
  // warm (llm-openresty's whole reason for existing).
  streamChat: async (args: {
    messages: ChatMessage[];
    params: ChatParams;
    sessionId: string;
    signal: AbortSignal;
    onDelta: (delta: Delta) => void;
  }): Promise<StreamResult> => {
    const { messages, params, sessionId, signal, onDelta } = args;
    const started = performance.now();
    const payload = buildPayload(messages, params);

    let res: Response;
    try {
      res = await apiFetch(`${BASE}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Session-Id": sessionId },
        body: JSON.stringify(payload),
        signal,
      });
    } catch (err) {
      if (isAbort(err)) return aborted(started);
      throw err;
    }
    if (!res.ok) throw new ApiError(res.status, await errorText(res));
    if (!res.body) throw new ApiError(res.status, "响应没有可读的流");

    const out: StreamResult = { text: "", reasoning: "", ms: 0, aborted: false };
    const parser = new SSEParser();
    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    const consume = (event: string) => {
      if (!event || event === "[DONE]") return;
      let chunk: Chunk;
      try {
        chunk = JSON.parse(event) as Chunk;
      } catch {
        return; // a keep-alive or a frame we do not understand
      }
      if (chunk.error) throw new ApiError(200, errorMessageOf(chunk.error));
      if (chunk.usage) {
        out.promptTokens = chunk.usage.prompt_tokens;
        out.completionTokens = chunk.usage.completion_tokens;
        const cached = chunk.usage.prompt_tokens_details?.cached_tokens;
        if (typeof cached === "number") out.cachedTokens = cached;
      }
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) return;
      const text = delta.content ?? "";
      const reasoning = delta.reasoning_content ?? "";
      if (!text && !reasoning) return;
      if (out.ttftMs === undefined) out.ttftMs = performance.now() - started;
      out.text += text;
      out.reasoning += reasoning;
      onDelta({ text, reasoning });
    };

    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const event of parser.feed(decoder.decode(value, { stream: true }))) consume(event);
      }
      const tail = parser.flush();
      if (tail) consume(tail);
    } catch (err) {
      // A model error mid-stream keeps whatever arrived before it.
      if (!isAbort(err)) throw err;
      out.aborted = true;
    }
    out.ms = performance.now() - started;
    return out;
  },
};

// buildPayload is the request body exactly as sent, so View Code can show the
// same thing. stream_options is deliberately absent: the gateway injects
// include_usage itself for streaming requests (lua/reqtransform.lua).
export function buildPayload(messages: ChatMessage[], params: ChatParams): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model: params.model,
    stream: true,
    messages: [
      ...(params.system ? [{ role: "system", content: params.system }] : []),
      ...messages.map(({ role, content }) => ({ role, content })),
    ],
  };
  if (Number.isFinite(params.temperature)) payload.temperature = params.temperature;
  if (Number.isFinite(params.topP)) payload.top_p = params.topP;
  if (params.maxTokens > 0) payload.max_tokens = params.maxTokens;
  if (params.seed !== undefined && Number.isInteger(params.seed) && params.seed >= 0) payload.seed = params.seed;
  const stop = (params.stop ?? []).filter((s) => s !== "");
  if (stop.length) payload.stop = stop;
  if (params.frequencyPenalty !== undefined && Number.isFinite(params.frequencyPenalty)) payload.frequency_penalty = params.frequencyPenalty;
  if (params.presencePenalty !== undefined && Number.isFinite(params.presencePenalty)) payload.presence_penalty = params.presencePenalty;
  if (params.reasoningEffort) payload.reasoning_effort = params.reasoningEffort;
  return payload;
}

function aborted(started: number): StreamResult {
  return { text: "", reasoning: "", ms: performance.now() - started, aborted: true };
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

function errorMessageOf(error: { message?: string } | string): string {
  return typeof error === "string" ? error : error.message || "模型返回错误";
}

// errorText prefers the message an OpenAI-compatible endpoint puts in
// {"error":{"message":…}}, and falls back to whatever body it did send.
async function errorText(res: Response): Promise<string> {
  const raw = await res.text().catch(() => "");
  try {
    const body = JSON.parse(raw) as { error?: { message?: string } | string; message?: string };
    if (body.error) return errorMessageOf(body.error);
    if (body.message) return body.message;
  } catch {
    /* not JSON */
  }
  return raw.slice(0, 300) || res.statusText;
}
