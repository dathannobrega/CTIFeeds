/**
 * Copia os IoCs gerados no build (dist/iocs) para um clone do repositório público
 * de IoCs (datan-iocs), mantendo LICENSE e README desse repositório.
 *
 *   npm run build && npm run export:iocs -- ../datan-iocs
 *
 * Depois revise o diff, faça commit assinado (git commit -S) e push no datan-iocs.
 */
import { cpSync, existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const target = process.argv[2];
if (!target) {
  console.error('uso: npm run export:iocs -- <caminho do clone do datan-iocs>');
  process.exit(1);
}
const source = resolve('dist/iocs');
const dest = resolve(target);
if (!existsSync(join(source, 'CHECKSUMS.sha256'))) {
  console.error('dist/iocs/CHECKSUMS.sha256 não existe; rode "npm run build" antes');
  process.exit(1);
}
if (!existsSync(join(dest, '.git'))) {
  console.error(`${dest} não é um repositório Git`);
  process.exit(1);
}

// Remove só o que é gerado; dotfiles (.git, .github...) e LICENSE/README/etc. ficam.
const keep = (name: string) => name.startsWith('.') || /^(LICENSE|README|CONTRIBUTING|SECURITY|CHANGELOG)/i.test(name);
for (const name of readdirSync(dest)) {
  if (!keep(name)) rmSync(join(dest, name), { recursive: true, force: true });
}
cpSync(source, dest, { recursive: true });

// Confere os checksums depois da cópia.
const lines = readFileSync(join(dest, 'CHECKSUMS.sha256'), 'utf8').trim().split('\n').filter(Boolean);
for (const line of lines) {
  const [hash, file] = line.split(/\s{2}/);
  const actual = createHash('sha256').update(readFileSync(join(dest, file ?? ''))).digest('hex');
  if (actual !== hash) {
    console.error(`checksum divergente: ${file}`);
    process.exit(1);
  }
}
console.log(`✓ ${lines.length} arquivo(s) exportado(s) para ${dest}; checksums conferidos`);
