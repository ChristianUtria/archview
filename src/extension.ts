import * as vscode from 'vscode';

import { StructureProvider } from './providers/structureProvider';
import { registerShowStructureCommand } from './commands/showStructure';
import { registerCopyStructureFromContextCommand } from './commands/copyStructureFromContext';

import { showProjectTreePanel } from './treePanel';

import { MainViewProvider } from './providers/MainViewProvider';
import { PyPointsTreeProvider } from './providers/PyPointsTreeProvider';

import { registerPyPointsCommands } from './commands/pyPointsCommands';

import { invalidateAnthropicClient } from './utils/tokenReducer';

export function activate(context: vscode.ExtensionContext) {

  // ─────────────────────────────────────────────────────────────
  // AI Context TreeView
  // ID: archview.treeView
  // ─────────────────────────────────────────────────────────────

  const archviewTree = new PyPointsTreeProvider(context);

  const archviewTreeView = vscode.window.createTreeView(
    'archview.treeView',
    {
      treeDataProvider: archviewTree,
      showCollapseAll: true,
      canSelectMany: false,
    }
  );

  context.subscriptions.push(
    archviewTreeView,
    archviewTree
  );

  registerPyPointsCommands(context, archviewTree);

  // ─────────────────────────────────────────────────────────────
  // Config watcher
  // ─────────────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────────────────────────
  // Floating Project Tree Panel
  // Command: archview.showProjectTree
  // ─────────────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'archview.showProjectTree',
      () => {
        showProjectTreePanel(context);
      }
    )
  );

  // ─────────────────────────────────────────────────────────────
  // Structure Webview
  // ID: archview.structure
  // ─────────────────────────────────────────────────────────────

  registerCopyStructureFromContextCommand(context);

  const structureProvider = new StructureProvider();

  context.subscriptions.push(

    vscode.window.registerWebviewViewProvider(
      'archview.structure',
      structureProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true
        }
      }
    )

  );

  registerShowStructureCommand(
    context,
    structureProvider
  );

  // ─────────────────────────────────────────────────────────────
  // Files Webview
  // ID: archview.main
  // ─────────────────────────────────────────────────────────────

  const mainView = new MainViewProvider(context);

  context.subscriptions.push(

    vscode.window.registerWebviewViewProvider(
      'archview.main',
      mainView,
      {
        webviewOptions: {
          retainContextWhenHidden: true
        }
      }
    )

  );

  // ─────────────────────────────────────────────────────────────
  // File Watchers
  // ─────────────────────────────────────────────────────────────

  let fileDebounce: NodeJS.Timeout | undefined;
  let fileWatcher: vscode.FileSystemWatcher | undefined;

  const scheduleFileRefresh = () => {

    if (fileDebounce) {
      clearTimeout(fileDebounce);
    }

    fileDebounce = setTimeout(() => {
      mainView.refreshFiles();
    }, 600);

  };

  const startFileWatcher = () => {

    fileWatcher?.dispose();

    fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');

    fileWatcher.onDidCreate(() => {
      scheduleFileRefresh();
    });

    fileWatcher.onDidChange(() => {
      scheduleFileRefresh();
    });

    fileWatcher.onDidDelete((e) => {

      scheduleFileRefresh();

      archviewTree.removeFile(e.fsPath);

    });

    context.subscriptions.push(fileWatcher);

  };

  startFileWatcher();

  // ─────────────────────────────────────────────────────────────
  // Workspace changes
  // ─────────────────────────────────────────────────────────────

  context.subscriptions.push(

    vscode.workspace.onDidChangeWorkspaceFolders(() => {

      mainView.refreshFiles();

      archviewTree.refresh();

      startFileWatcher();

    })

  );

  // ─────────────────────────────────────────────────────────────
  // Window focus refresh
  // ─────────────────────────────────────────────────────────────

  context.subscriptions.push(

    vscode.window.onDidChangeWindowState((e) => {

      if (e.focused) {
        scheduleFileRefresh();
      }

    })

  );

  // ─────────────────────────────────────────────────────────────
  // Cleanup
  // ─────────────────────────────────────────────────────────────

  context.subscriptions.push({

    dispose: () => {
      fileWatcher?.dispose();
    }

  });

}

export function deactivate() {}