/**
 * Estatísticas ao vivo (/api/v1/stats): preenche elementos [data-stat] e avisa assinantes.
 * Atualiza a cada 60 s enquanto a aba está visível.
 */
import { fmtBytes, fmtClock, fmtDateTime, fmtEdition, fmtNumber, fmtRelative, getJSON, reducedMotion } from './fmt.ts';

export interface FeedMeta {
  file: string;
  path: string;
  count: number;
  raw_count?: number;
  excluded?: number;
  bytes?: number;
  sha256?: string;
}

export interface Stats {
  generated_at: string;
  collected_at: string | null;
  published_at: string | null;
  refresh_interval_seconds: number;
  next_collection_at: string | null;
  totals: { url: number; domain: number; ipv4: number; all: number };
  feeds: Record<'url' | 'domain' | 'ipv4', FeedMeta>;
  exclusions: Record<'url' | 'domain' | 'ipv4', number>;
  sources: { configured: number; ok: number; stale: number; failed: number };
}

type Listener = (stats: Stats | null) => void;

const listeners = new Set<Listener>();
let current: Stats | null | undefined;
let started = false;
const filled = new WeakSet<Element>();

export function onStats(listener: Listener): void {
  listeners.add(listener);
  if (current !== undefined) listener(current);
}

export function startLive(): void {
  if (started) return;
  started = true;
  void refresh();
  window.setInterval(() => {
    if (document.visibilityState === 'visible') void refresh();
  }, 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && current !== undefined) render(current);
  });
}

async function refresh(): Promise<void> {
  try {
    current = await getJSON<Stats>('/api/v1/stats');
    document.documentElement.dataset.api = 'online';
  } catch {
    current = null;
    document.documentElement.dataset.api = 'offline';
  }
  render(current);
  for (const listener of listeners) listener(current);
}

function lookupPath(data: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => {
    if (value && typeof value === 'object') return (value as Record<string, unknown>)[key];
    return undefined;
  }, data);
}

function format(value: unknown, kind: string | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  switch (kind) {
    case 'number':
      return fmtNumber(Number(value));
    case 'bytes':
      return fmtBytes(Number(value));
    case 'relative':
      return fmtRelative(String(value));
    case 'datetime':
      return fmtDateTime(String(value));
    case 'clock':
      return fmtClock(String(value));
    case 'edition':
      return fmtEdition(String(value));
    case 'hash':
      return `${String(value).slice(0, 16)}…`;
    default:
      return String(value);
  }
}

function render(stats: Stats | null): void {
  for (const node of document.querySelectorAll<HTMLElement>('[data-stat]')) {
    const value = stats ? lookupPath(stats, node.dataset.stat || '') : undefined;
    const text = format(value, node.dataset.fmt);
    node.classList.toggle('placeholder', text === '—');
    if (node.hasAttribute('data-scramble') && !filled.has(node) && text !== '—' && !reducedMotion()) {
      filled.add(node);
      scramble(node, text);
    } else {
      node.textContent = text;
    }
    if (node.dataset.title === 'datetime' && typeof value === 'string') node.title = fmtDateTime(value);
  }

  // Barras proporcionais: [data-share="url"] etc. recebem --share.
  for (const node of document.querySelectorAll<HTMLElement>('[data-share]')) {
    const kind = node.dataset.share as keyof Stats['totals'];
    const total = stats?.totals.all || 0;
    const share = total ? (stats?.totals[kind] || 0) / total : 1 / 3;
    node.style.setProperty('--share', String(Math.max(share, total ? 0.004 : 0)));
  }

  for (const node of document.querySelectorAll<HTMLElement>('[data-sources-health]')) {
    if (!stats) {
      node.dataset.health = 'offline';
    } else if (stats.sources.configured === 0 || stats.collected_at === null) {
      node.dataset.health = 'pending';
    } else if (stats.sources.failed > 0) {
      node.dataset.health = 'degraded';
    } else {
      node.dataset.health = 'ok';
    }
  }
}

/** Efeito "teletipo": dígitos giram e assentam da esquerda para a direita. */
function scramble(node: HTMLElement, finalText: string): void {
  const duration = 900;
  const start = performance.now();
  node.setAttribute('aria-busy', 'true');
  const tick = (now: number) => {
    const progress = Math.min(1, (now - start) / duration);
    const settled = Math.floor(progress * finalText.length);
    let out = '';
    for (let i = 0; i < finalText.length; i += 1) {
      const char = finalText.charAt(i);
      out += i < settled || !/\d/.test(char) ? char : String(Math.floor(Math.random() * 10));
    }
    node.textContent = out;
    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      node.textContent = finalText;
      node.removeAttribute('aria-busy');
    }
  };
  requestAnimationFrame(tick);
}
