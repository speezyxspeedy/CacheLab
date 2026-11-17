import { HttpRequest, HttpResponse } from '../types/cache';

export const DEFAULT_SIMULATED_TIME_MS = Date.UTC(2026, 10, 17, 10, 0, 0); // Tue, 17 Nov 2026 10:00:00 GMT

export const STATUS_TEXT_MAP: Record<number, string> = {
  200: 'OK',
  203: 'Non-Authoritative Information',
  204: 'No Content',
  301: 'Moved Permanently',
  304: 'Not Modified',
  404: 'Not Found',
  500: 'Internal Server Error',
};

export function getStatusText(status: number, fallback?: string): string {
  return STATUS_TEXT_MAP[status] ?? fallback ?? 'Unknown Status';
}

export function toHttpDate(ms: number): string {
  return new Date(ms).toUTCString();
}

export function parseHttpDate(value?: string): number | null {
  if (!value || !value.trim()) {
    return null;
  }
  const parsed = Date.parse(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return '—';
  }
  const sign = seconds < 0 ? '-' : '';
  const abs = Math.abs(Math.round(seconds));
  if (abs < 60) {
    return `${sign}${abs}s`;
  }
  if (abs < 3600) {
    const mins = Math.floor(abs / 60);
    const secs = abs % 60;
    return secs === 0 ? `${sign}${mins}m` : `${sign}${mins}m ${secs}s`;
  }
  if (abs < 86400) {
    const hrs = Math.floor(abs / 3600);
    const mins = Math.floor((abs % 3600) / 60);
    return mins === 0 ? `${sign}${hrs}h` : `${sign}${hrs}h ${mins}m`;
  }
  const days = Math.floor(abs / 86400);
  const hrs = Math.floor((abs % 86400) / 3600);
  return hrs === 0 ? `${sign}${days}d` : `${sign}${days}d ${hrs}h`;
}

export function formatClockUtc(ms: number): string {
  const date = new Date(ms);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss} UTC`;
}

export function formatHttpRequestRaw(request: HttpRequest): string {
  let path = '/';
  let host = 'example.com';
  try {
    const parsed = new URL(request.url);
    path = `${parsed.pathname || '/'}${parsed.search || ''}`;
    host = parsed.host || host;
  } catch {
    path = request.url || '/';
  }

  const lines: string[] = [`${request.method} ${path} HTTP/1.1`, `Host: ${host}`];
  for (const [key, value] of Object.entries(request.headers)) {
    if (key.trim() && value !== undefined) {
      lines.push(`${key}: ${value}`);
    }
  }
  return lines.join('\n');
}

export function formatHttpResponseRaw(response: HttpResponse): string {
  const statusText = response.statusText || getStatusText(response.status);
  const lines: string[] = [`HTTP/1.1 ${response.status} ${statusText}`];
  for (const [key, value] of Object.entries(response.headers)) {
    if (key.trim() && value !== undefined && value !== '') {
      lines.push(`${key}: ${value}`);
    }
  }
  if (response.body && response.status !== 204 && response.status !== 304) {
    lines.push('');
    lines.push(response.body);
  }
  return lines.join('\n');
}

export function findHeaderCaseInsensitive(
  headers: Record<string, string>,
  targetName: string
): string | undefined {
  const lower = targetName.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) {
      return v;
    }
  }
  return undefined;
}

export function normalizeHeadersMap(headers: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const trimmed = key.trim();
    if (trimmed) {
      result[trimmed] = String(value ?? '').trim();
    }
  }
  return result;
}
