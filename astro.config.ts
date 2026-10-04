import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { SITE } from './src/site.config.ts';

// https://docs.astro.build/en/reference/configuration-reference/
export default defineConfig({
  site: SITE.url,
  trailingSlash: 'always',
  build: {
    format: 'directory',
    // CSP sem 'unsafe-inline': todo CSS vai para arquivos em /_astro/.
    inlineStylesheets: 'never',
  },
  i18n: {
    locales: ['en', 'pt-br'],
    defaultLocale: 'en',
    routing: {
      // Inglês também com prefixo (/en/); a raiz é a página de escolha de idioma.
      prefixDefaultLocale: true,
      redirectToDefaultLocale: false,
    },
  },
  markdown: {
    // Prism gera classes CSS (não atributos style inline), compatível com a CSP.
    syntaxHighlight: 'prism',
  },
  integrations: [
    mdx(),
    sitemap({
      // hreflang vai nas tags <link> do <head>, não no sitemap (um método só).
      filter: (page) => !page.endsWith('/404/') && !/\/(search|busca)\/$/.test(page),
    }),
  ],
  vite: {
    build: {
      // Nunca embutir JS/CSS como data: URI ou inline (CSP restrita).
      assetsInlineLimit: 0,
    },
  },
});
