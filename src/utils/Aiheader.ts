/**
 * Aiheader.ts
 * Generates the standardized AI context optimization header and file separators.
 */

import { formatTokens } from './tokenCounter';

export interface HeaderOptions {
  profile: string;
  fileCount: number;
  originalTokens: number;
  optimizedTokens: number;
  compressionPct: number;
  techniques: string[];
  timestamp?: boolean;
}

/** Compact file separator — much lighter than // ===== file ===== */
export const FILE_SEPARATOR = '---';

export function fileSeparator(filename: string): string {
  return `${FILE_SEPARATOR} ${filename}`;
}

export function generateAiHeader(options: HeaderOptions): string {
  const { profile, fileCount, originalTokens, optimizedTokens, compressionPct, techniques, timestamp } = options;

  const lines: string[] = [
    '[PyPoints AI Context Optimization Enabled]',
    '',
    'The following codebase has been optimized for AI analysis.',
    'Non-essential content such as redundant comments, empty lines, duplicated whitespace,',
    'oversized logs, and unnecessary formatting may have been reduced.',
    '',
    'Please provide concise, technical, and solution-focused responses.',
    '',
    `Optimization Profile : ${profile}`,
    `Files Included       : ${fileCount}`,
    `Original Tokens      : ${formatTokens(originalTokens)}`,
    `Optimized Tokens     : ${formatTokens(optimizedTokens)}`,
    `Compression          : ${compressionPct}%`,
  ];

  if (techniques.length > 0) {
    lines.push(`Techniques Applied   : ${techniques.slice(0, 6).join(', ')}`);
  }
  if (timestamp) {
    lines.push(`Generated At         : ${new Date().toISOString()}`);
  }

  lines.push('');
  lines.push('─'.repeat(60));
  lines.push('');

  return lines.join('\n');
}

export function generateMinimalHeader(filename: string, profile: string): string {
  return `[PyPoints: ${filename} — ${profile} optimization]\n`;
}