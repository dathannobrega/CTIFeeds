# CTIFeeds — agregador de feeds de IoC (legado)

> Projeto legado, mantido como item de portfólio. Os comandos abaixo devem ser executados
> dentro desta pasta (`tools/ioc-feed-aggregator/`). O site principal está na raiz do repositório.

Projeto de agregação de feeds de Indicadores de Comprometimento (IOCs) construído com Flask, PostgreSQL e Docker Compose.

## Visão geral

O serviço consulta fontes externas configuráveis de URL, domínios e endereços IPv4, armazena uma lista de exclusão no banco de dados e gera arquivos em cache com os indicadores liberados para consumo. Todas as operações de inclusão ou remoção na lista de exclusão disparam uma nova coleta dos feeds.

## Requisitos

- Docker 20.10+
- Docker Compose 1.29+

## Configuração dos feeds

As fontes externas ficam no arquivo `config/feeds.yaml`. Adicione ou remova entradas conforme necessário, separadas por tipo de indicador:

```yaml
urls:
  - https://exemplo.com/feeds/urls.txt
domains:
  - https://exemplo.com/feeds/domains.txt
ipv4:
  - https://exemplo.com/feeds/ipv4.txt
```

Cada feed deve disponibilizar uma lista de indicadores separados por quebra de linha. Linhas em branco ou iniciadas com `#` são ignoradas.

## Executando o projeto

1. Inicie a stack com Docker Compose:

   ```bash
   docker compose up --build
   ```

2. O serviço Flask ficará disponível em `http://localhost:5000`.

3. O diretório `data/` conterá os arquivos de cache `urls.txt`, `domains.txt` e `ipv4.txt` gerados automaticamente após cada atualização dos feeds.

## Endpoints

- `GET /exclusions` – Lista todos os itens na lista de exclusão.
- `POST /exclusions` – Adiciona um novo item na lista de exclusão. Exemplo de payload:

  ```json
  {
    "indicator_type": "ipv4",
    "value": "1.2.3.4"
  }
  ```

- `DELETE /exclusions` – Remove um item da lista de exclusão. Utilize o mesmo formato de payload do endpoint de criação.

Todos os endpoints retornam mensagens claras em caso de erro (por exemplo, indicador inválido ou duplicado).

## Estrutura do projeto

```
app/
  __init__.py           # Fábrica da aplicação Flask e rotas
  config.py             # Carregamento do arquivo de configuração dos feeds
  database.py           # Configuração do SQLAlchemy e sessão
  models/               # Modelos do banco de dados
  repositories.py       # Camada de acesso aos dados
  services/
    feed_service.py     # Agregação, normalização e cache das listas
    validators.py       # Validação de indicadores
config/
  feeds.yaml            # Fonte configurável das listas
Dockerfile
docker-compose.yml
requirements.txt
wsgi.py
```

## Banco de dados

A base PostgreSQL é criada automaticamente com a tabela `exclusions`, que armazena:

- `indicator_type` – Tipo do indicador (`url`, `domain` ou `ipv4`).
- `value` – Indicador propriamente dito.
- `created_at` – Timestamp da inclusão.

Um índice de unicidade garante que não existam itens repetidos na mesma categoria.

## Boas práticas

- Código seguindo PEP 8 e princípios SOLID com separação clara de responsabilidades.
- Uso de repositórios para acesso ao banco de dados e serviços especializados para regras de negócio.
- Cache em disco para reduzir o volume de requisições às fontes externas.

## Desenvolvimento local

Para executar testes de integração manualmente, utilize o comando abaixo com a stack ativa:

```bash
curl -X POST http://localhost:5000/exclusions \
  -H 'Content-Type: application/json' \
  -d '{"indicator_type": "domain", "value": "exemplo.com"}'
```

Após a chamada, observe os arquivos em `data/` para validar a regeneração do cache.
