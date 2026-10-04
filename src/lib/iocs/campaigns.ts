import { readFileSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { parse } from 'yaml';
import { parsePostPath } from '../../i18n/routes.ts';
import { CONFIDENCE_LEVELS, IOC_TYPES, type AttackTechnique, type Campaign, type Ioc } from './types.ts';
import { isIsoDate, normaliseIoc } from './validate.ts';

/**
 * Fonte única de IoCs (RF-10): um YAML por campanha em data/campaigns/.
 * CSV, TXT e STIX são sempre gerados a partir daqui; nunca edite os gerados.
 */
export const CAMPAIGNS_DIR = resolve(process.cwd(), 'data/campaigns');

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ATTACK_ID = /^T\d{4}(?:\.\d{3})?$/;
const CAMPAIGN_KEYS = new Set([
  'id', 'title', 'title_pt', 'description', 'tlp', 'first_seen', 'last_seen',
  'source', 'attack', 'malware', 'post', 'iocs',
]);
const IOC_KEYS = new Set(['type', 'value', 'confidence', 'first_seen', 'last_seen', 'source', 'comment']);

export interface CampaignLoadResult {
  campaigns: Campaign[];
  errors: string[];
}

export function loadCampaigns(dir: string = CAMPAIGNS_DIR): CampaignLoadResult {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort();
  } catch {
    return { campaigns: [], errors: [] };
  }
  const campaigns: Campaign[] = [];
  const errors: string[] = [];
  const seenIds = new Set<string>();
  for (const file of files) {
    const path = join(dir, file);
    const fileErrors: string[] = [];
    let data: unknown;
    try {
      data = parse(readFileSync(path, 'utf8'));
    } catch (error) {
      errors.push(`${file}: YAML inválido: ${(error as Error).message}`);
      continue;
    }
    const campaign = parseCampaign(data, basename(file).replace(/\.ya?ml$/, ''), fileErrors);
    if (campaign && seenIds.has(campaign.id)) fileErrors.push(`id duplicado "${campaign.id}"`);
    if (fileErrors.length) {
      errors.push(...fileErrors.map((e) => `data/campaigns/${file}: ${e}`));
    } else if (campaign) {
      seenIds.add(campaign.id);
      campaigns.push(campaign);
    }
  }
  return { campaigns, errors };
}

