/**
 * Checagens pós-build sobre dist/ (RF-05, RF-06, RF-12, RF-14, RNF-01, RNF-02).
 * Roda no fim de `npm run build`; qualquer erro falha o build.
 *
 *  - hreflang recíproco, autorreferente e apontando para páginas existentes
 *  - canonical absoluto em toda página; <html lang> coerente com o prefixo
 *  - nenhum <script>/<style> inline nem atributo style= (CSP sem 'unsafe-inline')
 *  - nenhum IoC bruto (sem defang) no HTML
 *  - orçamento de 100 KB (HTML + CSS + JS) por página
 *  - links internos quebrados, JSON-LD inválido, feeds e sitemap
 *  - rascunhos fora do build de produção
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { HTML_LANG, LANGS, type Lang } from '../src/i18n/config.ts';
import { POST_COLLECTIONS, ROUTES, postPath } from '../src/i18n/routes.ts';
import { loadCampaigns } from '../src/lib/iocs/campaigns.ts';
import { SITE } from '../src/site.config.ts';
import { ROOT, escapeRegExp, parseFrontmatter, rel, walk } from './lib/files.ts';

const DIST = join(ROOT, 'dist');
const BUDGET_BYTES = 100 * 1024;
const SHOW_DRAFTS = process.env.SHOW_DRAFTS === 'true';
const errors: string[] = [];

if (!existsSync(DIST)) {
  console.error('dist/ não existe; rode astro build antes');
  process.exit(1);
}

/** /en/about/ → dist/en/about/index.html ; /en/rss.xml → dist/en/rss.xml */
function distFile(path: string): string {
  const clean = decodeURI(path.split(/[?#]/)[0] ?? '/');
  return clean.endsWith('/') ? join(DIST, clean, 'index.html') : join(DIST, clean);
}

function pathOf(file: string): string {
  return `/${rel(file).replace(/^dist\//, '')}`.replace(/index\.html$/, '');
}

function attr(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag)?.[1];
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

interface Page {
  file: string;
  path: string;
  html: string;
  lang?: string | undefined;
  canonical?: string | undefined;
  alternates: Map<string, string>;
  noindex: boolean;
}

const pages: Page[] = walk(DIST, (p) => p.endsWith('.html')).map((file) => {
  const html = readFileSync(file, 'utf8');
  const links = html.match(/<link\b[^>]*>/gi) ?? [];
  const alternates = new Map<string, string>();
  let canonical: string | undefined;
  for (const tag of links) {
    const relAttr = attr(tag, 'rel');
    if (relAttr === 'canonical') canonical = attr(tag, 'href');
    const hreflang = attr(tag, 'hreflang');
    if (relAttr === 'alternate' && hreflang) alternates.set(hreflang, attr(tag, 'href') ?? '');
  }
  return {
    file,
    path: pathOf(file),
    html,
    lang: /<html\b[^>]*\slang="([^"]+)"/i.exec(html)?.[1],
    canonical,
    alternates,
    noindex: /<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html),
  };
});
const byUrl = new Map(pages.map((p) => [new URL(p.path, SITE.url).href, p]));

for (const page of pages) {
  const where = rel(page.file);

  // ---------------------------------------------------------------- lang + canonical
  const prefixLang = LANGS.find((l) => page.path.startsWith(`/${l}/`));
  if (!page.lang) errors.push(`${where}: <html> sem atributo lang`);
  else if (prefixLang && page.lang !== HTML_LANG[prefixLang]) {
    errors.push(`${where}: lang="${page.lang}" mas a página está em /${prefixLang}/`);
  }
  if (!page.canonical?.startsWith(SITE.url) && !page.canonical?.startsWith('https://')) {
    errors.push(`${where}: canonical ausente ou relativo`);
  }

  // ---------------------------------------------------------------- hreflang
  if (page.alternates.size > 0) {
    const self = new URL(page.path, SITE.url).href;
    // A página de escolha de idioma referencia a si mesma via x-default.
    const selfKey = [...page.alternates].find(([, href]) => href === self)?.[0];
    if (!selfKey) errors.push(`${where}: hreflang não referencia a própria página (${self})`);
    else if (selfKey !== 'x-default' && selfKey !== page.lang) {
      errors.push(`${where}: hreflang "${selfKey}" da própria página difere de lang="${page.lang}"`);
    }
    const languages = [...page.alternates.keys()].filter((k) => k !== 'x-default');
    if (languages.length < 2) {
      errors.push(`${where}: hreflang com uma única versão (só emitir quando há tradução)`);
    }
    for (const [hreflang, href] of page.alternates) {
      if (hreflang !== 'x-default' && !Object.values(HTML_LANG).includes(hreflang)) {
        errors.push(`${where}: hreflang desconhecido "${hreflang}"`);
      }
      if (href === self) continue;
      const target = byUrl.get(href);
      if (!target) {
        errors.push(`${where}: hreflang ${hreflang} aponta para página inexistente ${href}`);
      } else if (selfKey && target.alternates.get(selfKey) !== self) {
        errors.push(`${where}: hreflang não recíproco — ${rel(target.file)} não aponta de volta (${selfKey})`);
      }
    }
  }

  // ---------------------------------------------------------------- CSP: nada inline
  for (const tag of page.html.match(/<script\b[^>]*>/gi) ?? []) {
    if (!attr(tag, 'src') && attr(tag, 'type') !== 'application/ld+json') {
      errors.push(`${where}: <script> inline (bloqueado pela CSP)`);
    }
  }
  if (/<style\b/i.test(page.html)) errors.push(`${where}: <style> inline (bloqueado pela CSP)`);
  if (/<[a-z][^>]*\sstyle\s*=/i.test(page.html)) errors.push(`${where}: atributo style= inline (bloqueado pela CSP)`);
  if (/\son[a-z]+\s*=\s*"/i.test(page.html.replace(/<script\b[\s\S]*?<\/script>/gi, ''))) {
    errors.push(`${where}: handler de evento inline (onclick=...)`);
  }

  // ---------------------------------------------------------------- JSON-LD
  for (const match of page.html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      JSON.parse(match[1] ?? '');
    } catch {
      errors.push(`${where}: JSON-LD inválido`);
    }
  }

  // ---------------------------------------------------------------- links internos
  for (const match of page.html.matchAll(/\s(?:href|src)="(\/[^"]*)"/g)) {
    const href = decodeEntities(match[1] ?? '');
    if (href.startsWith('//')) continue;
    if (!existsSync(distFile(href))) errors.push(`${where}: link interno quebrado ${href}`);
  }

  // ---------------------------------------------------------------- orçamento (RNF-01)
  let bytes = Buffer.byteLength(page.html);
  const assets = new Set<string>();
  for (const tag of page.html.match(/<link\b[^>]*>/gi) ?? []) {
    const relAttr = attr(tag, 'rel');
    if (relAttr === 'stylesheet' || relAttr === 'modulepreload') assets.add(attr(tag, 'href') ?? '');
  }
  for (const tag of page.html.match(/<script\b[^>]*>/gi) ?? []) {
    const src = attr(tag, 'src');
    if (src) assets.add(src);
  }
  for (const asset of assets) {
    if (asset.startsWith('/') && existsSync(distFile(asset))) bytes += statSync(distFile(asset)).size;
  }
  if (bytes > BUDGET_BYTES) {
    errors.push(`${where}: ${(bytes / 1024).toFixed(1)} KB de HTML+CSS+JS (limite ${BUDGET_BYTES / 1024} KB)`);
  }
}

