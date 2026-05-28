// ===== MainViewProvider.ts =====
// viewId fixed: 'archview.main' (was 'pypointsMain')

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { estimateTokens, formatTokens } from '../utils/tokenCounter';
import { reduceTokens, reduceBatch, summarizeWithClaude, PROFILES } from '../utils/tokenReducer';
import { contextStore, ProfileKey } from './ContextStore';
import { OptimizationPreviewPanel, PreviewData } from '../webview/Optimizationpreviewpanel';

// ─── File tree ────────────────────────────────────────────────────────────────

const IGNORED = new Set([
  'node_modules', '.git', '__pycache__', '.venv', 'venv',
  'out', '.mypy_cache', 'dist', 'build', '.pytest_cache',
  '.vscode-test', 'coverage', '.tox',
]);
const IGNORED_EXT = new Set(['.vsix', '.pyc', '.pyo']);

function shouldIgnore(name: string): boolean {
  if (IGNORED.has(name)) return true;
  if (IGNORED_EXT.has(path.extname(name).toLowerCase())) return true;
  if (name.startsWith('.') && !['.env', '.gitignore', '.editorconfig', '.vscodeignore'].includes(name)) return true;
  return false;
}

interface FileNode {
  name: string;
  fullPath: string;
  isDir: boolean;
  tokens?: number;
  children?: FileNode[];
}

