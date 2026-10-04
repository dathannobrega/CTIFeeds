import { LANGS, type Lang } from './config.ts';

/**
 * Mapa único de rotas localizadas. Cada página existe sob o prefixo do idioma
 * (`/en/`, `/pt-br/`) e pode ter segmentos traduzidos (research → pesquisa).
 *
 * Este módulo não importa nada do Astro para poder ser usado pelos scripts de
 * validação em Node puro.
 */
export const ROUTES = {
  home: { en: '/en/', 'pt-br': '/pt-br/' },
  about: { en: '/en/about/', 'pt-br': '/pt-br/sobre/' },
  projects: { en: '/en/projects/', 'pt-br': '/pt-br/projetos/' },
  resume: { en: '/en/resume/', 'pt-br': '/pt-br/curriculo/' },
  contact: { en: '/en/contact/', 'pt-br': '/pt-br/contato/' },
  research: { en: '/en/research/', 'pt-br': '/pt-br/pesquisa/' },
  walkthroughs: { en: '/en/walkthroughs/', 'pt-br': '/pt-br/walkthroughs/' },
  notes: { en: '/en/notes/', 'pt-br': '/pt-br/notas/' },
  tags: { en: '/en/tags/', 'pt-br': '/pt-br/tags/' },
  campaigns: { en: '/en/campaigns/', 'pt-br': '/pt-br/campanhas/' },
  search: { en: '/en/search/', 'pt-br': '/pt-br/busca/' },
  rss: { en: '/en/rss.xml', 'pt-br': '/pt-br/rss.xml' },
  jsonFeed: { en: '/en/feed.json', 'pt-br': '/pt-br/feed.json' },
} as const satisfies Record<string, Record<Lang, string>>;

export type RouteKey = keyof typeof ROUTES;

export const POST_COLLECTIONS = ['research', 'walkthroughs', 'notes'] as const;
export type PostCollection = (typeof POST_COLLECTIONS)[number];

export function routePath(key: RouteKey, lang: Lang): string {
  return ROUTES[key][lang];
}

export function postPath(collection: PostCollection, lang: Lang, slug: string): string {
  return `${ROUTES[collection][lang]}${slug}/`;
}

/** Slug de tag seguro para URL: minúsculas, sem pontos (T1021.004 → t1021-004). */
export function tagSlug(tag: string): string {
  return tag
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function tagPath(lang: Lang, tag: string): string {
  return `${ROUTES.tags[lang]}${tagSlug(tag)}/`;
}

/** Converte `/en/research/<slug>/` de volta em coleção, idioma e slug. */
export function parsePostPath(
  path: string,
): { collection: PostCollection; lang: Lang; slug: string } | null {
  for (const collection of POST_COLLECTIONS) {
    for (const lang of LANGS) {
      const prefix = ROUTES[collection][lang];
      if (path.startsWith(prefix)) {
        const slug = path.slice(prefix.length).replace(/\/$/, '');
        if (/^[a-z0-9][a-z0-9-]*$/.test(slug)) return { collection, lang, slug };
      }
    }
  }
  return null;
}

/** Versões EN e PT-BR de uma página fixa, para hreflang e seletor de idioma. */
export function routeAlternates(key: RouteKey): { lang: Lang; path: string }[] {
  return LANGS.map((lang) => ({ lang, path: ROUTES[key][lang] }));
}
