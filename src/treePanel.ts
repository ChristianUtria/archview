import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const IGNORED = new Set([
  'node_modules', '.git', '__pycache__', '.venv', 'venv',
  'out', '.mypy_cache', 'dist', 'build', '.pytest_cache',
  '.vscode', '__MACOSX', '.idea', '.next', 'coverage',
  '.turbo', '.cache', 'tmp', 'temp', '.DS_Store'
]);

interface FolderNode {
  name: string;
  files: string[];
  subfolders: FolderNode[];
  depth: number;
}

function scanProject(dirPath: string, depth: number = 0): FolderNode {
  const name = depth === 0 ? '/' : path.basename(dirPath);
  const node: FolderNode = { name, files: [], subfolders: [], depth };

  if (depth >= 5) return node;

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      .filter(e => !IGNORED.has(e.name) && !e.name.startsWith('.'));

    node.files = entries
      .filter(e => !e.isDirectory())
      .map(e => e.name);

    const dirs = entries.filter(e => e.isDirectory());
    node.subfolders = dirs.map(d =>
      scanProject(path.join(dirPath, d.name), depth + 1)
    );
  } catch { /* ignore permission errors */ }

  return node;
}

export function showProjectTreePanel(context: vscode.ExtensionContext): void {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return;

  const rootPath = folders[0].uri.fsPath;
  const rootNode = scanProject(rootPath);
  const rootName = path.basename(rootPath);

  const panel = vscode.window.createWebviewPanel(
    'archview.treePanel',
    `ArchView: ${rootName}`,
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'tree-icon.svg');

  const logoWebviewUri = panel.webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, 'media', 'logotipo-v5.png')
  );

  panel.webview.html = buildHtml(rootName, rootNode, logoWebviewUri.toString());
}

