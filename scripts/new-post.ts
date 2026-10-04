/**
 * Cria um post a partir do template do tipo (RF-02), já com frontmatter válido.
 *
 *   npm run new -- campaign meu-slug            # EN e PT-BR
 *   npm run new -- walkthrough meu-lab --lang en
 *   npm run new -- note minha-nota --lang pt-br
 *
 * Tipos: campaign | research | walkthrough | note. Posts nascem como draft.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { LANGS, type Lang } from '../src/i18n/config.ts';
import type { PostCollection } from '../src/i18n/routes.ts';
import { ROOT, rel } from './lib/files.ts';

type Kind = 'campaign' | 'research' | 'walkthrough' | 'note';
const COLLECTION: Record<Kind, PostCollection> = {
  campaign: 'research',
  research: 'research',
  walkthrough: 'walkthroughs',
  note: 'notes',
};

const SECTIONS: Record<Kind, Record<Lang, string[]>> = {
  campaign: {
    en: ['Executive summary', 'Timeline', 'Technical analysis', 'MITRE ATT&CK', 'Indicators of compromise', 'Detections', 'Recommendations'],
    'pt-br': ['Resumo executivo', 'Linha do tempo', 'Análise técnica', 'MITRE ATT&CK', 'Indicadores de comprometimento', 'Detecções', 'Recomendações'],
  },
  research: {
    en: ['Summary', 'Method and data', 'Findings', 'Limitations', 'References'],
    'pt-br': ['Resumo', 'Método e dados', 'Resultados', 'Limitações', 'Referências'],
  },
  walkthrough: {
    en: ['Goal', 'Lab setup', 'Step by step', 'Detection and defense', 'Takeaways'],
    'pt-br': ['Objetivo', 'Ambiente', 'Passo a passo', 'Detecção e defesa', 'Lições'],
  },
  note: {
    en: ['Context', 'Notes'],
    'pt-br': ['Contexto', 'Notas'],
  },
};

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { lang: { type: 'string' } },
});
const [kind, slug] = positionals as [Kind | undefined, string | undefined];

if (!kind || !(kind in COLLECTION) || !slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
  console.error('uso: npm run new -- <campaign|research|walkthrough|note> <slug-kebab-case> [--lang en|pt-br]');
  process.exit(1);
}
const langs: Lang[] = values.lang ? [values.lang as Lang] : [...LANGS];
if (langs.some((l) => !LANGS.includes(l))) {
  console.error('--lang deve ser en ou pt-br');
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);
const campaignId = `${today.slice(0, 7)}-${slug}`;

function body(lang: Lang): string {
  const sections = SECTIONS[kind!][lang];
  return sections
    .map((title) => {
      if (kind === 'campaign' && /ATT&CK/.test(title)) return `## ${title}\n\n<AttackTable ids={['T1110']} />\n`;
      if (kind === 'campaign' && /(Indicators|Indicadores)/.test(title)) {
        return `## ${title}\n\n<CampaignIocs id="${campaignId}" />\n`;
      }
      return `## ${title}\n\n${lang === 'en' ? 'TODO' : 'A FAZER'}\n`;
    })
    .join('\n');
}

const created: string[] = [];
for (const lang of langs) {
  const file = join(ROOT, 'src/content', COLLECTION[kind], lang, `${slug}.mdx`);
  if (existsSync(file)) {
    console.error(`já existe: ${rel(file)}`);
    process.exit(1);
  }
  const frontmatter = [
    '---',
    `title: "${lang === 'en' ? 'TODO title' : 'TODO título'}"`,
    `description: "${lang === 'en' ? 'TODO: one or two sentences shown in listings, feeds and cards.' : 'TODO: uma ou duas frases exibidas em listas, feeds e cartões.'}"`,
    `lang: ${lang}`,
    `translationKey: ${slug}`,
    `pubDate: ${today}`,
    ...(kind === 'campaign' || kind === 'research' ? [`type: ${kind}`, 'tlp: CLEAR'] : []),
    ...(kind === 'campaign' ? [`campaign: ${campaignId}`, 'attack: [T1110]'] : []),
    'tags: []',
    'draft: true',
    '---',
    '',
  ].join('\n');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${frontmatter}\n${body(lang)}`);
  created.push(rel(file));
}

if (kind === 'campaign') {
  const file = join(ROOT, 'data/campaigns', `${campaignId}.yaml`);
  if (!existsSync(file)) {
    writeFileSync(
      file,
      [
        `id: ${campaignId}`,
        'title: "TODO campaign title"',
        'title_pt: "TODO título da campanha"',
        'tlp: CLEAR',
        `first_seen: ${today}`,
        `last_seen: ${today}`,
        'source: "TODO (ex.: honeypot pessoal, fonte pública)"',
        'attack:',
        '  - { id: T1110, name: Brute Force }',
        `post: /${langs[0]}/${langs[0] === 'en' ? 'research' : 'pesquisa'}/${slug}/`,
        'iocs:',
        '  # valores brutos aqui; o texto do post usa <Defang value="..." />',
        `  - { type: ipv4, value: 192.0.2.1, confidence: low, first_seen: ${today} }`,
        '',
      ].join('\n'),
    );
    created.push(rel(file));
  }
}

console.log(`criado:\n  ${created.join('\n  ')}\n\nRemova "draft: true" quando o post estiver pronto e revisado.`);
