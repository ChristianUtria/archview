export function calcComplexity(lineCount: number): 'simple' | 'medium' | 'complex' {
  if (lineCount <= 10) return 'simple';
  if (lineCount <= 30) return 'medium';
  return 'complex';
}

export const COMPLEXITY_ICON: Record<string, string> = {
  simple: 'Ⅰ',
  medium: 'ⅠⅠ',
  complex: 'ⅠⅠⅠ',
};