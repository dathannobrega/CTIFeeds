/** Formatação e utilidades compartilhadas pelos scripts do navegador. */
import type { ClientStrings } from '../i18n/ui.ts';

export type IndicatorType = 'url' | 'domain' | 'ipv4';

export function locale(): string {
  return document.documentElement.lang || 'pt-BR';
}

let cachedStrings: ClientStrings | undefined;

/** Textos localizados embutidos na página (<script type="application/json" id="i18n">). */
export function strings(): ClientStrings {
  if (!cachedStrings) {
    const node = document.getElementById('i18n');
    cachedStrings = JSON.parse(node?.textContent || '{}') as ClientStrings;
  }
  return cachedStrings;
}

export function fmtNumber(value: number): string {
  return new Intl.NumberFormat(locale()).format(value);
}

export function fmtBytes(bytes: number): string {
  const units = ['byte', 'kilobyte', 'megabyte', 'gigabyte'] as const;
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return new Intl.NumberFormat(locale(), {
    style: 'unit',
    unit: units[unit],
    unitDisplay: 'short',
    maximumFractionDigits: unit === 0 ? 0 : 1,
  }).format(value);
}

export function fmtRelative(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto', style: 'short' });
  const abs = Math.abs(seconds);
  if (abs < 45) return rtf.format(0, 'second');
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
  return rtf.format(Math.round(seconds / 86400), 'day');
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const formatted = new Intl.DateTimeFormat(locale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(iso));
  return `${formatted} UTC`;
}

export function fmtClock(iso: string | null | undefined): string {
  if (!iso) return '—';
  const time = new Intl.DateTimeFormat(locale(), {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    hourCycle: 'h23',
  }).format(new Date(iso));
  return `${time} UTC`;
}

/** "Edição" do boletim: ano + dia do ano da última publicação (ex.: 2026.281). */
export function fmtEdition(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = Math.floor((date.getTime() - start) / 86400000);
  return `${date.getUTCFullYear()}.${String(day).padStart(3, '0')}`;
}

/** Indicadores nunca aparecem clicáveis: hxxp://evil[.]example/... */
export function defang(value: string, type: IndicatorType | string | null | undefined): string {
  if (type === 'url') {
    const match = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)(.*)$/i.exec(value);
    if (!match) return value.replaceAll('.', '[.]');
    const [, scheme = '', host = '', rest = ''] = match;
    const safeScheme = scheme.replace(/^http/i, 'hxxp').replace(/^ftp/i, 'fxp');
    return `${safeScheme}://${host.replaceAll('.', '[.]')}${rest}`;
  }
  return value.replaceAll('.', '[.]');
}

export async function getJSON<T>(url: string, init: RequestInit = {}, timeoutMs = 10000): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { Accept: 'application/json', ...(init.headers || {}) },
    });
    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      try {
        const body = (await response.json()) as { message?: string };
        if (body.message) message = body.message;
      } catch {
        /* corpo não-JSON */
      }
      throw new ApiError(message, response.status);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  } finally {
    window.clearTimeout(timer);
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Cria elemento com classe e texto (evita innerHTML com dados externos). */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function typeTag(type: string | null | undefined): HTMLSpanElement {
  const labels = strings().types as Record<string, string>;
  const kind = type && labels[type] ? type : 'unknown';
  return el('span', `tag tag--${kind}`, labels[kind] ?? '?');
}
