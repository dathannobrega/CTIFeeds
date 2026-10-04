import type { Lang } from '../i18n/config.ts';

/**
 * Projetos (RF-07): só trabalho próprio ou público, feito fora do emprego.
 * Textos nos dois idiomas; links vazios não aparecem.
 */
export interface Project {
  name: string;
  summary: Record<Lang, string>;
  tags: string[];
  repo?: string;
  url?: string;
  featured?: boolean;
}

export const PROJECTS: Project[] = [
  {
    name: 'datan.com.br',
    summary: {
      en: 'This site: a static Astro blog with EN/PT-BR routes, RSS and JSON feeds, and a build pipeline that turns one YAML file per campaign into CSV, plain lists and STIX 2.1, with CI checks for IoC format, TLP and confidentiality.',
      'pt-br':
        'Este site: blog estático em Astro com rotas EN/PT-BR, feeds RSS e JSON e um pipeline de build que transforma um YAML por campanha em CSV, listas simples e STIX 2.1, com checagens de CI de formato de IoC, TLP e confidencialidade.',
    },
    tags: ['astro', 'stix', 'cloudflare-workers', 'ci'],
    repo: 'https://github.com/dathannobrega/CTIFeeds',
    url: 'https://www.datan.com.br',
    featured: true,
  },
  {
    name: 'IOC feed aggregator',
    summary: {
      en: 'Flask + PostgreSQL service that downloads public URL, domain and IPv4 feeds, normalises and validates them, applies an exclusion list and publishes cached blocklists. Kept in tools/ioc-feed-aggregator.',
      'pt-br':
        'Serviço em Flask + PostgreSQL que baixa feeds públicos de URLs, domínios e IPv4, normaliza e valida os valores, aplica uma lista de exclusão e publica blocklists em cache. Mantido em tools/ioc-feed-aggregator.',
    },
    tags: ['python', 'flask', 'threat-intel', 'docker'],
    repo: 'https://github.com/dathannobrega/CTIFeeds/tree/main/tools/ioc-feed-aggregator',
    featured: true,
  },
];
