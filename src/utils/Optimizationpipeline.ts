/**
 * optimizationPipeline.ts
 * Orchestrates the full optimization pipeline for single files and batches.
 * This is the main entry point replacing tokenReducer.ts.
 */

import { estimateTokens } from './tokenCounter';
import { OptimizationProfile, ProfileKey, PROFILES } from './optimizationProfiles';
import { optimizeByFileType, isSupportedExtension } from './Filetypeoptimizer';
import { detectRepetitivePatterns } from './Patterndetector';
import { smartTruncate, isGeneratedFile, isMinifiedFile } from './Smarttruncator';
import { summarizeLogs, collapseDebugPrints } from './Logsummarizer';
import { analyzeContextQuality, QualityScore } from './Contextquality';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TechniqueResult {
  name: string;
  savedTokens: number;
  savedChars: number;
}

export interface FileOptimizationResult {
  content: string;
  originalTokens: number;
  optimizedTokens: number;
  savingsPct: number;
  techniques: TechniqueResult[];
  qualityScore: QualityScore;
  wasSkipped: boolean;
  skipReason?: string;
}

export interface BatchOptimizationResult {
  files: Array<{
    name: string;
    ext: string;
    content: string;
    result: FileOptimizationResult;
  }>;
  totalOriginalTokens: number;
  totalOptimizedTokens: number;
  totalSavingsPct: number;
  allTechniques: TechniqueResult[];
}

export interface FileInput {
  content: string;
  ext: string;
  name: string;
}

// ─── Single file pipeline ─────────────────────────────────────────────────────

export function optimizeFile(
  content: string,
  ext: string,
  name: string,
  profileKey: ProfileKey = 'balanced'
): FileOptimizationResult {
  const profile = PROFILES[profileKey];
  const originalContent = content;
  const originalTokens  = estimateTokens(content);
  const techniques: TechniqueResult[] = [];

  // ── Guard: unsupported extension ─────────────────────────────────────
  if (!isSupportedExtension(ext)) {
    return makeSkippedResult(content, 'Unsupported file type');
  }

  // ── Guard: generated / minified files ────────────────────────────────
  if (isGeneratedFile(content, name)) {
    return makeSkippedResult(content, 'Auto-generated file detected');
  }
  if (isMinifiedFile(content)) {
    return makeSkippedResult(content, 'Minified file detected');
  }

  let current = content;

  // ── Step 1: Trailing whitespace ───────────────────────────────────────
  if (profile.trimTrailingWhitespace) {
    const before = current;
    current = current.split('\n').map(l => l.trimEnd()).join('\n');
    recordIfChanged(before, current, 'Trailing whitespace trimmed', techniques);
  }

  // ── Step 2: Blank line normalization ─────────────────────────────────
  if (profile.removeBlankLines) {
    const before = current;
    if (profile.maxBlankLines === 0) {
      current = current.replace(/\n{2,}/g, '\n');
    } else {
      const maxNewlines = '\n'.repeat(profile.maxBlankLines + 1);
      const excessPattern = new RegExp(`\n{${profile.maxBlankLines + 2},}`, 'g');
      current = current.replace(excessPattern, maxNewlines);
    }
    recordIfChanged(before, current, 'Blank lines normalized', techniques);
  }

  // ── Step 3: File-type-specific optimization ───────────────────────────
  const fileTypeResult = optimizeByFileType(current, ext, profile);
  if (fileTypeResult.savedChars > 0) {
    current = fileTypeResult.content;
    for (const t of fileTypeResult.techniquesApplied) {
      techniques.push({
        name: t,
        savedChars: 0,  // aggregate, we'll compute below
        savedTokens: 0,
      });
    }
  }

  // ── Step 4: Repetitive pattern detection ─────────────────────────────
  if (profile.collapseRepetitivePatterns) {
    const before = current;
    const patternResult = detectRepetitivePatterns(current);
    if (patternResult.savedChars > 0) {
      current = patternResult.content;
      techniques.push({
        name: `Pattern collapse (${patternResult.patterns.length} patterns)`,
        savedChars: patternResult.savedChars,
        savedTokens: Math.ceil(patternResult.savedChars / 4),
      });
    }
  }

  // ── Step 5: Log summarization ─────────────────────────────────────────
  if (profile.summarizeLogs) {
    const logResult = summarizeLogs(current);
    if (logResult.savedChars > 0) {
      current = logResult.content;
      techniques.push({
        name: `Log summarization (${logResult.logBlocksFound} blocks)`,
        savedChars: logResult.savedChars,
        savedTokens: Math.ceil(logResult.savedChars / 4),
      });
    }

    const debugResult = collapseDebugPrints(current, ext);
    if (debugResult.saved > 0) {
      current = debugResult.content;
      techniques.push({
        name: 'Debug statements collapsed',
        savedChars: debugResult.saved,
        savedTokens: Math.ceil(debugResult.saved / 4),
      });
    }
  }

  // ── Step 6: Smart truncation ──────────────────────────────────────────
  if (profile.smartTruncation) {
    const truncResult = smartTruncate(
      current,
      ext,
      profile.aggressiveCompression ? 6_000 : 4_000,
      profile.aggressiveCompression
    );
    if (truncResult.wasTruncated) {
      current = truncResult.content;
      techniques.push({
        name: `Smart truncation (${truncResult.strategy})`,
        savedChars: 0,
        savedTokens: truncResult.originalTokens - truncResult.truncatedTokens,
      });
    }
  }

  // ── Final measurements ────────────────────────────────────────────────
  const optimizedTokens = estimateTokens(current);
  const saved = originalTokens - optimizedTokens;
  const savingsPct = originalTokens > 0 ? Math.round((saved / originalTokens) * 100) : 0;

  // Back-fill token savings for techniques that didn't compute them
  if (techniques.length > 0 && saved > 0) {
    const totalChars = techniques.reduce((s, t) => s + t.savedChars, 0);
    const totalTokensTech = techniques.reduce((s, t) => s + t.savedTokens, 0);
    const tokenDiff = saved - totalTokensTech;

    if (tokenDiff > 0 && techniques.length > 0) {
      techniques[0].savedTokens += tokenDiff;
    }
    if (totalChars === 0) {
      const charsPerToken = (originalContent.length - current.length) / Math.max(1, saved);
      techniques.forEach(t => {
        if (t.savedChars === 0 && t.savedTokens > 0) {
          t.savedChars = Math.round(t.savedTokens * charsPerToken);
        }
      });
    }
  }

  const qualityScore = analyzeContextQuality(originalContent, current, ext);

  return {
    content: current,
    originalTokens,
    optimizedTokens,
    savingsPct,
    techniques,
    qualityScore,
    wasSkipped: false,
  };
}

