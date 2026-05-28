import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// ─── IGNORED FILTER ───────────────────────────────────────────────────────────

const IGNORED_EXACT = new Set([
  'node_modules', '.git', '__pycache__', '.venv',
  'venv', 'out', '.mypy_cache', 'dist', 'build', '.pytest_cache',
  '.vscode-test', 'coverage', '.tox', 'package-lock.json',
]);

const IGNORED_EXTENSIONS = new Set(['.vsix']);

const ALLOWED_DOTFILES = new Set([
  '.gitignore', '.gitattributes', '.env', '.editorconfig',
  '.eslintrc', '.prettierrc', '.vscodeignore',
]);

function shouldIgnore(name: string): boolean {
  if (IGNORED_EXACT.has(name)) return true;
  const ext = path.extname(name).toLowerCase();
  if (IGNORED_EXTENSIONS.has(ext)) return true;
  if (name.startsWith('.') && !ALLOWED_DOTFILES.has(name)) return true;
  return false;
}

// ─── GITIGNORE PARSER ────────────────────────────────────────────────────────

function loadGitignorePatterns(rootPath: string): string[] {
  const gitignorePath = path.join(rootPath, '.gitignore');
  if (!fs.existsSync(gitignorePath)) return [];
  return fs.readFileSync(gitignorePath, 'utf8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));
}

function matchesGitignore(name: string, relativePath: string, patterns: string[]): boolean {
  const normalizedRel = relativePath.replace(/\\/g, '/');
  for (const pattern of patterns) {
    if (pattern.startsWith('!')) continue;
    const cleanPattern = pattern.endsWith('/') ? pattern.slice(0, -1) : pattern;
    if (cleanPattern.startsWith('/')) {
      const anchored = cleanPattern.slice(1);
      if (matchGlob(anchored, normalizedRel)) return true;
      continue;
    }
    if (cleanPattern.includes('/')) {
      if (matchGlob(cleanPattern, normalizedRel)) return true;
      continue;
    }
    if (matchGlob(cleanPattern, name)) return true;
    const segments = normalizedRel.split('/');
    if (segments.some(seg => matchGlob(cleanPattern, seg))) return true;
  }
  return false;
}

function matchGlob(pattern: string, str: string): boolean {
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '<<<DOUBLESTAR>>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<<DOUBLESTAR>>>/g, '.*')
    .replace(/\?/g, '[^/]');
  try {
    return new RegExp(`^${regexStr}$`).test(str);
  } catch {
    return false;
  }
}

// ─── SVG ICONS ───────────────────────────────────────────────────────────────

const SVG = {
  folder: `<svg  width="16" height="16" viewBox="0 0 24 24"><path fill="#fff" d="M4 20q-.825 0-1.412-.587T2 18V6q0-.825.588-1.412T4 4h6l2 2h8q.825 0 1.413.588T22 8v10q0 .825-.587 1.413T20 20z"/></svg>`,
  file:   `<svg width="16" height="16" viewBox="0 0 24 24"><path fill="#fff" d="M14 11a3 3 0 0 1-3-3V4H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-8zm-2-3a2 2 0 0 0 2 2h3.59L12 4.41zM7 3h5l7 7v9a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3"/></svg>`,
  python: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path fill="#0288d1" d="M9.86 2A2.86 2.86 0 0 0 7 4.86v1.68h4.29c.39 0 .71.57.71.96H4.86A2.86 2.86 0 0 0 2 10.36v3.781a2.86 2.86 0 0 0 2.86 2.86h1.18v-2.68a2.85 2.85 0 0 1 2.85-2.86h5.25c1.58 0 2.86-1.271 2.86-2.851V4.86A2.86 2.86 0 0 0 14.14 2zm-.72 1.61c.4 0 .72.12.72.71s-.32.891-.72.891c-.39 0-.71-.3-.71-.89s.32-.711.71-.711"/><path fill="#fdd835" d="M17.959 7v2.68a2.85 2.85 0 0 1-2.85 2.859H9.86A2.85 2.85 0 0 0 7 15.389v3.75a2.86 2.86 0 0 0 2.86 2.86h4.28A2.86 2.86 0 0 0 17 19.14v-1.68h-4.291c-.39 0-.709-.57-.709-.96h7.14A2.86 2.86 0 0 0 22 13.64V9.86A2.86 2.86 0 0 0 19.14 7zm-9.639 4.513l-.004.004.038-.004zm6.54 7.276c.39 0 .71.3.71.89a.71.71 0 0 1-.71.71c-.4 0-.72-.12-.72-.71s.32-.89.72-.89"/></svg>`,
  typescript: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 128 128"><path fill="#fff" d="M22.67 47h99.67v73.67H22.67z"/><path fill="#007acc" d="M1.5 63.91v62.5h125v-125H1.5zm100.73-5a15.56 15.56 0 0 1 7.82 4.5a20.6 20.6 0 0 1 3 4c0 .16-5.4 3.81-8.69 5.85c-.12.08-.6-.44-1.13-1.23a7.09 7.09 0 0 0-5.87-3.53c-3.79-.26-6.23 1.73-6.21 5a4.6 4.6 0 0 0 .54 2.34c.83 1.73 2.38 2.76 7.24 4.86c8.95 3.85 12.78 6.39 15.16 10c2.66 4 3.25 10.46 1.45 15.24c-2 5.2-6.9 8.73-13.83 9.9a38.3 38.3 0 0 1-9.52-.1a23 23 0 0 1-12.72-6.63c-1.15-1.27-3.39-4.58-3.25-4.82a9 9 0 0 1 1.15-.73L82 101l3.59-2.08l.75 1.11a16.8 16.8 0 0 0 4.74 4.54c4 2.1 9.46 1.81 12.16-.62a5.43 5.43 0 0 0 .69-6.92c-1-1.39-3-2.56-8.59-5c-6.45-2.78-9.23-4.5-11.77-7.24a16.5 16.5 0 0 1-3.43-6.25a25 25 0 0 1-.22-8c1.33-6.23 6-10.58 12.82-11.87a31.7 31.7 0 0 1 9.49.26zm-29.34 5.24v5.12H56.66v46.23H45.15V69.26H28.88v-5a49 49 0 0 1 .12-5.17C29.08 59 39 59 51 59h21.83z"/></svg>`,
  javascript: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256"><path fill="#f7df1e" d="M0 0h256v256H0z"/><path d="m67.312 213.932l19.59-11.856c3.78 6.701 7.218 12.371 15.465 12.371c7.905 0 12.89-3.092 12.89-15.12v-81.798h24.057v82.138c0 24.917-14.606 36.259-35.916 36.259c-19.245 0-30.416-9.967-36.087-21.996m85.07-2.576l19.588-11.341c5.157 8.421 11.859 14.607 23.715 14.607c9.969 0 16.325-4.984 16.325-11.858c0-8.248-6.53-11.17-17.528-15.98l-6.013-2.58c-17.357-7.387-28.87-16.667-28.87-36.257c0-18.044 13.747-31.792 35.228-31.792c15.294 0 26.292 5.328 34.196 19.247l-18.732 12.03c-4.125-7.389-8.591-10.31-15.465-10.31c-7.046 0-11.514 4.468-11.514 10.31c0 7.217 4.468 10.14 14.778 14.608l6.014 2.577c20.45 8.765 31.963 17.7 31.963 37.804c0 21.654-17.012 33.51-39.867 33.51c-22.339 0-36.774-10.654-43.819-24.574"/></svg>`,
  json:     `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path fill="#fff" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM8.022 16.704c0 .961-.461 1.296-1.2 1.296c-.176 0-.406-.029-.557-.08l.086-.615c.104.035.239.06.391.06c.319 0 .52-.145.52-.67v-2.122h.761zm1.459 1.291c-.385 0-.766-.1-.955-.205l.155-.631c.204.105.521.211.846.211c.35 0 .534-.146.534-.365c0-.211-.159-.331-.564-.476c-.562-.195-.927-.506-.927-.996c0-.576.481-1.017 1.277-1.017c.38 0 .659.08.861.171l-.172.615c-.135-.065-.375-.16-.705-.16s-.491.15-.491.325c0 .215.19.311.627.476c.596.22.876.53.876 1.006c.001.566-.436 1.046-1.362 1.046m3.306.005c-1.001 0-1.586-.755-1.586-1.716c0-1.012.646-1.768 1.642-1.768c1.035 0 1.601.776 1.601 1.707C14.443 17.33 13.773 18 12.787 18m4.947-.055h-.802l-.721-1.302a13 13 0 0 1-.585-1.19l-.016.005c.021.445.031.921.031 1.472v1.016h-.701v-3.373h.891l.701 1.236c.2.354.4.775.552 1.155h.014c-.05-.445-.065-.9-.065-1.406v-.985h.702zM14 9h-1V4l5 5z"/></svg>`,
  markdown: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><g fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M7 15V9l2 2l2-2v6m3-2l2 2l2-2m-2 2V9"/></g></svg>`,
  html:     `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 128 128"><path fill="#e44d26" d="M19.037 113.876L9.032 1.661h109.936l-10.016 112.198l-45.019 12.48z"/><path fill="#f16529" d="m64 116.8l36.378-10.086l8.559-95.878H64z"/><path fill="#ebebeb" d="M64 52.455H45.788L44.53 38.361H64V24.599H29.489l.33 3.692l3.382 37.927H64zm0 35.743l-.061.017l-15.327-4.14l-.979-10.975H33.816l1.928 21.609l28.193 7.826l.063-.017z"/><path fill="#fff" d="M63.952 52.455v13.763h16.947l-1.597 17.849l-15.35 4.143v14.319l28.215-7.82l.207-2.325l3.234-36.233l.335-3.696h-3.708zm0-27.856v13.762h33.244l.276-3.092l.628-6.978l.329-3.692z"/></svg>`,
  css:      `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 128 128"><path fill="#1572b6" d="M18.814 114.123L8.76 1.352h110.48l-10.064 112.754l-45.243 12.543z"/><path fill="#33a9dc" d="m64.001 117.062l36.559-10.136l8.601-96.354h-45.16z"/><path fill="#fff" d="M64.001 51.429h18.302l1.264-14.163H64.001V23.435h34.682l-.332 3.711l-3.4 38.114h-30.95z"/><path fill="#ebebeb" d="m64.083 87.349l-.061.018l-15.403-4.159l-.985-11.031H33.752l1.937 21.717l28.331 7.863l.063-.018z"/><path fill="#fff" d="m81.127 64.675l-1.666 18.522l-15.426 4.164v14.39l28.354-7.858l.208-2.337l2.406-26.881z"/><path fill="#ebebeb" d="M64.048 23.435v13.831H30.64l-.277-3.108l-.63-7.012l-.331-3.711zm-.047 27.996v13.831H48.792l-.277-3.108l-.631-7.012l-.33-3.711z"/></svg>`,
  env:      `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path fill="#fff" d="M17 8h-1V6A5 5 0 0 0 6 6v2H5a2.006 2.006 0 0 0-2 2v10a2.006 2.006 0 0 0 2 2h12a2.006 2.006 0 0 0 2-2V10a2.006 2.006 0 0 0-2-2m-9.72 6.59v.752H5.975v.877H7.45V17H5v-4h2.45v.78H5.975v.81ZM7.9 6a3.1 3.1 0 1 1 6.2 0v2H7.9Zm4.268 11h-.974l-1.63-2.467V17H8.59v-4h.974l1.63 2.479V13h.974Zm3.433 0H14.4L13 13h1l1 3l1-3h1Z"/></svg>`,
  sql:      `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 32 32"><path fill="#375c70" d="M27.917 6h-9.679l-2 4H5v17h25V6ZM28 24H7V12h21Zm.1-14h-7.81l.952-2H28v2Z"/></svg>`,
  git:      `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 128 128"><path fill="#f34f29" d="M124.737 58.378L69.621 3.264c-3.172-3.174-8.32-3.174-11.497 0L46.68 14.71l14.518 14.518c3.375-1.139 7.243-.375 9.932 2.314c2.703 2.706 3.461 6.607 2.294 9.993l13.992 13.993c3.385-1.167 7.292-.413 9.994 2.295c3.78 3.777 3.78 9.9 0 13.679a9.673 9.673 0 0 1-13.683 0a9.68 9.68 0 0 1-2.105-10.521L68.574 47.933l-.002 34.341a9.7 9.7 0 0 1 2.559 1.828c3.778 3.777 3.778 9.898 0 13.683c-3.779 3.777-9.904 3.777-13.679 0c-3.778-3.784-3.778-9.905 0-13.683a9.7 9.7 0 0 1 3.167-2.11V47.333a9.6 9.6 0 0 1-3.167-2.111c-2.862-2.86-3.551-7.06-2.083-10.576L41.056 20.333L3.264 58.123a8.133 8.133 0 0 0 0 11.5l55.117 55.114c3.174 3.174 8.32 3.174 11.499 0l54.858-54.858a8.135 8.135 0 0 0-.001-11.501"/></svg>`,
  txt:      `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path fill="#fff" d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM9.998 14.768H8.895v3.274h-.917v-3.274H6.893V14h3.105zm2.725 3.274l-.365-.731c-.15-.282-.246-.492-.359-.726h-.013c-.083.233-.185.443-.312.726l-.335.731h-1.045l1.171-2.045L10.336 14h1.05l.354.738c.121.245.21.443.306.671h.013c.096-.258.174-.438.276-.671l.341-.738h1.043l-1.139 1.973l1.198 2.069zm4.384-3.274h-1.104v3.274h-.917v-3.274h-1.085V14h3.105zM14 9h-1V4l5 5z"/></svg>`,
};

function getIconKey(name: string): keyof typeof SVG {
  const ext = path.extname(name).toLowerCase();
  const base = name.toLowerCase();
  if (base === '.gitignore' || base === '.gitattributes') return 'git';
  const map: Record<string, keyof typeof SVG> = {
    '.py': 'python', '.ts': 'typescript', '.js': 'javascript',
    '.json': 'json', '.md': 'markdown', '.html': 'html',
    '.css': 'css', '.env': 'env', '.sql': 'sql', '.txt': 'txt',
  };
  return map[ext] ?? 'file';
}

interface TreeNode {
  name: string;
  isDir: boolean;
  children?: TreeNode[];
}

function buildNodes(dirPath: string, rootPath: string, gitignorePatterns: string[]): TreeNode[] {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true })
      .filter(e => {
        if (shouldIgnore(e.name)) return false;
        const rel = path.relative(rootPath, path.join(dirPath, e.name));
        if (matchesGitignore(e.name, rel, gitignorePatterns)) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      })
      .map(e => ({
        name: e.name,
        isDir: e.isDirectory(),
        children: e.isDirectory()
          ? buildNodes(path.join(dirPath, e.name), rootPath, gitignorePatterns)
          : undefined,
      }));
  } catch {
    return [];
  }
}

