import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const IGNORED = new Set([
  'node_modules', '.git', '__pycache__', '.venv',
  'venv', 'out', '.mypy_cache', 'dist', 'build', '.pytest_cache'
]);

function buildTree(dirPath: string, prefix = ''): string {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true })
      .filter(e => !IGNORED.has(e.name))
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });
  } catch {
    return '';
  }

  return entries.map((entry, index) => {
    const isLast = index === entries.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const childPrefix = isLast ? '    ' : '│   ';
    const suffix = entry.isDirectory() ? '/' : '';
    let line = `${prefix}${connector}${entry.name}${suffix}\n`;
    if (entry.isDirectory()) {
      line += buildTree(path.join(dirPath, entry.name), prefix + childPrefix);
    }
    return line;
  }).join('');
}

export function registerCopyStructureFromContextCommand(
  context: vscode.ExtensionContext
): void {
  const command = vscode.commands.registerCommand(
    'archview.copyStructureFromContext',
    async (uri: vscode.Uri) => {
      let targetPath: string;
      let targetName: string;

      if (uri) {
        const stat = fs.statSync(uri.fsPath);
        if (stat.isDirectory()) {
          targetPath = uri.fsPath;
          targetName = path.basename(uri.fsPath);
        } else {
          targetPath = path.dirname(uri.fsPath);
          targetName = path.basename(targetPath);
        }
      } else {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders || folders.length === 0) {
          vscode.window.showWarningMessage('PyPoints: No hay ningún workspace abierto.');
          return;
        }
        targetPath = folders[0].uri.fsPath;
        targetName = path.basename(targetPath);
      }

      const tree = `${targetName}/\n` + buildTree(targetPath);

      await vscode.env.clipboard.writeText(tree);

      vscode.window.showInformationMessage(
        `PyPoints: Estructura de "${targetName}" copiada al portapapeles`
      );
    }
  );

  context.subscriptions.push(command);
}