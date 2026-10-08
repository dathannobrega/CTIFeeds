import type { APIRoute } from 'astro';

/** robots.txt com a URL do sitemap derivada de SITE_URL. Arquivos de feed ficam fora do índice. */
export const GET: APIRoute = ({ site }) => {
  const sitemap = new URL('/sitemap-index.xml', site).href;
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /console/',
    'Disallow: /en/console/',
    'Disallow: /exclusions',
    'Disallow: /feeds/*.txt$',
    'Disallow: /feeds/SHA256SUMS',
    '',
    `Sitemap: ${sitemap}`,
    '',
  ].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