function nodesToText(nodes: TreeNode[], prefix = ''): string {
  return nodes.map((node, i) => {
    const isLast = i === nodes.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = isLast ? '    ' : '│   ';
    const suffix = node.isDir ? '/' : '';
    let line = `${prefix}${connector}${node.name}${suffix}\n`;
    if (node.children) line += nodesToText(node.children, prefix + childPrefix);
    return line;
  }).join('');
}

function nodesToHtml(nodes: TreeNode[], depth = 0): string {
  return nodes.map((node, i) => {
    const isLast = i === nodes.length - 1;
    const icon = node.isDir ? SVG.folder : SVG[getIconKey(node.name)];
    const children = node.children ? nodesToHtml(node.children, depth + 1) : '';
    const hasChildren = node.isDir && node.children && node.children.length > 0;
    return `
      <div class="node ${node.isDir ? 'dir' : 'file'} ${isLast ? 'last' : ''}" style="padding-left:${depth * 16}px">
        <span class="node-inner ${hasChildren ? 'collapsible' : ''}" onclick="${hasChildren ? 'toggleDir(this)' : ''}">
          <span class="icon">${icon}</span>
          <span class="label">${node.name}${node.isDir ? '/' : ''}</span>
          ${hasChildren ? '<span class="chevron">▾</span>' : ''}
        </span>
        ${hasChildren ? `<div class="children">${children}</div>` : ''}
      </div>`;
  }).join('');
}

