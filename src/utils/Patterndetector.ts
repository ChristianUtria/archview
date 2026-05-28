/**
 * patternDetector.ts
 * Detects and collapses repetitive patterns within source files.
 * Preserves semantics while reducing token usage.
 */

export interface PatternMatch {
  pattern: string;
  count: number;
  firstLine: number;
  lastLine: number;
  savings: number;  // estimated chars saved
}

export interface PatternDetectionResult {
  content: string;
  patterns: PatternMatch[];
  savedChars: number;
}

// Minimum repetitions before we consider collapsing
const MIN_REPETITIONS = 3;
// Minimum line length to bother tracking
const MIN_LINE_LENGTH = 10;

/**
 * Detect blocks of identical/near-identical lines that repeat consecutively.
 * e.g., long arrays of similar constants, repeated log lines, etc.
 */
export function detectRepetitivePatterns(content: string): PatternDetectionResult {
  const lines = content.split('\n');
  const patterns: PatternMatch[] = [];
  const resultLines: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip short lines
    if (trimmed.length < MIN_LINE_LENGTH) {
      resultLines.push(line);
      i++;
      continue;
    }

    // Look ahead: how many consecutive lines share the same prefix/structure?
    const runStart = i;
    let runEnd = i;

    // Normalize the line to a "structural signature" for comparison
    const sig = structuralSignature(trimmed);

    while (
      runEnd + 1 < lines.length &&
      structuralSignature(lines[runEnd + 1].trim()) === sig &&
      lines[runEnd + 1].trim().length >= MIN_LINE_LENGTH
    ) {
      runEnd++;
    }

    const runLength = runEnd - runStart + 1;

    if (runLength >= MIN_REPETITIONS) {
      // Collapse the run: keep first 2, summarize the rest
      const kept = 2;
      const collapsed = runLength - kept;
      const savedChars = lines.slice(runStart + kept, runEnd + 1).join('\n').length;

      patterns.push({
        pattern: sig,
        count: runLength,
        firstLine: runStart,
        lastLine: runEnd,
        savings: savedChars,
      });

      // Output first `kept` lines + a collapse marker
      for (let k = runStart; k < runStart + kept; k++) {
        resultLines.push(lines[k]);
      }
      resultLines.push(
        `${getIndent(line)}// [PyPoints: ${collapsed} similar lines collapsed — pattern: ${sig.slice(0, 40)}]`
      );
      i = runEnd + 1;
    } else {
      resultLines.push(line);
      i++;
    }
  }

  const newContent = resultLines.join('\n');
  return {
    content: newContent,
    patterns,
    savedChars: content.length - newContent.length,
  };
}

/**
 * Produce a structural signature for a line of code.
 * Replaces string literals, numbers, and identifiers with generic placeholders
 * to find lines that are "structurally identical" but differ only in values.
 */
function structuralSignature(line: string): string {
  return line
    .replace(/"[^"]*"/g, '"STR"')         // double-quoted strings
    .replace(/'[^']*'/g, "'STR'")         // single-quoted strings
    .replace(/`[^`]*`/g, '`STR`')        // template literals
    .replace(/\b\d+\.?\d*\b/g, 'NUM')    // numbers
    .replace(/\b[a-zA-Z_]\w{6,}\b/g, 'ID') // long identifiers
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);                        // limit signature length
}

/** Extract leading whitespace from a line */
function getIndent(line: string): string {
  const match = line.match(/^(\s*)/);
  return match ? match[1] : '';
}

/**
 * Detect repeated import groups (e.g., barrel exports with 50+ lines of the same shape).
 * Returns lines where groups of very similar imports are collapsed.
 */
export function collapseRepetitiveImports(content: string): { content: string; saved: number } {
  const lines = content.split('\n');
  const importLines: number[] = [];

  // Find import line ranges
  lines.forEach((l, i) => {
    if (/^\s*(import|export)\s+/.test(l)) importLines.push(i);
  });

  // If import block is huge (>30 lines), summarize the tail
  if (importLines.length > 30) {
    const max = 30;
    const tail = importLines.slice(max);
    const tailLines = tail.map(i => lines[i]);
    const savedChars = tailLines.join('\n').length;

    const result = [...lines];
    // Mark tail imports as collapsed
    tail.reverse().forEach(i => { result[i] = ''; });
    result.splice(importLines[max], 0,
      `// [PyPoints: ${tail.length} additional imports collapsed for context optimization]`
    );

    return { content: result.filter((_, i) => lines[i] !== '' || result[i] !== '').join('\n'), saved: savedChars };
  }

  return { content, saved: 0 };
}