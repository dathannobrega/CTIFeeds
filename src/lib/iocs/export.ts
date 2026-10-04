import { createHash } from 'node:crypto';
import type { Campaign, Confidence, Ioc, IocType } from './types.ts';

/**
 * Gera os artefatos legíveis por máquina de uma campanha (CSV, listas TXT e
 * bundle STIX 2.1). Saída determinística: mesmo YAML → mesmos bytes, o que
 * mantém checksums e diffs estáveis no repositório de IoCs.
 */
export interface ExportContext {
  /** URL absoluta do site, sem barra final. */
  siteUrl: string;
  authorName: string;
  /** Data de publicação do post da campanha (vira created/modified no STIX). */
  published: Date;
  modified?: Date;
}

export interface GeneratedFile {
  /** Caminho relativo a /iocs/ */
  path: string;
  content: string;
}

export const CSV_COLUMNS = [
  'type', 'value', 'first_seen', 'last_seen', 'confidence', 'tlp', 'campaign', 'post_url', 'source',
] as const;

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function campaignCsv(campaign: Campaign, ctx: ExportContext): string {
  const postUrl = ctx.siteUrl + campaign.post;
  const rows = campaign.iocs.map((ioc) =>
    [
      ioc.type, ioc.value, ioc.first_seen, ioc.last_seen ?? '', ioc.confidence,
      `TLP:${campaign.tlp}`, campaign.id, postUrl, ioc.source,
    ].map(csvField).join(','),
  );
  return `${CSV_COLUMNS.join(',')}\n${rows.join('\n')}\n`;
}

/** Uma lista por tipo, um valor por linha (estilo ESET/abuse.ch). */
export function campaignTxtLists(campaign: Campaign, ctx: ExportContext): GeneratedFile[] {
  const byType = new Map<IocType, string[]>();
  for (const ioc of campaign.iocs) {
    byType.set(ioc.type, [...(byType.get(ioc.type) ?? []), ioc.value]);
  }
  return [...byType.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([type, values]) => ({
      path: `${campaign.id}/${type}.txt`,
      content: [
        `# ${campaign.title}`,
        `# campaign: ${campaign.id} | TLP:${campaign.tlp} | type: ${type}`,
        `# post: ${ctx.siteUrl}${campaign.post}`,
        '# Raw (non-defanged) values for tooling. Handle with care.',
        ...[...values].sort(),
        '',
      ].join('\n'),
    }));
}

// ---------------------------------------------------------------- STIX 2.1

/**
 * ID estável no formato UUIDv4 (o que a spec recomenda para SDOs/SROs):
 * bits de versão/variante de um SHA-256 do nome com namespace do site.
 * Mesmo YAML → mesmos IDs, então consumidores deduplicam entre versões.
 */
