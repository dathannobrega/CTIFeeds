# Segark CTI — serviço de feeds de IoC

Serviço que agrega fontes públicas de Indicadores de Comprometimento (URLs, domínios e IPv4),
normaliza, valida, remove duplicatas e falsos positivos e publica três blocklists em texto puro.
Roda em produção em <https://cti.segark.com>. É independente do site da raiz do repositório.

```
                 ┌──────────────────────────── docker compose ────────────────────────────┐
 Internet ─TLS─▶ │ frontend (nginx :8080)  ──/api, /healthz, /exclusions──▶  web (gunicorn) │──▶ fontes
 (proxy reverso) │   site estático (Astro)                                    Flask API     │    externas
                 │   /feeds/*.txt ◀── volume cache_data (somente leitura) ◀── coleta/publica │
                 │                                                     db (PostgreSQL 15)  │
                 └─────────────────────────────────────────────────────────────────────────┘
```

- **frontend/**: site em Astro (HTML estático, PT-BR na raiz e inglês em `/en/`) servido por nginx
  sem root. Serve os arquivos de feed direto do volume, então os feeds continuam no ar mesmo com a
  API parada. CSP estrita sem `unsafe-inline`, gzip pré-comprimido, cache imutável em `/_astro/`,
  limite de requisições na API.
- **app/**: API Flask (gunicorn) com coleta periódica, consulta de indicadores, estatísticas,
  estado das fontes e lista de exclusão.
- **db**: PostgreSQL, guarda a lista de exclusão.

## Subir

Requisitos: Docker 20.10+ com Docker Compose v2.

```bash
cd tools/ioc-feed-aggregator
cp .env.example .env        # defina ADMIN_TOKEN (openssl rand -hex 32) e, se quiser, POSTGRES_PASSWORD
docker compose up -d --build
```

O site fica em `http://localhost:5000` (porta configurável por `HTTP_PORT`). Em produção, aponte o
proxy reverso com TLS (Caddy, nginx, Traefik, Cloudflare Tunnel) para essa porta. É a mesma porta
que a API usava antes, então um proxy que já apontava para `:5000` passa a entregar o site inteiro,
e as rotas antigas (`/exclusions`) continuam respondendo.

Exemplo com Caddy no host:

```
cti.segark.com {
    reverse_proxy 127.0.0.1:5000
}
```

### Variáveis (`.env`)

| Variável | Padrão | Uso |
| --- | --- | --- |
| `SITE_URL` | `https://cti.segark.com` | URL pública usada em canonical, Open Graph, sitemap e robots.txt (entra no build do frontend: mudou, rode `docker compose build frontend`) |
| `HTTP_PORT` | `5000` | Porta publicada no host |
| `ADMIN_TOKEN` | vazio | Token exigido para ler e alterar a lista de exclusão. **Defina em produção**: vazio deixa a API de exclusões aberta (o log avisa) |
| `POSTGRES_PASSWORD` | `postgres` | Senha do banco. Em instalação existente, troque também no banco (`ALTER USER`) |
| `REFRESH_INTERVAL_SECONDS` | `3600` | Intervalo da coleta automática; `0` desativa |
| `WEB_CONCURRENCY` | `2` | Workers do gunicorn |
| `API_RATE_LIMIT` / `API_RATE_BURST` | `10r/s` / `40` | Limite por IP no nginx para `/api/` (respostas 429); feeds não entram no limite |

Outras opções da API: `FEED_TIMEOUT_SECONDS` (padrão 30) e `FEED_MAX_BYTES` (64 MB por fonte).

## Fontes

As fontes ficam em `config/feeds.yaml`, montado no container (edite e rode `docker compose restart web`):

```yaml
urls:
  - https://exemplo.com/feeds/urls.txt
domains:
  - https://exemplo.com/feeds/domains.txt
ipv4:
  - https://exemplo.com/feeds/ipv4.txt
```

Cada fonte deve ter um indicador por linha; linhas vazias e iniciadas com `#` são ignoradas.

- A coleta roda a cada `REFRESH_INTERVAL_SECONDS` dentro da API. Com vários workers, só um coleta
  (trava em arquivo no volume).
- Cada fonte guarda a última cópia válida em `data/raw/`. Se ela falhar, a cópia anterior continua
  no feed e a fonte aparece como **obsoleta** em `/fontes/`, em vez de a blocklist encolher de repente.
- A página de fontes e `/api/v1/sources` mostram as URLs **sem query string nem usuário/senha**,
  mas o host e o caminho ficam públicos.
- Para coletar na hora: `docker compose exec web flask refresh-feeds`.

## Arquivos publicados

| Caminho | Conteúdo |
| --- | --- |
| `/feeds/urls.txt`, `/feeds/domains.txt`, `/feeds/ipv4.txt` | Um indicador por linha, ordenado, UTF-8, com quebra de linha final |
| `/feeds/SHA256SUMS` | Checksums no formato `sha256sum -c` |

Servidos pelo nginx com `ETag`/`Last-Modified` (requisições condicionais retornam 304), CORS
liberado e `X-Robots-Tag: noindex`. A gravação é atômica: quem baixa nunca recebe arquivo pela metade.

## API

Referência completa com exemplos em `/docs/` (`/en/docs/`). Resumo:

| Método e rota | Descrição |
| --- | --- |
| `GET /api/v1/stats` | Totais por tipo, metadados dos arquivos, exclusões, saúde das fontes |
| `GET /api/v1/sources` | Resultado da última coleta de cada fonte |
| `GET /api/v1/lookup?value=` | Consulta um indicador (aceita defang: `hxxp://`, `[.]`), com domínio pai e host relacionados |
| `POST /api/v1/lookup` | Consulta em lote: `{"values": [...]}`, até 500 |
| `GET /api/v1/sample?limit=&type=` | Amostra aleatória dos feeds |
| `GET /api/v1/meta` | Versão, limites e se a lista de exclusão exige token |
| `GET /healthz` | 200 com banco acessível, 503 caso contrário |
| `GET/POST/DELETE /api/v1/exclusions` | Lista de exclusão (`Authorization: Bearer $ADMIN_TOKEN` quando definido) |
| `GET/POST/DELETE /exclusions` | Rota legada, mesmo comportamento |

```bash
curl -X POST http://localhost:5000/api/v1/exclusions \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"indicator_type": "domain", "value": "exemplo.com"}'
```

Incluir ou remover uma exclusão republica os três arquivos na hora a partir da última coleta, sem
baixar as fontes de novo. A lista também pode ser gerida pelo navegador em `/console/` (fora do índice
dos buscadores).

## Frontend e SEO

- Páginas: início, feeds, consulta (única e em lote, exporta CSV), fontes, integrações (FortiGate,
  Palo Alto, pfSense, OPNsense, Linux/nftables, Pi-hole/AdGuard/Unbound), documentação da API e console.
- Cada página tem título e descrição próprios, canonical, `hreflang` (pt-BR, en, x-default),
  Open Graph/Twitter com imagem 1200×630, JSON-LD (`WebSite`, `Organization`, `BreadcrumbList`,
  `FAQPage`, `Dataset` com os arquivos de download, `TechArticle`/`HowTo` nas integrações),
  `sitemap-index.xml` com alternates por idioma e `robots.txt` que deixa API, console e arquivos
  brutos fora do índice.
- Indicadores exibidos no site aparecem sempre "defanged" (`hxxp://`, `[.]`), nunca como link.
- Sem cookies, sem scripts de terceiros, fontes servidas localmente (Archivo e Martian Mono).
- `npm run build` roda `scripts/check-dist.mjs`, que falha o build se uma página perder title,
  description, canonical, hreflang, JSON-LD, og:image ou tiver script/estilo inline (CSP).

## Desenvolvimento

API (Python 3.12):

```bash
cd tools/ioc-feed-aggregator
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
python -m pytest                       # testes com SQLite e downloads simulados
DATABASE_URL=sqlite:///dev.db CACHE_DIR=data flask --app wsgi run   # API em :5000
```

Frontend (Node 22.18+):

```bash
npm ci --ignore-scripts                # na raiz do repositório, uma vez (ver nota abaixo)
cd tools/ioc-feed-aggregator/frontend
npm ci
npm run dev                            # http://localhost:4321, encaminha /api e /feeds para :5000
npm run check && npm run build
```

> O Vite 8 também lê o `tsconfig.json` da raiz do repositório, que estende `astro/tsconfigs/strict`;
> sem as dependências da raiz instaladas o build local falha com "Tsconfig not found". O build do
> Docker usa só a pasta `frontend/` e não é afetado. Para apontar o dev server para outra API, use
> `API_URL=http://host:porta npm run dev`.

O CI (`.github/workflows/ioc-feed-aggregator.yml`) roda os testes da API, a checagem de tipos, o
build do frontend com as verificações de SEO/CSP, o build das duas imagens e `nginx -t`.

## Atualizando uma instalação existente

O que muda para quem rodava a versão anterior (um container Flask em `:5000`):

- `docker compose up -d --build` sobe três serviços; só o `frontend` publica porta (`HTTP_PORT`, padrão
  5000). A API deixa de ser exposta diretamente, mas todas as rotas antigas continuam respondendo
  através do nginx.
- A API roda com gunicorn (não mais `flask run`) e como usuário sem privilégios; o entrypoint ajusta o
  dono do volume `cache_data` criado por versões anteriores.
- O código não é mais montado por cima do container (`.:/app`); só `config/` é montado. Mudanças em
  `app/` exigem `docker compose up -d --build`.
- A coleta passa a ser periódica (antes só acontecia no start e a cada mudança na exclusão). Mudanças
  na lista de exclusão republicam na hora sem baixar as fontes.
- Os arquivos de feed passam a terminar com quebra de linha e ganham `SHA256SUMS`.
- Defina `ADMIN_TOKEN`: com ele, `/exclusions` e `/api/v1/exclusions` exigem `Authorization: Bearer`.
