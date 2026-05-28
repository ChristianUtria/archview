/**
 * ContextStore.ts
 * Shared singleton that bridges MainViewProvider (webview) ↔ PyPointsTreeProvider (TreeView).
 * Stores: selected files, excluded files, active optimization profile.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { estimateTokens } from '../utils/tokenCounter';

export type ProfileKey = 'fast' | 'balanced' | 'ai_max' | 'conservative';

export interface SelectedFile {
  path: string;
  name: string;
  ext: string;
  tokens: number;
}

type Listener = () => void;

class ContextStore {
  private _selected    = new Map<string, SelectedFile>();
  private _excluded    = new Set<string>();
  private _profile: ProfileKey = 'balanced';
  private _listeners: Listener[] = [];

  // ── Subscribe ──────────────────────────────────────────────────────────────

  onChange(fn: Listener): vscode.Disposable {
    this._listeners.push(fn);
    return { dispose: () => { this._listeners = this._listeners.filter(l => l !== fn); } };
  }
  private _notify() { this._listeners.forEach(fn => fn()); }

  // ── Getters ────────────────────────────────────────────────────────────────

  get selectedFiles(): SelectedFile[] { return [...this._selected.values()]; }
  get selectedPaths(): string[]       { return [...this._selected.keys()]; }
  get excludedPaths(): Set<string>    { return this._excluded; }
  get totalTokens(): number           { return [...this._selected.values()].reduce((s, f) => s + f.tokens, 0); }
  get fileCount(): number             { return this._selected.size; }
  get activeProfile(): ProfileKey     { return this._profile; }

  isSelected(p: string): boolean { return this._selected.has(p); }
  isExcluded(p: string): boolean { return this._excluded.has(p); }

  // ── Mutators ───────────────────────────────────────────────────────────────

  setActiveProfile(key: string): void {
    const valid: ProfileKey[] = ['fast', 'balanced', 'ai_max', 'conservative'];
    if (valid.includes(key as ProfileKey) && key !== this._profile) {
      this._profile = key as ProfileKey;
      this._notify();
    }
  }

  addFile(filePath: string): void {
    if (this._selected.has(filePath) || this._excluded.has(filePath)) return;
    this._selected.set(filePath, this._makeEntry(filePath));
    this._notify();
  }

  addFiles(paths: string[]): void {
    let changed = false;
    for (const p of paths) {
      if (this._selected.has(p) || this._excluded.has(p)) continue;
      this._selected.set(p, this._makeEntry(p));
      changed = true;
    }
    if (changed) this._notify();
  }

  removeFile(filePath: string): void {
    if (this._selected.delete(filePath)) this._notify();
  }

  clearSelection(): void {
    if (this._selected.size === 0) return;
    this._selected.clear();
    this._notify();
  }

  excludeFile(filePath: string): void {
    this._selected.delete(filePath);
    this._excluded.add(filePath);
    this._notify();
  }

  includeFile(filePath: string): void {
    this._excluded.delete(filePath);
    this._notify();
  }

  clearExclusions(): void {
    if (this._excluded.size === 0) return;
    this._excluded.clear();
    this._notify();
  }

  /** Called when webview sends its full selected paths array */
  syncFromWebview(selectedPaths: string[]): void {
    this._selected.clear();
    for (const p of selectedPaths) {
      if (this._excluded.has(p)) continue;
      this._selected.set(p, this._makeEntry(p));
    }
    this._notify();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private _makeEntry(filePath: string): SelectedFile {
    return {
      path:   filePath,
      name:   path.basename(filePath),
      ext:    path.extname(filePath).slice(1).toLowerCase() || 'text',
      tokens: this._readTokens(filePath),
    };
  }

  private _readTokens(filePath: string): number {
    try {
      const stat = fs.statSync(filePath);
      if (stat.size > 512 * 1024) return Math.ceil(stat.size / 4);
      return estimateTokens(fs.readFileSync(filePath, 'utf-8'));
    } catch { return 0; }
  }
}

export const contextStore = new ContextStore();