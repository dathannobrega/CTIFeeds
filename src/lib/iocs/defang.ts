import type { IocType } from './types.ts';

/**
 * Defang para exibição no texto (hxxp, [.], [@]), conforme
 * draft-grimminck-safe-ioc-sharing. Arquivos CSV/TXT/STIX mantêm o valor bruto.
 */
export function defang(value: string, type?: IocType): string {
  if (type === 'md5' || type === 'sha1' || type === 'sha256') return value;

  const urlMatch = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)(.*)$/i.exec(value);
  if (urlMatch) {
    const [, scheme = '', authority = '', rest = ''] = urlMatch;
    const safeScheme = scheme.replace(/^http/i, (m) => (m[0] === 'H' ? 'HXXP' : 'hxxp'));
    return `${safeScheme}://${defangHost(authority)}${rest}`;
  }
  return defangHost(value);
}

function defangHost(host: string): string {
  // IPv6 não tem pontos (exceto IPv4 embutido); ':' fica como está.
  return host.replace(/@/g, '[@]').replace(/\./g, '[.]');
}
