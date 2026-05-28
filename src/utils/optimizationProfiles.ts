/**
 * optimizationProfiles.ts
 * Defines the three optimization profiles: FAST, BALANCED, AI_MAX.
 */

export type ProfileKey = 'fast' | 'balanced' | 'ai_max' | 'conservative';

export interface OptimizationProfile {
  key: ProfileKey;
  label: string;
  description: string;
  icon: string;
  // Feature flags
  removeComments: boolean;
  removeBlankLines: boolean;        // collapse 2+ blank lines → 1
  trimTrailingWhitespace: boolean;
  compactImports: boolean;          // collapse multi-line import blocks
  compactJson: boolean;
  collapseRepetitivePatterns: boolean;
  smartTruncation: boolean;
  summarizeLogs: boolean;
  aggressiveCompression: boolean;   // merges short lines, removes debug lines
  // Limits
  maxBlankLines: number;            // 0 = remove all, 1 = one blank line max
}

export const PROFILES: Record<ProfileKey, OptimizationProfile> = {
  conservative: {
    key: 'conservative',
    label: 'Conservative',
    description: 'Minimal changes – safe for code review',
    icon: '🛡',
    removeComments: false,
    removeBlankLines: true,
    trimTrailingWhitespace: true,
    compactImports: false,
    compactJson: false,
    collapseRepetitivePatterns: false,
    smartTruncation: false,
    summarizeLogs: false,
    aggressiveCompression: false,
    maxBlankLines: 2,
  },

  fast: {
    key: 'fast',
    label: 'Fast',
    description: 'Remove comments, blank lines, trailing whitespace',
    icon: '⚡',
    removeComments: true,
    removeBlankLines: true,
    trimTrailingWhitespace: true,
    compactImports: true,
    compactJson: false,
    collapseRepetitivePatterns: false,
    smartTruncation: false,
    summarizeLogs: false,
    aggressiveCompression: false,
    maxBlankLines: 1,
  },

  balanced: {
    key: 'balanced',
    label: 'Balanced',
    description: 'Fast + compact JSON, smart truncation, repetitive pattern collapse',
    icon: '⚖️',
    removeComments: true,
    removeBlankLines: true,
    trimTrailingWhitespace: true,
    compactImports: true,
    compactJson: true,
    collapseRepetitivePatterns: true,
    smartTruncation: true,
    summarizeLogs: false,
    aggressiveCompression: false,
    maxBlankLines: 1,
  },

  ai_max: {
    key: 'ai_max',
    label: 'AI Max',
    description: 'Balanced + log summarization + aggressive compression',
    icon: '🤖',
    removeComments: true,
    removeBlankLines: true,
    trimTrailingWhitespace: true,
    compactImports: true,
    compactJson: true,
    collapseRepetitivePatterns: true,
    smartTruncation: true,
    summarizeLogs: true,
    aggressiveCompression: true,
    maxBlankLines: 0,
  },
};

/** Legacy alias used by existing code */
export const PROFILE_KEYS: ProfileKey[] = ['conservative', 'fast', 'balanced', 'ai_max'];