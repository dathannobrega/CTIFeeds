import type { APIRoute } from 'astro';
import { SITE } from '../site.config.ts';

export const GET: APIRoute = () =>
  new Response(['User-agent: *', 'Allow: /', '', `Sitemap: ${SITE.url}/sitemap-index.xml`, ''].join('\n'));
