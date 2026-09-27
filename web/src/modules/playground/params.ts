import type { ChatParams, ReasoningEffort } from "@/modules/playground/api";

// What the parameter form edits: strings, so a half-typed "0." is not rewritten
// under the cursor. toChatParams decides what reaches the request.
export interface ParamsForm {
  system: string;
  temperature: string;
  topP: string;
  maxTokens: string;
  seed: string;
  stop: string;
  frequencyPenalty: string;
  presencePenalty: string;
  reasoningEffort: ReasoningEffort;
}

export const DEFAULT_FORM: ParamsForm = {
  system: "",
  temperature: "0.7",
  topP: "0.95",
  maxTokens: "1024",
  seed: "",
  stop: "",
  frequencyPenalty: "",
  presencePenalty: "",
  reasoningEffort: "",
};

export const REASONING_EFFORTS: ReasoningEffort[] = ["none", "minimal", "low", "medium", "high"];

export function toChatParams(model: string, form: ParamsForm): ChatParams {
  return {
    model,
    system: form.system.trim(),
    temperature: optional(form.temperature),
    topP: optional(form.topP),
    maxTokens: Math.max(0, Math.round(optional(form.maxTokens) || 0)),
    seed: optional(form.seed),
    // One stop sequence per line; a stop sequence may itself contain a comma.
    stop: form.stop.split("\n").filter((s) => s !== ""),
    frequencyPenalty: optional(form.frequencyPenalty),
    presencePenalty: optional(form.presencePenalty),
    reasoningEffort: form.reasoningEffort,
  };
}

// An empty or unparseable field is NaN, which buildPayload leaves out.
function optional(value: string): number {
  return value.trim() === "" ? Number.NaN : Number(value);
}
