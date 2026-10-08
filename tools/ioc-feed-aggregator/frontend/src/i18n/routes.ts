/**
 * Rotas localizadas. PT-BR na raiz (x-default), inglês em /en/.
 * Usado pelas páginas, pelo hreflang e pelo sitemap (astro.config.ts).
 */
export type Lang = 'pt' | 'en';
export const LANGS: Lang[] = ['pt', 'en'];

export const HTML_LANG: Record<Lang, string> = { pt: 'pt-BR', en: 'en' };
export const OG_LOCALE: Record<Lang, string> = { pt: 'pt_BR', en: 'en_US' };

const ROUTES = {
  home: { pt: '/', en: '/en/' },
  feeds: { pt: '/feeds/', en: '/en/feeds/' },
  lookup: { pt: '/consulta/', en: '/en/lookup/' },
  sources: { pt: '/fontes/', en: '/en/sources/' },
  integrations: { pt: '/integracoes/', en: '/en/integrations/' },
  docs: { pt: '/docs/', en: '/en/docs/' },
  console: { pt: '/console/', en: '/en/console/' },
} as const;

export type RouteKey = keyof typeof ROUTES;

export function routePath(key: RouteKey, lang: Lang): string {
  return ROUTES[key][lang];
}

export function integrationPath(slug: string, lang: Lang): string {
  return `${ROUTES.integrations[lang]}${slug}/`;
}

export function otherLang(lang: Lang): Lang {
  return lang === 'pt' ? 'en' : 'pt';
}

/** Pares [pt, en] de todas as páginas indexáveis (para hreflang no sitemap). */
export function alternatePairs(integrationSlugs: string[]): [string, string][] {
  const pairs: [string, string][] = (Object.keys(ROUTES) as RouteKey[])
    .filter((key) => key !== 'console')
    .map((key) => [ROUTES[key].pt, ROUTES[key].en]);
  for (const slug of integrationSlugs) {
    pairs.push([integrationPath(slug, 'pt'), integrationPath(slug, 'en')]);
  }
  return pairs;
}
