import type { StreamResult } from "@/modules/playground/api";

export interface Stats {
  ttftMs?: number;
  ms: number;
  promptTokens?: number;
  completionTokens?: number;
  cachedTokens?: number;
}

export function statsOf(result: StreamResult): Stats {
  return {
    ttftMs: result.ttftMs,
    ms: result.ms,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
    cachedTokens: result.cachedTokens,
  };
}

// tokensPerSecond is over the decoding window, so it adds up with the TTFT.
export function tokensPerSecond(stats: Stats): number | undefined {
  const span = stats.ms - (stats.ttftMs ?? 0);
  if (!stats.completionTokens || span <= 0) return undefined;
  return (stats.completionTokens * 1000) / span;
}

export function cacheHitRate(stats: Stats): number | undefined {
  if (stats.cachedTokens === undefined || !stats.promptTokens) return undefined;
  return stats.cachedTokens / stats.promptTokens;
}

export function statsParts(stats: Stats): string[] {
  const parts: string[] = [];
  if (stats.ttftMs !== undefined) parts.push(`首字 ${Math.round(stats.ttftMs)} ms`);
  parts.push(`用时 ${(stats.ms / 1000).toFixed(1)} s`);
  if (stats.promptTokens !== undefined) parts.push(`输入 ${stats.promptTokens} tok`);
  if (stats.completionTokens !== undefined) parts.push(`输出 ${stats.completionTokens} tok`);
  const tps = tokensPerSecond(stats);
  if (tps !== undefined) parts.push(`${tps.toFixed(1)} tok/s`);
  const hit = cacheHitRate(stats);
  if (hit !== undefined) parts.push(`缓存命中 ${Math.round(hit * 100)}%`);
  return parts;
}
