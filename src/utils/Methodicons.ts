export function getMethodIcon(method: string): string {
  return ({
    GET: 'arrow-down',
    POST: 'arrow-up',
    PUT: 'pencil',
    PATCH: 'diff-modified',
    DELETE: 'trash',
    HEAD: 'eye',
    OPTIONS: 'settings-gear',
  } as Record<string, string>)[method.toUpperCase()] ?? 'circle-outline';
}

export function getMethodColor(method: string): string {
  return ({
    GET: 'charts.green',
    POST: 'charts.blue',
    PUT: 'charts.yellow',
    PATCH: 'charts.orange',
    DELETE: 'charts.red',
    HEAD: 'charts.purple',
    OPTIONS: 'foreground',
  } as Record<string, string>)[method.toUpperCase()] ?? 'foreground';
}