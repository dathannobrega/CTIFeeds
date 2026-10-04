/**
 * Confere os headers de segurança servidos em produção (RNF-02).
 *
 *   node scripts/check-headers.ts https://www.datan.com.br
 *
 * Roda no workflow "Production headers" depois de cada deploy e diariamente.
 */
const base = (process.argv[2] ?? 'https://www.datan.com.br').replace(/\/$/, '');
const paths = ['/', '/en/', '/pt-br/', '/en/rss.xml'];
const errors: string[] = [];

function expect(path: string, headers: Headers, name: string, test: (value: string) => boolean, hint: string) {
  const value = headers.get(name);
  if (value === null || !test(value)) errors.push(`${path}: ${name} ${value === null ? 'ausente' : `= "${value}"`} (${hint})`);
}

for (const path of paths) {
  const res = await fetch(base + path, { redirect: 'manual' });
  if (res.status !== 200) {
    errors.push(`${path}: status ${res.status}`);
    continue;
  }
  const h = res.headers;
  expect(
    path,
    h,
    'content-security-policy',
    (v) => !/'unsafe-inline'|'unsafe-eval'/.test(v) && /default-src 'self'/.test(v) && /frame-ancestors 'none'/.test(v),
    "restrita, sem 'unsafe-inline'",
  );
  if (base.startsWith('https://')) {
    const maxAge = (v: string) => Number(/max-age=(\d+)/.exec(v)?.[1] ?? 0);
    expect(path, h, 'strict-transport-security', (v) => maxAge(v) >= 31536000, 'max-age ≥ 1 ano');
  }
  expect(path, h, 'x-content-type-options', (v) => v.toLowerCase() === 'nosniff', 'nosniff');
  expect(path, h, 'referrer-policy', (v) => /strict-origin|no-referrer|same-origin/.test(v), 'política restrita');
  expect(path, h, 'x-frame-options', (v) => v.toUpperCase() === 'DENY', 'DENY');
  if (h.get('set-cookie')) errors.push(`${path}: define cookie (RNF-07: sem cookies)`);
}

if (base.startsWith('https://')) {
  const insecure = await fetch(base.replace('https://', 'http://'), { redirect: 'manual' });
  if (insecure.status < 300 || insecure.status >= 400 || !insecure.headers.get('location')?.startsWith('https://')) {
    errors.push(`http:// não redireciona para https:// (status ${insecure.status})`);
  }
}

if (errors.length) {
  console.error(`✗ headers de ${base}:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`✓ headers de segurança ok em ${base} (${paths.length} páginas)`);

export {};
