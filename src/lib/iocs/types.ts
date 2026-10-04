/** Níveis TLP 2.0 (FIRST). Só CLEAR é publicável neste site. */
export const TLP_LEVELS = ['CLEAR', 'GREEN', 'AMBER', 'AMBER+STRICT', 'RED'] as const;
export type Tlp = (typeof TLP_LEVELS)[number];

export const IOC_TYPES = ['ipv4', 'ipv6', 'domain', 'url', 'email', 'md5', 'sha1', 'sha256'] as const;
export type IocType = (typeof IOC_TYPES)[number];

export const CONFIDENCE_LEVELS = ['high', 'medium', 'low'] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export interface Ioc {
  type: IocType;
  /** Valor bruto, normalizado (nunca defanged nos arquivos de dados). */
  value: string;
  confidence: Confidence;
  first_seen: string;
  last_seen?: string;
  /** Fonte da observação; herda `campaign.source` se omitido. */
  source: string;
  comment?: string;
}

export interface AttackTechnique {
  id: string;
  name?: string;
}

export interface Campaign {
  id: string;
  title: string;
  /** Título em português, opcional; cai para `title` se ausente. */
  title_pt?: string;
  description?: string;
  tlp: 'CLEAR';
  first_seen: string;
  last_seen: string;
  source: string;
  attack: AttackTechnique[];
  malware: { name: string; is_family: boolean }[];
  /** Caminho do post que descreve a campanha, ex.: /en/research/<slug>/ */
  post: string;
  iocs: Ioc[];
}
