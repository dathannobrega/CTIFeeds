/**
 * Formatação mínima para textos dos dicionários: `código` e **negrito**.
 * O texto é escapado antes, então é seguro usar com set:html.
 */
export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function rich(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

/** Remove a formatação (para meta description, JSON-LD etc.). */
export function plain(text: string): string {
  return text.replace(/`([^`]+)`/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1');
}

/** Troca o marcador {SITE} pela origem pública (sem barra final). */
export function withSite(text: string, site: URL | string): string {
  const origin = String(site).replace(/\/$/, '');
  return text.replaceAll('{SITE}', origin);
}
