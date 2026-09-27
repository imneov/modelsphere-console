// Server-sent events, as an OpenAI-compatible endpoint emits them: one event per
// chunk, `data: <json>` followed by a blank line, `data: [DONE]` to end. A read
// from the body stream is a byte boundary, not an event boundary, so the parser
// keeps whatever is left of an unfinished line or event.
export class SSEParser {
  private tail = "";
  private lines: string[] = [];

  // feed returns the events this chunk completed. An already-parsed event is
  // never returned twice; partial ones wait for the next chunk.
  feed(chunk: string): string[] {
    this.tail += chunk;
    const done: string[] = [];
    for (let nl = this.tail.indexOf("\n"); nl !== -1; nl = this.tail.indexOf("\n")) {
      let line = this.tail.slice(0, nl);
      this.tail = this.tail.slice(nl + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (line === "") {
        // Blank line: the event is complete.
        if (this.lines.length) done.push(this.lines.join("\n"));
        this.lines = [];
        continue;
      }
      // `event:`, `id:`, `retry:` and `: comment` are not payload.
      if (line.startsWith("data:")) this.lines.push(line.slice(5).replace(/^ /, ""));
    }
    return done;
  }

  // flush returns an event the stream ended without terminating. A server that
  // closes right after its last chunk is common enough to be worth handling --
  // including the last line itself, which never saw a newline.
  flush(): string | null {
    const rest = this.tail.endsWith("\r") ? this.tail.slice(0, -1) : this.tail;
    this.tail = "";
    if (rest.startsWith("data:")) this.lines.push(rest.slice(5).replace(/^ /, ""));
    if (!this.lines.length) return null;
    const event = this.lines.join("\n");
    this.lines = [];
    return event;
  }
}
