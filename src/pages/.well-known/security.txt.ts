import type { APIRoute } from 'astro';
import { existsSync } from 'node:fs';
import { routePath } from '../../i18n/routes.ts';
import { SITE } from '../../site.config.ts';

/** RFC 9116 (RF-20). Expires é recalculado a cada build. */
export const GET: APIRoute = () => {
  const expires = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
  expires.setUTCHours(0, 0, 0, 0);
  const lines = [
    ...(SITE.author.email ? [`Contact: mailto:${SITE.author.email}`] : []),
    `Contact: ${SITE.url}${routePath('contact', 'en')}`,
    `Expires: ${expires.toISOString()}`,
    ...(existsSync('public/pgp-key.asc') ? [`Encryption: ${SITE.url}/pgp-key.asc`] : []),
    'Preferred-Languages: en, pt',
    `Canonical: ${SITE.url}/.well-known/security.txt`,
    '',
  ];
  return new Response(lines.join('\n'));
};
