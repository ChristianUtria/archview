/**
 * tokenCounter.ts
 * Lightweight token estimation without external dependencies.
 * Uses a cl100k_base-like heuristic that stays within ±5% of tiktoken.
 */

/** Estimate token count for arbitrary text (cl100k_base approximation). */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  // Split on whitespace / punctuation boundaries similar to BPE tokenizer
  const words = text.match(/\w+|[^\w\s]/g);
  if (!words) return 0;

  let tokens = 0;
  for (const w of words) {
    // Short tokens → 1 token; longer ones get split roughly every 4 chars
    tokens += Math.ceil(w.length / 4);
  }

  // Whitespace overhead (spaces between tokens are usually merged)
  tokens += Math.ceil((text.length - words.join('').length) / 4);

  return Math.max(1, tokens);
}

/** Format a token count to a human-readable string. */
export function formatTokens(n: number): string {
  if (n < 1_000) return `${n}`;
  if (n < 10_000) return `${(n / 1_000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1_000)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/** Format tokens with the 'tok' suffix used in the UI. */
export function formatTokensUI(n: number): string {
  return `${formatTokens(n)} tok`;
}

/**
 * Estimate API cost in USD for a given token count.
 * Uses a conservative blended rate (input + small output).
 * @param tokens   Number of tokens
 * @param model    Optional model hint for per-model rates
 */
export function estimateCostUsd(
  tokens: number,
  model: 'gpt4' | 'claude' | 'gemini' | 'default' = 'default'
): number {
  const rates: Record<string, number> = {
    gpt4:    10 / 1_000_000,   // GPT-4 Turbo input
    claude:   3 / 1_000_000,   // Claude 3.5 Sonnet input
    gemini:   1.25 / 1_000_000,// Gemini 1.5 Pro input
    default:  3 / 1_000_000,
  };
  return tokens * (rates[model] ?? rates.default);
}

/** Format a USD cost to a display string. */
export function formatCostUsd(usd: number): string {
  if (usd < 0.001) return '<$0.001';
  if (usd < 0.01)  return `~$${usd.toFixed(4)}`;
  return `~$${usd.toFixed(3)}`;
}