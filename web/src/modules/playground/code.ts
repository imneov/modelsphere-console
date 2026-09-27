// Snippets reproducing the current request against the public /v1 endpoint. The
// key is always a placeholder read from the environment, never a real value.
export const API_KEY_ENV = "MODELSPHERE_API_KEY";

export type Language = "curl" | "python" | "node";

export const LANGUAGES: { id: Language; label: string }[] = [
  { id: "curl", label: "cURL" },
  { id: "python", label: "Python" },
  { id: "node", label: "Node.js" },
];

export function snippet(language: Language, baseURL: string, payload: Record<string, unknown>): string {
  switch (language) {
    case "curl":
      return curl(baseURL, payload);
    case "python":
      return python(baseURL, payload);
    case "node":
      return node(baseURL, payload);
  }
}

function curl(baseURL: string, payload: Record<string, unknown>): string {
  const body = JSON.stringify(payload, null, 2).replace(/'/g, `'\\''`);
  return [
    `curl -N ${baseURL}/chat/completions \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -H "Authorization: Bearer $${API_KEY_ENV}" \\`,
    `  -d '${body}'`,
  ].join("\n");
}

function python(baseURL: string, payload: Record<string, unknown>): string {
  const args = Object.entries(payload)
    .map(([k, v]) => `    ${k}=${indentTail(py(v), 4)},`)
    .join("\n");
  return [
    "import os",
    "from openai import OpenAI",
    "",
    `client = OpenAI(base_url=${py(baseURL)}, api_key=os.environ[${py(API_KEY_ENV)}])`,
    "",
    "stream = client.chat.completions.create(",
    args,
    ")",
    "for chunk in stream:",
    "    if chunk.choices and chunk.choices[0].delta.content:",
    '        print(chunk.choices[0].delta.content, end="", flush=True)',
  ].join("\n");
}

function node(baseURL: string, payload: Record<string, unknown>): string {
  return [
    'import OpenAI from "openai";',
    "",
    `const client = new OpenAI({ baseURL: ${JSON.stringify(baseURL)}, apiKey: process.env.${API_KEY_ENV} });`,
    "",
    `const stream = await client.chat.completions.create(${JSON.stringify(payload, null, 2)});`,
    "for await (const chunk of stream) {",
    '  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");',
    "}",
  ].join("\n");
}

// py renders JSON data as a Python literal. JSON string escapes are valid Python.
export function py(value: unknown, depth = 0): string {
  if (value === null || value === undefined) return "None";
  if (value === true) return "True";
  if (value === false) return "False";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  const pad = "    ".repeat(depth + 1);
  const end = "    ".repeat(depth);
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    return `[\n${value.map((v) => pad + py(v, depth + 1)).join(",\n")},\n${end}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) return "{}";
  return `{\n${entries.map(([k, v]) => `${pad}${JSON.stringify(k)}: ${py(v, depth + 1)}`).join(",\n")},\n${end}}`;
}

function indentTail(text: string, spaces: number): string {
  return text.replace(/\n/g, "\n" + " ".repeat(spaces));
}

// fenced wraps text in a Markdown code block whose fence is longer than any
// backtick run inside it: conversations often contain ``` themselves.
export function fenced(lang: string, text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}${lang}\n${text}\n${fence}`;
}
