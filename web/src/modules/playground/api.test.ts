import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shell";
import { api, type ChatMessage, type ChatParams, type Delta } from "@/modules/playground/api";

const params: ChatParams = { model: "kimi-k2.6", system: "简洁回答", temperature: 0.3, topP: 0.9, maxTokens: 64 };
const messages: ChatMessage[] = [{ role: "user", content: "你好" }];

function sse(chunks: string[], init: ResponseInit = { status: 200 }): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    init,
  );
}

function delta(content: string, reasoning?: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content, reasoning_content: reasoning } }] })}\n\n`;
}

function call(onDelta: (d: Delta) => void, signal = new AbortController().signal) {
  return api.streamChat({ messages, params, sessionId: "conv-1", signal, onDelta });
}

beforeEach(() => {
  // apiFetch reads the session cookie; there is no document in a node test.
  vi.stubGlobal("document", { cookie: "" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("playground api.models", () => {
  it("returns the gateway's model list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: [{ id: "a" }, { id: "b" }] }), { status: 200 })),
    );
    await expect(api.models()).resolves.toEqual([{ id: "a" }, { id: "b" }]);
  });
});

describe("playground api.streamChat", () => {
  it("sends the turn, the parameters and the conversation id", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => sse([`data: [DONE]\n\n`]));
    vi.stubGlobal("fetch", fetchMock);
    await call(() => {});

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/llm/v1/chat/completions");
    const headers = new Headers(init?.headers);
    // The gateway pins a conversation to one backend on this header.
    expect(headers.get("X-Session-Id")).toBe("conv-1");
    expect(JSON.parse(String(init?.body))).toEqual({
      model: "kimi-k2.6",
      stream: true,
      stream_options: { include_usage: true },
      messages: [
        { role: "system", content: "简洁回答" },
        { role: "user", content: "你好" },
      ],
      temperature: 0.3,
      top_p: 0.9,
      max_tokens: 64,
    });
  });

  it("stops sending parameters that were cleared", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => sse([]));
    vi.stubGlobal("fetch", fetchMock);
    await api.streamChat({
      messages,
      params: { model: "m", system: "", temperature: Number.NaN, topP: Number.NaN, maxTokens: 0 },
      sessionId: "c",
      signal: new AbortController().signal,
      onDelta: () => {},
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toEqual({ model: "m", stream: true, stream_options: { include_usage: true }, messages: [{ role: "user", content: "你好" }] });
  });

  it("accumulates content and reasoning across chunk boundaries", async () => {
    const frames = [delta("你"), delta("好"), delta("", "想想"), delta("！")];
    // Split mid-frame: a read is a byte boundary, not an event boundary.
    vi.stubGlobal("fetch", vi.fn(async () => sse([frames.join("").slice(0, 40), frames.join("").slice(40)])));
    const seen: Delta[] = [];
    const result = await call((d) => seen.push(d));

    expect(result.text).toBe("你好！");
    expect(result.reasoning).toBe("想想");
    expect(seen.map((d) => d.text).join("")).toBe("你好！");
    expect(result.aborted).toBe(false);
    expect(result.ttftMs).toBeTypeOf("number");
    expect(result.ms).toBeGreaterThanOrEqual(0);
  });

  it("takes token counts from the usage frame the gateway injects", async () => {
    const usage = `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 12, completion_tokens: 34 } })}\n\n`;
    vi.stubGlobal("fetch", vi.fn(async () => sse([delta("hi"), usage, "data: [DONE]\n\n"])));
    const result = await call(() => {});

    expect(result.promptTokens).toBe(12);
    expect(result.completionTokens).toBe(34);
    expect(result.cachedTokens).toBeUndefined();
  });

  it("takes cached prompt tokens when the engine reports them", async () => {
    const usage = `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 64 } } })}\n\n`;
    vi.stubGlobal("fetch", vi.fn(async () => sse([delta("hi"), usage])));
    const result = await call(() => {});
    expect(result.cachedTokens).toBe(64);
  });

  it("ignores keep-alives and unparseable frames", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sse([": ping\n\n", "data: not json\n\n", delta("ok"), "\n\n"])));
    const result = await call(() => {});
    expect(result.text).toBe("ok");
  });

  it("keeps what arrived when the stream is stopped", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const encoder = new TextEncoder();
        return new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(encoder.encode(delta("部分")));
              init.signal?.addEventListener("abort", () => c.error(new DOMException("aborted", "AbortError")));
            },
          }),
        );
      }),
    );

    const result = await call(() => controller.abort(), controller.signal);
    expect(result.aborted).toBe(true);
    expect(result.text).toBe("部分");
  });

  it("reports an error frame as an ApiError", async () => {
    const frame = `data: ${JSON.stringify({ error: { message: "model not found" } })}\n\n`;
    vi.stubGlobal("fetch", vi.fn(async () => sse([frame])));
    await expect(call(() => {})).rejects.toThrow(/model not found/);
  });

  it("surfaces the endpoint's error message on a rejected request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: { message: "invalid api key" } }), { status: 401 })),
    );
    const err = await call(() => {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(401);
    expect((err as ApiError).message).toBe("invalid api key");
  });
});
