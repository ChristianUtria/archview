/**
 * PyPointsTreeProvider.ts
 * All state comes from ContextStore — always in sync with the webview.
 * Actions now mirror the unified MainViewProvider (agent, preview, reduce).
 *
 * PROFILE SYNC FLOW:
 *   User clicks a mode here → setProfile() → contextStore.setActiveProfile()
 *   → contextStore fires onChange()
 *   → MainViewProvider._syncProfileToWebview() posts { command: 'syncProfile', profile }
 *   → Webview updates activeProfile, pill label, and button text automatically.
 *
 *   No extra code needed here: ContextStore is the single source of truth.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { formatTokens, estimateCostUsd, formatCostUsd } from '../utils/tokenCounter';
import { PROFILES } from '../utils/optimizationProfiles';
import { analyzeCompatibility, CompatibilityResult } from '../utils/Compatibilityanalyzer';
import { contextStore, ProfileKey } from './ContextStore';

export type NodeKind =
  | 'section-selected' | 'section-analysis' | 'section-modes'
  | 'section-compat'   | 'section-actions'  | 'section-excluded'
  | 'file-item' | 'excluded-item' | 'analysis-item'
  | 'mode-item' | 'compat-item'   | 'action-item' | 'empty-hint';

export class PyPointsNode extends vscode.TreeItem {
  constructor(
    public readonly kind: NodeKind,
    label: string,
    collapsible: vscode.TreeItemCollapsibleState,
    public readonly data?: Record<string, unknown>
  ) { super(label, collapsible); }
}

export class PyPointsTreeProvider
  implements vscode.TreeDataProvider<PyPointsNode>, vscode.Disposable
{
  public static readonly viewId = 'archview.treeView';

  private readonly _onDidChangeTreeData =
    new vscode.EventEmitter<PyPointsNode | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private _lastSavingsPct  = 0;
  private _lastQuality     = 0;
  private _optimizing      = false;
  private _agentBusy       = false;
  private _previewBusy     = false;
  private readonly _disposables: vscode.Disposable[] = [];

  constructor(private readonly _context: vscode.ExtensionContext) {
    this._disposables.push(contextStore.onChange(() => this.refresh()));
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
    this._disposables.forEach(d => d.dispose());
  }

  refresh(): void { this._onDidChangeTreeData.fire(); }

  // ── Delegated to ContextStore ──────────────────────────────────────────────

  addFiles(paths: string[]): void  { contextStore.addFiles(paths); }
  removeFile(fp: string): void     { contextStore.removeFile(fp); }
  clearSelection(): void           { contextStore.clearSelection(); }
  excludeFile(fp: string): void    { contextStore.excludeFile(fp); }
  includeFile(fp: string): void    { contextStore.includeFile(fp); }
  clearExclusions(): void          { contextStore.clearExclusions(); }

  /**
   * Cambia el perfil activo en el ContextStore.
   * Esto dispara onChange() → MainViewProvider recibe syncProfile →
   * el webview del panel de archivos se actualiza automáticamente.
   */
  setProfile(p: ProfileKey): void {
    contextStore.setActiveProfile(p);
    this._lastSavingsPct = 0; // invalida resultados previos al cambiar modo
  }

  setLastResults(pct: number, quality: number): void {
    this._lastSavingsPct = pct;
    this._lastQuality    = quality;
    this.refresh();
  }

  setOptimizing(v: boolean): void  { this._optimizing  = v; this.refresh(); }
  setAgentBusy(v: boolean): void   { this._agentBusy   = v; this.refresh(); }
  setPreviewBusy(v: boolean): void { this._previewBusy = v; this.refresh(); }

  get selectedFilePaths(): string[]  { return contextStore.selectedPaths; }
  get activeProfile(): ProfileKey    { return contextStore.activeProfile; }
  get totalSelectedTokens(): number  { return contextStore.totalTokens; }

  // ── TreeDataProvider ───────────────────────────────────────────────────────

  getTreeItem(el: PyPointsNode): vscode.TreeItem { return el; }

  getChildren(el?: PyPointsNode): PyPointsNode[] {
    if (!el) return this._roots();
    switch (el.kind) {
      case 'section-selected': return this._selectedNodes();
      case 'section-analysis': return this._analysisNodes();
      case 'section-modes':    return this._modeNodes();
      case 'section-compat':   return this._compatNodes();
      case 'section-actions':  return this._actionNodes();
      case 'section-excluded': return this._excludedNodes();
      default: return [];
    }
  }

  // ── Root sections ──────────────────────────────────────────────────────────

  private _roots(): PyPointsNode[] {
    const sel = contextStore.fileCount;
    const exl = contextStore.excludedPaths.size;
    const exp = vscode.TreeItemCollapsibleState.Expanded;
    const col = vscode.TreeItemCollapsibleState.Collapsed;
    const roots = [
      this._sec('section-selected', 'Selected Files',     sel > 0 ? exp : col, 'files',     sel > 0 ? `${sel}` : undefined),
      this._sec('section-analysis', 'Token Analysis',     sel > 0 ? exp : col, 'graph'),
      this._sec('section-modes',    'Optimization Modes', col,                  'zap'),
      this._sec('section-compat',   'AI Compatibility',   col,                  'robot'),
      this._sec('section-actions',  'Actions',            exp,                  'checklist'),
    ];
    if (exl > 0) roots.push(this._sec('section-excluded', 'Excluded Files', col, 'circle-slash', `${exl}`));
    return roots;
  }

  private _sec(kind: NodeKind, label: string, state: vscode.TreeItemCollapsibleState, icon: string, badge?: string): PyPointsNode {
    const n = new PyPointsNode(kind, label, state);
    n.iconPath     = new vscode.ThemeIcon(icon);
    n.contextValue = kind;
    if (badge) n.description = badge;
    return n;
  }

  // ── Selected files ─────────────────────────────────────────────────────────

  private _selectedNodes(): PyPointsNode[] {
    const files = contextStore.selectedFiles;

    if (files.length === 0) {
      const hint = new PyPointsNode('empty-hint', 'No files selected', vscode.TreeItemCollapsibleState.None);
      hint.description = 'Use the Files panel or right-click → Add to PyPoints';
      hint.iconPath    = new vscode.ThemeIcon('info');
      return [hint];
    }

    return files.map(f => {
      const n = new PyPointsNode(
        'file-item', f.name,
        vscode.TreeItemCollapsibleState.None,
        { filePath: f.path }
      );
      n.description  = `${formatTokens(f.tokens)} tok`;
      n.tooltip      = new vscode.MarkdownString(`**${f.name}**\n\n\`${f.path}\`\n\n${formatTokens(f.tokens)} tokens`);
      n.iconPath     = this._fileIcon(f.ext);
      n.contextValue = 'archview.fileItem';
      n.resourceUri  = vscode.Uri.file(f.path);
      n.command      = { command: 'archview.openFile', title: 'Open', arguments: [f.path] };
      return n;
    });
  }

  // ── Token analysis ─────────────────────────────────────────────────────────

  private _analysisNodes(): PyPointsNode[] {
    const total = contextStore.totalTokens;
    if (total === 0) {
      const h = new PyPointsNode('analysis-item', 'Select files to analyze', vscode.TreeItemCollapsibleState.None);
      h.iconPath = new vscode.ThemeIcon('info');
      return [h];
    }
    const cost  = estimateCostUsd(total, 'claude');
    const nodes = [
      this._stat('symbol-number', 'Total Tokens',   formatTokens(total)),
      this._stat('credit-card',   'Estimated Cost',  formatCostUsd(cost)),
    ];
    if (this._lastSavingsPct > 0) {
      nodes.push(this._stat('arrow-down', 'Compression', `${this._lastSavingsPct}%`,
        this._lastSavingsPct >= 50 ? 'charts.green' : 'charts.yellow'));
    }
    if (this._lastQuality > 0) {
      const icon = this._lastQuality >= 85 ? 'star-full' : this._lastQuality >= 65 ? 'star-half' : 'star-empty';
      nodes.push(this._stat(icon, 'Context Quality', `${this._lastQuality}/100`));
    }
    nodes.push(this._stat('file-code', 'Files Selected', String(contextStore.fileCount)));
    return nodes;
  }

  private _stat(icon: string, label: string, value: string, color?: string): PyPointsNode {
    const n = new PyPointsNode('analysis-item', label, vscode.TreeItemCollapsibleState.None);
    n.description = value;
    n.iconPath    = color ? new vscode.ThemeIcon(icon, new vscode.ThemeColor(color)) : new vscode.ThemeIcon(icon);
    return n;
  }

  // ── Optimization modes ─────────────────────────────────────────────────────
  // Al hacer clic en un modo aquí, contextStore.setActiveProfile() dispara onChange()
  // y MainViewProvider propaga el cambio al webview via syncProfile.

  private _modeNodes(): PyPointsNode[] {
    const current = contextStore.activeProfile;
    const defs: Array<{ key: ProfileKey; icon: string }> = [
      { key: 'fast',     icon: 'zap'    },
      { key: 'balanced', icon: 'scale'  },
      { key: 'ai_max',   icon: 'rocket' },
    ];
    return defs.map(({ key, icon }) => {
      const p  = PROFILES[key];
      const on = current === key;
      const n  = new PyPointsNode('mode-item',
        `${on ? '▶  ' : '    '}${p.label}`,
        vscode.TreeItemCollapsibleState.None, { profileKey: key });
      n.description  = p.description;
      n.tooltip      = p.description;
      n.iconPath     = new vscode.ThemeIcon(icon, on ? new vscode.ThemeColor('charts.blue') : undefined);
      n.contextValue = `archview.mode.${key}`;
      // archview.setProfile llama a treeProvider.setProfile(key) → contextStore.setActiveProfile(key)
      n.command      = { command: 'archview.setProfile', title: 'Set', arguments: [key] };
      return n;
    });
  }

  // ── AI Compatibility ───────────────────────────────────────────────────────

  private _compatNodes(): PyPointsNode[] {
    const total = contextStore.totalTokens;
    if (total === 0) {
      const h = new PyPointsNode('compat-item', 'Select files to analyze', vscode.TreeItemCollapsibleState.None);
      h.iconPath = new vscode.ThemeIcon('info');
      return [h];
    }
    const SHOW   = new Set(['gpt4o', 'claude-sonnet', 'gemini-pro', 'copilot', 'cursor', 'windsurf']);
    const report = analyzeCompatibility(total);
    const nodes  = report.results
      .filter((r: CompatibilityResult) => SHOW.has(r.model.id))
      .map((r: CompatibilityResult) => {
        const n = new PyPointsNode('compat-item', r.model.name, vscode.TreeItemCollapsibleState.None);
        n.description = r.fits ? `${r.usagePct}% used` : 'Exceeds limit';
        n.iconPath    = new vscode.ThemeIcon(r.fits ? 'check' : 'x',
          new vscode.ThemeColor(r.fits ? 'charts.green' : 'charts.red'));
        n.tooltip = r.warning ?? `${r.usagePct}% of ${formatTokens(r.model.contextWindow)} context`;
        return n;
      });
    const rec = new PyPointsNode('compat-item', report.recommendation, vscode.TreeItemCollapsibleState.None);
    rec.iconPath = new vscode.ThemeIcon('lightbulb');
    nodes.push(rec);
    return nodes;
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  private _actionNodes(): PyPointsNode[] {
    const has  = contextStore.fileCount > 0;
    const cnt  = contextStore.fileCount;
    const prof = PROFILES[contextStore.activeProfile] ?? PROFILES.balanced;

    const optimizingNow = this._optimizing;
    const agentNow      = this._agentBusy;
    const previewNow    = this._previewBusy;

    const defs = [
      {
        id:    'copy',
        label: 'Copy Files',
        icon:  'copy',
        cmd:   'archview.copyFiles',
        on:    has,
        desc:  `${cnt} file${cnt !== 1 ? 's' : ''}`,
      },
      {
        id:    'optimize',
        // Muestra el perfil activo del store para que sea consistente con el webview
        label: optimizingNow ? 'Optimizing…' : 'Optimize & Copy',
        icon:  optimizingNow ? 'loading~spin' : 'zap',
        cmd:   'archview.optimizeAndCopy',
        on:    has && !optimizingNow,
        desc:  prof.label,  // ← nombre del perfil activo
      },
      {
        id:    'preview',
        label: previewNow ? 'Calculating…' : 'Preview Optimization',
        icon:  previewNow ? 'loading~spin' : 'eye',
        cmd:   'archview.previewOptimization',
        on:    has && !previewNow,
        desc:  'All profiles',
      },
      {
        id:    'summarize',
        label: 'Summarize with Claude',
        icon:  'sparkle',
        cmd:   'archview.summarizeFiles',
        on:    has && !optimizingNow,
        desc:  'AI quality',
      },
      {
        id:    'agent',
        label: agentNow ? 'Agent thinking…' : 'Ask AI Agent',
        icon:  agentNow ? 'loading~spin' : 'comment-discussion',
        cmd:   'archview.openAgentPanel',
        on:    has && !agentNow,
        desc:  'Multi-file analysis',
      },
      {
        id:    'clear',
        label: 'Clear Selection',
        icon:  'clear-all',
        cmd:   'archview.clearSelection',
        on:    has,
      },
    ] as const;

    return defs.map(a => {
      const n = new PyPointsNode('action-item', a.label, vscode.TreeItemCollapsibleState.None, { actionId: a.id });
      n.description  = (a as { desc?: string }).desc;
      n.iconPath     = new vscode.ThemeIcon(a.icon, a.on ? undefined : new vscode.ThemeColor('disabledForeground'));
      n.contextValue = `archview.action.${a.id}`;
      if (a.on) n.command = { command: a.cmd, title: a.label, arguments: [] };
      return n;
    });
  }

  // ── Excluded ───────────────────────────────────────────────────────────────

  private _excludedNodes(): PyPointsNode[] {
    const nodes = [...contextStore.excludedPaths].map(fp => {
      const n = new PyPointsNode('excluded-item', path.basename(fp),
        vscode.TreeItemCollapsibleState.None, { filePath: fp });
      n.description  = 'excluded';
      n.iconPath     = this._fileIcon(path.extname(fp).slice(1));
      n.contextValue = 'archview.excludedItem';
      n.tooltip      = fp;
      return n;
    });
    const clear = new PyPointsNode('action-item', 'Clear All Exclusions', vscode.TreeItemCollapsibleState.None);
    clear.iconPath = new vscode.ThemeIcon('trash');
    clear.command  = { command: 'archview.clearExclusions', title: 'Clear', arguments: [] };
    nodes.push(clear);
    return nodes;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private _fileIcon(ext: string): vscode.ThemeIcon {
    const m: Record<string, string> = {
      ts:'symbol-class', tsx:'symbol-class', js:'symbol-method', jsx:'symbol-method',
      py:'symbol-misc',  json:'symbol-array', md:'book', css:'symbol-color',
      scss:'symbol-color', html:'symbol-structure', yaml:'symbol-constant',
      yml:'symbol-constant', sql:'database', dockerfile:'package',
    };
    return new vscode.ThemeIcon(m[ext] ?? 'file');
  }

  handleDrag(source: readonly PyPointsNode[], dt: vscode.DataTransfer): void {
    const paths = source
      .filter(n => n.kind === 'file-item' && n.data?.['filePath'])
      .map(n => n.data!['filePath'] as string);
    if (paths.length) dt.set('application/vnd.archview.files', new vscode.DataTransferItem(paths));
  }

  handleDrop(_t: PyPointsNode | undefined, dt: vscode.DataTransfer): void {
    const item = dt.get('application/vnd.code.tree.explorer');
    if (item) contextStore.addFiles((item.value as vscode.Uri[]).map(u => u.fsPath));
  }
}