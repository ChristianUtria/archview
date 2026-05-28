export function buildCodePreview(source: string | undefined, maxLines: number): string {
  if (!source) return '# (código no disponible)';
  const lines = source.split('\n').slice(0, maxLines);
  if (source.split('\n').length > maxLines) lines.push('    ...');
  return lines.join('\n');
}