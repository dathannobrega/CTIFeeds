/**
 * Dados globais do serviço. A URL pública vem de SITE_URL no build (Dockerfile/compose).
 */
export const SITE = {
  name: 'Segark CTI',
  /** Wordmark: o próprio nome em notação "defang", como um IoC num relatório. */
  wordmark: { left: 'cti', right: 'segark' },
  org: 'Segark',
  repo: 'https://github.com/dathannobrega/CTIFeeds',
  issues: 'https://github.com/dathannobrega/CTIFeeds/issues',
  /** Intervalo de coleta exibido nos textos estáticos (o valor real vem da API). */
  refreshMinutes: 60,
} as const;

export const FEED_PATHS = {
  url: '/feeds/urls.txt',
  domain: '/feeds/domains.txt',
  ipv4: '/feeds/ipv4.txt',
} as const;

export type IndicatorType = keyof typeof FEED_PATHS;
export const INDICATOR_TYPES: IndicatorType[] = ['url', 'domain', 'ipv4'];
