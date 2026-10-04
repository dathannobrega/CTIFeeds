import { isIPv4, isIPv6 } from 'node:net';
import type { IocType } from './types.ts';

const DOMAIN_LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const TLD = /^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/;
const HEX = { md5: 32, sha1: 40, sha256: 64 } as const;

export function isValidDomain(value: string): boolean {
  if (value.length > 253 || value !== value.toLowerCase()) return false;
  const labels = value.split('.');
  if (labels.length < 2) return false;
  const tld = labels[labels.length - 1] ?? '';
  return labels.every((l) => DOMAIN_LABEL.test(l)) && TLD.test(tld);
}

function isValidUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (!['http:', 'https:', 'ftp:'].includes(parsed.protocol)) return false;
  const host = parsed.hostname.replace(/^\[|\]$/g, '');
  return isValidDomain(host) || isIPv4(host) || isIPv6(host);
}

function isValidEmail(value: string): boolean {
  const at = value.lastIndexOf('@');
  if (at < 1) return false;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}$/i.test(local) && isValidDomain(domain);
}

/** Marcas de defang que nunca devem aparecer nos arquivos de dados. */
const DEFANG_MARKERS = /\[\.\]|\[:\]|\[@\]|\(\.\)|\[dot\]|^hxxps?:/i;

/**
 * Normaliza um IoC (minúsculas para hashes/domínios, IPv4 canônico) e
 * retorna a mensagem de erro se o valor não bater com o tipo.
 */
export function normaliseIoc(
  type: IocType,
  raw: string,
): { value: string; error?: undefined } | { value?: undefined; error: string } {
  const value = raw.trim();
  if (!value) return { error: 'valor vazio' };
  if (DEFANG_MARKERS.test(value)) {
    return { error: `"${value}" está defanged; arquivos de dados guardam o valor bruto` };
  }
  switch (type) {
    case 'ipv4':
      return isIPv4(value) && !/(^|\.)0\d/.test(value)
        ? { value }
        : { error: `"${value}" não é um IPv4 válido` };
    case 'ipv6':
      return isIPv6(value) ? { value: value.toLowerCase() } : { error: `"${value}" não é um IPv6 válido` };
    case 'domain': {
      const v = value.toLowerCase().replace(/\.$/, '');
      return isValidDomain(v) ? { value: v } : { error: `"${value}" não é um domínio válido` };
    }
    case 'url':
      return isValidUrl(value) ? { value } : { error: `"${value}" não é uma URL http(s)/ftp válida` };
    case 'email': {
      const v = value.toLowerCase();
      return isValidEmail(v) ? { value: v } : { error: `"${value}" não é um e-mail válido` };
    }
    case 'md5':
    case 'sha1':
    case 'sha256': {
      const v = value.toLowerCase();
      return new RegExp(`^[a-f0-9]{${HEX[type]}}$`).test(v)
        ? { value: v }
        : { error: `"${value}" não é um hash ${type.toUpperCase()} válido` };
    }
  }
}

/** Data ISO `AAAA-MM-DD` que existe no calendário. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
