import { getCollection } from 'astro:content';
import { SITE } from '../site.config.ts';
import { getPosts, urlOf, type PostEntry } from './content.ts';
import { loadCampaignsOrThrow } from './iocs/campaigns.ts';
import { campaignFiles, type GeneratedFile } from './iocs/export.ts';
import type { Campaign } from './iocs/types.ts';

export interface PublishedCampaign {
  campaign: Campaign;
  /** Post apontado por `campaign.post` (idioma canônico da campanha). */
  post: PostEntry;
  /** Todas as versões publicadas do post (EN e/ou PT-BR). */
  posts: PostEntry[];
  files: GeneratedFile[];
}

let cache: Promise<PublishedCampaign[]> | undefined;

/**
 * Campanhas publicadas = campanhas cujo post existe e não é rascunho.
 * Inconsistências entre post e YAML derrubam o build.
 */
export function getPublishedCampaigns(): Promise<PublishedCampaign[]> {
  cache ??= build();
  return cache;
}

async function build(): Promise<PublishedCampaign[]> {
  const campaigns = loadCampaignsOrThrow();
  const allResearch = (await getCollection('research')) as PostEntry[];
  const published = await getPosts('research');
  const errors: string[] = [];

  const ids = new Set(campaigns.map((c) => c.id));
  for (const entry of allResearch) {
    if (entry.collection !== 'research') continue;
    const ref = entry.data.campaign;
    if (ref && !ids.has(ref)) {
      errors.push(`research/${entry.id}: campaign "${ref}" não existe em data/campaigns/`);
    }
  }

  const result: PublishedCampaign[] = [];
  for (const campaign of campaigns) {
    const target = allResearch.find((e) => urlOf(e) === campaign.post);
    if (!target) {
      errors.push(`data/campaigns/${campaign.id}.yaml: post ${campaign.post} não existe`);
      continue;
    }
    if (target.collection !== 'research' || target.data.campaign !== campaign.id) {
      errors.push(`research/${target.id}: precisa de "campaign: ${campaign.id}" no frontmatter`);
      continue;
    }
    const post = published.find((e) => e.id === target.id);
    if (!post) continue; // rascunho: campanha ainda não publicada
    const posts = published.filter(
      (e) => e.collection === 'research' && e.data.campaign === campaign.id,
    );
    const files = campaignFiles(campaign, {
      siteUrl: SITE.url,
      authorName: SITE.author.name,
      published: post.data.pubDate,
      ...(post.data.updatedDate ? { modified: post.data.updatedDate } : {}),
    });
    result.push({ campaign, post, posts, files });
  }

  if (errors.length) throw new Error(`Campanhas inconsistentes:\n  - ${errors.join('\n  - ')}`);
  return result.sort((a, b) => b.campaign.last_seen.localeCompare(a.campaign.last_seen));
}

export async function findPublishedCampaign(id: string): Promise<PublishedCampaign | undefined> {
  return (await getPublishedCampaigns()).find((c) => c.campaign.id === id);
}
