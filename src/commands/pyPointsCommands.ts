/**
 * pyPointsCommands.ts
 * All command handlers. Reads file list from contextStore (shared with webview).
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { PyPointsTreeProvider, PyPointsNode } from '../providers/PyPointsTreeProvider';
import { contextStore } from '../providers/ContextStore';
import { ProfileKey, PROFILES } from '../utils/optimizationProfiles';
import { optimizeBatch, optimizeFile } from '../utils/Optimizationpipeline';
import { estimateTokens, formatTokens } from '../utils/tokenCounter';
import { generateAiHeader, fileSeparator } from '../utils/Aiheader';
import { summarizeWithClaude } from '../utils/tokenReducer';
import { OptimizationPreviewPanel } from '../webview/Optimizationpreviewpanel';

// ─── BOM-aware reader ─────────────────────────────────────────────────────────

function readFileSafe(fp: string): string {
  const raw = fs.readFileSync(fp);
  let c: string;
  if (raw[0]===0xEF && raw[1]===0xBB && raw[2]===0xBF) { c = raw.slice(3).toString('utf-8'); }
  else if (raw[0]===0xFF && raw[1]===0xFE)              { c = raw.slice(2).toString('utf16le'); }
  else                                                   { c = raw.toString('utf-8'); }
  return c.replace(/\r\n/g,'\n').replace(/\r/g,'\n');
}

// ─── Safe arg casters ─────────────────────────────────────────────────────────

function asNode(a: unknown): PyPointsNode | undefined  { return a instanceof PyPointsNode ? a : undefined; }
function asUri(a: unknown):  vscode.Uri | undefined    { return a instanceof vscode.Uri ? a : undefined; }
function asStr(a: unknown):  string | undefined        { return typeof a === 'string' ? a : undefined; }
function asProfile(a: unknown): ProfileKey | undefined {
  return (['conservative','fast','balanced','ai_max'] as ProfileKey[]).includes(a as ProfileKey)
    ? a as ProfileKey : undefined;
}

// ─── Register ─────────────────────────────────────────────────────────────────

export function registerPyPointsCommands(
  context: vscode.ExtensionContext,
  provider: PyPointsTreeProvider
): void {

  const reg = (id: string, h: (...a: unknown[]) => unknown) =>
    context.subscriptions.push(vscode.commands.registerCommand(id, h));

  // ── File management ───────────────────────────────────────────────────────

  reg('archview.addFileToContext', async (...a) => {
    const paths = await resolveFilePaths(asUri(a[0]));
    if (!paths.length) return;
    contextStore.addFiles(paths);   // ← notifies both TreeView + webview
    vscode.window.showInformationMessage(
      `PyPoints: Added ${paths.length} file${paths.length!==1?'s':''} to context`
    );
  });

  reg('archview.removeFileFromContext', (...a) => {
    const fp = asNode(a[0])?.data?.['filePath'] as string | undefined;
    if (fp) contextStore.removeFile(fp);
  });

  reg('archview.clearSelection', () => contextStore.clearSelection());

  reg('archview.excludeFile', (...a) => {
    const fp = asNode(a[0])?.data?.['filePath'] as string | undefined;
    if (!fp) return;
    contextStore.excludeFile(fp);
    vscode.window.showInformationMessage(`PyPoints: Excluded ${path.basename(fp)}`);
  });

  reg('archview.includeFile',     (...a) => { const fp = asNode(a[0])?.data?.['filePath'] as string|undefined; if(fp) contextStore.includeFile(fp); });
reg('archview.clearExclusions', () => { contextStore.clearExclusions(); vscode.window.showInformationMessage('ArchView: Exclusions cleared'); })
  reg('archview.openFile',        (...a) => { const fp = asStr(a[0]); if(fp) vscode.window.showTextDocument(vscode.Uri.file(fp), { preview:true }); });

  // ── Profile ───────────────────────────────────────────────────────────────

  reg('archview.setProfile', (...a) => {
    const key = asProfile(a[0]);
    if (!key) return;
    provider.setProfile(key);
    vscode.window.showInformationMessage(`PyPoints: Profile → ${PROFILES[key].label}`);
  });

  reg('archview.selectProfile', async () => {
    const picked = await vscode.window.showQuickPick(
      Object.values(PROFILES).filter(p=>p.key!=='conservative').map(p=>({
        label: `${p.icon}  ${p.label}`, description: p.description,
        detail: p.key === provider.activeProfile ? '✓ Active' : undefined,
      })),
      { placeHolder:'Select optimization profile', title:'PyPoints — Optimization Mode' }
    );
    if (!picked) return;
    const found = Object.values(PROFILES).find(p => picked.label.includes(p.label));
    if (found) provider.setProfile(found.key as ProfileKey);
  });

  // ── Copy plain ────────────────────────────────────────────────────────────

  reg('archview.copyFiles', async () => {
    const paths = contextStore.selectedPaths;
    if (!paths.length) { vscode.window.showWarningMessage('PyPoints: No files selected'); return; }

    const parts: string[] = [];
    let skipped = 0;
    for (const fp of paths) {
      try {
        const ext = path.extname(fp).slice(1).toLowerCase() || 'text';
        parts.push(`${fileSeparator(path.basename(fp))}\n\`\`\`${ext}\n${readFileSafe(fp)}\n\`\`\``);
      } catch { skipped++; }
    }
    if (!parts.length) { vscode.window.showWarningMessage('PyPoints: Could not read files'); return; }
    await vscode.env.clipboard.writeText(parts.join('\n\n'));
    vscode.window.showInformationMessage(
      `PyPoints: Copied ${parts.length} file${parts.length!==1?'s':''}` + (skipped?` (${skipped} skipped)`:'')
    );
  });

  // ── Optimize & copy ───────────────────────────────────────────────────────

  reg('archview.optimizeAndCopy', async () => {
    const paths = contextStore.selectedPaths;
    if (!paths.length) { vscode.window.showWarningMessage('PyPoints: No files selected'); return; }

    provider.setOptimizing(true);
    try {
      const inputs = paths.flatMap(fp => {
        try { return [{ content:readFileSafe(fp), ext:path.extname(fp).slice(1).toLowerCase()||'text', name:path.basename(fp) }]; }
        catch { return []; }
      });
      if (!inputs.length) { vscode.window.showWarningMessage('PyPoints: Could not read files'); return; }

      const batch  = optimizeBatch(inputs, provider.activeProfile);
      const header = generateAiHeader({
        profile: PROFILES[provider.activeProfile].label,
        fileCount: batch.files.length,
        originalTokens: batch.totalOriginalTokens, optimizedTokens: batch.totalOptimizedTokens,
        compressionPct: batch.totalSavingsPct, techniques: batch.allTechniques.map(t=>t.name), timestamp:true,
      });
      const body = batch.files.map(f => `${fileSeparator(f.name)}\n\`\`\`${f.ext}\n${f.content}\n\`\`\``).join('\n\n');
      await vscode.env.clipboard.writeText(header + body);

      const avgQ = Math.round(batch.files.reduce((s,f)=>s+f.result.qualityScore.total,0)/batch.files.length);
      provider.setLastResults(batch.totalSavingsPct, avgQ);

      vscode.window.showInformationMessage(
        `PyPoints: ${formatTokens(batch.totalOriginalTokens)} → ${formatTokens(batch.totalOptimizedTokens)} (${batch.totalSavingsPct}% reduction)`
      );
    } finally { provider.setOptimizing(false); }
  });

  // ── Summarize with Claude ──────────────────────────────────────────────────

  reg('archview.summarizeFiles', async () => {
    const paths = contextStore.selectedPaths;
    if (!paths.length) { vscode.window.showWarningMessage('PyPoints: No files selected'); return; }

    provider.setOptimizing(true);
    await vscode.window.withProgress(
      { location:vscode.ProgressLocation.Notification, title:'PyPoints: Summarizing with Claude', cancellable:false },
      async progress => {
        const parts: string[] = [];
        let skipped=0, totalOrig=0, totalOpt=0;
        for (let i=0; i<paths.length; i++) {
          const fp=paths[i], name=path.basename(fp), ext=path.extname(fp).slice(1).toLowerCase()||'text';
          progress.report({ message:`${name} (${i+1}/${paths.length})`, increment:(1/paths.length)*100 });
          try {
            const raw=readFileSafe(fp);
            totalOrig+=estimateTokens(raw);
            const preOpt=optimizeFile(raw,ext,name,'fast');
            const summary=await summarizeWithClaude(preOpt.content,name);
            totalOpt+=estimateTokens(summary);
            parts.push(`${fileSeparator(name)} (summarized)\n\`\`\`${ext}\n${summary}\n\`\`\``);
          } catch(e) { skipped++; vscode.window.showWarningMessage(`PyPoints: Failed ${name}: ${(e as Error).message}`); }
        }
        if (!parts.length) return;
        const pct=totalOrig>0?Math.round((1-totalOpt/totalOrig)*100):0;
        const header=generateAiHeader({ profile:'Claude AI Summarization', fileCount:parts.length,
          originalTokens:totalOrig, optimizedTokens:totalOpt, compressionPct:pct,
          techniques:['Claude summarization','Fast pre-optimization'], timestamp:true });
        await vscode.env.clipboard.writeText(header+parts.join('\n\n'));
        provider.setLastResults(pct,95);
        vscode.window.showInformationMessage(
          `PyPoints: Summarized ${parts.length} files — ${pct}% reduction`+(skipped?` (${skipped} skipped)`:'')
        );
      }
    );
    provider.setOptimizing(false);
  });

  // ── Analyze ───────────────────────────────────────────────────────────────

  reg('archview.analyzeFile', (...a) => {
    const fp = asNode(a[0])?.data?.['filePath'] as string|undefined;
    if (!fp) return;
    try {
      const ext=path.extname(fp).slice(1).toLowerCase()||'text';
      const r=optimizeFile(readFileSafe(fp),ext,path.basename(fp),provider.activeProfile);
      vscode.window.showInformationMessage([
        `File: ${path.basename(fp)}`,
        `Original:  ${formatTokens(r.originalTokens)} tok`,
        `Optimized: ${formatTokens(r.optimizedTokens)} tok  (${r.savingsPct}% saved)`,
        `Quality:   ${r.qualityScore.total}/100 (${r.qualityScore.grade})`,
        r.techniques.map(t=>`• ${t.name}: -${formatTokens(t.savedTokens)}`).join('\n'),
      ].join('\n'), {modal:true});
    } catch(e) { vscode.window.showErrorMessage(`PyPoints: ${(e as Error).message}`); }
  });

  // ── Preview ───────────────────────────────────────────────────────────────

  reg('archview.previewOptimization', (...a) => {
    const fp = (asNode(a[0])?.data?.['filePath'] as string|undefined) ?? contextStore.selectedPaths[0];
    if (!fp) { vscode.window.showWarningMessage('PyPoints: Select a file first'); return; }
    try {
      const content=readFileSafe(fp), ext=path.extname(fp).slice(1).toLowerCase()||'text', name=path.basename(fp);
      const r=optimizeFile(content,ext,name,provider.activeProfile);
      OptimizationPreviewPanel.createOrShow(context.extensionUri, {
        filename:name, originalContent:content, optimizedContent:r.content,
        originalTokens:r.originalTokens, optimizedTokens:r.optimizedTokens,
        savingsPct:r.savingsPct, techniques:r.techniques, qualityScore:r.qualityScore,
      });
    } catch(e) { vscode.window.showErrorMessage(`PyPoints: Preview failed — ${(e as Error).message}`); }
  });

  // ── Copy optimized (context menu) ─────────────────────────────────────────

  reg('archview.copyOptimized', async (...a) => {
    const fp=asNode(a[0])?.data?.['filePath'] as string|undefined;
    if (!fp) return;
    try {
      const ext=path.extname(fp).slice(1).toLowerCase()||'text', name=path.basename(fp);
      const r=optimizeFile(readFileSafe(fp),ext,name,provider.activeProfile);
      await vscode.env.clipboard.writeText(`${fileSeparator(name)}\n\`\`\`${ext}\n${r.content}\n\`\`\``);
      vscode.window.showInformationMessage(`PyPoints: Copied ${name} — ${r.savingsPct}% reduction`);
    } catch(e) { vscode.window.showErrorMessage(`PyPoints: ${(e as Error).message}`); }
  });

  reg('archview.showTokenUsage', (...a) => {
    const fp=asNode(a[0])?.data?.['filePath'] as string|undefined;
    if (!fp) return;
    try { vscode.window.showInformationMessage(`${path.basename(fp)}: ~${formatTokens(estimateTokens(readFileSafe(fp)))} tokens`); }
    catch { /**/ }
  });

  reg('archview.analyzeDependencies', (...a) => {
    const fp=asNode(a[0])?.data?.['filePath'] as string|undefined;
    vscode.window.showInformationMessage(fp
      ? `PyPoints: Dependency graph for ${path.basename(fp)} — coming soon`
      : 'PyPoints: Dependency analysis coming soon');
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function resolveFilePaths(uri?: vscode.Uri): Promise<string[]> {
  if (uri) return [uri.fsPath];
  const ed = vscode.window.activeTextEditor;
  if (ed) return [ed.document.uri.fsPath];
  const uris = await vscode.window.showOpenDialog({
    canSelectMany:true, openLabel:'Add to PyPoints',
    filters:{ 'Source files':['ts','js','tsx','jsx','py','json','md','yaml','yml','html','css','scss'] },
  });
  return uris?.map(u=>u.fsPath) ?? [];
}