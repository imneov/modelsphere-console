import { formatNumber, getT, type TFn } from "@/shell";
import type { StreamResult } from "@/modules/playground/api";
import "@/modules/playground/i18n";

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

const ONE_DECIMAL = { minimumFractionDigits: 1, maximumFractionDigits: 1 };

export function statsParts(stats: Stats, t: TFn = getT("playground")): string[] {
  const parts: string[] = [];
  if (stats.ttftMs !== undefined) parts.push(t("stats.ttft", { ms: formatNumber(Math.round(stats.ttftMs)) }));
  parts.push(t("stats.duration", { s: formatNumber(stats.ms / 1000, ONE_DECIMAL) }));
  if (stats.promptTokens !== undefined) parts.push(t("stats.input", { n: formatNumber(stats.promptTokens) }));
  if (stats.completionTokens !== undefined) parts.push(t("stats.output", { n: formatNumber(stats.completionTokens) }));
  const tps = tokensPerSecond(stats);
  if (tps !== undefined) parts.push(t("stats.tps", { n: formatNumber(tps, ONE_DECIMAL) }));
  const hit = cacheHitRate(stats);
  if (hit !== undefined) parts.push(t("stats.cacheHit", { pct: Math.round(hit * 100) }));
  return parts;
}
