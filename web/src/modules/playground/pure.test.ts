import { describe, expect, it } from "vitest";
import { buildPayload } from "@/modules/playground/api";
import { fenced, py, snippet } from "@/modules/playground/code";
import { DEFAULT_FORM, toChatParams } from "@/modules/playground/params";
import { cacheHitRate, statsParts } from "@/modules/playground/stats";
import { splitThink } from "@/modules/playground/think";
import { historyOf, type Turn } from "@/modules/playground/useChat";

const history = [{ role: "user" as const, content: "你好" }];

describe("toChatParams + buildPayload", () => {
  it("leaves every optional field out by default", () => {
    expect(buildPayload(history, toChatParams("m", DEFAULT_FORM))).toEqual({
      model: "m",
      stream: true,
      stream_options: { include_usage: true },
      messages: history,
      temperature: 0.7,
      top_p: 0.95,
      max_tokens: 1024,
    });
  });

  it("sends the optional fields that are filled in", () => {
    const form = {
      ...DEFAULT_FORM,
      temperature: "",
      seed: "42",
      stop: "</s>\n\nEND, now",
      frequencyPenalty: "0.5",
      presencePenalty: "-1",
      reasoningEffort: "low" as const,
    };
    const body = buildPayload(history, toChatParams("m", form));
    expect(body.temperature).toBeUndefined();
    expect(body).toMatchObject({ seed: 42, stop: ["</s>", "END, now"], frequency_penalty: 0.5, presence_penalty: -1, reasoning_effort: "low" });
  });

  it("drops values that do not parse", () => {
    const body = buildPayload(history, toChatParams("m", { ...DEFAULT_FORM, seed: "1.5", topP: "abc", maxTokens: "x" }));
    expect(body.seed).toBeUndefined();
    expect(body.top_p).toBeUndefined();
    expect(body.max_tokens).toBeUndefined();
  });
});

describe("splitThink", () => {
  it("passes plain content through", () => {
    expect(splitThink("hello")).toEqual({ reasoning: "", answer: "hello", thinking: false });
  });

  it("separates a closed think block", () => {
    expect(splitThink("<think>\nstep 1\n</think>\n\nanswer")).toEqual({ reasoning: "step 1", answer: "answer", thinking: false });
  });

  it("reports an open think block while streaming", () => {
    expect(splitThink("  <think>still going")).toEqual({ reasoning: "still going", answer: "", thinking: true });
  });

  it("ignores a think tag that is not at the start", () => {
    expect(splitThink("use <think> tags").answer).toBe("use <think> tags");
  });
});

describe("stats", () => {
  it("shows the cache hit rate only when the engine reports it", () => {
    expect(cacheHitRate({ ms: 1, promptTokens: 200 })).toBeUndefined();
    expect(cacheHitRate({ ms: 1, promptTokens: 200, cachedTokens: 150 })).toBe(0.75);
    expect(statsParts({ ttftMs: 100, ms: 1100, promptTokens: 200, completionTokens: 50, cachedTokens: 150 })).toEqual([
      "首字 100 ms",
      "用时 1.1 s",
      "输入 200 tok",
      "输出 50 tok",
      "50.0 tok/s",
      "缓存命中 75%",
    ]);
  });
});

describe("code snippets", () => {
  const payload = { model: "m", stream: true, messages: [{ role: "user", content: "it's" }], temperature: 0.7 };

  it("never contains a key, only the environment placeholder", () => {
    for (const lang of ["curl", "python", "node"] as const) {
      expect(snippet(lang, "https://console.example/v1", payload)).toContain("MODELSPHERE_API_KEY");
    }
  });

  it("quotes a single quote in the curl body for the shell", () => {
    const text = snippet("curl", "https://c/v1", payload);
    expect(text).toContain(`"content": "it'\\''s"`);
    expect(text.startsWith("curl -N https://c/v1/chat/completions")).toBe(true);
  });

  it("renders Python literals", () => {
    expect(py({ a: true, b: null, c: [1, "x"] })).toBe('{\n    "a": True,\n    "b": None,\n    "c": [\n        1,\n        "x",\n    ],\n}');
    const text = snippet("python", "https://c/v1", payload);
    expect(text).toContain("    stream=True,");
    expect(text).toContain('    model="m",');
  });
});

describe("fenced", () => {
  it("outgrows the longest backtick run inside", () => {
    expect(fenced("js", "a")).toBe("```js\na\n```");
    expect(fenced("bash", "x ```py y")).toBe("````bash\nx ```py y\n````");
  });
});

describe("historyOf", () => {
  it("sends answers without their reasoning, and skips a turn still streaming", () => {
    const turns: Turn[] = [
      { id: "1", role: "user", content: "q", reasoning: "" },
      { id: "2", role: "assistant", content: "<think>x</think>\n\nanswer", reasoning: "r" },
      { id: "3", role: "user", content: "<think> is literal here", reasoning: "" },
      { id: "4", role: "assistant", content: "", reasoning: "", pending: true },
    ];
    expect(historyOf(turns)).toEqual([
      { role: "user", content: "q" },
      { role: "assistant", content: "answer" },
      { role: "user", content: "<think> is literal here" },
    ]);
  });
});
