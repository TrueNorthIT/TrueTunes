// One-line, greppable logs for Vercel: `[area] event key=value …`. Never log tokens, cookies or passwords.

type Fields = Record<string, unknown>;

function value(v: unknown): string {
  if (typeof v === 'string') return /[\s"=]/.test(v) ? JSON.stringify(v) : v;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function line(area: string, event: string, fields: Fields): string {
  const kv = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}=${value(v)}`)
    .join(' ');
  return `[${area}] ${event}${kv ? ` ${kv}` : ''}`;
}

export const log = {
  info: (area: string, event: string, fields: Fields = {}) => console.log(line(area, event, fields)),
  warn: (area: string, event: string, fields: Fields = {}) => console.warn(line(area, event, fields)),
  error: (area: string, event: string, fields: Fields = {}) => console.error(line(area, event, fields)),
};

export const since = (start: number) => `${Date.now() - start}ms`;

export const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
