import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, escapeRegExp, normaliseText } from './files.ts';

/**
 * Termos proibidos (RF-11, RNF-08): nomes de empregador, clientes, produtos
 * internos, hostnames... Três fontes, somadas:
 *
 *  - data/forbidden-terms.txt        versionado; só marcadores genéricos (TLP restritos)
 *  - data/forbidden-terms.local.txt  local, no .gitignore; nomes reais ficam aqui
 *  - FORBIDDEN_TERMS (env)           no CI, um secret do GitHub (um termo por linha)
 *
 * Nomes reais nunca vão para o repositório: o próprio arquivo os revelaria.
 */
export interface ForbiddenTerms {
  terms: string[];
  /** Termos do arquivo versionado (podem aparecer em logs). */
  publicTerms: Set<string>;
  counts: { committed: number; local: number; env: number };
}

function readList(path: string): string[] {
  try {
    return parseList(readFileSync(path, 'utf8'));
  } catch {
    return [];
  }
}

/** Um termo por linha; `#` inicia comentário. No env, vírgula também separa. */
export function parseList(text: string, { commas = false } = {}): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .flatMap((line) => (commas ? line.split(',') : [line]))
    .map((term) => term.trim())
    .filter(Boolean);
}

export function loadForbiddenTerms(): ForbiddenTerms {
  const committed = readList(join(ROOT, 'data/forbidden-terms.txt'));
  const local = readList(join(ROOT, 'data/forbidden-terms.local.txt'));
  const env = parseList(process.env.FORBIDDEN_TERMS ?? '', { commas: true });
  const terms = [...new Set([...committed, ...local, ...env])];
  return {
    terms,
    publicTerms: new Set(committed),
    counts: { committed: committed.length, local: local.length, env: env.length },
  };
}

/** Casa o termo como palavra inteira, ignorando maiúsculas e acentos. */
export function compileTerm(term: string): RegExp {
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(normaliseText(term))}(?=[^a-z0-9]|$)`, 'm');
}

export function findTerms(text: string, compiled: { term: string; re: RegExp }[]): string[] {
  const normalised = normaliseText(text);
  return compiled.filter(({ re }) => re.test(normalised)).map(({ term }) => term);
}
