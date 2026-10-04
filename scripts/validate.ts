/**
 * Validação pré-build (RF-02, RF-11, RNF-08). Roda em `npm run validate` e
 * antes de todo `npm run build`; qualquer erro interrompe o build.
 *
 *  - campanhas: formato de IoC, duplicados, datas, TLP, ligação com o post
 *  - termos proibidos em conteúdo, dados e arquivos públicos
 *  - posts de campanha com todas as seções obrigatórias
 *  - pares de tradução coerentes e idioma igual à pasta
 *  - imagens sem EXIF/XMP e com texto alternativo
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LANGS, type Lang } from '../src/i18n/config.ts';
import { POST_COLLECTIONS, parsePostPath } from '../src/i18n/routes.ts';
import { loadCampaigns } from '../src/lib/iocs/campaigns.ts';
import { ROOT, parseFrontmatter, proseLines, rel, walk } from './lib/files.ts';
import { compileTerm, findTerms, loadForbiddenTerms } from './lib/forbidden.ts';
import { imageMetadata } from './lib/image-metadata.ts';

const errors: string[] = [];
const warnings: string[] = [];
const isCI = process.env.CI === 'true';

// ------------------------------------------------------------------ campanhas
const { campaigns, errors: campaignErrors } = loadCampaigns();
errors.push(...campaignErrors);
for (const campaign of campaigns) {
  const target = parsePostPath(campaign.post);
  if (!target) continue;
  const base = join(ROOT, 'src/content', target.collection, target.lang, target.slug);
  if (!existsSync(`${base}.mdx`) && !existsSync(`${base}.md`)) {
    errors.push(`data/campaigns/${campaign.id}.yaml: post ${campaign.post} não existe (${rel(base)}.mdx)`);
  }
}
const campaignIds = new Set(campaigns.map((c) => c.id));

// ------------------------------------------------------------------ posts
const REQUIRED_SECTIONS: Record<Lang, { name: string; re: RegExp }[]> = {
  en: [
    { name: 'Executive summary', re: /summary/ },
    { name: 'Timeline', re: /timeline/ },
    { name: 'Technical analysis', re: /technical analysis/ },
    { name: 'MITRE ATT&CK', re: /att&ck/ },
    { name: 'Indicators of compromise', re: /indicators of compromise|\biocs?\b/ },
    { name: 'Detections', re: /detection/ },
    { name: 'Recommendations', re: /recommendation/ },
  ],
  'pt-br': [
    { name: 'Resumo executivo', re: /resumo/ },
    { name: 'Linha do tempo', re: /linha do tempo|timeline/ },
    { name: 'Análise técnica', re: /análise técnica/ },
    { name: 'MITRE ATT&CK', re: /att&ck/ },
    { name: 'Indicadores de comprometimento', re: /indicadores de comprometimento|\biocs?\b/ },
    { name: 'Detecções', re: /detecç/ },
    { name: 'Recomendações', re: /recomendaç/ },
  ],
};

const translations = new Map<string, string[]>();

for (const collection of POST_COLLECTIONS) {
  for (const file of walk(join(ROOT, 'src/content', collection), (p) => /\.mdx?$/.test(p))) {
    const where = rel(file);
    const fm = parseFrontmatter(readFileSync(file, 'utf8'));
    if (!fm) {
      errors.push(`${where}: frontmatter ausente`);
      continue;
    }
    const folder = where.split('/')[3];
    const lang = fm.data.lang;
    if (!LANGS.includes(lang as Lang)) {
      errors.push(`${where}: lang deve ser "en" ou "pt-br"`);
      continue;
    }
    if (folder !== lang) errors.push(`${where}: lang "${String(lang)}" não bate com a pasta "${folder}"`);

    const key = `${collection}:${lang}:${String(fm.data.translationKey)}`;
    translations.set(key, [...(translations.get(key) ?? []), where]);

    if (fm.data.type === 'campaign') {
      const ref = fm.data.campaign;
      if (typeof ref === 'string' && !campaignIds.has(ref)) {
        errors.push(`${where}: campaign "${ref}" não existe em data/campaigns/`);
      }
      const headings = proseLines(fm.body)
        .filter(({ text }) => /^##\s/.test(text))
        .map(({ text }) => text.replace(/^##\s+/, '').trim().toLowerCase());
      for (const section of REQUIRED_SECTIONS[lang as Lang]) {
        if (!headings.some((h) => section.re.test(h))) {
          errors.push(`${where}: post de campanha sem a seção "## ${section.name}"`);
        }
      }
    }

    for (const { line, text } of proseLines(fm.body)) {
      const at = `${where}:${line + fm.bodyLine - 1}`;
      if (/!\[\s*\]\(/.test(text)) errors.push(`${at}: imagem sem texto alternativo (![descrição](...))`);
      for (const tag of text.match(/<img\b[^>]*>/gi) ?? []) {
        if (!/\balt\s*=\s*["{][^"}]+/.test(tag)) errors.push(`${at}: <img> sem alt`);
      }
    }
  }
}

for (const [key, files] of translations) {
  if (files.length > 1) {
    errors.push(`translationKey repetida no mesmo idioma (${key}): ${files.join(', ')}`);
  }
}

// ------------------------------------------------------------------ termos proibidos
const forbidden = loadForbiddenTerms();
const compiled = forbidden.terms.map((term) => ({ term, re: compileTerm(term) }));
if (forbidden.counts.local + forbidden.counts.env === 0) {
  const message =
    'nenhum termo proibido pessoal configurado: crie data/forbidden-terms.local.txt ' +
    '(local) e o secret FORBIDDEN_TERMS (CI) com nomes de empregador/clientes';
  if (isCI) console.log(`::warning title=Termos proibidos::${message}`);
  warnings.push(message);
}
const TEXT_FILE = /\.(mdx?|ya?ml|json|txt|csv|html|xml|svg|asc|astro|ts)$/i;
const scanTargets = [
  ...walk(join(ROOT, 'src/content')),
  ...walk(join(ROOT, 'src/data')),
  ...walk(join(ROOT, 'data'), (p) => !/forbidden-terms(\.local)?\.txt$/.test(p)),
  ...walk(join(ROOT, 'public')),
].filter((p) => TEXT_FILE.test(p));
for (const file of scanTargets) {
  const hits = findTerms(readFileSync(file, 'utf8'), compiled);
  // Não ecoa termos de fontes privadas no log do CI.
  for (const term of hits) {
    const label = forbidden.publicTerms.has(term) ? `"${term}"` : '(lista privada)';
    errors.push(`${rel(file)}: contém termo proibido ${label}`);
  }
}

// ------------------------------------------------------------------ imagens
const IMAGE = /\.(jpe?g|png|webp|gif|avif|heic|tiff?)$/i;
for (const file of [...walk(join(ROOT, 'src'), (p) => IMAGE.test(p)), ...walk(join(ROOT, 'public'), (p) => IMAGE.test(p))]) {
  for (const finding of imageMetadata(file, readFileSync(file))) {
    if (finding === 'unsupported-format') {
      errors.push(`${rel(file)}: formato sem verificação de metadados; converta para PNG, JPEG ou WebP`);
    } else {
      errors.push(`${rel(file)}: contém metadados ${finding}; remova com "exiftool -all= ${rel(file)}"`);
    }
  }
}

// ------------------------------------------------------------------ resultado
for (const w of warnings) console.warn(`aviso: ${w}`);
if (errors.length) {
  console.error(`\n✗ validação falhou (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `✓ validação ok: ${campaigns.length} campanha(s), ${scanTargets.length} arquivo(s) varridos, ` +
    `${forbidden.terms.length} termo(s) proibido(s)`,
);
