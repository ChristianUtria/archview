/**
 * contextQuality.ts
 * Scores the quality of optimized context for AI consumption.
 * Returns a 0–100 score with component breakdown.
 */

import { estimateTokens } from './tokenCounter';

export interface QualityScore {
  total: number;          // 0–100
  breakdown: {
    readability: number;  // Are code structure and naming preserved?
    density: number;      // Is there good signal-to-noise ratio?
    completeness: number; // Are critical constructs (imports, exports) intact?
    diversity: number;    // Good mix of constructs vs repetitive noise?
  };
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  summary: string;
}

export function analyzeContextQuality(
  originalContent: string,
  optimizedContent: string,
  ext: string
): QualityScore {
  const origLines = originalContent.split('\n');
  const optLines  = optimizedContent.split('\n');
  const origTokens = estimateTokens(originalContent);
  const optTokens  = estimateTokens(optimizedContent);

  // ── Readability: check indentation & naming are preserved ─────────────
  const indentOk       = checkIndentationPreserved(optLines);
  const namingOk       = checkNamingPreserved(originalContent, optimizedContent);
  const readabilityScore = Math.round((indentOk ? 50 : 20) + (namingOk ? 50 : 20));

  // ── Density: ratio of meaningful lines to total lines ─────────────────
  const blankCount    = optLines.filter(l => l.trim() === '').length;
  const commentCount  = optLines.filter(l => /^\s*(\/\/|#|\/\*|\*)/.test(l)).length;
  const meaningfulPct = 1 - (blankCount + commentCount) / Math.max(optLines.length, 1);
  const densityScore  = Math.min(100, Math.round(meaningfulPct * 110)); // slight bonus for density

  // ── Completeness: critical constructs preserved ────────────────────────
  const importsPct = checkConstructPreservation(originalContent, optimizedContent, 'imports', ext);
  const exportsPct = checkConstructPreservation(originalContent, optimizedContent, 'exports', ext);
  const funcPct    = checkConstructPreservation(originalContent, optimizedContent, 'functions', ext);
  const completenessScore = Math.round((importsPct + exportsPct + funcPct) / 3 * 100);

  // ── Diversity: detect overly repetitive output ────────────────────────
  const uniqueLinePct = uniqueLineRatio(optLines);
  const diversityScore = Math.min(100, Math.round(uniqueLinePct * 120));

  // ── Weighted total ─────────────────────────────────────────────────────
  const total = Math.min(100, Math.round(
    readabilityScore  * 0.30 +
    densityScore      * 0.25 +
    completenessScore * 0.30 +
    diversityScore    * 0.15
  ));

  const grade: QualityScore['grade'] =
    total >= 90 ? 'A' :
    total >= 75 ? 'B' :
    total >= 60 ? 'C' :
    total >= 45 ? 'D' : 'F';

  const compressionPct = origTokens > 0
    ? Math.round((1 - optTokens / origTokens) * 100)
    : 0;

  const summary =
    total >= 85 ? `Excellent context quality. ${compressionPct}% reduction preserves full semantics.` :
    total >= 70 ? `Good context quality. Minor structural loss for ${compressionPct}% reduction.` :
    total >= 55 ? `Acceptable quality. Aggressive compression (${compressionPct}%) reduced clarity.` :
    `Low quality. Consider using a less aggressive optimization profile.`;

  return {
    total,
    breakdown: {
      readability: readabilityScore,
      density: densityScore,
      completeness: completenessScore,
      diversity: diversityScore,
    },
    grade,
    summary,
  };
}

/** Check indentation characters are present and consistent */
function checkIndentationPreserved(lines: string[]): boolean {
  const indentedLines = lines.filter(l => /^[ \t]+\S/.test(l));
  if (indentedLines.length === 0) return true; // flat file, ok

  const hasSpaceIndent = indentedLines.some(l => l.startsWith('  '));
  const hasTabIndent   = indentedLines.some(l => l.startsWith('\t'));

  // Mixed indentation is a bad sign
  if (hasSpaceIndent && hasTabIndent) return false;
  return true;
}

/** Ensure identifiers (function/class/variable names) are not corrupted */
function checkNamingPreserved(original: string, optimized: string): boolean {
  // Extract identifiers from original (words 3+ chars)
  const origIds = new Set(
    (original.match(/\b[a-zA-Z_][a-zA-Z0-9_]{2,}\b/g) ?? []).slice(0, 100)
  );

  if (origIds.size === 0) return true;

  let preserved = 0;
  for (const id of origIds) {
    if (optimized.includes(id)) preserved++;
  }

  return (preserved / origIds.size) >= 0.85;
}

type ConstructType = 'imports' | 'exports' | 'functions';

/** Check what fraction of a construct type was preserved */
function checkConstructPreservation(
  original: string,
  optimized: string,
  type: ConstructType,
  ext: string
): number {
  const patterns: Record<ConstructType, RegExp> = {
    imports:   /^\s*(import|from|require|#include|using)\s/m,
    exports:   /^\s*(export|module\.exports|pub\s+(fn|struct|enum|trait))/m,
    functions: /^\s*(function|def|func|fn|public|private|protected|async\s+function|const\s+\w+\s*=\s*(async\s+)?\()/m,
  };

  const countMatches = (content: string, pattern: RegExp): number => {
    const flags = pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g';
    return (content.match(new RegExp(pattern.source, flags)) ?? []).length;
  };

  const origCount = countMatches(original, patterns[type]);
  const optCount  = countMatches(optimized, patterns[type]);

  if (origCount === 0) return 1;
  return Math.min(1, optCount / origCount);
}

/** Ratio of unique lines to total lines (higher = less repetitive) */
function uniqueLineRatio(lines: string[]): number {
  const nonEmpty = lines.filter(l => l.trim().length > 5);
  if (nonEmpty.length === 0) return 1;

  const unique = new Set(nonEmpty.map(l => l.trim())).size;
  return unique / nonEmpty.length;
}