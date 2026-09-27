import { describe, expect, it } from "vitest";
import { SSEParser } from "@/modules/playground/sse";

describe("SSEParser", () => {
  it("returns one payload per event", () => {
    const p = new SSEParser();
    expect(p.feed('data: {"a":1}\n\ndata: {"b":2}\n\n')).toEqual(['{"a":1}', '{"b":2}']);
  });

  it("holds an event split across chunks", () => {
    const p = new SSEParser();
    expect(p.feed('data: {"cho')).toEqual([]);
    expect(p.feed('ices":[]}\n\n')).toEqual(['{"choices":[]}']);
  });

  it("holds a chunk that ends mid-line", () => {
    const p = new SSEParser();
    expect(p.feed("data: [DO")).toEqual([]);
    expect(p.feed("NE]\n\n")).toEqual(["[DONE]"]);
  });

  it("ignores comments and non-data fields", () => {
    const p = new SSEParser();
    expect(p.feed(": keep-alive\nevent: message\nid: 7\ndata: x\n\n")).toEqual(["x"]);
  });

  it("joins a multi-line event the way the spec says", () => {
    const p = new SSEParser();
    expect(p.feed("data: a\ndata: b\n\n")).toEqual(["a\nb"]);
  });

  it("accepts CRLF line endings", () => {
    const p = new SSEParser();
    expect(p.feed("data: x\r\n\r\n")).toEqual(["x"]);
  });

  it("flush returns an event the stream never terminated", () => {
    const p = new SSEParser();
    expect(p.feed("data: last")).toEqual([]);
    expect(p.flush()).toBe("last");
    expect(p.flush()).toBeNull();
  });

  it("keeps an empty payload, which some servers use as a keep-alive", () => {
    const p = new SSEParser();
    expect(p.feed("data:\n\n")).toEqual([""]);
  });
});