export function stableUuid(name: string): string {
  const bytes = createHash('sha256').update(name, 'utf8').digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * TLP:CLEAR (TLP 2.0) equivale ao TLP:WHITE; usamos a marcação predefinida
 * na especificação STIX 2.1 (seção 7.2.1.4), que todo consumidor conhece.
 */
export const TLP_WHITE_MARKING = {
  type: 'marking-definition',
  spec_version: '2.1',
  id: 'marking-definition--613f2e26-407d-48c7-9eca-b8e91df99dc9',
  created: '2017-01-20T00:00:00.000Z',
  definition_type: 'tlp',
  name: 'TLP:WHITE',
  definition: { tlp: 'white' },
} as const;

const CONFIDENCE_SCORE: Record<Confidence, number> = { low: 15, medium: 50, high: 85 };

function stixString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

export function stixPattern(ioc: Pick<Ioc, 'type' | 'value'>): string {
  const v = stixString(ioc.value);
  switch (ioc.type) {
    case 'ipv4': return `[ipv4-addr:value = ${v}]`;
    case 'ipv6': return `[ipv6-addr:value = ${v}]`;
    case 'domain': return `[domain-name:value = ${v}]`;
    case 'url': return `[url:value = ${v}]`;
    case 'email': return `[email-addr:value = ${v}]`;
    case 'md5': return `[file:hashes.MD5 = ${v}]`;
    case 'sha1': return `[file:hashes.'SHA-1' = ${v}]`;
    case 'sha256': return `[file:hashes.'SHA-256' = ${v}]`;
  }
}

function attackUrl(id: string): string {
  return `https://attack.mitre.org/techniques/${id.replace('.', '/')}/`;
}

export function campaignStixBundle(campaign: Campaign, ctx: ExportContext): object {
  const host = new URL(ctx.siteUrl).hostname;
  const sid = (type: string, name: string) => `${type}--${stableUuid(`${host}|${type}:${name}`)}`;
  const created = ctx.published.toISOString();
  const modified = (ctx.modified ?? ctx.published).toISOString();
  const postUrl = ctx.siteUrl + campaign.post;
  const postRef = { source_name: ctx.siteUrl.replace(/^https?:\/\//, ''), url: postUrl };
  const marking = [TLP_WHITE_MARKING.id];

  const identity = {
    type: 'identity',
    spec_version: '2.1',
    id: sid('identity', ctx.authorName),
    created: '2026-10-04T00:00:00.000Z',
    modified: '2026-10-04T00:00:00.000Z',
    name: ctx.authorName,
    identity_class: 'individual',
    contact_information: ctx.siteUrl,
  };
  const common = {
    spec_version: '2.1',
    created,
    modified,
    created_by_ref: identity.id,
    object_marking_refs: marking,
  };

  const campaignObj = {
    type: 'campaign',
    ...common,
    id: sid('campaign', campaign.id),
    name: campaign.title,
    ...(campaign.description ? { description: campaign.description } : {}),
    first_seen: `${campaign.first_seen}T00:00:00.000Z`,
    last_seen: `${campaign.last_seen}T00:00:00.000Z`,
    external_references: [postRef],
  };

  const indicators = campaign.iocs.map((ioc) => ({
    type: 'indicator',
    ...common,
    id: sid('indicator', `${campaign.id}:${ioc.type}:${ioc.value}`),
    name: `${ioc.type}: ${ioc.value}`,
    description: ioc.comment ?? `${ioc.type} observed in campaign "${campaign.title}" (source: ${ioc.source}).`,
    indicator_types: ['malicious-activity'],
    pattern: stixPattern(ioc),
    pattern_type: 'stix',
    pattern_version: '2.1',
    valid_from: `${ioc.first_seen}T00:00:00.000Z`,
    confidence: CONFIDENCE_SCORE[ioc.confidence],
    external_references: [postRef],
  }));

  const attackPatterns = campaign.attack.map((tech) => ({
    type: 'attack-pattern',
    ...common,
    id: sid('attack-pattern', tech.id),
    name: tech.name ?? tech.id,
    external_references: [{ source_name: 'mitre-attack', external_id: tech.id, url: attackUrl(tech.id) }],
  }));

  const malware = campaign.malware.map((m) => ({
    type: 'malware',
    ...common,
    id: sid('malware', m.name.toLowerCase()),
    name: m.name,
    is_family: m.is_family,
  }));

  const rel = (source: string, relationship: string, target: string) => ({
    type: 'relationship',
    ...common,
    id: sid('relationship', `${source}|${relationship}|${target}`),
    relationship_type: relationship,
    source_ref: source,
    target_ref: target,
  });

  const relationships = [
    ...indicators.map((i) => rel(i.id, 'indicates', campaignObj.id)),
    ...attackPatterns.map((a) => rel(campaignObj.id, 'uses', a.id)),
    ...malware.map((m) => rel(campaignObj.id, 'uses', m.id)),
  ];

  return {
    type: 'bundle',
    id: sid('bundle', campaign.id),
    objects: [TLP_WHITE_MARKING, identity, campaignObj, ...malware, ...attackPatterns, ...indicators, ...relationships],
  };
}

/** Todos os arquivos de uma campanha, com caminhos relativos a /iocs/. */
export function campaignFiles(campaign: Campaign, ctx: ExportContext): GeneratedFile[] {
  return [
    { path: `${campaign.id}.csv`, content: campaignCsv(campaign, ctx) },
    { path: `${campaign.id}.stix.json`, content: `${JSON.stringify(campaignStixBundle(campaign, ctx), null, 2)}\n` },
    ...campaignTxtLists(campaign, ctx),
  ];
}

export function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/** Formato do `sha256sum`: "<hash>  <arquivo>". */
export function checksumsFile(files: GeneratedFile[]): string {
  return files
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => `${sha256(f.content)}  ${f.path}`)
    .join('\n')
    .concat(files.length ? '\n' : '');
}
