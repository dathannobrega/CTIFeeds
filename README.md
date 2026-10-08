# datan.com.br — blog e portfólio de pesquisa

Site estático em [Astro](https://astro.build/) com conteúdo em MDX versionado no Git, publicado em
`https://www.datan.com.br`, com rotas por idioma (`/en/` canônico e `/pt-br/` espelhado), feeds RSS e
JSON por idioma e IoCs legíveis por máquina (CSV, listas TXT e STIX 2.1) gerados de uma fonte única.

- Sem banco de dados, login, comentários ou script de terceiros em tempo de execução.
- CSP sem `'unsafe-inline'`, sem cookies, sem fontes externas.
- O build é o único caminho até a produção: valida conteúdo, IoCs, TLP, termos proibidos, EXIF,
  `hreflang`, orçamento de 100 KB por página e vazamento de IoC sem defang.

> O agregador de feeds de IoC fica em [`tools/ioc-feed-aggregator/`](tools/ioc-feed-aggregator/): é um
> serviço independente deste site (API Flask + PostgreSQL + frontend próprio em Astro/nginx), publicado
> em `https://cti.segark.com`, com Docker Compose e CI próprios.

## Começando

Requisitos: **Node 22.18 ou mais novo** (versão fixada em `.nvmrc`) e npm. Node 20 não funciona: o
Astro 7 exige 22.12+ e os scripts `.ts` usam o *type stripping* nativo do Node, estável a partir do
22.18. O `.npmrc` tem `engine-strict=true`, então `npm ci` recusa versões antigas, e `dev`, `build`,
`test` e `new` checam a versão antes de rodar.

```bash
nvm install && nvm use   # lê o .nvmrc
npm ci
npm run dev              # http://localhost:4321 — rascunhos aparecem no modo dev
```

Num servidor Debian/Ubuntu sem nvm:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v                  # v22.18 ou maior
rm -rf node_modules && npm ci && npm run build
```

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor local com recarga automática (mostra rascunhos) |
| `npm run new -- <tipo> <slug>` | Cria post a partir do template (`campaign`, `research`, `walkthrough`, `note`) |
| `npm run validate` | Validação pré-build: IoCs, TLP, termos proibidos, seções, EXIF, traduções |
| `npm test` | Testes unitários (validação de IoC, defang, CSV/STIX, termos, EXIF) |
| `npm run check` | Checagem de tipos (Astro + TypeScript) |
| `npm run build` | `validate` → `astro build` → índice Pagefind → `check-dist` |
| `npm run build:drafts` | Igual, incluindo rascunhos (ex.: prévia local da campanha de exemplo) |
| `npm run preview` | Serve `dist/` com o runtime do Workers (`wrangler dev`), incluindo `_headers` |
| `npm run audit` | `npm audit` com exceções justificadas e com validade (`audit-allowlist.json`) |
| `npm run export:iocs -- ../datan-iocs` | Copia `dist/iocs` para o repositório público de IoCs e confere checksums |

## Publicar um post (passo a passo)

1. Crie uma branch: `git switch -c post/meu-slug`.
2. Gere os arquivos: `npm run new -- research meu-slug` (EN e PT-BR) ou `--lang en` para um idioma só.
   Os arquivos nascem em `src/content/<coleção>/<idioma>/meu-slug.mdx` com `draft: true`.
3. Escreva no idioma em que você expressa melhor a análise. Gere o rascunho do outro idioma (IA, se
   quiser), revise à mão e mantenha o glossário: *threat hunting*, *IoC*, *lateral movement* ficam em
   inglês nos dois idiomas; blocos de código, IoCs, regras e nomes de ferramentas nunca são traduzidos.
   As duas versões compartilham o mesmo `translationKey`. Se só houver uma versão, o site mostra o aviso
   "disponível apenas em…" e não emite `hreflang` para o outro idioma.
4. IoCs no texto: use `<Defang value="evil.example" />` (vira `evil[.]example`). Em blocos de código,
   escreva já defanged (`hxxp://`, `[.]`). O build falha se um IoC de campanha aparecer bruto no HTML.
5. Imagens: coloque junto do post e referencie com texto alternativo (`![descrição](./img.png)`). Remova
   metadados antes (`exiftool -all= img.png`); o build falha se encontrar EXIF/XMP.
6. `npm run dev` para revisar; `npm run build` para rodar todas as checagens.
7. Remova `draft: true`, faça commit e abra o PR. Preencha o checklist de pré-publicação do template do
   PR e revise a prévia (URL postada pelo Workers Builds no PR).
8. Merge na `main` → build → deploy.

Campos do frontmatter (validados por schema em `src/content.config.ts`): `title`, `description`,
`lang`, `translationKey`, `pubDate`, `updatedDate?`, `tags` (kebab-case), `attack` (IDs `T1234` ou
`T1234.001`), `tlp` (só `CLEAR` compila), `draft`, `canonicalUrl?` (só para republicação, ex.: Medium),
`image?` + `imageAlt`. Pesquisa também tem `type: campaign | research` e `campaign` (ID do YAML).

### Post de campanha

`npm run new -- campaign meu-slug` cria os dois posts **e** `data/campaigns/AAAA-MM-meu-slug.yaml`.
O post precisa das seções: resumo executivo, linha do tempo, análise técnica, MITRE ATT&CK,
indicadores de comprometimento, detecções e recomendações (o build confere). Use os componentes:

```mdx
<AttackTable ids={['T1110', 'T1021.004']} />
<CampaignIocs id="2026-10-meu-slug" />
```

Veja o exemplo completo (rascunho, valores fictícios) em
`src/content/research/{en,pt-br}/exemplo-honeypot-ssh.mdx` e
`data/campaigns/2026-10-exemplo-honeypot-ssh.yaml`.

## IoCs: fonte única → CSV, TXT, STIX

Cada campanha é um YAML em `data/campaigns/` (o nome do arquivo é o `id`). É o **único** lugar onde os
indicadores são escritos, sempre com o valor bruto:

```yaml
id: 2026-10-exemplo-honeypot-ssh
title: "Example: SSH brute-force campaign observed on a honeypot"
title_pt: "Exemplo: campanha de força bruta SSH observada em honeypot"   # opcional
tlp: CLEAR                      # qualquer outro valor falha o build
first_seen: 2026-09-01
last_seen: 2026-09-28
source: personal SSH honeypot   # herdado por cada IoC; pode ser sobrescrito por IoC
attack:
  - { id: T1110, name: Brute Force }
post: /en/research/exemplo-honeypot-ssh/
iocs:
  - { type: ipv4, value: 203.0.113.10, confidence: high, first_seen: 2026-09-02 }
  - { type: sha256, value: "…", confidence: low, first_seen: 2026-09-05, comment: "…" }
```

Tipos: `ipv4`, `ipv6`, `domain`, `url`, `email`, `md5`, `sha1`, `sha256`. Confiança: `high`,
`medium`, `low`. Hashes vão entre aspas (o YAML transformaria `0e123…` em número).

Quando o post da campanha está publicado, o build gera:

| Arquivo | Conteúdo |
| --- | --- |
| `/iocs/<id>.csv` | `type,value,first_seen,last_seen,confidence,tlp,campaign,post_url,source` |
| `/iocs/<id>/<tipo>.txt` | Um valor por linha, com cabeçalho `#` |
| `/iocs/<id>.stix.json` | Bundle STIX 2.1: `identity`, `campaign`, `indicator`, `attack-pattern`, `malware`, `relationship`, marcação TLP |
| `/iocs/index.json` | Índice das campanhas publicadas |
| `/iocs/CHECKSUMS.sha256` | SHA-256 de todos os arquivos (formato `sha256sum -c`) |

A geração é determinística (IDs STIX derivados dos dados): mesmo YAML, mesmos bytes, mesmos checksums.
A página `/en/campaigns/` (`/pt-br/campanhas/`) lista período, TLP, links e checksums.

**Repositório público de IoCs** (`datan-iocs`, a criar): depois do build,
`npm run export:iocs -- ../datan-iocs`, revise o diff e faça commit assinado (`git commit -S`). Mantenha
lá um `LICENSE` (ex.: BSD-2-Clause como a ESET, ou CC0) e use issues/PRs para falsos positivos.

## Confidencialidade

- **Termos proibidos**: `data/forbidden-terms.txt` (versionado) só tem marcadores genéricos
  (`TLP:AMBER`, `TLP:RED`…). Nomes de empregador, clientes, produtos e hostnames internos vão em
  `data/forbidden-terms.local.txt` (ignorado pelo Git) e no secret `FORBIDDEN_TERMS` do GitHub Actions
  (um termo por linha). Uma lista versionada num repositório público revelaria exatamente o que se quer
  esconder. Sem termos pessoais configurados, o build avisa.
- **Checklist de pré-publicação** em todo PR (`.github/pull_request_template.md`).
- Ative *secret scanning* e *push protection* no GitHub (Settings → Code security).

## Deploy: Cloudflare Workers (static assets)

O site é só `dist/` servido pelo Workers Static Assets (`wrangler.jsonc`), sem código de Worker.
`public/_headers` define CSP, HSTS, `nosniff`, `Referrer-Policy`, cache longo em `/_astro/*` e CORS
para feeds e IoCs.

1. **Conta e segurança**: ative 2FA no GitHub e no Cloudflare. Tokens de API, se usar, com escopo mínimo
   (Workers Scripts: Edit na conta certa).
2. **Conectar o repositório**: Cloudflare → Workers & Pages → Create → Import a repository. Build command
   `npm run build`, deploy command `npx wrangler deploy`. Em *Branch control*, deixe a `main` como produção
   e ative *preview builds* (comando `npx wrangler preview`): cada PR ganha uma URL de prévia comentada
   no PR. O Workers Builds lê a versão do Node do `.nvmrc`.
3. **Variável no build**: adicione `FORBIDDEN_TERMS` nas variáveis de build do Workers (o build roda
   `npm run validate`).
4. **DNS — cuidado com o e-mail**: um Custom Domain no Workers exige a zona `datan.com.br` ativa no
   Cloudflare (nameservers do Cloudflare). **Antes** de trocar os nameservers, copie para a zona nova
   todos os registros existentes, principalmente **MX, SPF (TXT), DKIM (TXT/CNAME) e DMARC (TXT)**, ou o
   e-mail @datan.com.br para. Compare com `dig MX datan.com.br`, `dig TXT datan.com.br`,
   `dig TXT _dmarc.datan.com.br` antes e depois.
5. **Domínio**: com a zona ativa, descomente `routes` em `wrangler.jsonc`
   (`www.datan.com.br`, `custom_domain: true`). Para o domínio raiz, crie um registro proxied e uma
   *Redirect Rule* `datan.com.br/*` → `https://www.datan.com.br/${1}` (301). Ative *Always Use HTTPS* e
   HSTS na zona.
6. **Headers em produção**: defina a variável de repositório `PRODUCTION_URL=https://www.datan.com.br`
   (Settings → Secrets and variables → Actions → Variables). O workflow *Production headers* passa a
   conferir os headers diariamente (`node scripts/check-headers.ts`).
7. **Rollback** (RNF-09): Workers → Deployments → escolha a versão anterior → *Rollback*, ou
   `npx wrangler rollback`. Teste uma vez antes do lançamento.
8. **Métricas sem cookies** (RNF-07): use as métricas da zona/Workers no painel do Cloudflare. Não ative
   o Web Analytics com beacon JS (é script de terceiro).

Plano B: qualquer host estático serve (`dist/` + regras do `_headers` traduzidas para o provedor).

## Estrutura

```text
src/
  content/                 research/, walkthroughs/, notes/ (en/ e pt-br/) e pages/ (Sobre)
  content.config.ts        schemas do frontmatter (Zod)
  data/                    projects.ts, resume.ts
  i18n/                    idiomas, rotas localizadas e textos de interface
  lib/iocs/                validação, defang, CSV/TXT/STIX (compartilhado com os scripts)
  pages/                   rotas: /, /en/*, /pt-br/*, /iocs/*, feeds, robots, security.txt
  views/ layouts/ components/ styles/
data/campaigns/            fonte única de IoCs (um YAML por campanha)
data/forbidden-terms.txt   marcadores genéricos (nomes reais: arquivo .local ou secret)
scripts/                   validate, check-dist, check-headers, new-post, audit, export-iocs
tests/                     testes unitários (node:test)
public/_headers            CSP e demais headers
wrangler.jsonc             deploy no Workers
tools/ioc-feed-aggregator/ serviço de feeds de IoC (cti.segark.com): API, frontend e compose próprios
```

## O que você precisa preencher

- `src/site.config.ts`: LinkedIn, Medium e e-mail público (vazio = não aparece).
- `src/data/resume.ts`: experiência, formação, certificações. A lista inicial de competências é um
  ponto de partida baseado no plano, **revise**. Coloque os PDFs em `public/cv/cv-en.pdf` e
  `public/cv/cv-pt-br.pdf` (o link aparece sozinho).
- `src/content/pages/{en,pt-br}/about.mdx`: sua bio.
- `public/pgp-key.asc`: chave PGP pública (aparece no Contato e no `security.txt`).
- `data/forbidden-terms.local.txt` e o secret `FORBIDDEN_TERMS`.
- Primeiro post de campanha (o banking trojan do Medium): republique com `canonicalUrl` apontando para o
  original **ou** reescreva como versão estendida, e confirme que os IoCs vêm do seu laboratório ou de
  fontes públicas.

## Status dos requisitos do plano

| Fase | Requisitos | Status |
| --- | --- | --- |
| MVP | RF-01 a RF-14 | Implementados. RF-07 depende dos seus dados (currículo, PDFs); RF-09 depende de ativar preview builds no Cloudflare |
| v1 | RF-15 busca (Pagefind), RF-16 índice de campanhas, RF-17 STIX 2.1, RF-20 `security.txt` | Implementados (chave PGP: adicionar o arquivo) |
| v1 | RF-18 repositórios de detecção, RF-19 imagens | RF-18 pendente (repositório `datan-detections` a criar); RF-19 parcial (pipeline de imagens do Astro + alt obrigatório) |
| v2 | RF-21 | JSON Feed implementado; camada ATT&CK Navigator e feed MISP pendentes |
| v2 | RF-22 newsletter | Pendente |
| RNF | 01–14 | Automatizados no CI: Lighthouse (LCP/CLS/acessibilidade), orçamento de 100 KB, CSP sem inline, `hreflang`, termos proibidos, EXIF, audit, checksums. Manuais: 2FA, Search Console, teste de rollback, commits assinados no `datan-iocs` |
