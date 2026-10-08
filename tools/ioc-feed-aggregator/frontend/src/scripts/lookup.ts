/** Página de consulta: modo único e em lote (POST /api/v1/lookup). */
import { ApiError, defang, el, fmtDateTime, getJSON, typeTag } from './fmt.ts';

interface Related {
  type: string;
  value: string;
  relation: 'parent_domain' | 'url_host' | 'url_variant';
}

interface Result {
  query: string;
  type: 'url' | 'domain' | 'ipv4' | null;
  value: string | null;
  valid: boolean;
  listed: boolean;
  excluded: boolean;
  excluded_at: string | null;
  related: Related[];
}

interface BatchResponse {
  summary: { total: number; listed: number; related: number; excluded: number; invalid: number };
  results: Result[];
  feeds_published_at: string | null;
}

type Verdict = 'listed' | 'related' | 'excluded' | 'clear' | 'invalid';

interface Strings {
  verdicts: Record<Verdict, string>;
  fields: Record<'value' | 'type' | 'feed' | 'excluded' | 'related' | 'updated', string>;
  relations: Record<Related['relation'], string>;
  detected: string;
  unknown: string;
  summary: Record<'total' | 'listed' | 'related' | 'excluded' | 'invalid', string>;
  table: Record<'verdict' | 'type' | 'value' | 'detail', string>;
  copyListed: string;
  csv: string;
  none: string;
  error: string;
  tooMany: string;
  empty: string;
  no: string;
}

const FEED_FILE: Record<string, string> = { url: 'urls.txt', domain: 'domains.txt', ipv4: 'ipv4.txt' };
const MAX_BATCH = 500;

/** Mesmo refang/detecção do backend, para mostrar o tipo enquanto a pessoa digita. */
export function refang(value: string): string {
  return value
    .trim()
    .replace(/\[\s*\.\s*\]|\(\s*\.\s*\)|\{\s*\.\s*\}|\[dot\]|\(dot\)/gi, '.')
    .replace(/\[\s*:\s*\]/g, ':')
    .replace(/\[\s*\/\s*\]/g, '/')
    .replace(/^hxxp/i, 'http')
    .replace(/^fxp/i, 'ftp');
}

export function detectType(value: string): 'url' | 'domain' | 'ipv4' | null {
  const cleaned = value.trim();
  if (!cleaned || /\s/.test(cleaned)) return null;
  if (/^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(cleaned)) return 'ipv4';
  if (cleaned.includes(':') && !cleaned.includes('://')) return null;
  if (cleaned.includes('://')) return 'url';
  if (cleaned.includes('/')) return null;
  return 'domain';
}

function verdictOf(result: Result): Verdict {
  if (!result.valid) return 'invalid';
  if (result.excluded) return 'excluded';
  if (result.listed) return 'listed';
  if (result.related.length) return 'related';
  return 'clear';
}

function stamp(verdict: Verdict, label: string, small = false): HTMLSpanElement {
  return el('span', `stamp ${verdict}${small ? ' small' : ' is-new'}`, label);
}

export function runLookupPage(): void {
  const root = document.querySelector<HTMLElement>('[data-lookup]');
  const stringsNode = document.getElementById('lookup-strings');
  if (!root || !stringsNode) return;
  const S = JSON.parse(stringsNode.textContent || '{}') as Strings;

  const singleForm = root.querySelector<HTMLFormElement>('[data-form="single"]')!;
  const batchForm = root.querySelector<HTMLFormElement>('[data-form="batch"]')!;
  const input = singleForm.querySelector<HTMLInputElement>('input[name="q"]')!;
  const textarea = batchForm.querySelector<HTMLTextAreaElement>('textarea')!;
  const detect = root.querySelector<HTMLElement>('[data-detect]')!;
  const lineCount = root.querySelector<HTMLElement>('[data-line-count]')!;
  const output = root.querySelector<HTMLElement>('[data-result]')!;

  // Alternância de modo -------------------------------------------------------
  const setMode = (mode: string) => {
    singleForm.hidden = mode !== 'single';
    batchForm.hidden = mode !== 'batch';
    output.replaceChildren();
  };
  for (const radio of root.querySelectorAll<HTMLInputElement>('input[name="mode"]')) {
    radio.addEventListener('change', () => radio.checked && setMode(radio.value));
  }

  // Detecção ao digitar -------------------------------------------------------
  const showDetected = () => {
    const value = refang(input.value);
    detect.replaceChildren();
    if (!value) return;
    const type = detectType(value);
    if (type) {
      detect.append(typeTag(type), document.createTextNode(`${S.detected}${value !== input.value.trim() ? ` · ${value}` : ''}`));
    } else {
      detect.textContent = S.unknown;
    }
  };
  input.addEventListener('input', showDetected);

  const lines = () =>
    textarea.value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  textarea.addEventListener('input', () => {
    const count = lines().length;
    lineCount.textContent = String(count);
    lineCount.classList.toggle('signal', count > MAX_BATCH);
  });

  // Consulta ------------------------------------------------------------------
  const query = async (values: string[]): Promise<BatchResponse> =>
    getJSON<BatchResponse>('/api/v1/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values }),
    });

  const fail = (message: string) => output.replaceChildren(el('p', 'error', message));

  const busy = (form: HTMLFormElement, state: boolean) => {
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) button.disabled = state;
    output.setAttribute('aria-busy', String(state));
  };

  singleForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = input.value.trim();
    if (!value) {
      input.focus();
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set('q', value);
    history.replaceState(null, '', url);
    busy(singleForm, true);
    try {
      const response = await query([value]);
      const result = response.results[0];
      if (result) output.replaceChildren(renderCard(result, response.feeds_published_at, S));
    } catch (error) {
      fail(error instanceof ApiError && error.status < 500 ? error.message : S.error);
    } finally {
      busy(singleForm, false);
    }
  });

  batchForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = lines();
    if (!values.length) return fail(S.empty);
    if (values.length > MAX_BATCH) return fail(S.tooMany);
    busy(batchForm, true);
    try {
      const response = await query(values);
      output.replaceChildren(renderBatch(response, S));
    } catch (error) {
      fail(error instanceof ApiError && error.status < 500 ? error.message : S.error);
    } finally {
      busy(batchForm, false);
    }
  });

  // ?q= vindo da home ou do SearchAction: consulta direto.
  const initial = new URL(window.location.href).searchParams.get('q');
  if (initial) {
    input.value = initial;
    showDetected();
    singleForm.requestSubmit();
  }
}

