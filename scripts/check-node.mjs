// Roda antes de dev/build/test. Em .mjs puro para funcionar mesmo em Node antigo
// e explicar o problema em vez de falhar com ERR_UNKNOWN_FILE_EXTENSION.
const [major, minor] = process.versions.node.split('.').map(Number);
const ok = major > 22 || (major === 22 && minor >= 18);

if (!ok) {
  console.error(
    [
      `✗ Node ${process.versions.node} não é suportado: este projeto precisa do Node 22.18 ou mais novo`,
      '  (Astro 7 exige 22.12+; os scripts .ts usam o type stripping nativo do Node, estável a partir do 22.18).',
      '',
      '  Com nvm:        nvm install && nvm use        (lê a versão do .nvmrc)',
      '  Debian/Ubuntu:  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs',
      '',
      '  Depois: rm -rf node_modules && npm ci',
    ].join('\n'),
  );
  process.exit(1);
}
