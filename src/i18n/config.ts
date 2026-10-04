export const LANGS = ['en', 'pt-br'] as const;
export type Lang = (typeof LANGS)[number];

/** Inglês é o idioma canônico; português é espelhado. */
export const DEFAULT_LANG: Lang = 'en';

/** Valor de `<html lang>` e de `hreflang` (idioma primeiro, região depois). */
export const HTML_LANG: Record<Lang, string> = {
  en: 'en',
  'pt-br': 'pt-BR',
};

export const OG_LOCALE: Record<Lang, string> = {
  en: 'en_US',
  'pt-br': 'pt_BR',
};

export const LANG_NAME: Record<Lang, string> = {
  en: 'English',
  'pt-br': 'Português (Brasil)',
};

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANGS as readonly string[]).includes(value);
}

export function otherLang(lang: Lang): Lang {
  return lang === 'en' ? 'pt-br' : 'en';
}
