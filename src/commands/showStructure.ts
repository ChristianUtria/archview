import * as vscode from 'vscode';
import { StructureProvider } from '../providers/structureProvider';

export function registerShowStructureCommand(
  context: vscode.ExtensionContext,
  provider: StructureProvider
): void {
  const command = vscode.commands.registerCommand(
    'archview.showStructure',
    () => {
      provider.refresh();
      vscode.window.showInformationMessage('archview: estructura actualizada ');
    }
  );

  context.subscriptions.push(command);
}