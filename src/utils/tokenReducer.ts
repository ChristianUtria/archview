/**
 * tokenReducer.ts
 * Backward-compatible facade over Optimizationpipeline.
 * Uses native fetch for Claude API — no SDK dependency required.
 */

import * as vscode from 'vscode';
import { ProfileKey, PROFILES, OptimizationProfile } from './optimizationProfiles';
import {
  optimizeFile,
  optimizeBatch,
  FileInput,
  FileOptimizationResult,
  BatchOptimizationResult,
} from './Optimizationpipeline';

// ─── Re-exports for legacy callers ────────────────────────────────────────────

export { PROFILES, ProfileKey };
export type { OptimizationProfile, FileOptimizationResult as ReduceResult };

export interface LegacyReduceResult {
  content: string;
  originalTokens: number;
  optimizedTokens: number;
  savingsPct: number;
  techniques: Array<{ name: string; savedTokens: number }>;
}

export interface LegacyBatchResult {
  files: LegacyReduceResult[];
  totalSavingsPct: number;
}

/** @deprecated Use Optimizationpipeline.optimizeFile */
export function reduceTokens(content: string, ext: string, profile: OptimizationProfile): LegacyReduceResult {
  const r = optimizeFile(content, ext, 'unknown', profile.key as ProfileKey);
  return { content: r.content, originalTokens: r.originalTokens, optimizedTokens: r.optimizedTokens, savingsPct: r.savingsPct, techniques: r.techniques };
}

/** @deprecated Use Optimizationpipeline.optimizeBatch */
export function reduceBatch(files: FileInput[], profile: OptimizationProfile): LegacyBatchResult {
  const batch = optimizeBatch(files, profile.key as ProfileKey);
  return {
    files: batch.files.map(f => ({
      content: f.content,
      originalTokens: f.result.originalTokens,
      optimizedTokens: f.result.optimizedTokens,
      savingsPct: f.result.savingsPct,
      techniques: f.result.techniques,
    })),
    totalSavingsPct: batch.totalSavingsPct,
  };
}

// ─── Claude summarization via fetch (no SDK needed) ──────────────────────────

interface AnthropicMessage {
  content: Array<{ type: string; text?: string }>;
}

function getApiKey(): string {
  const config = vscode.workspace.getConfiguration('pypoints');
  // Support both old key name (anthropicApiKey) and new (claudeApiKey)
  return (
    config.get<string>('claudeApiKey') ||
    config.get<string>('anthropicApiKey') ||
    process.env['ANTHROPIC_API_KEY'] ||
    ''
  );
}

export function invalidateAnthropicClient(): void {
  // No-op — we no longer cache a client object; each call reads config fresh
}

const SUMMARIZE_SYSTEM = `You are an expert software architect. Summarize the following source file for AI context optimization.

Rules:
- Output only the summarized code/content — no explanations or preamble
- Preserve all function signatures, class definitions, and public API surface
- Preserve all import/export statements
- Collapse large function bodies to a one-line comment: // [implementation: brief description]
- Preserve any TODO, FIXME, or HACK comments
- Maintain file structure and indentation
- Be extremely concise`;

export async function summarizeWithClaude(content: string, filename: string): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error(
      'No Anthropic API key found. Set it in Settings → ArchView: Claude API Key (archview.claudeApiKey).'
    );
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system:     SUMMARIZE_SYSTEM,
      messages: [
        { role: 'user', content: `Summarize this file (${filename}):\n\n${content}` },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error ${response.status}: ${err.slice(0, 200)}`);
  }

  const data = await response.json() as AnthropicMessage;

  const text = data.content
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { type: string; text?: string }) => b.text ?? '')
    .join('');

  return text.trim() || content;
}