function buildFileTree(dirPath: string): FileNode[] {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true })
      .filter(e => !shouldIgnore(e.name))
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      })
      .map(e => {
        const fullPath = path.join(dirPath, e.name);
        if (e.isDirectory()) {
          return { name: e.name, fullPath, isDir: true, children: buildFileTree(fullPath) };
        }
        let tokens = 0;
        try {
          const stat = fs.statSync(fullPath);
          tokens = stat.size < 512 * 1024
            ? estimateTokens(fs.readFileSync(fullPath, 'utf-8'))
            : Math.ceil(stat.size / 4);
        } catch { tokens = 0; }
        return { name: e.name, fullPath, isDir: false, tokens };
      });
  } catch { return []; }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export class MainViewProvider implements vscode.WebviewViewProvider {
  /** FIXED: was 'pypointsMain' — must match package.json view id 'archview.main' */
  public static readonly viewId = 'archview.main';
  private _view?: vscode.WebviewView;
  private _fileTree: FileNode[] = [];
  private _workspaceRoot = '';

  constructor(private readonly _context: vscode.ExtensionContext) {
    contextStore.onChange(() => {
      this._syncSelectionToWebview();
      this._syncProfileToWebview();
    });
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    this._refreshFileTree();
    this._render();

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) { this._refreshFileTree(); this._render(); }
    });

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.command) {
        case 'selectionChanged':
          contextStore.syncFromWebview(msg.paths as string[]);
          break;
        case 'profileChanged':
          contextStore.setActiveProfile(msg.profile as ProfileKey);
          break;
        case 'copyFiles':
          await this._copyFiles(msg.paths, false);
          break;
        case 'copyReduced':
          await this._copyFiles(msg.paths, true, contextStore.activeProfile);
          break;
        case 'summarizeFiles':
          await this._summarizeFiles(msg.paths);
          break;
        case 'openPreviewPanel':
          await this._openPreviewPanel(msg.paths, contextStore.activeProfile);
          break;
      }
    });
  }

  public refreshFiles() {
    this._refreshFileTree();
    if (this._view) this._render();
  }

  private _syncSelectionToWebview() {
    if (!this._view?.visible) return;
    this._post({ command: 'syncSelection', paths: contextStore.selectedPaths });
  }

  private _syncProfileToWebview() {
    if (!this._view?.visible) return;
    this._post({ command: 'syncProfile', profile: contextStore.activeProfile });
  }

  private _refreshFileTree() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length) { this._fileTree = []; return; }
    this._workspaceRoot = folders[0].uri.fsPath;
    this._fileTree = buildFileTree(this._workspaceRoot);
  }

  private _readFile(fp: string): string {
    const raw = fs.readFileSync(fp);
    let content: string;
    if (raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF) {
      content = raw.slice(3).toString('utf-8');
    } else if (raw[0] === 0xFF && raw[1] === 0xFE) {
      content = raw.slice(2).toString('utf16le');
    } else if (raw[0] === 0xFE && raw[1] === 0xFF) {
      const swapped = Buffer.alloc(raw.length - 2);
      for (let i = 2; i < raw.length - 1; i += 2) { swapped[i - 2] = raw[i + 1]; swapped[i - 1] = raw[i]; }
      content = swapped.toString('utf16le');
    } else {
      content = raw.toString('utf-8');
    }
    return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  private async _copyFiles(
    filePaths: string[],
    reduce: boolean,
    profile: ProfileKey = 'balanced'
  ) {
    if (!filePaths.length) { vscode.window.showWarningMessage('No hay archivos seleccionados.'); return; }

    type FileInput = { content: string; ext: string; name: string };
    const inputs: FileInput[] = [];
    let skipped = 0;

    for (const fp of filePaths) {
      try {
        inputs.push({
          content: this._readFile(fp),
          ext:     path.extname(fp).slice(1).toLowerCase() || 'text',
          name:    path.basename(fp),
        });
      } catch { skipped++; }
    }

    if (!inputs.length) { vscode.window.showWarningMessage('No se pudo leer ningún archivo.'); return; }

    let contents: string[];
    let savedPct = 0;

    if (reduce) {
      const batch = reduceBatch(inputs, PROFILES[profile]);
      contents = batch.files.map((f: { content: string }) => f.content);
      savedPct = batch.totalSavingsPct;
    } else {
      contents = inputs.map((f: { content: string }) => f.content);
    }

    const text = inputs
      .map((f, i) => `// ===== ${f.name} =====\n\`\`\`${f.ext}\n${contents[i]}\n\`\`\``)
      .join('\n\n');

    await vscode.env.clipboard.writeText(text);

    let msg = `${inputs.length} archivo(s) copiado(s)`;
    if (skipped) msg += ` (${skipped} omitidos)`;
    if (reduce && savedPct > 0) msg += ` — ${savedPct}% menos tokens`;

    vscode.window.showInformationMessage(msg);
    this._post({ command: 'copyDone', reduced: reduce, savedPct });
  }

  private async _openPreviewPanel(filePaths: string[], profile: ProfileKey) {
    if (!filePaths.length) { vscode.window.showWarningMessage('No hay archivos seleccionados.'); return; }

    const profileLabel = PROFILES[profile]?.label ?? profile;
    vscode.window.showInformationMessage(
      `Reduciendo tokens con perfil "${profileLabel}". No comprensión. La IA ayuda. El desarrollador decide. Preserva semántica con menor costo contextual.`
    );

    this._post({ command: 'previewStart', total: filePaths.length });
    const allData: PreviewData[] = [];

    try {
      for (let i = 0; i < filePaths.length; i++) {
        const fp   = filePaths[i];
        const name = path.basename(fp);
        const ext  = path.extname(fp).slice(1).toLowerCase() || 'text';

        this._post({ command: 'previewProgress', current: i + 1, total: filePaths.length, file: name });

        try {
          const raw     = this._readFile(fp);
          const origTok = estimateTokens(raw);
          const reduced = reduceTokens(raw, ext, PROFILES[profile] ?? PROFILES.balanced);
          const optTok  = estimateTokens(reduced.content);
          const savePct = origTok > 0 ? Math.round(((origTok - optTok) / origTok) * 100) : 0;

          allData.push({
            filename:         name,
            originalContent:  raw,
            optimizedContent: reduced.content,
            originalTokens:   origTok,
            optimizedTokens:  optTok,
            savingsPct:       savePct,
            techniques:       (reduced.techniques ?? []).map((t: { name: string; savedTokens: number; savedChars?: number }) => ({
              name:        t.name,
              savedTokens: t.savedTokens,
              savedChars:  t.savedChars ?? 0,
            })),
            qualityScore: {
              total:    Math.max(0, 100 - savePct),
              grade:    savePct < 30 ? 'A' : savePct < 60 ? 'B' : 'C',
              summary:  savePct < 30 ? 'Alta fidelidad' : savePct < 60 ? 'Equilibrado' : 'Máxima compresión',
              breakdown: { readability: 0, density: 0, completeness: 0, diversity: 0 },
            },
          });
        } catch (e) {
          vscode.window.showWarningMessage(`Error procesando ${name}: ${(e as Error).message}`);
        }
      }

      if (!allData.length) {
        this._post({ command: 'previewError' });
        vscode.window.showWarningMessage('No se pudo procesar ningún archivo.');
        return;
      }

      this._post({ command: 'previewDone' });
      OptimizationPreviewPanel.createOrShow(this._context.extensionUri, allData);

    } catch (e) {
      this._post({ command: 'previewError' });
      vscode.window.showErrorMessage(`ArchView preview error: ${(e as Error).message}`);
    }
  }

  private async _summarizeFiles(filePaths: string[]) {
    if (!filePaths.length) { vscode.window.showWarningMessage('No hay archivos seleccionados.'); return; }

    this._post({ command: 'summarizing', total: filePaths.length });

    const parts: string[] = [];
    let skipped = 0, totalOriginal = 0, totalReduced = 0;

    for (let i = 0; i < filePaths.length; i++) {
      const fp   = filePaths[i];
      const name = path.basename(fp);
      const ext  = path.extname(fp).slice(1).toLowerCase() || 'text';

      this._post({ command: 'summarizingProgress', current: i + 1, total: filePaths.length, file: name });

      try {
        const raw        = this._readFile(fp);
        totalOriginal   += estimateTokens(raw);
        const preReduced = reduceTokens(raw, ext, PROFILES.conservative);
        const summary    = await summarizeWithClaude(preReduced.content, name);
        totalReduced    += estimateTokens(summary);
        parts.push(`// ===== ${name} (resumido) =====\n\`\`\`${ext}\n${summary}\n\`\`\``);
      } catch (e) {
        skipped++;
        vscode.window.showWarningMessage(`Error resumiendo ${name}: ${(e as Error).message}`);
      }
    }

    if (!parts.length) { this._post({ command: 'summarizeDone', error: true }); return; }

    await vscode.env.clipboard.writeText(parts.join('\n\n'));

    const saved    = totalOriginal - totalReduced;
    const savedPct = totalOriginal > 0 ? Math.round((saved / totalOriginal) * 100) : 0;

    vscode.window.showInformationMessage(
      `${parts.length} archivo(s) resumidos por Claude — ${savedPct}% menos tokens` +
      (skipped ? ` (${skipped} omitidos)` : '')
    );
    this._post({ command: 'summarizeDone', savedPct, skipped });
  }

  private _post(msg: object) { this._view?.webview.postMessage(msg); }
  private _render()          { if (this._view) this._view.webview.html = this._buildHtml(); }

  private _buildHtml(): string {
    const tree            = JSON.stringify(this._fileTree);
    const initialSelected = JSON.stringify(contextStore.selectedPaths);
    const initialProfile  = JSON.stringify(contextStore.activeProfile);

    return /* html */`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
:root {
  --bg:    var(--vscode-sideBar-background);
  --bg3:   var(--vscode-input-background);
  --fg:    var(--vscode-foreground);
  --dim:   var(--vscode-descriptionForeground);
  --ac:    var(--vscode-button-background, #c0392b);
  --ac-h:  var(--vscode-button-hoverBackground, #e74c3c);
  --green: #27ae60;
  --bdr:   var(--vscode-panel-border, #333);
  --hover: var(--vscode-list-hoverBackground);
  --font:  var(--vscode-font-family, 'Segoe UI', sans-serif);
  --r: 3px;
}
* { box-sizing:border-box; margin:0; padding:0 }
body {
  background:var(--bg); color:var(--fg); font-family:var(--font);
  font-size:12px; height:100vh; display:flex; flex-direction:column; overflow:hidden;
}
.bar {
  display:flex; align-items:center; gap:4px; padding:5px 8px;
  border-bottom:1px solid var(--bdr); flex-shrink:0;
}
.bar-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; color:var(--dim); flex:1 }
.ghost-btn {
  background:transparent; border:none; color:var(--dim); cursor:pointer;
  padding:3px 6px; border-radius:var(--r); font-size:11px;
}
.ghost-btn:hover { background:var(--hover); color:var(--fg) }
.token-bar {
  display:none; align-items:center; justify-content:space-between;
  padding:4px 8px; background:var(--bg3); border-bottom:1px solid var(--bdr);
  font-size:10px; flex-shrink:0; gap:6px;
}
.token-bar.visible { display:flex }
.token-total { font-weight:700 }
.token-cost  { color:var(--dim); flex:1 }
.token-badge { background:var(--ac); color:#fff; border-radius:8px; padding:1px 7px; font-size:9px; font-weight:700 }
.profile-bar {
  display:none; align-items:center; justify-content:space-between;
  padding:4px 8px; background:var(--bg3); border-bottom:1px solid var(--bdr);
  font-size:10px; flex-shrink:0;
}
.profile-bar.visible { display:flex }
.profile-label { color:var(--dim) }
.profile-pill {
  font-weight:700; font-size:9px; padding:2px 8px;
  border-radius:8px; background:var(--ac); color:#fff;
}
.profile-pill.fast     { background:#e67e22 }
.profile-pill.balanced { background:#2980b9 }
.profile-pill.ai_max   { background:#8e44ad }
.list { flex:1; overflow-y:auto; min-height:0; padding:2px 0 }
.list::-webkit-scrollbar { width:4px }
.list::-webkit-scrollbar-thumb { background:var(--bg3); border-radius:2px }
.ft-node {
  display:flex; align-items:center; padding:2px 4px 2px 0;
  cursor:pointer; user-select:none; border-radius:2px;
}
.ft-node:hover { background:var(--hover) }
.ft-guide {
  flex-shrink:0; width:12px; align-self:stretch; position:relative;
}
.ft-guide::before {
  content:''; position:absolute; left:6px; top:0; bottom:0;
  width:1px; background:var(--bdr); opacity:.35;
}
.ft-toggle {
  width:15px; flex-shrink:0; text-align:center; font-size:10px;
  color:var(--dim); line-height:1;
}
.ft-toggle.leaf { opacity:0; pointer-events:none }
.ft-folder-icon {
  width:14px; height:13px; flex-shrink:0; margin-right:4px;
  display:flex; align-items:center;
}
.ft-folder-icon svg { width:14px; height:13px; display:block }
.ft-check {
  width:13px; height:13px; flex-shrink:0; margin-right:5px;
  border:1.5px solid var(--dim); border-radius:2px;
  display:flex; align-items:center; justify-content:center;
  font-size:9px; color:transparent;
}
.ft-node.selected .ft-check { background:var(--ac); border-color:var(--ac); color:#fff }
.ft-node.dir .ft-check { display:none }
.ft-name {
  font-size:11px; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; line-height:1.5;
}
.ft-node.dir .ft-name { color:var(--vscode-symbolIcon-folderForeground, #DCB67A); font-weight:600 }
.ft-token {
  font-size:9px; color:var(--dim); margin-right:6px; flex-shrink:0; opacity:0;
}
.ft-node:hover .ft-token,
.ft-node.selected .ft-token { opacity:1 }
.ft-node.selected .ft-token { color:var(--ac) }
.ft-children.hidden { display:none }
.empty {
  flex:1; display:flex; flex-direction:column; align-items:center;
  justify-content:center; gap:8px; color:var(--dim); text-align:center; padding:20px;
}
.empty-title { font-size:12px; font-weight:600 }
.empty-sub   { font-size:10px; line-height:1.6; max-width:180px }
.bottom { border-top:1px solid var(--bdr); flex-shrink:0; padding:8px; }
.copy-btn {
  width:100%; padding:8px; background:var(--ac); color:#fff; border:none;
  border-radius:var(--r); font-size:11px; font-weight:700; cursor:pointer;
  font-family:var(--font);
}
.copy-btn:hover    { background:var(--ac-h) }
.copy-btn:disabled { background:var(--bg3); color:var(--dim); cursor:not-allowed }
.progress-wrap { display:none; padding:6px 0 2px }
.progress-wrap.visible { display:block }
.progress-label {
  font-size:9px; color:var(--dim); margin-bottom:3px;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.progress-bar  { height:3px; background:var(--bg3); border-radius:2px; overflow:hidden }
.progress-fill { height:100%; background:var(--green); width:0% }
.savings-bar {
  display:none; align-items:center; justify-content:space-between;
  padding:4px 6px; background:var(--bg3); border-radius:var(--r); font-size:9px; margin-top:6px;
}
.savings-bar.visible { display:flex }
.savings-pct    { font-weight:700; color:var(--green) }
</style>
</head>
<body>

<div class="bar">
  <span class="bar-label" id="sel-label">Archivos del proyecto</span>
  <button class="ghost-btn" onclick="clearSel()">Limpiar</button>
</div>

<div class="token-bar" id="token-bar">
  <span class="token-total" id="token-total">0 tokens</span>
  <span class="token-cost"  id="token-cost"></span>
  <span class="token-badge" id="token-badge">0 archivos</span>
</div>

<div class="profile-bar" id="profile-bar">
  <span class="profile-label">Modo activo</span>
  <span class="profile-pill" id="profile-pill">Balanced</span>
</div>

<div class="list" id="tree-wrap">
  <div class="empty" id="empty">
    <div class="empty-title">Sin workspace</div>
    <div class="empty-sub">Abre una carpeta en VS Code para ver los archivos</div>
  </div>
</div>

<div class="bottom">
  <button class="copy-btn" id="copy-btn" onclick="copySelected()" disabled>Copiar</button>
  <button class="copy-btn" id="optimize-btn" onclick="optimizeSelected()" style="margin-top:6px;" disabled>Optimizar</button>
  <button class="copy-btn" id="preview-btn" onclick="previewSelected()"
    style="margin-top:6px; background:var(--vscode-button-secondaryBackground,#34495e);" disabled>
    Ver archivos optimizados
  </button>
  <div class="progress-wrap" id="progress-wrap">
    <div class="progress-label" id="progress-label">Procesando...</div>
    <div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
  </div>
  <div class="savings-bar" id="savings-bar">
    <span class="savings-pct" id="savings-pct"></span>
  </div>
</div>

<script>
const vsc = acquireVsCodeApi();
let fileTree     = ${tree};
let selected     = new Set(${initialSelected});
let tokenMap     = new Map();
let collapsedDirs = new Set();
let hasOptimized  = false;
let activeProfile = ${initialProfile};

const PROFILE_META = {
  fast:     { label: ' Fast',     cls: 'fast'     },
  balanced: { label: ' Balanced', cls: 'balanced' },
  ai_max:   { label: ' AI Max',  cls: 'ai_max'   },
};

function buildTokenMap(nodes) {
  for (const n of nodes) {
    if (!n.isDir && n.tokens != null) tokenMap.set(n.fullPath, n.tokens);
    if (n.children) buildTokenMap(n.children);
  }
}
buildTokenMap(fileTree);

function updateProfilePill() {
  const meta = PROFILE_META[activeProfile] ?? PROFILE_META.balanced;
  const pill = document.getElementById('profile-pill');
  pill.textContent = meta.label;
  pill.className   = 'profile-pill ' + meta.cls;
  const bar = document.getElementById('profile-bar');
  bar.classList.toggle('visible', selected.size > 0);
}

function folderSvg(open) {
  const c = 'var(--vscode-symbolIcon-folderForeground,#DCB67A)';
  if (open) {
    return '<svg viewBox="0 0 16 14" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M1 3a1 1 0 011-1h4.172l1.414 1.414.293.293H14a1 1 0 011 1V5H1V3z" fill="' + c + '" opacity=".7"/>' +
      '<path d="M1 5h14l-1.2 7.2A1 1 0 0112.813 13H3.187a1 1 0 01-.987-.8L1 5z" fill="' + c + '"/>' +
      '</svg>';
  }
  return '<svg viewBox="0 0 16 14" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M1 3a1 1 0 011-1h4.172l1.414 1.414.293.293H14a1 1 0 011 1v6a1 1 0 01-1 1H2a1 1 0 01-1-1V3z" fill="' + c + '" opacity=".7"/>' +
    '<path d="M1 6h14v4a1 1 0 01-1 1H2a1 1 0 01-1-1V6z" fill="' + c + '"/>' +
    '</svg>';
}

function renderTree(nodes, container, depth) {
  for (const node of nodes) {
    const row = document.createElement('div');
    row.className = 'ft-node' + (node.isDir ? ' dir' : '');
    row.dataset.path = node.fullPath;
    if (selected.has(node.fullPath)) row.classList.add('selected');

    const isCol  = collapsedDirs.has(node.fullPath);
    const tokStr = (!node.isDir && node.tokens != null) ? fmtTok(node.tokens) : '';

    let guides = '';
    for (let d = 0; d < depth; d++) guides += '<span class="ft-guide"></span>';

    let inner = guides;
    if (node.isDir) {
      inner +=
        '<span class="ft-toggle">' + (isCol ? '›' : '⌄') + '</span>' +
        '<span class="ft-folder-icon">' + folderSvg(!isCol) + '</span>' +
        '<span class="ft-name">' + esc(node.name) + '</span>';
    } else {
      inner +=
        '<span class="ft-toggle leaf">•</span>' +
        '<span class="ft-check">✓</span>' +
        '<span class="ft-name">' + esc(node.name) + '</span>' +
        (tokStr ? '<span class="ft-token">' + tokStr + '</span>' : '');
    }

    row.innerHTML = inner;
    row.addEventListener('click', () => onFileClick(node, row));
    container.appendChild(row);

    if (node.isDir && node.children) {
      const wrap = document.createElement('div');
      wrap.className = 'ft-children' + (isCol ? ' hidden' : '');
      wrap.dataset.parentPath = node.fullPath;
      renderTree(node.children, wrap, depth + 1);
      container.appendChild(wrap);
    }
  }
}

function onFileClick(node, row) {
  if (node.isDir) {
    const wrap = document.querySelector('.ft-children[data-parent-path="' + CSS.escape(node.fullPath) + '"]');
    const tog  = row.querySelector('.ft-toggle');
    const icon = row.querySelector('.ft-folder-icon');
    if (!wrap) return;
    const collapsed = collapsedDirs.has(node.fullPath);
    if (!collapsed) {
      collapsedDirs.add(node.fullPath); wrap.classList.add('hidden');
      tog.textContent = '›'; icon.innerHTML = folderSvg(false);
    } else {
      collapsedDirs.delete(node.fullPath); wrap.classList.remove('hidden');
      tog.textContent = '⌄'; icon.innerHTML = folderSvg(true);
    }
  } else {
    if (selected.has(node.fullPath)) { selected.delete(node.fullPath); row.classList.remove('selected'); }
    else                             { selected.add(node.fullPath);    row.classList.add('selected'); }
    hasOptimized = false;
    updateUI();
    vsc.postMessage({ command: 'selectionChanged', paths: [...selected] });
  }
}

function updateUI() {
  const n = selected.size;
  document.getElementById('sel-label').textContent = n
    ? n + ' archivo' + (n !== 1 ? 's' : '') + ' seleccionado' + (n !== 1 ? 's' : '')
    : 'Archivos del proyecto';

  const copyBtn = document.getElementById('copy-btn');
  copyBtn.disabled = n === 0;
  copyBtn.textContent = n ? 'Copiar ' + n + ' archivo' + (n !== 1 ? 's' : '') : 'Copiar';

  const meta = PROFILE_META[activeProfile] ?? PROFILE_META.balanced;
  const optimizeBtn = document.getElementById('optimize-btn');
  optimizeBtn.disabled = n === 0;
  optimizeBtn.textContent = n
    ? 'Optimizar ' + n + ' archivo' + (n !== 1 ? 's' : '') + '  ·  ' + meta.label
    : 'Optimizar';

  const prevBtn = document.getElementById('preview-btn');
  prevBtn.disabled = n === 0 || !hasOptimized;

  const bar = document.getElementById('token-bar');
  if (n > 0) {
    let total = 0;
    for (const p of selected) total += tokenMap.get(p) ?? 0;
    document.getElementById('token-total').textContent = fmtTok(total) + ' tokens';
    document.getElementById('token-cost').textContent  = estimateCost(total);
    document.getElementById('token-badge').textContent = n + ' archivo' + (n !== 1 ? 's' : '');
    bar.classList.add('visible');
  } else {
    bar.classList.remove('visible');
  }

  updateProfilePill();
  if (!hasOptimized) document.getElementById('savings-bar').classList.remove('visible');
}

function clearSel() {
  selected.clear(); hasOptimized = false;
  document.querySelectorAll('.ft-node.selected').forEach(el => el.classList.remove('selected'));
  updateUI();
  vsc.postMessage({ command: 'selectionChanged', paths: [] });
}

function copySelected()     { vsc.postMessage({ command: 'copyFiles',        paths: [...selected] }); }
function optimizeSelected() { vsc.postMessage({ command: 'copyReduced',      paths: [...selected], profile: activeProfile }); }
function previewSelected()  { vsc.postMessage({ command: 'openPreviewPanel', paths: [...selected], profile: activeProfile }); }

function setProgress(visible, pct, label) {
  const wrap = document.getElementById('progress-wrap');
  wrap.classList.toggle('visible', !!visible);
  if (pct   != null) document.getElementById('progress-fill').style.width = pct + '%';
  if (label != null) document.getElementById('progress-label').textContent = label;
}

function showSavings(pct) {
  document.getElementById('savings-pct').textContent = '-' + pct + '% tokens';
  document.getElementById('savings-bar').classList.add('visible');
}

window.addEventListener('message', e => {
  const m = e.data;
  if (m.command === 'syncSelection') {
    selected.clear();
    for (const p of m.paths) selected.add(p);
    document.querySelectorAll('.ft-node:not(.dir)').forEach(el => {
      el.classList.toggle('selected', selected.has(el.dataset.path));
    });
    hasOptimized = false; updateUI(); return;
  }
  if (m.command === 'syncProfile') {
    if (activeProfile !== m.profile) { activeProfile = m.profile; hasOptimized = false; updateUI(); }
    return;
  }
  if (m.command === 'copyDone') {
    if (m.reduced) {
      hasOptimized = true;
      const btn = document.getElementById('optimize-btn');
      const meta = PROFILE_META[activeProfile] ?? PROFILE_META.balanced;
      btn.textContent = 'Optimizado ✓  ·  ' + meta.label; btn.disabled = true;
      setTimeout(() => { btn.disabled = false; updateUI(); }, 2000);
      if (m.savedPct > 0) showSavings(m.savedPct);
    } else {
      const btn = document.getElementById('copy-btn');
      btn.textContent = 'Copiado ✓'; btn.disabled = true;
      setTimeout(() => { btn.disabled = false; updateUI(); }, 2000);
    }
    updateUI();
  }
  if (m.command === 'previewStart') { const meta = PROFILE_META[activeProfile] ?? PROFILE_META.balanced; setProgress(true, 0, 'Reduciendo tokens · Modo ' + meta.label + '...'); }
  if (m.command === 'previewProgress') { const meta = PROFILE_META[activeProfile] ?? PROFILE_META.balanced; setProgress(true, Math.round((m.current / m.total) * 100), 'Modo ' + meta.label + ' | ' + m.file + ' (' + m.current + '/' + m.total + ')...'); }
  if (m.command === 'previewDone' || m.command === 'previewError') { setProgress(false); }
  if (m.command === 'summarizing')         { setProgress(true, 0, 'Resumiendo con Claude...'); }
  if (m.command === 'summarizingProgress') { setProgress(true, Math.round((m.current / m.total) * 100), 'Resumiendo ' + m.file + ' (' + m.current + '/' + m.total + ')...'); }
  if (m.command === 'summarizeDone') { setProgress(false); if (!m.error && m.savedPct > 0) showSavings(m.savedPct); }
});

function fmtTok(n) {
  if (!n || n === 0) return '0';
  if (n < 1000)      return n + '';
  if (n < 10000)     return (n / 1000).toFixed(1) + 'k';
  return Math.round(n / 1000) + 'k';
}
function estimateCost(tokens) {
  const usd = (tokens / 1_000_000) * 3;
  if (usd < 0.001) return '<$0.001';
  return '~$' + usd.toFixed(3);
}
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function buildTree() {
  const wrap  = document.getElementById('tree-wrap');
  const empty = document.getElementById('empty');
  wrap.innerHTML = '';
  if (!fileTree.length) { wrap.appendChild(empty); empty.style.display = 'flex'; return; }
  empty.style.display = 'none';
  renderTree(fileTree, wrap, 0);
}

buildTree();
updateUI();
</script>
</body>
</html>`;
  }
}
