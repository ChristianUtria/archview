/**
 * logSummarizer.ts
 * Summarizes repetitive log lines and massive debug output blocks.
 * Applied only in AI_MAX mode.
 */

export interface LogSummaryResult {
  content: string;
  savedChars: number;
  logBlocksFound: number;
}

// Log line patterns by common frameworks/languages
const LOG_LINE_PATTERNS = [
  // Generic log levels
  /^\s*\[?(DEBUG|INFO|WARN|WARNING|ERROR|FATAL|TRACE|VERBOSE)\]?\s*[:|-]/i,
  // Timestamped log lines
  /^\s*\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/,
  // Python logging
  /^\s*\w+\s*-\s*(DEBUG|INFO|WARNING|ERROR|CRITICAL)\s*-/,
  // console.log / print patterns (common in debug sessions)
  /^\s*(console\.(log|error|warn|info|debug)|print\(|println\(|System\.out)/,
  // Stack trace lines
  /^\s+at\s+[\w.<>$]+\(.*:\d+:\d+\)/,
  /^\s+File\s+"[^"]+",\s+line\s+\d+/,
];

const MIN_LOG_RUN = 5;  // Minimum consecutive log lines to trigger summarization

/**
 * Detect and summarize repetitive log output blocks.
 * Keeps first 3 and last 2 lines of each log block, collapses the rest.
 */
export function summarizeLogs(content: string): LogSummaryResult {
  const lines = content.split('\n');
  const result: string[] = [];
  let savedChars = 0;
  let logBlocksFound = 0;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (isLogLine(line)) {
      // Collect the full log run
      const runStart = i;
      while (i < lines.length && (isLogLine(lines[i]) || isStackTraceLine(lines[i]))) {
        i++;
      }
      const runEnd = i;
      const runLength = runEnd - runStart;

      if (runLength >= MIN_LOG_RUN) {
        logBlocksFound++;
        const KEEP_HEAD = 3;
        const KEEP_TAIL = 2;

        // Keep head
        for (let k = runStart; k < Math.min(runStart + KEEP_HEAD, runEnd); k++) {
          result.push(lines[k]);
        }

        // Collapse middle
        if (runLength > KEEP_HEAD + KEEP_TAIL) {
          const collapsedCount = runLength - KEEP_HEAD - KEEP_TAIL;
          const collapsedContent = lines.slice(runStart + KEEP_HEAD, runEnd - KEEP_TAIL).join('\n');
          savedChars += collapsedContent.length;

          // Detect unique patterns in collapsed block
          const uniquePatterns = detectUniquePatterns(lines.slice(runStart + KEEP_HEAD, runEnd - KEEP_TAIL));
          const patternSummary = uniquePatterns.length > 0
            ? ` Patterns: ${uniquePatterns.slice(0, 3).join(', ')}`
            : '';

          result.push(
            `// [PyPoints Log Summary: ${collapsedCount} lines collapsed.${patternSummary}]`
          );
        }

        // Keep tail
        const tailStart = Math.max(runStart + KEEP_HEAD, runEnd - KEEP_TAIL);
        for (let k = tailStart; k < runEnd; k++) {
          result.push(lines[k]);
        }
      } else {
        // Short run – keep as-is
        for (let k = runStart; k < runEnd; k++) {
          result.push(lines[k]);
        }
      }
    } else {
      result.push(line);
      i++;
    }
  }

  return {
    content: result.join('\n'),
    savedChars,
    logBlocksFound,
  };
}

function isLogLine(line: string): boolean {
  return LOG_LINE_PATTERNS.some(p => p.test(line));
}

function isStackTraceLine(line: string): boolean {
  return /^\s+(at\s+|File\s+"|in\s+<)/.test(line);
}

/**
 * Find unique structural patterns in a set of log lines.
 * Used to produce a useful summary of what was collapsed.
 */
function detectUniquePatterns(lines: string[]): string[] {
  const patterns = new Set<string>();

  for (const line of lines) {
    // Extract log level
    const levelMatch = line.match(/\b(DEBUG|INFO|WARN(?:ING)?|ERROR|FATAL|CRITICAL)\b/i);
    if (levelMatch) patterns.add(levelMatch[1].toUpperCase());

    // Extract HTTP methods/status
    const httpMatch = line.match(/\b(GET|POST|PUT|PATCH|DELETE|HEAD)\s+\S+\s+(\d{3})/);
    if (httpMatch) patterns.add(`${httpMatch[1]} ${httpMatch[2]}`);

    // Extract exception types
    const exMatch = line.match(/\b(\w+(?:Error|Exception|Warning))\b/);
    if (exMatch) patterns.add(exMatch[1]);
  }

  return [...patterns];
}

/**
 * Summarize debug-style console.log / print statements in source code.
 * Collapses clusters of debug prints while keeping the surrounding logic.
 */
export function collapseDebugPrints(content: string, ext: string): { content: string; saved: number } {
  const lines = content.split('\n');
  const result: string[] = [];
  let saved = 0;

  const debugPatterns: Record<string, RegExp> = {
    ts:  /^\s*console\.(log|debug|trace|dir)\(/,
    js:  /^\s*console\.(log|debug|trace|dir)\(/,
    tsx: /^\s*console\.(log|debug|trace|dir)\(/,
    jsx: /^\s*console\.(log|debug|trace|dir)\(/,
    py:  /^\s*print\(/,
    java:/^\s*System\.out\.(print|println|printf)\(/,
    go:  /^\s*fmt\.(Print|Println|Printf)\(/,
  };

  const pattern = debugPatterns[ext];
  if (!pattern) return { content, saved: 0 };

  let i = 0;
  while (i < lines.length) {
    if (pattern.test(lines[i])) {
      const runStart = i;
      while (i < lines.length && pattern.test(lines[i])) i++;
      const runLength = i - runStart;

      if (runLength >= 3) {
        saved += lines.slice(runStart + 1, i).join('\n').length;
        result.push(lines[runStart]);
        result.push(`  // [PyPoints: ${runLength - 1} similar debug statements removed]`);
      } else {
        for (let k = runStart; k < i; k++) result.push(lines[k]);
      }
    } else {
      result.push(lines[i]);
      i++;
    }
  }

  return { content: result.join('\n'), saved };
}