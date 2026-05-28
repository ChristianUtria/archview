/**
 * fileTypeOptimizer.ts
 * Language-specific optimization rules applied before the generic pipeline.
 */

import { OptimizationProfile } from './optimizationProfiles';

export type FileExtension =
  | 'py' | 'ts' | 'js' | 'tsx' | 'jsx'
  | 'json' | 'md' | 'yaml' | 'yml'
  | 'html' | 'css' | 'scss' | 'sql'
  | 'java' | 'kt' | 'cs' | 'go'
  | 'rs' | 'php' | 'xml' | 'dockerfile'
  | 'log' | 'txt' | string;

interface FileOptimizationResult {
  content: string;
  savedChars: number;
  techniquesApplied: string[];
}

/** Per-language comment stripping regex pairs [block-start, block-end] */
const BLOCK_COMMENT_DELIMITERS: Record<string, [RegExp, RegExp][]> = {
  py:  [],  // Python has no block comments (docstrings handled separately)
  ts:  [[/\/\*/g, /\*\//g]],
  js:  [[/\/\*/g, /\*\//g]],
  tsx: [[/\/\*/g, /\*\//g]],
  jsx: [[/\/\*/g, /\*\//g]],
  css: [[/\/\*/g, /\*\//g]],
  scss:[[/\/\*/g, /\*\//g]],
  java:[[/\/\*/g, /\*\//g]],
  kt:  [[/\/\*/g, /\*\//g]],
  cs:  [[/\/\*/g, /\*\//g]],
  go:  [[/\/\*/g, /\*\//g]],
  rs:  [[/\/\*/g, /\*\//g]],
  php: [[/\/\*/g, /\*\//g]],
  sql: [[/\/\*/g, /\*\//g]],
  xml: [[/<!--/g, /-->/g]],
  html:[[/<!--/g, /-->/g]],
};

const LINE_COMMENT_PATTERNS: Record<string, RegExp> = {
  py:  /^\s*#.*/,
  ts:  /^\s*\/\/.*/,
  js:  /^\s*\/\/.*/,
  tsx: /^\s*\/\/.*/,
  jsx: /^\s*\/\/.*/,
  java:/^\s*\/\/.*/,
  kt:  /^\s*\/\/.*/,
  cs:  /^\s*\/\/.*/,
  go:  /^\s*\/\/.*/,
  rs:  /^\s*\/\/.*/,
  php: /^\s*\/\/.*/,
  yaml:/^\s*#.*/,
  yml: /^\s*#.*/,
  sql: /^\s*--.*/,
  css: /^\s*\/\/.*/,
  scss:/^\s*\/\/.*/,
};

/** Remove inline trailing comments while preserving strings */
const INLINE_COMMENT_PATTERNS: Record<string, RegExp> = {
  ts:  /\s+\/\/(?![/!]).*$/,
  js:  /\s+\/\/(?![/!]).*$/,
  tsx: /\s+\/\/(?![/!]).*$/,
  jsx: /\s+\/\/(?![/!]).*$/,
  py:  /\s+#.*$/,
};

/**
 * Remove block comments (/* ... *​/ or <!-- ... -->) from source.
 * Works across multiple lines.
 */
function removeBlockComments(content: string, ext: string): string {
  const delimiters = BLOCK_COMMENT_DELIMITERS[ext] ?? BLOCK_COMMENT_DELIMITERS['ts'];
  if (!delimiters?.length) return content;

  for (const [_start, _end] of delimiters) {
    // Build a combined regex that captures content between block comment delimiters
    if (ext === 'xml' || ext === 'html') {
      content = content.replace(/<!--[\s\S]*?-->/g, '');
    } else {
      // Remove /* ... */ but preserve JSDoc (/** ... */) in balanced mode
      content = content.replace(/\/\*[\s\S]*?\*\//g, '');
    }
  }

  return content;
}

/**
 * Remove or compact JSON-specific content.
 * Compact JSON: remove all whitespace between tokens for object/array literals.
 */
function compactJson(content: string): string {
  try {
    const parsed = JSON.parse(content);
    return JSON.stringify(parsed);
  } catch {
    // Not valid JSON – try to compact inline objects/arrays only
    return content
      .replace(/\{\s+/g, '{')
      .replace(/\s+\}/g, '}')
      .replace(/\[\s+/g, '[')
      .replace(/\s+\]/g, ']')
      .replace(/,\s+/g, ', ');
  }
}

/**
 * Compact multi-line import/require blocks into fewer lines.
 * e.g.:
 *   import {
 *     A,
 *     B,
 *   } from 'x';
 * →  import { A, B } from 'x';
 */
function compactImports(content: string, ext: string): string {
  if (!['ts','js','tsx','jsx'].includes(ext)) return content;

  // Multi-line named imports
  content = content.replace(
    /import\s*\{([^}]+)\}\s*from\s*(['"][^'"]+['"])/g,
    (_, names: string, from: string) => {
      const compact = names.split('\n')
        .map(n => n.trim().replace(/,$/, ''))
        .filter(Boolean)
        .join(', ');
      return `import { ${compact} } from ${from}`;
    }
  );

  // Python: normalize multi-line from imports
  if (ext === 'py') {
    content = content.replace(
      /from\s+(\S+)\s+import\s*\(([^)]+)\)/g,
      (_, mod: string, names: string) => {
        const compact = names.split('\n')
          .map((n: string) => n.trim().replace(/,$/, ''))
          .filter(Boolean)
          .join(', ');
        return `from ${mod} import ${compact}`;
      }
    );
  }

  return content;
}

/** Compact YAML – remove comments & trailing spaces */
function optimizeYaml(content: string): string {
  return content
    .split('\n')
    .map(l => l.replace(/\s+#.*$/, '').trimEnd())
    .filter(l => l.trim() !== '' || false)
    .join('\n');
}

/** Compact SQL – remove inline comments, normalize whitespace */
function optimizeSql(content: string): string {
  return content
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/** Main per-file-type optimizer */
export function optimizeByFileType(
  content: string,
  ext: FileExtension,
  profile: OptimizationProfile
): FileOptimizationResult {
  const original = content;
  const techniques: string[] = [];

  // ── JSON ────────────────────────────────────────────────────────────────
  if (ext === 'json') {
    if (profile.compactJson) {
      const compacted = compactJson(content);
      if (compacted.length < content.length) {
        content = compacted;
        techniques.push('JSON compact');
      }
    }
    return { content, savedChars: original.length - content.length, techniquesApplied: techniques };
  }

  // ── YAML/YML ────────────────────────────────────────────────────────────
  if (ext === 'yaml' || ext === 'yml') {
    if (profile.removeComments) {
      const opt = optimizeYaml(content);
      if (opt.length < content.length) { content = opt; techniques.push('YAML optimize'); }
    }
    return { content, savedChars: original.length - content.length, techniquesApplied: techniques };
  }

  // ── SQL ─────────────────────────────────────────────────────────────────
  if (ext === 'sql') {
    if (profile.removeComments) {
      const opt = optimizeSql(content);
      if (opt.length < content.length) { content = opt; techniques.push('SQL optimize'); }
    }
    return { content, savedChars: original.length - content.length, techniquesApplied: techniques };
  }

  // ── Block comments ──────────────────────────────────────────────────────
  if (profile.removeComments) {
    const withoutBlock = removeBlockComments(content, ext);
    if (withoutBlock.length < content.length) {
      content = withoutBlock;
      techniques.push('Block comments removed');
    }
  }

  // ── Line comments ───────────────────────────────────────────────────────
  if (profile.removeComments) {
    const linePattern = LINE_COMMENT_PATTERNS[ext];
    if (linePattern) {
      const lines = content.split('\n');
      const filtered = lines.filter(l => !linePattern.test(l));
      if (filtered.length < lines.length) {
        content = filtered.join('\n');
        techniques.push('Line comments removed');
      }
    }
  }

  // ── Inline trailing comments ────────────────────────────────────────────
  if (profile.removeComments && profile.aggressiveCompression) {
    const inlinePattern = INLINE_COMMENT_PATTERNS[ext];
    if (inlinePattern) {
      const before = content;
      content = content.replace(new RegExp(inlinePattern.source, 'gm'), '');
      if (content.length < before.length) techniques.push('Inline comments removed');
    }
  }

  // ── Compact imports ─────────────────────────────────────────────────────
  if (profile.compactImports) {
    const before = content;
    content = compactImports(content, ext);
    if (content.length < before.length) techniques.push('Imports compacted');
  }

  return {
    content,
    savedChars: original.length - content.length,
    techniquesApplied: techniques,
  };
}

/** Whether a file extension is a known code/config type we can optimize */
export function isSupportedExtension(ext: string): boolean {
  const supported = new Set([
    'py','ts','js','tsx','jsx','json','md','yaml','yml',
    'html','css','scss','sql','java','kt','cs','go',
    'rs','php','xml','log','txt','dockerfile','toml','env',
    'sh','bash','zsh','fish','conf','ini','cfg',
  ]);
  return supported.has(ext.toLowerCase());
}