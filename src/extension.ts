import * as vscode from 'vscode';

import { StructureProvider }     from './providers/structureProvider';
import { registerShowStructureCommand }         from './commands/showStructure';
import { registerCopyStructureFromContextCommand } from './commands/copyStructureFromContext';
import { showProjectTreePanel }  from './treePanel';
import { MainViewProvider }      from './providers/MainViewProvider';
import { PyPointsTreeProvider }  from './providers/PyPointsTreeProvider';
import { registerPyPointsCommands } from './commands/pyPointsCommands';
import { invalidateAnthropicClient } from './utils/tokenReducer';
import { t } from './utils/i18n';

// ─────────────────────────────────────────────────────────────
// PyPoints recommendation
// ─────────────────────────────────────────────────────────────

const PYPOINTS_ID      = 'christian-dev.pypoints';

const NOTIFIED_KEY     = 'archview.pypointsNotified';

const PYTHON_BACKEND_PATTERNS = [
  '**/app.py', '**/main.py', '**/wsgi.py', '**/asgi.py',
  '**/manage.py', '**/routes.py', '**/views.py', '**/api.py',
];

async function isPythonBackend(): Promise<boolean> {
  for (const pattern of PYTHON_BACKEND_PATTERNS) {
    const found = await vscode.workspace.findFiles(pattern, '**/node_modules/**', 1);
    if (found.length > 0) { return true; }
  }
  return false;
}

async function hasPythonFiles(): Promise<boolean> {
  const found = await vscode.workspace.findFiles('**/*.py', '**/node_modules/**', 1);
  return found.length > 0;
}

async function recommendPyPoints(context: vscode.ExtensionContext): Promise<void> {
  if (context.workspaceState.get<boolean>(NOTIFIED_KEY, false)) { return; }
  if (vscode.extensions.getExtension(PYPOINTS_ID)) { return; }

  await context.workspaceState.update(NOTIFIED_KEY, true);

  const msg = t();
  const isPyBackend = await isPythonBackend();
  const hasPy       = isPyBackend || await hasPythonFiles();

  const message = isPyBackend ? msg.pypointsTier1
                : hasPy       ? msg.pypointsTier2
                :               msg.pypointsTier3;

  const action = await vscode.window.showInformationMessage(message, msg.installBtn, msg.notNow);
  if (action === msg.installBtn) {
    vscode.commands.executeCommand('workbench.extensions.installExtension', PYPOINTS_ID);
  }
}

export function activate(context: vscode.ExtensionContext) {

  // ── AI Context TreeView ───────────────────────────────────────────────────

  const archviewTree = new PyPointsTreeProvider(context);
  const archviewTreeView = vscode.window.createTreeView('archview.treeView', {
    treeDataProvider: archviewTree,
    showCollapseAll:  true,
    canSelectMany:    false,
  });
  context.subscriptions.push(archviewTreeView, archviewTree);
  registerPyPointsCommands(context, archviewTree);

  // ── Config watcher ────────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration('archview.claudeApiKey') ||
        e.affectsConfiguration('archview.anthropicApiKey')
      ) {
        invalidateAnthropicClient();
      }
    })
  );

  // ── Floating Project Tree Panel ───────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('archview.showProjectTree', () => {
      showProjectTreePanel(context);
    })
  );

  // ── Structure Webview ─────────────────────────────────────────────────────

  registerCopyStructureFromContextCommand(context);
  const structureProvider = new StructureProvider();
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('archview.structure', structureProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );
  registerShowStructureCommand(context, structureProvider);

  // ── Files Webview ─────────────────────────────────────────────────────────

  const mainView = new MainViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('archview.main', mainView, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  // ── File Watchers ─────────────────────────────────────────────────────────

  let fileDebounce: NodeJS.Timeout | undefined;
  let fileWatcher: vscode.FileSystemWatcher | undefined;
  let pyPointsFileTipShown = false;

  const scheduleFileRefresh = () => {
    if (fileDebounce) { clearTimeout(fileDebounce); }
    fileDebounce = setTimeout(() => mainView.refreshFiles(), 600);
  };

  const startFileWatcher = () => {
    fileWatcher?.dispose();
    fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');
    fileWatcher.onDidCreate(() => scheduleFileRefresh());
    fileWatcher.onDidChange(() => scheduleFileRefresh());
    fileWatcher.onDidDelete((e) => { scheduleFileRefresh(); archviewTree.removeFile(e.fsPath); });
    context.subscriptions.push(fileWatcher);
  };

  startFileWatcher();

  // ── PyPoints tip on file add ──────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'archview._addFileToContextWithTip',
      async (uri: vscode.Uri) => {
        await vscode.commands.executeCommand('archview.addFileToContext', uri);

        if (!pyPointsFileTipShown && !vscode.extensions.getExtension(PYPOINTS_ID)) {
          pyPointsFileTipShown = true;

          const msg     = t();
          const isPy    = uri.fsPath.endsWith('.py');
          const message = isPy ? msg.pypointsFilePython : msg.pypointsFileOther;

          const action = await vscode.window.showInformationMessage(message, msg.installBtn, msg.dismiss);
          if (action === msg.installBtn) {
            vscode.commands.executeCommand('workbench.extensions.installExtension', PYPOINTS_ID);
          }
        }
      }
    )
  );

  // ── Workspace changes ─────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      mainView.refreshFiles();
      archviewTree.refresh();
      startFileWatcher();
    })
  );

  // ── Window focus refresh ──────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.window.onDidChangeWindowState((e) => {
      if (e.focused) { scheduleFileRefresh(); }
    })
  );

  // ── PyPoints recommendation on activation (all users, tiered) ────────────

  setTimeout(() => recommendPyPoints(context), 3000);

  // ── Cleanup ───────────────────────────────────────────────────────────────

  context.subscriptions.push({ dispose: () => fileWatcher?.dispose() });
}

export function deactivate() {}