// ─── PROVIDER ────────────────────────────────────────────────────────────────

export class StructureProvider implements vscode.WebviewViewProvider {
  /** FIXED: was 'pypointsStructure' — must match package.json view id 'archview.structure' */
  public static readonly viewId = 'archview.structure';
  private _view?: vscode.WebviewView;

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    this._generate();
    vscode.workspace.onDidChangeWorkspaceFolders(() => this._generate());
  }

  public refresh(): void { this._generate(); }

  private _generate(): void {
    if (!this._view) return;
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      this._view.webview.html = this._getHtml([], '', '');
      return;
    }
    const root = folders[0].uri.fsPath;
    const rootName = path.basename(root);
    const gitignorePatterns = loadGitignorePatterns(root);
    const nodes = buildNodes(root, root, gitignorePatterns);
    const plainText = `${rootName}/\n` + nodesToText(nodes);
    const richHtml = nodesToHtml(nodes);
    this._view.webview.html = this._getHtml(nodes, rootName, plainText, richHtml);
  }

  private _getHtml(
    _nodes: TreeNode[],
    rootName: string,
    plainText: string,
    richHtml: string = ''
  ): string {
    const escapedPlain = plainText
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px;
    color: var(--vscode-editor-foreground);
    background: transparent;
    padding: 8px 6px;
  }
  .toolbar {
    display: flex; align-items: center; gap: 4px;
    margin-bottom: 8px; padding-bottom: 6px;
    border-bottom: 1px solid var(--vscode-panel-border);
  }
  .title {
    font-size: 11px; font-weight: 600;
    color: var(--vscode-descriptionForeground);
    text-transform: uppercase; letter-spacing: 0.06em;
    flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .btn {
    background: transparent; color: var(--vscode-icon-foreground);
    border: none; border-radius: 4px; padding: 3px 6px; font-size: 11px;
    cursor: pointer; opacity: 0.7; transition: opacity 0.15s, background 0.15s;
    white-space: nowrap;
  }
  .btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }
  .btn.active { opacity: 1; background: var(--vscode-button-secondaryBackground); }
  .toggle-group { display: flex; gap: 2px; }
  #feedback { font-size: 10px; color: var(--vscode-terminal-ansiGreen); opacity: 0; transition: opacity 0.3s; }
  #feedback.show { opacity: 1; }
  #plain-view { display: block; white-space: pre; overflow-x: auto; line-height: 1.75; font-family: 'Cascadia Code', 'Fira Code', monospace; font-size: 12px; }
  #rich-view { display: none; }
  .node { position: relative; line-height: 1; }
  .node-inner { display: flex; align-items: center; gap: 4px; padding: 2px 4px; border-radius: 3px; cursor: default; user-select: none; }
  .node-inner.collapsible { cursor: pointer; }
  .node-inner:hover { background: var(--vscode-list-hoverBackground); }
  .icon { display: flex; align-items: center; flex-shrink: 0; }
  .label { font-size: 12px; }
  .dir > .node-inner > .label { color: var(--vscode-symbolIcon-folderForeground, #DCB67A); }
  .chevron { font-size: 10px; opacity: 0.5; margin-left: 2px; transition: transform 0.15s; }
  .chevron.collapsed { transform: rotate(-90deg); }
  .children { overflow: hidden; }
  .children.collapsed { display: none; }
</style>
</head>
<body>
<div class="toolbar">
  <span class="title">${rootName || 'Estructura'}</span>
  <span id="feedback">¡Copiado!</span>
  <div class="toggle-group">
    <button class="btn active" id="btn-plain" onclick="setMode('plain')" title="Modo texto">Texto</button>
  </div>
  <button class="btn" onclick="copyTree()" title="Copiar estructura"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path fill="#fff" d="M15.24 2h-3.894c-1.764 0-3.162 0-4.255.148c-1.126.152-2.037.472-2.755 1.193c-.719.721-1.038 1.636-1.189 2.766C3 7.205 3 8.608 3 10.379v5.838c0 1.508.92 2.8 2.227 3.342c-.067-.91-.067-2.185-.067-3.247v-5.01c0-1.281 0-2.386.118-3.27c.127-.948.413-1.856 1.147-2.593s1.639-1.024 2.583-1.152c.88-.118 1.98-.118 3.257-.118h3.07c1.276 0 2.374 0 3.255.118A3.6 3.6 0 0 0 15.24 2"/><path fill="#fff" d="M6.6 11.397c0-2.726 0-4.089.844-4.936c.843-.847 2.2-.847 4.916-.847h2.88c2.715 0 4.073 0 4.917.847S21 8.671 21 11.397v4.82c0 2.726 0 4.089-.843 4.936c-.844.847-2.202.847-4.917.847h-2.88c-2.715 0-4.073 0-4.916-.847c-.844-.847-.844-2.21-.844-4.936z"/></svg></button>
</div>
<pre id="plain-view">${escapedPlain}</pre>
<div id="rich-view">${richHtml}</div>
<script>
  const plainText = ${JSON.stringify(plainText)};
  let currentMode = 'plain';
  function setMode(mode) {
    currentMode = mode;
    document.getElementById('plain-view').style.display = mode === 'plain' ? 'block' : 'none';
    document.getElementById('rich-view').style.display  = mode === 'rich'  ? 'block' : 'none';
    document.getElementById('btn-plain').classList.toggle('active', mode === 'plain');
  }
  function toggleDir(el) {
    const children = el.parentElement.querySelector('.children');
    const chevron  = el.querySelector('.chevron');
    if (!children) return;
    children.classList.toggle('collapsed');
    chevron && chevron.classList.toggle('collapsed');
  }
  function copyTree() {
    navigator.clipboard.writeText(plainText).then(() => {
      const fb = document.getElementById('feedback');
      fb.classList.add('show');
      setTimeout(() => fb.classList.remove('show'), 1500);
    });
  }
</script>
</body>
</html>`;
  }
}