// ------------------------------------------------------------------ IoCs brutos no HTML (RF-12)
const { campaigns, errors: campaignErrors } = loadCampaigns();
errors.push(...campaignErrors);
const NETWORK_TYPES = new Set(['ipv4', 'ipv6', 'domain', 'url', 'email']);
const rawPatterns = campaigns.flatMap((c) =>
  c.iocs
    .filter((ioc) => NETWORK_TYPES.has(ioc.type))
    .map((ioc) => ({
      value: ioc.value,
      re:
        ioc.type === 'ipv4'
          ? new RegExp(`(?<![0-9.])${escapeRegExp(ioc.value)}(?![0-9])`)
          : new RegExp(`(?<![a-z0-9.-])${escapeRegExp(ioc.value)}(?![a-z0-9-])`, 'i'),
    })),
);
for (const page of pages) {
  const text = decodeEntities(page.html);
  for (const { value, re } of rawPatterns) {
    if (re.test(text)) {
      errors.push(`${rel(page.file)}: IoC sem defang no HTML ("${value}"); use <Defang value="..." />`);
    }
  }
}

// ------------------------------------------------------------------ rascunhos (RF-09)
for (const collection of POST_COLLECTIONS) {
  for (const file of walk(join(ROOT, 'src/content', collection), (p) => /\.mdx?$/.test(p))) {
    const fm = parseFrontmatter(readFileSync(file, 'utf8'));
    if (!fm) continue;
    const [lang, slug] = rel(file).split('/').slice(3);
    const url = postPath(collection, lang as Lang, (slug ?? '').replace(/\.mdx?$/, ''));
    const built = existsSync(distFile(url));
    if (fm.data.draft === true && built && !SHOW_DRAFTS) {
      errors.push(`${rel(file)}: rascunho publicado no build de produção (${url})`);
    }
    if (fm.data.draft !== true && !built) errors.push(`${rel(file)}: post publicado sem página em ${url}`);
  }
}

// ------------------------------------------------------------------ feeds, sitemap, arquivos fixos
for (const lang of LANGS) {
  const rss = distFile(ROUTES.rss[lang]);
  if (!existsSync(rss)) errors.push(`${ROUTES.rss[lang]} não foi gerado`);
  else {
    const xml = readFileSync(rss, 'utf8');
    if (!xml.includes('<rss') || !xml.includes(`<language>${HTML_LANG[lang]}</language>`)) {
      errors.push(`${ROUTES.rss[lang]}: RSS sem <rss> ou <language>${HTML_LANG[lang]}</language>`);
    }
  }
  const json = distFile(ROUTES.jsonFeed[lang]);
  try {
    const feed = JSON.parse(readFileSync(json, 'utf8')) as { version?: string; items?: unknown[] };
    if (feed.version !== 'https://jsonfeed.org/version/1.1' || !Array.isArray(feed.items)) {
      errors.push(`${ROUTES.jsonFeed[lang]}: JSON Feed 1.1 inválido`);
    }
  } catch {
    errors.push(`${ROUTES.jsonFeed[lang]}: ausente ou não é JSON`);
  }
}
const sitemap = walk(DIST, (p) => /sitemap-\d+\.xml$/.test(p)).map((f) => readFileSync(f, 'utf8')).join('');
for (const lang of LANGS) {
  if (!sitemap.includes(`${SITE.url}/${lang}/`)) errors.push(`sitemap sem páginas de /${lang}/`);
}
for (const required of ['robots.txt', '.well-known/security.txt', '_headers', '404.html', 'iocs/CHECKSUMS.sha256']) {
  if (!existsSync(join(DIST, required))) errors.push(`dist/${required} não foi gerado`);
}

if (errors.length) {
  console.error(`\n✗ check-dist falhou (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`✓ check-dist ok: ${pages.length} páginas HTML verificadas${SHOW_DRAFTS ? ' (com rascunhos)' : ''}`);
