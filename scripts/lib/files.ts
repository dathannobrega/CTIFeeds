import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from 'yaml';

export const ROOT = process.cwd();

/** Lista arquivos recursivamente (ignora node_modules e pastas ocultas). */
export function walk(dir: string, filter: (path: string) => boolean = () => true): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const name of entries) {
    if (name === 'node_modules' || (name.startsWith('.') && name !== '.well-known')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path, filter));
    else if (filter(path)) out.push(path);
  }
  return out.sort();
}

export function rel(path: string): string {
  return relative(ROOT, path);
}

export interface Frontmatter {
  data: Record<string, unknown>;
  body: string;
  /** Linha (1-based) onde o corpo começa, para mensagens de erro. */
  bodyLine: number;
}

export function parseFrontmatter(source: string): Frontmatter | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) return null;
  const data = parse(match[1] ?? '') as unknown;
  return {
    data: typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {},
    body: source.slice(match[0].length),
    bodyLine: match[0].split('\n').length,
  };
}

/** Linhas de Markdown fora de blocos de código cercados (```). */
export function proseLines(body: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  let fence: string | null = null;
  body.split('\n').forEach((text, index) => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(text)?.[1];
    if (marker) {
      if (fence === null) fence = marker[0]!;
      else if (marker[0] === fence) fence = null;
      return;
    }
    if (fence === null) out.push({ line: index + 1, text });
  });
  return out;
}

export function normaliseText(value: string): string {
  return value.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
