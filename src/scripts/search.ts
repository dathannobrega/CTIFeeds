// Busca estática com Pagefind (RF-15). O índice é gerado no build e separado por
// idioma a partir do <html lang>, então só aparecem resultados do idioma atual.
interface PagefindResult {
  data(): Promise<{ url: string; excerpt: string; meta: { title?: string } }>;
}
interface Pagefind {
  init(): Promise<void>;
  debouncedSearch(term: string, options?: object, ms?: number): Promise<{ results: PagefindResult[] } | null>;
}

const form = document.querySelector<HTMLFormElement>('.search-form');
const input = document.querySelector<HTMLInputElement>('#q');
const list = document.querySelector<HTMLOListElement>('#search-results');
const statusEl = document.querySelector<HTMLElement>('#search-status');

/** Excerpt do Pagefind vem com <mark>; reconstruímos o texto sem usar innerHTML. */
function renderExcerpt(target: HTMLElement, excerpt: string): void {
  const parts = excerpt.split(/(<mark>.*?<\/mark>)/g);
  for (const part of parts) {
    const match = /^<mark>(.*)<\/mark>$/.exec(part);
    const text = (match ? match[1] : part) ?? '';
    const decoded = new DOMParser().parseFromString(text, 'text/html').documentElement.textContent ?? '';
    if (match) {
      const mark = document.createElement('mark');
      mark.textContent = decoded;
      target.append(mark);
    } else {
      target.append(decoded);
    }
  }
}

if (form && input && list && statusEl) {
  let pagefind: Pagefind | undefined;
  const load = async () => {
    // Caminho montado em runtime para o Vite não tentar empacotar o índice.
    const path = ['', 'pagefind', 'pagefind.js'].join('/');
    pagefind ??= (await import(/* @vite-ignore */ path)) as Pagefind;
    return pagefind;
  };

  const run = async () => {
    const term = input.value.trim();
    const url = new URL(location.href);
    if (term) url.searchParams.set('q', term);
    else url.searchParams.delete('q');
    history.replaceState(null, '', url);

    list.replaceChildren();
    if (!term) {
      statusEl.textContent = '';
      return;
    }
    const search = await (await load()).debouncedSearch(term, {}, 250);
    if (!search) return; // superado por uma busca mais nova
    const items = await Promise.all(search.results.slice(0, 20).map((r) => r.data()));
    statusEl.textContent = items.length
      ? `${search.results.length} ${form.dataset.resultsLabel ?? ''}`
      : (form.dataset.empty ?? '');
    for (const item of items) {
      const li = document.createElement('li');
      const h = document.createElement('h2');
      const a = document.createElement('a');
      a.href = item.url;
      a.textContent = item.meta.title ?? item.url;
      h.append(a);
      const p = document.createElement('p');
      renderExcerpt(p, item.excerpt);
      li.append(h, p);
      list.append(li);
    }
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    void run();
  });
  input.addEventListener('input', () => void run());

  const initial = new URL(location.href).searchParams.get('q');
  if (initial) {
    input.value = initial;
    void run();
  }
}

export {};