function buildHtml(rootName: string, rootNode: FolderNode, logoUri: string): string {
  const W = 2400, H = 1800;
  const CX = 0;
  const GROUND_Y = 0;
  const TRUNK_TOP = -260;
  const TRUNK_W = 28;

  let treeElements: string[] = [];
  let minX = CX, maxX = CX, minY = TRUNK_TOP, maxY = GROUND_Y;

  function registerBounds(x: number, y: number, r: number): void {
    minX = Math.min(minX, x - r);
    maxX = Math.max(maxX, x + r);
    minY = Math.min(minY, y - r);
    maxY = Math.max(maxY, y + r);
  }

  function renderTreeRecursive(
    node: FolderNode,
    x: number,
    y: number,
    angle: number,
    spread: number
  ): void {
    const isRoot = node.depth === 0;
    const sizeScale = Math.pow(0.80, node.depth);
    const folderR = 42 * sizeScale;
    const fileR = folderR * 0.44;

    if (!isRoot) registerBounds(x, y, folderR);

    if (!isRoot && node.files.length > 0) {
      const shown = node.files.slice(0, 6);
      const fTotal = shown.length;
      const fSpread = Math.PI * 0.55;
      shown.forEach((fname, i) => {
        const fAngle = fTotal === 1
          ? angle
          : (angle - fSpread / 2) + (i * (fSpread / (fTotal - 1)));
        const dist = folderR * 3.1;
        const fx = x + Math.cos(fAngle) * dist;
        const fy = y + Math.sin(fAngle) * dist;
        const shortF = fname.length > 10 ? fname.slice(0, 9) + '…' : fname;
        registerBounds(fx, fy, fileR);

        treeElements.push(`
          <line x1="${x}" y1="${y}" x2="${fx}" y2="${fy}" stroke="#5a6e3a" stroke-width="1.5" stroke-opacity="0.6"/>
          <circle cx="${fx}" cy="${fy}" r="${fileR}" fill="#1f5c2a" stroke="#2ea44f" stroke-width="1"/>
          <text x="${fx}" y="${fy}" font-family="monospace" font-size="${Math.max(fileR * 0.68, 7)}" fill="#fff" text-anchor="middle" dominant-baseline="middle">${shortF}</text>
        `);
      });
    }

    const subs = node.subfolders.slice(0, 6);
    const sTotal = subs.length;
    subs.forEach((sub, i) => {
      const currentSpread = spread * 0.70;
      const sAngle = sTotal === 1
        ? angle
        : (angle - currentSpread / 2) + (i * (currentSpread / (sTotal - 1)));

      const baseDist = 260 * sizeScale;
      const variedDist = baseDist + (i % 2 === 0 ? 30 : -15);

      const sx = x + Math.cos(sAngle) * variedDist;
      const sy = y + Math.sin(sAngle) * variedDist;

      registerBounds(sx, sy, 42 * Math.pow(0.80, node.depth + 1));

      const mx = (x + sx) / 2 + Math.cos(sAngle + Math.PI / 2) * 14;
      const my = (y + sy) / 2 + Math.sin(sAngle + Math.PI / 2) * 14;

      treeElements.push(`
        <path d="M${x},${y} Q${mx},${my} ${sx},${sy}"
              fill="none" stroke="#7a4820" stroke-width="${Math.max(9 * sizeScale, 1.5)}" stroke-linecap="round"/>
      `);

      renderTreeRecursive(sub, sx, sy, sAngle, currentSpread);
    });

    if (!isRoot) {
      const displayName = node.name.length > 12 ? node.name.slice(0, 11) + '…' : node.name;
      const hiddenFiles = Math.max(0, node.files.length - 6);
      const hiddenDirs  = Math.max(0, node.subfolders.length - 6);
      const badge = (hiddenFiles + hiddenDirs) > 0
        ? `<text x="${x + folderR * 0.75}" y="${y - folderR * 0.75}" font-family="monospace" font-size="${Math.max(folderR * 0.28, 7)}" fill="#ffd080" text-anchor="middle" dominant-baseline="middle">+${hiddenFiles + hiddenDirs}</text>`
        : '';

      treeElements.push(`
        <circle cx="${x}" cy="${y}" r="${folderR}" fill="#238636" stroke="#2ea44f" stroke-width="2"/>
        <circle cx="${x}" cy="${y}" r="${folderR * 0.7}" fill="#2ea44f" opacity="0.3"/>
        <text x="${x}" y="${y}" font-family="monospace" font-size="${Math.max(folderR * 0.36, 8)}" font-weight="bold" fill="#fff" text-anchor="middle" dominant-baseline="middle">${displayName}</text>
        ${badge}
      `);
    }
  }

  const rootFiles = rootNode.files.slice(0, 8);
  const rootsRender = rootFiles.map((fname, i) => {
    const rTotal = rootFiles.length;
    const rAngle = (Math.PI / 2 - 0.7) + (i * (1.4 / Math.max(1, rTotal - 1)));
    const rootLen = 125 + (i % 2 === 0 ? 65 : 25);
    const rx = CX + Math.cos(rAngle) * rootLen;
    const ry = GROUND_Y + Math.sin(rAngle) * rootLen;
    const shortF = fname.length > 12 ? fname.slice(0, 11) + '…' : fname;

    return `
      <path d="M${CX},${GROUND_Y} Q${CX},${ry - 30} ${rx},${ry}" fill="none" stroke="#5a3818" stroke-width="4" stroke-linecap="round" opacity="0.8"/>
      <circle cx="${rx}" cy="${ry}" r="18" fill="#3a2010" stroke="#7a4820" stroke-width="2"/>
      <text x="${rx}" y="${ry}" font-family="monospace" font-size="9" font-weight="bold" fill="#e0d0b0" text-anchor="middle" dominant-baseline="middle">${shortF}</text>
    `;
  }).join('');

  // ── renderTreeRecursive llena minX/maxX/minY/maxY ──────────────────────────
  renderTreeRecursive(rootNode, CX, TRUNK_TOP, -Math.PI / 2, Math.PI * 1.2);

  // Bounding box real del árbol — se interpola directo en el JS
  const bbCX = ((minX + maxX) / 2).toFixed(1);
  const bbCY = ((minY + maxY) / 2).toFixed(1);
  const bbW  = (maxX - minX).toFixed(1);
  const bbH  = (maxY - minY).toFixed(1);

  const centerIcon = `<svg xmlns="http://www.w3.org/2000/svg" style="width:18px;height:18px;display:block;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M9.134 2.5c-2.666.06-4.223.315-5.287 1.375C2.915 4.803 2.604 6.108 2.5 8.2"/><path d="M21.5 8.2c-.104-2.092-.415-3.397-1.347-4.325c-1.064-1.06-2.621-1.315-5.287-1.375"/><path d="M14.866 21.5c2.666-.06 4.223-.315 5.287-1.375c.932-.928 1.243-2.233 1.347-4.325"/><path d="M2.5 15.8c.104 2.092.415 3.397 1.347 4.325c1.064 1.06 2.621 1.315 5.287 1.375"/><circle cx="12" cy="12" r="4"/></svg>`;

  return `<!DOCTYPE html>
<html>
<head>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%; height: 100%;
      overflow: hidden;
      background: #111;
      cursor: grab;
      color: white;
      font-family: 'Courier New', monospace;
    }
    body:active { cursor: grabbing; }
    svg#tree-svg {
      position: fixed; top: 0; left: 0;
      width: 100vw; height: 100vh;
      display: block;
    }
    #brand {
      position: fixed; top: 14px; left: 14px;
      z-index: 20; pointer-events: none;
      font-size: 13px; font-weight: bold;
      color: rgba(224,208,176,0.82);
      letter-spacing: 0.04em;
    }
    #bottom-bar {
      position: fixed; bottom: 18px; right: 18px;
      z-index: 20; display: flex; align-items: center; gap: 8px;
    }
    #project-logo {
      width: 30px; height: 30px;
      object-fit: contain; opacity: 0.32;
      border-radius: 5px; display: block;
    }
    #center-btn {
      width: 36px; height: 36px;
      background: rgba(10,20,40,0.75);
      border: 1px solid rgba(255,255,255,0.18);
      border-radius: 8px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      padding: 0; transition: background 0.2s, border-color 0.2s;
    }
    #center-btn:hover {
      background: rgba(35,134,54,0.5);
      border-color: rgba(46,164,79,0.5);
    }
  </style>
</head>
<body>

  <div id="brand">${rootName}</div>

  <div id="bottom-bar">
    <img id="project-logo" src="${logoUri}" alt="logo" />
    <button id="center-btn" title="Centrar árbol" onclick="centerView()">
      ${centerIcon}
    </button>
  </div>

  <svg id="tree-svg" 
       xmlns="http://www.w3.org/2000/svg">
    <defs>
<!-- Tus degradados originales para el árbol (id="tg") y el pasto (id="gg") -->
      <linearGradient id="tg" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%"   stop-color="#2d1a08"/>
        <stop offset="35%"  stop-color="#6b3c14"/>
        <stop offset="100%" stop-color="#3a2010"/>
      </linearGradient>
      <radialGradient id="gg" cx="50%" cy="30%" r="60%">
        <stop offset="0%"   stop-color="#1a4a1a"/>
        <stop offset="100%" stop-color="#071007"/>
      </radialGradient>

      <!-- Nuevo degradado para la Tierra (id="dirt"), pero usando TUS tonos oscuros -->
      <linearGradient id="dirt" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="#3a2010"/> <!-- Tu marrón oscuro para el tronco/raíces -->
        <stop offset="100%" stop-color="#140b04"/> <!-- Un marrón aún más oscuro para el fondo -->
      </linearGradient>
      
    </defs>

    <rect x="0" y="0" width="${W}" height="${H}" fill="#111"/>

<g id="viewport">
      <!-- NUEVA BASE DE LA ISLA CON COLOR Y BORDE -->
      <!-- Parte de la tierra (usa url(#dirt)) -->
      <path d="
        M${CX - (W * 0.26)},${GROUND_Y + 20}
        L${CX - (W * 0.26) * 0.85},${GROUND_Y + 120}
        L${CX - (W * 0.26) * 0.6},${GROUND_Y + 280}
        L${CX - (W * 0.26) * 0.4},${GROUND_Y + 400}
        L${CX - 70},${GROUND_Y + 550 - 40}
        Q${CX},${GROUND_Y + 550 + 20} ${CX + 70},${GROUND_Y + 550 - 40}
        L${CX + (W * 0.26) * 0.4},${GROUND_Y + 400}
        L${CX + (W * 0.26) * 0.6},${GROUND_Y + 280}
        L${CX + (W * 0.26) * 0.85},${GROUND_Y + 120}
        L${CX + (W * 0.26)},${GROUND_Y + 20}
        Z" fill="url(#dirt)" stroke="#1a0f07" stroke-width="8" stroke-linejoin="round"/>
        
      <!-- Superficie de la isla (usa url(#gg)) -->
      <ellipse cx="${CX}" cy="${GROUND_Y + 20}" rx="${W * 0.26}" ry="40" fill="url(#gg)" stroke="#1a0f07" stroke-width="4"/>
      <!-- FIN DE LA NUEVA BASE CON COLOR -->

      <!-- ÁRBOL Y OTROS ELEMENTOS (Se dibuja encima) -->
      ${rootsRender}
      <path d="
M${CX - TRUNK_W} ${GROUND_Y}
Q${CX - 20} ${GROUND_Y - 120} ${CX - 10} ${TRUNK_TOP}
L${CX + 10} ${TRUNK_TOP}
Q${CX + 20} ${GROUND_Y - 120} ${CX + TRUNK_W} ${GROUND_Y}
Z"
fill="url(#tg)"/>
      <rect x="${CX - 75}" y="${(TRUNK_TOP + GROUND_Y) / 2 - 16}" width="150" height="32" rx="5" fill="#3a2010" stroke="#8b5020" stroke-width="2"/>
      <text x="${CX}" y="${(TRUNK_TOP + GROUND_Y) / 2 + 7}" fill="#ffd080" font-size="14" font-weight="bold" text-anchor="middle" dominant-baseline="middle">${rootName}</text>
      ${treeElements.join('')}
    </g>
  </svg>

  <script>
    const svg = document.getElementById('tree-svg');
    const vp  = document.getElementById('viewport');

    // Bounding box real del árbol calculado en TypeScript
const TREE_MIN_X = ${minX};
const TREE_MIN_Y = ${minY};

const TREE_W = ${bbW};
const TREE_H = ${bbH};

    let isPanning = false, startX = 0, startY = 0;
    let tx = 0, ty = 0, sc = 1;

function centerView() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const padding = 120;

  const scaleX = (vw - padding * 2) / TREE_W;
  const scaleY = (vh - padding * 2) / TREE_H;

  sc = Math.min(scaleX, scaleY);

  tx = vw / 2 - ((TREE_MIN_X + TREE_W / 2) * sc);
  ty = vh / 2 - ((TREE_MIN_Y + TREE_H / 2) * sc);

  update();
}

    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect   = svg.getBoundingClientRect();
      const mx     = e.clientX - rect.left;
      const my     = e.clientY - rect.top;
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const newSc  = Math.min(Math.max(0.05, sc * factor), 6);
      tx = mx - (mx - tx) * (newSc / sc);
      ty = my - (my - ty) * (newSc / sc);
      sc = newSc;
      update();
    }, { passive: false });

    svg.addEventListener('mousedown', (e) => {
      isPanning = true;
      startX = e.clientX - tx;
      startY = e.clientY - ty;
    });
    window.addEventListener('mousemove', (e) => {
      if (!isPanning) return;
      tx = e.clientX - startX;
      ty = e.clientY - startY;
      update();
    });
    window.addEventListener('mouseup', () => { isPanning = false; });

function update() {
  vp.setAttribute(
    'transform',
    'matrix(' + sc + ',0,0,' + sc + ',' + tx + ',' + ty + ')'
  );
}

    centerView();
  </script>
</body>
</html>`;
}