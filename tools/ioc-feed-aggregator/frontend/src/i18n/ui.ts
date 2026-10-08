import type { Lang } from './routes.ts';

/** Textos de interface compartilhados entre páginas (o conteúdo longo fica em cada view). */
const UI = {
  pt: {
    skip: 'Pular para o conteúdo',
    'nav.label': 'Navegação principal',
    'nav.feeds': 'Feeds',
    'nav.lookup': 'Consulta',
    'nav.sources': 'Fontes',
    'nav.integrations': 'Integrações',
    'nav.docs': 'API',
    'lang.switch': 'Read in English',
    'lang.short': 'EN',
    'theme.toggle': 'Alternar tema claro/escuro',
    'theme.light': 'Claro',
    'theme.dark': 'Escuro',
    'status.label': 'Estado do serviço',
    'status.loading': 'conectando à API…',
    'status.offline': 'API indisponível — os arquivos de feed continuam no ar',
    'status.collected': 'coleta',
    'status.indicators': 'indicadores',
    'status.sources': 'fontes ok',
    'status.next': 'próxima',
    'status.edition': 'edição',
    'type.url': 'URL',
    'type.domain': 'Domínio',
    'type.ipv4': 'IPv4',
    'type.url.plural': 'URLs',
    'type.domain.plural': 'Domínios',
    'type.ipv4.plural': 'Endereços IPv4',
    'action.copy': 'Copiar',
    'action.copied': 'Copiado',
    'action.download': 'Baixar',
    'footer.service': 'Serviço',
    'footer.data': 'Dados',
    'footer.project': 'Projeto',
    'footer.checksums': 'Checksums SHA-256',
    'footer.health': 'Saúde da API',
    'footer.source': 'Código-fonte',
    'footer.report': 'Reportar falso positivo',
    'footer.console': 'Console',
    'footer.colophon':
      'Sem cookies, sem rastreadores, sem scripts de terceiros. Tipografia: Archivo e Martian Mono, servidas daqui mesmo.',
    'footer.disclaimer':
      'Os feeds agregam fontes públicas e são fornecidos como estão. Valide antes de bloquear em produção.',
    'breadcrumb.home': 'Início',
  },
  en: {
    skip: 'Skip to content',
    'nav.label': 'Main navigation',
    'nav.feeds': 'Feeds',
    'nav.lookup': 'Lookup',
    'nav.sources': 'Sources',
    'nav.integrations': 'Integrations',
    'nav.docs': 'API',
    'lang.switch': 'Ler em português',
    'lang.short': 'PT',
    'theme.toggle': 'Toggle light/dark theme',
    'theme.light': 'Light',
    'theme.dark': 'Dark',
    'status.label': 'Service status',
    'status.loading': 'connecting to the API…',
    'status.offline': 'API unavailable — feed files are still being served',
    'status.collected': 'collected',
    'status.indicators': 'indicators',
    'status.sources': 'sources ok',
    'status.next': 'next',
    'status.edition': 'edition',
    'type.url': 'URL',
    'type.domain': 'Domain',
    'type.ipv4': 'IPv4',
    'type.url.plural': 'URLs',
    'type.domain.plural': 'Domains',
    'type.ipv4.plural': 'IPv4 addresses',
    'action.copy': 'Copy',
    'action.copied': 'Copied',
    'action.download': 'Download',
    'footer.service': 'Service',
    'footer.data': 'Data',
    'footer.project': 'Project',
    'footer.checksums': 'SHA-256 checksums',
    'footer.health': 'API health',
    'footer.source': 'Source code',
    'footer.report': 'Report a false positive',
    'footer.console': 'Console',
    'footer.colophon':
      'No cookies, no trackers, no third-party scripts. Set in Archivo and Martian Mono, served from this very host.',
    'footer.disclaimer':
      'Feeds aggregate public sources and are provided as is. Validate before blocking in production.',
    'breadcrumb.home': 'Home',
  },
} as const;

export type UiKey = keyof (typeof UI)['pt'];

export function t(lang: Lang, key: UiKey): string {
  return UI[lang][key];
}

/** Textos usados pelos scripts do navegador (vão num bloco JSON na página). */
export function clientStrings(lang: Lang) {
  return lang === 'pt'
    ? {
        copy: 'Copiar',
        copied: 'Copiado',
        offline: UI.pt['status.offline'],
        never: 'ainda não coletado',
        types: { url: 'URL', domain: 'DOM', ipv4: 'IPv4' },
        typeNames: { url: 'URL', domain: 'domínio', ipv4: 'IPv4' },
        theme: { light: UI.pt['theme.light'], dark: UI.pt['theme.dark'] },
      }
    : {
        copy: 'Copy',
        copied: 'Copied',
        offline: UI.en['status.offline'],
        never: 'not collected yet',
        types: { url: 'URL', domain: 'DOM', ipv4: 'IPv4' },
        typeNames: { url: 'URL', domain: 'domain', ipv4: 'IPv4' },
        theme: { light: UI.en['theme.light'], dark: UI.en['theme.dark'] },
      };
}

export type ClientStrings = ReturnType<typeof clientStrings>;
