export interface Thought {
  reasoning: string;
  answer: string;
  // The think block has opened but not closed yet: the model is still thinking.
  thinking: boolean;
}

const OPEN = "<think>";
const CLOSE = "</think>";

// splitThink separates a leading <think>…</think> block from the answer, for
// engines that put reasoning into content instead of reasoning_content.
export function splitThink(content: string): Thought {
  const lead = content.match(/^\s*/)?.[0].length ?? 0;
  if (!content.startsWith(OPEN, lead)) return { reasoning: "", answer: content, thinking: false };
  const body = content.slice(lead + OPEN.length);
  const end = body.indexOf(CLOSE);
  if (end === -1) return { reasoning: body.trim(), answer: "", thinking: true };
  return { reasoning: body.slice(0, end).trim(), answer: body.slice(end + CLOSE.length).replace(/^\s+/, ""), thinking: false };
}