function field(label: string, ...content: (Node | string)[]): HTMLDivElement {
  const row = el('div');
  const dd = el('dd');
  dd.append(...content);
  row.append(el('dt', undefined, label), dd);
  return row;
}

function relatedNodes(result: Result, S: Strings): Node[] {
  return result.related.map((item) => {
    const line = el('span', 'rel');
    line.append(typeTag(item.type), `${defang(item.value, item.type)} — ${S.relations[item.relation]}`);
    return line;
  });
}

function renderCard(result: Result, publishedAt: string | null, S: Strings): HTMLElement {
  const verdict = verdictOf(result);
  const card = el('article', 'card');
  const left = el('div', 'stamp-wrap');
  left.append(stamp(verdict, S.verdicts[verdict]));

  const list = el('dl');
  list.append(field(S.fields.value, result.value ? defang(result.value, result.type) : result.query));
  if (result.type) {
    list.append(field(S.fields.type, typeTag(result.type)));
    list.append(field(S.fields.feed, result.listed ? FEED_FILE[result.type] ?? S.none : S.none));
  }
  if (result.valid) {
    list.append(field(S.fields.excluded, result.excluded_at ? fmtDateTime(result.excluded_at) : S.no));
    const related = relatedNodes(result, S);
    list.append(field(S.fields.related, ...(related.length ? related : [S.none])));
  }
  list.append(field(S.fields.updated, fmtDateTime(publishedAt)));
  card.append(left, list);
  return card;
}

function renderBatch(response: BatchResponse, S: Strings): DocumentFragment {
  const fragment = document.createDocumentFragment();

  const summary = el('dl', 'summary');
  for (const key of ['total', 'listed', 'related', 'excluded', 'invalid'] as const) {
    const box = el('div');
    box.append(el('dt', undefined, S.summary[key]), el('dd', undefined, String(response.summary[key])));
    summary.append(box);
  }

  const actions = el('div', 'batch-actions');
  const listedValues = response.results.filter((item) => item.listed && item.value).map((item) => item.value as string);
  const copyButton = el('button', 'btn btn--small', S.copyListed);
  copyButton.type = 'button';
  copyButton.disabled = listedValues.length === 0;
  copyButton.addEventListener('click', () => void navigator.clipboard?.writeText(listedValues.join('\n')));
  const csvButton = el('button', 'btn btn--small', S.csv);
  csvButton.type = 'button';
  csvButton.addEventListener('click', () => downloadCsv(response.results));
  actions.append(copyButton, csvButton);

  const scroll = el('div', 'table-scroll');
  const table = el('table', 'data-table');
  const head = el('thead');
  const headRow = el('tr');
  for (const label of ['#', S.table.verdict, S.table.type, S.table.value, S.table.detail]) {
    const th = el('th', undefined, label);
    th.scope = 'col';
    headRow.append(th);
  }
  head.append(headRow);
  const body = el('tbody');
  response.results.forEach((result, index) => {
    const verdict = verdictOf(result);
    const row = el('tr');
    const verdictCell = el('td');
    verdictCell.append(stamp(verdict, S.verdicts[verdict], true));
    const typeCell = el('td');
    if (result.type) typeCell.append(typeTag(result.type));
    const valueCell = el('td', 'value', result.value ? defang(result.value, result.type) : result.query);
    const detailCell = el('td', 'value');
    const related = relatedNodes(result, S);
    if (related.length) detailCell.append(...related);
    else if (result.excluded_at) detailCell.textContent = fmtDateTime(result.excluded_at);
    row.append(el('td', 'num', String(index + 1)), verdictCell, typeCell, valueCell, detailCell);
    body.append(row);
  });
  table.append(head, body);
  scroll.append(table);

  fragment.append(summary, actions, scroll);
  return fragment;
}

function csvCell(value: string): string {
  // Evita injeção de fórmula ao abrir no Excel/Sheets.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

function downloadCsv(results: Result[]): void {
  const header = ['query', 'type', 'value', 'verdict', 'listed', 'excluded', 'excluded_at', 'related'];
  const rows = results.map((item) =>
    [
      item.query,
      item.type ?? '',
      item.value ?? '',
      verdictOf(item),
      String(item.listed),
      String(item.excluded),
      item.excluded_at ?? '',
      item.related.map((rel) => `${rel.relation}:${rel.value}`).join(' '),
    ]
      .map(csvCell)
      .join(','),
  );
  const blob = new Blob([`${header.join(',')}\n${rows.join('\n')}\n`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = el('a');
  link.href = url;
  link.download = `ioc-lookup-${new Date().toISOString().slice(0, 19).replaceAll(':', '')}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
