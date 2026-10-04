import type { Lang } from '../i18n/config.ts';

/**
 * Currículo (RF-07). Preencha com o seu histórico; seções vazias não aparecem.
 *
 * Confidencialidade: descreva cargos e competências no mesmo nível de detalhe
 * do seu perfil público. Nada de nomes/quantidade de clientes, volumes, SLAs,
 * arquitetura interna ou ferramentas em produção no empregador.
 *
 * PDFs: coloque public/cv/cv-en.pdf e public/cv/cv-pt-br.pdf; o link de
 * download aparece automaticamente quando o arquivo existe.
 */
type Localized = Record<Lang, string>;

export interface ResumeEntry {
  title: Localized;
  org: string;
  period: Localized;
  details?: Localized[];
}

export interface Resume {
  headline: Localized;
  summary: Localized;
  experience: ResumeEntry[];
  education: ResumeEntry[];
  certifications: { name: string; year?: string; url?: string }[];
  skills: { group: Localized; items: string[] }[];
  publications: { title: string; url: string; year?: string }[];
}

export const RESUME: Resume = {
  headline: {
    en: 'Security researcher — threat intelligence, detection engineering and incident response',
    'pt-br': 'Pesquisador de segurança — threat intelligence, engenharia de detecção e resposta a incidentes',
  },
  summary: {
    en: 'I research threats on my own infrastructure (honeypots, labs) and public data, and publish the analysis together with machine-readable IoCs and detection rules.',
    'pt-br':
      'Pesquiso ameaças em infraestrutura própria (honeypots, laboratórios) e dados públicos, e publico a análise junto com IoCs legíveis por máquina e regras de detecção.',
  },
  experience: [],
  education: [],
  certifications: [],
  skills: [
    {
      group: { en: 'Threat intelligence', 'pt-br': 'Threat intelligence' },
      items: ['MITRE ATT&CK', 'STIX 2.1', 'IoC enrichment', 'OSINT'],
    },
    {
      group: { en: 'Detection & response', 'pt-br': 'Detecção e resposta' },
      items: ['Sigma', 'YARA', 'Suricata', 'DFIR'],
    },
    {
      group: { en: 'Engineering', 'pt-br': 'Engenharia' },
      items: ['Python', 'TypeScript', 'Docker', 'CI/CD'],
    },
  ],
  publications: [],
};
