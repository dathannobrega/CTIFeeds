import type { APIRoute, GetStaticPaths } from 'astro';
import { getPublishedCampaigns } from '../../lib/campaign-data.ts';
import { checksumsFile, type GeneratedFile } from '../../lib/iocs/export.ts';
import { SITE } from '../../site.config.ts';

/**
 * Todos os artefatos de IoC servidos em /iocs/ (RF-10, RF-16, RF-17):
 *   /iocs/<campanha>.csv, /iocs/<campanha>.stix.json, /iocs/<campanha>/<tipo>.txt,
 *   /iocs/index.json e /iocs/CHECKSUMS.sha256.
 * Gerados no build a partir de data/campaigns/*.yaml; nunca editados à mão.
 */
export const getStaticPaths = (async () => {
  const published = await getPublishedCampaigns();
  const campaignFiles: GeneratedFile[] = published.flatMap((p) => p.files);
  const index: GeneratedFile = {
    path: 'index.json',
    content: `${JSON.stringify(
      {
        site: SITE.url,
        tlp: 'CLEAR',
        campaigns: published.map(({ campaign, files }) => ({
          id: campaign.id,
          title: campaign.title,
          first_seen: campaign.first_seen,
          last_seen: campaign.last_seen,
          attack: campaign.attack.map((a) => a.id),
          post: SITE.url + campaign.post,
          ioc_count: campaign.iocs.length,
          files: files.map((f) => `${SITE.url}/iocs/${f.path}`),
        })),
      },
      null,
      2,
    )}\n`,
  };
  const checksums: GeneratedFile = { path: 'CHECKSUMS.sha256', content: checksumsFile([...campaignFiles, index]) };
  return [...campaignFiles, index, checksums].map((f) => ({ params: { file: f.path }, props: { content: f.content } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => new Response(props.content as string);
