// Verificações pós-build: SEO básico por página e compatibilidade com a CSP estrita do nginx.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname;
const errors = [];

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

const count = (html, re) => (html.match(re) || []).length;

let pages = 0;
for await (const file of walk(DIST)) {
  if (!file.endsWith('.html')) continue;
  pages += 1;
  const html = await readFile(file, 'utf8');
  const rel = file.slice(DIST.length);
  const fail = (message) => errors.push(`${rel}: ${message}`);

  // CSP: sem script executável inline, sem atributos style, sem handlers on*.
  for (const tag of html.match(/<script\b[^>]*>/g) || []) {
    const isData = /type="application\/(ld\+)?json"/.test(tag);
    if (!isData && !/\bsrc=/.test(tag)) fail(`script inline: ${tag}`);
  }
  if (/\sstyle="/.test(html)) fail('atributo style inline');
  if (/\son[a-z]+="/.test(html)) fail('handler de evento inline');
  if (/<style[\s>]/.test(html)) fail('bloco <style> inline');

  // SEO.
  if (count(html, /<title>/g) !== 1) fail('precisa de exatamente um <title>');
  if (!/<meta name="description" content="[^"]{50,}"/.test(html)) fail('meta description ausente ou curta');
  if (!/<link rel="canonical" href="https?:\/\//.test(html)) fail('canonical ausente');
  if (count(html, /<h1[\s>]/g) !== 1) fail(`precisa de exatamente um <h1> (tem ${count(html, /<h1[\s>]/g)})`);
  if (!/<html lang="(pt-BR|en)"/.test(html)) fail('atributo lang ausente');
  const noindex = /<meta name="robots" content="noindex/.test(html);
  if (!noindex) {
    if (count(html, /hreflang="(pt-BR|en|x-default)"/g) < 3) fail('hreflang incompleto');
    if (!/<script type="application\/ld\+json">/.test(html)) fail('JSON-LD ausente');
    if (!/property="og:image" content="https?:\/\//.test(html)) fail('og:image ausente');
  }
  const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (ld) {
    try {
      JSON.parse(ld[1]);
    } catch {
      fail('JSON-LD inválido');
    }
  }
}

if (pages === 0) errors.push('nenhuma página HTML em dist/');
if (errors.length) {
  console.error(`check-dist: ${errors.length} problema(s)\n${errors.map((e) => ` - ${e}`).join('\n')}`);
  process.exit(1);
}
console.log(`check-dist: ${pages} páginas ok`);