// ─── Batch pipeline ───────────────────────────────────────────────────────────

export function optimizeBatch(
  files: FileInput[],
  profileKey: ProfileKey = 'balanced'
): BatchOptimizationResult {
  const results = files.map(f => ({
    name: f.name,
    ext:  f.ext,
    content: '',
    result: optimizeFile(f.content, f.ext, f.name, profileKey),
  }));

  // Apply optimized content
  results.forEach((r, i) => { r.content = r.result.content; });

  const totalOriginal  = results.reduce((s, r) => s + r.result.originalTokens, 0);
  const totalOptimized = results.reduce((s, r) => s + r.result.optimizedTokens, 0);
  const totalSaved     = totalOriginal - totalOptimized;
  const totalSavingsPct = totalOriginal > 0
    ? Math.round((totalSaved / totalOriginal) * 100)
    : 0;

  // Aggregate techniques
  const techMap = new Map<string, TechniqueResult>();
  for (const r of results) {
    for (const t of r.result.techniques) {
      const existing = techMap.get(t.name);
      if (existing) {
        existing.savedTokens += t.savedTokens;
        existing.savedChars  += t.savedChars;
      } else {
        techMap.set(t.name, { ...t });
      }
    }
  }

  return {
    files: results,
    totalOriginalTokens: totalOriginal,
    totalOptimizedTokens: totalOptimized,
    totalSavingsPct,
    allTechniques: [...techMap.values()].sort((a, b) => b.savedTokens - a.savedTokens),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function recordIfChanged(
  before: string,
  after: string,
  name: string,
  techniques: TechniqueResult[]
): void {
  const savedChars = before.length - after.length;
  if (savedChars > 0) {
    techniques.push({
      name,
      savedChars,
      savedTokens: Math.ceil(savedChars / 4),
    });
  }
}

function makeSkippedResult(content: string, reason: string): FileOptimizationResult {
  const tokens = estimateTokens(content);
  return {
    content,
    originalTokens:  tokens,
    optimizedTokens: tokens,
    savingsPct: 0,
    techniques: [],
    qualityScore: {
      total: 100,
      breakdown: { readability: 100, density: 100, completeness: 100, diversity: 100 },
      grade: 'A',
      summary: 'File not optimized.',
    },
    wasSkipped: true,
    skipReason: reason,
  };
}