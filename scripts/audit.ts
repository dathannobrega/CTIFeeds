/**
 * `npm audit` com lista de exceções justificadas e com validade (RNF-04).
 * Falha com vulnerabilidade alta ou crítica que não esteja em audit-allowlist.json,
 * ou cuja exceção tenha expirado.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

interface AllowEntry {
  advisory: string;
  package: string;
  reason: string;
  expires: string;
}
interface Via {
  url?: string;
  severity?: string;
  title?: string;
}
interface Report {
  vulnerabilities?: Record<string, { severity: string; via: (Via | string)[] }>;
}

const allowlist = JSON.parse(readFileSync('audit-allowlist.json', 'utf8')) as AllowEntry[];
const today = new Date().toISOString().slice(0, 10);

let raw: string;
try {
  raw = execFileSync('npm', ['audit', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
} catch (error) {
  // npm audit sai com código != 0 quando há vulnerabilidades; o JSON vem no stdout.
  raw = (error as { stdout?: string }).stdout ?? '';
}
const report = JSON.parse(raw || '{}') as Report;

const failures: string[] = [];
const allowed: string[] = [];
for (const [name, vuln] of Object.entries(report.vulnerabilities ?? {})) {
  for (const via of vuln.via) {
    if (typeof via === 'string') continue; // dependência transitiva; o advisory aparece no pacote de origem
    if (via.severity !== 'high' && via.severity !== 'critical') continue;
    const advisory = via.url?.split('/').pop() ?? '';
    const entry = allowlist.find((a) => a.advisory === advisory && a.package === name);
    if (entry && entry.expires >= today) allowed.push(`${name} ${advisory} (até ${entry.expires}): ${entry.reason}`);
    else if (entry) failures.push(`${name} ${advisory}: exceção expirou em ${entry.expires}; reavalie`);
    else failures.push(`${name} ${advisory} [${via.severity}] ${via.title ?? ''}`);
  }
}

for (const a of allowed) console.log(`exceção: ${a}`);
if (failures.length) {
  console.error(`✗ npm audit: ${failures.length} vulnerabilidade(s) alta(s)/crítica(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('✓ npm audit sem vulnerabilidades altas/críticas fora da lista de exceções');
