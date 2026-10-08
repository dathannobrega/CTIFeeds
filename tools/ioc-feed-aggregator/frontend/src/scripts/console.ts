/** Console da lista de exclusão. O token fica só no sessionStorage desta aba. */
import { ApiError, el, fmtDateTime, getJSON, typeTag } from './fmt.ts';

interface Exclusion {
  id: number;
  indicator_type: string;
  value: string;
  created_at: string | null;
}

interface Strings {
  cols: string[];
  remove: string;
  confirm: string;
  empty: string;
  noMatch: string;
  added: string;
  removed: string;
  badToken: string;
  error: string;
}

const TOKEN_KEY = 'cti-admin-token';

function readToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

function writeToken(token: string): void {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* armazenamento indisponível: o token vale só até recarregar */
  }
}

export function runConsole(): void {
  const root = document.querySelector<HTMLElement>('[data-console]');
  const stringsNode = document.getElementById('console-strings');
  if (!root || !stringsNode) return;
  const S = JSON.parse(stringsNode.textContent || '{}') as Strings;

  const banner = root.querySelector<HTMLElement>('[data-open-banner]')!;
  const login = root.querySelector<HTMLFormElement>('[data-login]')!;
  const panel = root.querySelector<HTMLElement>('[data-panel]')!;
  const addForm = root.querySelector<HTMLFormElement>('[data-add]')!;
  const flash = root.querySelector<HTMLElement>('[data-flash]')!;
  const list = root.querySelector<HTMLElement>('[data-list]')!;
  const count = root.querySelector<HTMLElement>('[data-count]')!;
  const filter = root.querySelector<HTMLInputElement>('[data-filter]')!;
  const logout = root.querySelector<HTMLButtonElement>('[data-logout]')!;

  let token = readToken();
  let authRequired = false;
  let items: Exclusion[] = [];

  const headers = (): HeadersInit => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });

  const say = (message: string, isError = false) => {
    flash.textContent = message;
    flash.classList.toggle('is-error', isError);
  };

  const showLogin = (message = '') => {
    panel.hidden = true;
    login.hidden = false;
    if (message) say(message, true);
    login.querySelector('input')?.focus();
  };

  const render = () => {
    const query = filter.value.trim().toLowerCase();
    const visible = query ? items.filter((item) => item.value.toLowerCase().includes(query)) : items;
    count.textContent = String(items.length);
    if (!visible.length) {
      list.replaceChildren(el('p', 'mono muted', items.length ? S.noMatch : S.empty));
      return;
    }
    const table = el('table', 'data-table');
    const head = el('thead');
    const headRow = el('tr');
    for (const label of S.cols) {
      const th = el('th', undefined, label);
      th.scope = 'col';
      headRow.append(th);
    }
    head.append(headRow);
    const body = el('tbody');
    for (const item of visible) {
      const row = el('tr');
      const typeCell = el('td');
      typeCell.append(typeTag(item.indicator_type));
      const actionCell = el('td', 'num');
      const button = el('button', 'btn btn--small remove', S.remove);
      button.type = 'button';
      button.addEventListener('click', () => void remove(item, button));
      actionCell.append(button);
      row.append(
        typeCell,
        el('td', 'value', item.value),
        el('td', undefined, item.created_at ? fmtDateTime(`${item.created_at.replace(/Z?$/, 'Z')}`) : '—'),
        actionCell,
      );
      body.append(row);
    }
    table.append(head, body);
    list.replaceChildren(table);
  };

  const load = async () => {
    try {
      items = await getJSON<Exclusion[]>('/api/v1/exclusions', { headers: headers() });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        token = '';
        writeToken('');
        showLogin(authRequired ? S.badToken : '');
        return;
      }
      say(S.error, true);
      return;
    }
    login.hidden = true;
    panel.hidden = false;
    logout.hidden = !authRequired;
    render();
  };

  const remove = async (item: Exclusion, button: HTMLButtonElement) => {
    if (!button.classList.contains('is-armed')) {
      button.classList.add('is-armed');
      button.textContent = S.confirm;
      window.setTimeout(() => {
        button.classList.remove('is-armed');
        button.textContent = S.remove;
      }, 4000);
      return;
    }
    button.disabled = true;
    try {
      await getJSON('/api/v1/exclusions', {
        method: 'DELETE',
        headers: headers(),
        body: JSON.stringify({ indicator_type: item.indicator_type, value: item.value }),
      });
      say(S.removed);
      await load();
    } catch (error) {
      button.disabled = false;
      say(error instanceof ApiError ? error.message : S.error, true);
    }
  };

  addForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(addForm);
    const payload = { indicator_type: String(data.get('indicator_type')), value: String(data.get('value') || '').trim() };
    if (!payload.value) return;
    const button = addForm.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    button.disabled = true;
    try {
      await getJSON('/api/v1/exclusions', { method: 'POST', headers: headers(), body: JSON.stringify(payload) });
      addForm.reset();
      say(S.added);
      await load();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) showLogin(S.badToken);
      else say(error instanceof ApiError ? error.message : S.error, true);
    } finally {
      button.disabled = false;
    }
  });

  login.addEventListener('submit', (event) => {
    event.preventDefault();
    token = String(new FormData(login).get('token') || '').trim();
    writeToken(token);
    login.reset();
    say('');
    void load();
  });

  logout.addEventListener('click', () => {
    token = '';
    writeToken('');
    items = [];
    showLogin();
  });

  filter.addEventListener('input', render);

  void (async () => {
    try {
      const meta = await getJSON<{ auth_required: boolean }>('/api/v1/meta');
      authRequired = meta.auth_required;
    } catch {
      say(S.error, true);
      return;
    }
    banner.hidden = authRequired;
    if (authRequired && !token) showLogin();
    else void load();
  })();
}