/** Carrega e lança erro agregado; usado no build para falhar cedo. */
export function loadCampaignsOrThrow(dir?: string): Campaign[] {
  const { campaigns, errors } = loadCampaigns(dir);
  if (errors.length) {
    throw new Error(`Campanhas inválidas:\n  - ${errors.join('\n  - ')}`);
  }
  return campaigns;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function parseCampaign(data: unknown, fileId: string, errors: string[]): Campaign | null {
  if (!isRecord(data)) {
    errors.push('o arquivo deve ser um objeto YAML');
    return null;
  }
  for (const key of Object.keys(data)) {
    if (!CAMPAIGN_KEYS.has(key)) errors.push(`campo desconhecido "${key}"`);
  }

  const id = str(data.id);
  if (!id || !KEBAB.test(id)) errors.push('id ausente ou fora do padrão kebab-case');
  else if (id !== fileId) errors.push(`id "${id}" deve ser igual ao nome do arquivo "${fileId}"`);

  const title = str(data.title);
  if (!title) errors.push('title é obrigatório');

  if (data.tlp !== 'CLEAR') {
    errors.push(`tlp deve ser CLEAR (recebido: ${JSON.stringify(data.tlp ?? null)}); outros níveis não vão para o site`);
  }

  const firstSeen = data.first_seen;
  const lastSeen = data.last_seen;
  if (!isIsoDate(firstSeen)) errors.push('first_seen deve ser uma data AAAA-MM-DD');
  if (!isIsoDate(lastSeen)) errors.push('last_seen deve ser uma data AAAA-MM-DD');
  if (isIsoDate(firstSeen) && isIsoDate(lastSeen) && firstSeen > lastSeen) {
    errors.push('first_seen é posterior a last_seen');
  }

  const source = str(data.source);
  if (!source) errors.push('source é obrigatório (de onde vieram os dados: honeypot próprio, fonte pública...)');

  const attack: AttackTechnique[] = [];
  if (!Array.isArray(data.attack) || data.attack.length === 0) {
    errors.push('attack deve listar ao menos uma técnica ATT&CK');
  } else {
    for (const entry of data.attack) {
      const tech = typeof entry === 'string' ? { id: entry } : isRecord(entry) ? { id: str(entry.id), name: str(entry.name) } : null;
      if (!tech?.id || !ATTACK_ID.test(tech.id)) {
        errors.push(`técnica ATT&CK inválida: ${JSON.stringify(entry)}`);
      } else {
        attack.push(tech.name ? { id: tech.id, name: tech.name } : { id: tech.id });
      }
    }
  }

  const malware: Campaign['malware'] = [];
  if (data.malware !== undefined) {
    if (!Array.isArray(data.malware)) errors.push('malware deve ser uma lista');
    else {
      for (const entry of data.malware) {
        const name = typeof entry === 'string' ? str(entry) : isRecord(entry) ? str(entry.name) : undefined;
        if (!name) errors.push(`malware inválido: ${JSON.stringify(entry)}`);
        else malware.push({ name, is_family: isRecord(entry) ? entry.is_family !== false : true });
      }
    }
  }

  const post = str(data.post);
  if (!post || !parsePostPath(post)) {
    errors.push('post deve ser o caminho do post, ex.: /en/research/<slug>/');
  }

  const iocs: Ioc[] = [];
  if (!Array.isArray(data.iocs) || data.iocs.length === 0) {
    errors.push('iocs deve ser uma lista não vazia');
  } else {
    const seen = new Set<string>();
    data.iocs.forEach((raw, index) => {
      const where = `iocs[${index}]`;
      if (!isRecord(raw)) {
        errors.push(`${where}: deve ser um objeto {type, value, confidence, first_seen}`);
        return;
      }
      for (const key of Object.keys(raw)) {
        if (!IOC_KEYS.has(key)) errors.push(`${where}: campo desconhecido "${key}"`);
      }
      const type = raw.type;
      if (!(IOC_TYPES as readonly unknown[]).includes(type)) {
        errors.push(`${where}: type deve ser um de ${IOC_TYPES.join(', ')}`);
        return;
      }
      const iocType = type as Ioc['type'];
      if (typeof raw.value !== 'string') {
        // Ex.: um hash como 0e1234... vira número no YAML e perde o valor.
        errors.push(`${where}: value deve ser texto; coloque o valor entre aspas`);
        return;
      }
      const normalised = normaliseIoc(iocType, raw.value);
      if (normalised.error !== undefined) {
        errors.push(`${where}: ${normalised.error}`);
        return;
      }
      const key = `${iocType}:${normalised.value}`;
      if (seen.has(key)) errors.push(`${where}: IoC duplicado ${key}`);
      seen.add(key);

      if (!(CONFIDENCE_LEVELS as readonly unknown[]).includes(raw.confidence)) {
        errors.push(`${where}: confidence deve ser high, medium ou low`);
      }
      const iocFirst = raw.first_seen;
      if (!isIsoDate(iocFirst)) {
        errors.push(`${where}: first_seen deve ser uma data AAAA-MM-DD`);
      } else if (isIsoDate(firstSeen) && isIsoDate(lastSeen) && (iocFirst < firstSeen || iocFirst > lastSeen)) {
        errors.push(`${where}: first_seen ${iocFirst} fora do período da campanha`);
      }
      const iocLast = raw.last_seen;
      if (iocLast !== undefined) {
        if (!isIsoDate(iocLast)) errors.push(`${where}: last_seen deve ser uma data AAAA-MM-DD`);
        else if (isIsoDate(iocFirst) && iocLast < iocFirst) errors.push(`${where}: last_seen anterior a first_seen`);
      }

      const ioc: Ioc = {
        type: iocType,
        value: normalised.value,
        confidence: raw.confidence as Ioc['confidence'],
        first_seen: String(iocFirst),
        source: str(raw.source) ?? source ?? '',
      };
      if (isIsoDate(iocLast)) ioc.last_seen = iocLast;
      const comment = str(raw.comment);
      if (comment) ioc.comment = comment;
      iocs.push(ioc);
    });
  }

  if (errors.length) return null;
  const campaign: Campaign = {
    id: id!,
    title: title!,
    tlp: 'CLEAR',
    first_seen: firstSeen as string,
    last_seen: lastSeen as string,
    source: source!,
    attack,
    malware,
    post: post!,
    iocs,
  };
  const titlePt = str(data.title_pt);
  if (titlePt) campaign.title_pt = titlePt;
  const description = str(data.description);
  if (description) campaign.description = description;
  return campaign;
}
