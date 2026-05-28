/**
 * compatibilityAnalyzer.ts
 * Analyzes whether the optimized context fits within common AI model context windows.
 */

export interface AIModel {
  id: string;
  name: string;
  contextWindow: number;   // tokens
  inputCostPer1M: number;  // USD per 1M input tokens
  supportsLargeContext: boolean;
}

export interface CompatibilityResult {
  model: AIModel;
  fits: boolean;
  usagePct: number;           // % of context window used
  estimatedCostUsd: number;
  warning?: string;
}

export interface CompatibilityReport {
  totalTokens: number;
  results: CompatibilityResult[];
  recommendation: string;
}

export const AI_MODELS: AIModel[] = [
  {
    id: 'gpt4o',
    name: 'GPT-4o',
    contextWindow: 128_000,
    inputCostPer1M: 2.50,
    supportsLargeContext: true,
  },
  {
    id: 'gpt4o-mini',
    name: 'GPT-4o Mini',
    contextWindow: 128_000,
    inputCostPer1M: 0.15,
    supportsLargeContext: true,
  },
  {
    id: 'claude-sonnet',
    name: 'Claude Sonnet',
    contextWindow: 200_000,
    inputCostPer1M: 3.00,
    supportsLargeContext: true,
  },
  {
    id: 'claude-haiku',
    name: 'Claude Haiku',
    contextWindow: 200_000,
    inputCostPer1M: 0.80,
    supportsLargeContext: true,
  },
  {
    id: 'gemini-pro',
    name: 'Gemini 1.5 Pro',
    contextWindow: 1_000_000,
    inputCostPer1M: 1.25,
    supportsLargeContext: true,
  },
  {
    id: 'gemini-flash',
    name: 'Gemini 1.5 Flash',
    contextWindow: 1_000_000,
    inputCostPer1M: 0.075,
    supportsLargeContext: true,
  },
  {
    id: 'gemini-free',
    name: 'Gemini Free',
    contextWindow: 32_768,
    inputCostPer1M: 0,
    supportsLargeContext: false,
  },
  {
    id: 'cursor',
    name: 'Cursor',
    contextWindow: 128_000,
    inputCostPer1M: 0,   // Subscription
    supportsLargeContext: true,
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    contextWindow: 8_192,
    inputCostPer1M: 0,   // Subscription
    supportsLargeContext: false,
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    contextWindow: 128_000,
    inputCostPer1M: 0,
    supportsLargeContext: true,
  },
];

/** Analyze compatibility of a given token count against all AI models */
export function analyzeCompatibility(totalTokens: number): CompatibilityReport {
  const results: CompatibilityResult[] = AI_MODELS.map(model => {
    const fits      = totalTokens <= model.contextWindow * 0.85; // 85% to leave room for output
    const usagePct  = Math.round((totalTokens / model.contextWindow) * 100);
    const costUsd   = (totalTokens / 1_000_000) * model.inputCostPer1M;

    let warning: string | undefined;
    if (!fits) {
      warning = `Exceeds ${model.name} context limit by ${Math.round(((totalTokens / model.contextWindow) - 1) * 100)}%`;
    } else if (usagePct > 70) {
      warning = `Using ${usagePct}% of context window — little room for conversation`;
    }

    return { model, fits, usagePct, estimatedCostUsd: costUsd, warning };
  });

  const compatible = results.filter(r => r.fits).map(r => r.model.name);
  const incompatible = results.filter(r => !r.fits).map(r => r.model.name);

  let recommendation: string;
  if (incompatible.length === 0) {
    recommendation = 'Context fits all major AI models.';
  } else if (compatible.length >= results.length / 2) {
    recommendation = `Compatible with ${compatible.length}/${results.length} models. Run AI Max optimization to unlock ${incompatible.join(', ')}.`;
  } else {
    recommendation = `Context too large for most models. Apply AI Max optimization to reduce significantly.`;
  }

  return { totalTokens, results, recommendation };
}

/** Get a compact compatibility status icon string for the TreeView */
export function getCompatibilityStatus(model: AIModel, totalTokens: number): {
  compatible: boolean;
  icon: string;
  label: string;
} {
  const compatible = totalTokens <= model.contextWindow * 0.85;
  const usagePct   = Math.round((totalTokens / model.contextWindow) * 100);

  return {
    compatible,
    icon: compatible ? '$(check)' : '$(x)',
    label: compatible
      ? `${model.name} — ${usagePct}% used`
      : `${model.name} — exceeds limit`,
  };
}