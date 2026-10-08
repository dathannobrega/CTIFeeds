import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { INTEGRATIONS } from './src/data/integrations.ts';
import { alternatePairs } from './src/i18n/routes.ts';

// URL pública do serviço (canonical, Open Graph, sitemap). Definida no build do Docker.
const SITE_URL = (process.env.SITE_URL || 'https://cti.segark.com').replace(/\/$/, '');

// Mapa caminho → { pt, en } para os links hreflang do sitemap (slugs são localizados).
const alternates = new Map<string, { pt: string; en: string }>();
for (const [pt, en] of alternatePairs(INTEGRATIONS.map((item) => item.slug))) {
  alternates.set(pt, { pt, en });
  alternates.set(en, { pt, en });
}

// https://docs.astro.build/en/reference/configuration-reference/
export default defineConfig({
  site: SITE_URL,
  // No dev, 'always' responderia 404 para /api/... antes do proxy chegar ao Flask.
  trailingSlash: process.argv.includes('dev') ? 'ignore' : 'always',
  build: {
    format: 'directory',
    // CSP sem 'unsafe-inline': todo CSS vai para arquivos em /_astro/.
    inlineStylesheets: 'never',
  },
  integrations: [
    sitemap({
      filter: (page) => !/\/(console|404)\/$/.test(page),
      serialize(item) {
        const path = new URL(item.url).pathname;
        const pair = alternates.get(path);
        if (pair) {
          item.links = [
            { lang: 'pt-BR', url: `${SITE_URL}${pair.pt}` },
            { lang: 'en', url: `${SITE_URL}${pair.en}` },
            { lang: 'x-default', url: `${SITE_URL}${pair.pt}` },
          ];
        }
        item.lastmod = new Date().toISOString();
        return item;
      },
    }),
  ],
  vite: {
    server: {
      // `npm run dev`: encaminha a API e os arquivos de feed para o Flask local.
      proxy: Object.fromEntries(
        ['/api', '/healthz', '/exclusions', '^/feeds/[^/]+\\.txt$', '/feeds/SHA256SUMS'].map((path) => [
          path,
          { target: process.env.API_URL || 'http://127.0.0.1:5000', changeOrigin: false },
        ]),
      ),
    },
    build: {
      // Nunca embutir JS/CSS/fontes como data: URI (CSP restrita e cache melhor).
      assetsInlineLimit: 0,
    },
  },
});
