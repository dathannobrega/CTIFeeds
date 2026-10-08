/** Página de fontes: tabela montada a partir de /api/v1/sources. */
import { el, fmtNumber, fmtRelative, fmtDateTime, getJSON, typeTag } from './fmt.ts';

interface Source {
  indicator_type: string;
  url: string;
  host: string;
  ok: boolean | null;
  stale: boolean;
  count: number;
  invalid: number;
  duration_ms: number | null;
  error: string | null;
  fetched_at: string | null;
}

interface Strings {
  cols: string[];
  loading: string;
  empty: string;
  offline: string;
  states: Record<'ok' | 'stale' | 'failed' | 'pending', string>;
}

function stateOf(source: Source): keyof Strings['states'] {
  if (source.ok === null || source.ok === undefined) return 'pending';
  if (source.ok) return 'ok';
  return source.stale ? 'stale' : 'failed';
}

export function runSourcesPage(): void {
  const container = document.querySelector<HTMLElement>('[data-sources]');
  const stringsNode = document.getElementById('sources-strings');
  if (!container || !stringsNode) return;
  const S = JSON.parse(stringsNode.textContent || '{}') as Strings;

  const render = (sources: Source[]) => {
    if (!sources.length) {
      container.replaceChildren(el('p', 'mono muted loading', S.empty));
      return;
    }
    const table = el('table', 'data-table');
    const head = el('thead');
    const headRow = el('tr');
    S.cols.forEach((label, index) => {
      const th = el('th', [3, 4, 5].includes(index) ? 'num' : undefined, label);
      th.scope = 'col';
      headRow.append(th);
    });
    head.append(headRow);

    const body = el('tbody');
    const order = { failed: 0, stale: 1, pending: 2, ok: 3 };
    const sorted = [...sources].sort((a, b) => order[stateOf(a)] - order[stateOf(b)] || b.count - a.count);
    for (const source of sorted) {
      const state = stateOf(source);
      const row = el('tr');

      const stateCell = el('td');
      const badge = el('span', `state ${state}`);
      badge.append(el('span', 'sq'), S.states[state]);
      stateCell.append(badge);

      const typeCell = el('td');
      typeCell.append(typeTag(source.indicator_type));

      const urlCell = el('td', 'value');
      const host = el('strong', undefined, source.host);
      const path = el('span', 'muted', source.url.replace(/^https?:\/\/[^/]+/, ''));
      urlCell.append(host, el('br'), path);

      const fetched = el('td', undefined, fmtRelative(source.fetched_at));
      if (source.fetched_at) fetched.title = fmtDateTime(source.fetched_at);

      row.append(
        stateCell,
        typeCell,
        urlCell,
        el('td', 'num', fmtNumber(source.count)),
        el('td', 'num', fmtNumber(source.invalid)),
        el('td', 'num', source.duration_ms === null ? '—' : `${fmtNumber(source.duration_ms)} ms`),
        fetched,
        el('td', state === 'ok' ? 'muted' : 'signal', source.error ?? '—'),
      );
      body.append(row);
    }
    table.append(head, body);
    container.replaceChildren(table);
  };

  const load = async () => {
    try {
      const data = await getJSON<{ sources: Source[] }>('/api/v1/sources');
      render(data.sources);
    } catch {
      container.replaceChildren(el('p', 'mono muted loading', S.offline));
    }
  };

  void load();
  window.setInterval(() => document.visibilityState === 'visible' && void load(), 60000);
}
