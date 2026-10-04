/**
 * Dados globais do site. Edite aqui nome, links e perfil público.
 *
 * Regra de confidencialidade: nada de empregador, clientes ou stack interna.
 * Campos vazios ('') simplesmente não aparecem no site.
 */
export const SITE = {
  /** URL canônica (www é o endereço principal; o domínio raiz redireciona para cá). */
  url: 'https://www.datan.com.br',
  name: 'datan.com.br',
  author: {
    name: 'Dathan Nobrega',
    /** Usuário do GitHub (sem @). */
    github: 'dathannobrega',
    /** URL completa do perfil no LinkedIn, se quiser exibir. */
    linkedin: '',
    /** URL completa do perfil no Medium, se quiser exibir. */
    medium: '',
    /**
     * E-mail público de contato. Deixe vazio para não publicar endereço;
     * a página de contato e o security.txt passam a apontar só para a página de contato.
     */
    email: '',
  },
  /** Repositório deste site, usado em links "editar/ver código". */
  repoUrl: 'https://github.com/dathannobrega/CTIFeeds',
} as const;

export type SiteConfig = typeof SITE;
