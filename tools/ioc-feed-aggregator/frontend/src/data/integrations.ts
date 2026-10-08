import type { Lang } from '../i18n/routes.ts';
import type { IndicatorType } from '../site.ts';

/**
 * Guias de integração. `{SITE}` nos blocos de código vira a URL pública do serviço.
 * Texto com `crases` vira <code> e **asteriscos** vira <strong> (ver lib/rich.ts).
 */
export interface Integration {
  slug: string;
  name: string;
  vendor: string;
  feeds: IndicatorType[];
  mechanism: Record<Lang, string>;
  title: Record<Lang, string>;
  description: Record<Lang, string>;
  intro: Record<Lang, string>;
  steps: Record<Lang, string[]>;
  code: { label: Record<Lang, string>; lang: string; body: string }[];
  notes: Record<Lang, string[]>;
}

export const INTEGRATIONS: Integration[] = [
  {
    slug: 'fortigate',
    name: 'FortiGate',
    vendor: 'Fortinet FortiOS',
    feeds: ['ipv4', 'domain', 'url'],
    mechanism: { pt: 'Threat Feeds (External Connectors)', en: 'Threat Feeds (External Connectors)' },
    title: {
      pt: 'Bloquear IoCs no FortiGate com Threat Feeds',
      en: 'Block IoCs on FortiGate with Threat Feeds',
    },
    description: {
      pt: 'Passo a passo para consumir os feeds de IPv4, domínios e URLs no FortiGate (FortiOS) como External Block List, com exemplo de CLI e política de firewall.',
      en: 'Step-by-step guide to consume the IPv4, domain and URL feeds on FortiGate (FortiOS) as an External Block List, with CLI and firewall policy examples.',
    },
    intro: {
      pt: 'O FortiOS baixa listas externas em texto puro e as transforma em objetos de endereço, categorias de DNS Filter e categorias de Web Filter. Os três feeds encaixam direto, sem conversão.',
      en: 'FortiOS downloads plain-text external lists and turns them into address objects, DNS Filter categories and Web Filter categories. All three feeds plug in directly, no conversion needed.',
    },
    steps: {
      pt: [
        'Em **Security Fabric › External Connectors**, clique em **Create New** e escolha **Threat Feeds › IP Address**.',
        'Nome `segark-ipv4`, URI `{SITE}/feeds/ipv4.txt`, **Refresh Rate** de 60 minutos. Não há autenticação.',
        'Repita com **Domain Name** apontando para `domains.txt` e com **FortiGuard Category** apontando para `urls.txt`.',
        'Use `segark-ipv4` como destino numa política de firewall com ação **DENY**, o conector de domínios num perfil de **DNS Filter** e o de URLs num perfil de **Web Filter**, ambos com ação **Block**.',
        'Abra o conector e confira **View Entries**: a contagem deve bater com a da página de feeds.',
      ],
      en: [
        'Go to **Security Fabric › External Connectors**, click **Create New** and pick **Threat Feeds › IP Address**.',
        'Name it `segark-ipv4`, URI `{SITE}/feeds/ipv4.txt`, **Refresh Rate** 60 minutes. No authentication is required.',
        'Repeat with **Domain Name** pointing to `domains.txt` and **FortiGuard Category** pointing to `urls.txt`.',
        'Use `segark-ipv4` as the destination of a firewall policy with action **DENY**, the domain connector in a **DNS Filter** profile and the URL connector in a **Web Filter** profile, both set to **Block**.',
        'Open the connector and check **View Entries**: the count should match the feeds page.',
      ],
    },
    code: [
      {
        label: { pt: 'CLI do FortiOS: conectores', en: 'FortiOS CLI: connectors' },
        lang: 'fortios',
        body: `config system external-resource
    edit "segark-ipv4"
        set type address
        set resource "{SITE}/feeds/ipv4.txt"
        set refresh-rate 60
    next
    edit "segark-domains"
        set type domain
        set category 192
        set resource "{SITE}/feeds/domains.txt"
        set refresh-rate 60
    next
    edit "segark-urls"
        set type category
        set category 193
        set resource "{SITE}/feeds/urls.txt"
        set refresh-rate 60
    next
end`,
      },
      {
        label: { pt: 'Política bloqueando o tráfego de saída', en: 'Policy blocking outbound traffic' },
        lang: 'fortios',
        body: `config firewall policy
    edit 0
        set name "block-segark-ipv4"
        set srcintf "internal"
        set dstintf "wan1"
        set srcaddr "all"
        set dstaddr "segark-ipv4"
        set action deny
        set schedule "always"
        set service "ALL"
        set logtraffic all
    next
end`,
      },
    ],
    notes: {
      pt: [
        'Coloque a política de bloqueio acima das políticas de saída liberadas: o FortiOS avalia de cima para baixo.',
        'Linhas que o FortiOS não reconhece são ignoradas e aparecem como inválidas em **View Entries**.',
        'Um refresh menor que 60 minutos não traz dados mais novos: a coleta acontece de hora em hora.',
      ],
      en: [
        'Place the block policy above the permissive outbound policies: FortiOS evaluates top to bottom.',
        'Lines FortiOS does not recognise are skipped and shown as invalid under **View Entries**.',
        'A refresh shorter than 60 minutes brings no fresher data: collection runs hourly.',
      ],
    },
  },
  {
    slug: 'palo-alto',
    name: 'Palo Alto Networks',
    vendor: 'PAN-OS',
    feeds: ['ipv4', 'domain', 'url'],
    mechanism: { pt: 'External Dynamic Lists (EDL)', en: 'External Dynamic Lists (EDL)' },
    title: {
      pt: 'Feeds de IoC como External Dynamic List no Palo Alto (PAN-OS)',
      en: 'IoC feeds as External Dynamic Lists on Palo Alto (PAN-OS)',
    },
    description: {
      pt: 'Configure os feeds de IPv4, domínios e URLs como External Dynamic Lists (EDL) no PAN-OS e use-os em políticas de segurança, Anti-Spyware e URL Filtering.',
      en: 'Configure the IPv4, domain and URL feeds as External Dynamic Lists (EDL) on PAN-OS and use them in security policies, Anti-Spyware and URL Filtering.',
    },
    intro: {
      pt: 'EDLs são o caminho nativo do PAN-OS para listas externas. O firewall busca o arquivo no intervalo escolhido e atualiza a política sem commit.',
      en: 'EDLs are the native PAN-OS way to consume external lists. The firewall fetches the file on the chosen schedule and updates policy without a commit.',
    },
    steps: {
      pt: [
        'Em **Objects › External Dynamic Lists**, clique em **Add**.',
        'Nome `segark-ipv4`, **Type: IP List**, **Source** `{SITE}/feeds/ipv4.txt`, **Check for updates: Hourly**.',
        'Crie `segark-domains` com **Type: Domain List** (`domains.txt`) e `segark-urls` com **Type: URL List** (`urls.txt`).',
        'Use a lista de IPs como origem ou destino de uma regra de segurança com ação **Drop**; a de domínios no perfil **Anti-Spyware** (DNS policies); a de URLs num perfil de **URL Filtering** com ação **block**.',
        'Faça o commit uma vez. Depois disso o firewall atualiza as listas sozinho.',
      ],
      en: [
        'In **Objects › External Dynamic Lists**, click **Add**.',
        'Name `segark-ipv4`, **Type: IP List**, **Source** `{SITE}/feeds/ipv4.txt`, **Check for updates: Hourly**.',
        'Create `segark-domains` with **Type: Domain List** (`domains.txt`) and `segark-urls` with **Type: URL List** (`urls.txt`).',
        'Use the IP list as source or destination of a security rule with action **Drop**; the domain list in an **Anti-Spyware** profile (DNS policies); the URL list in a **URL Filtering** profile set to **block**.',
        'Commit once. From then on the firewall refreshes the lists by itself.',
      ],
    },
    code: [
      {
        label: { pt: 'Forçar atualização e conferir (modo operacional)', en: 'Force a refresh and verify (operational mode)' },
        lang: 'panos',
        body: `request system external-list refresh type ip name segark-ipv4
request system external-list show type ip name segark-ipv4`,
      },
    ],
    notes: {
      pt: [
        'O PAN-OS valida cada linha. Entradas recusadas aparecem em **List Entries and Exceptions** do objeto EDL.',
        'Verifique o limite de entradas por EDL do seu modelo antes de usar listas grandes de URLs.',
      ],
      en: [
        'PAN-OS validates every line. Rejected entries show up under **List Entries and Exceptions** on the EDL object.',
        'Check your model’s per-EDL entry limit before using large URL lists.',
      ],
    },
  },
  {
    slug: 'pfsense',
    name: 'pfSense',
    vendor: 'Netgate pfSense + pfBlockerNG',
    feeds: ['ipv4', 'domain'],
    mechanism: { pt: 'pfBlockerNG (IPv4 e DNSBL)', en: 'pfBlockerNG (IPv4 and DNSBL)' },
    title: {
      pt: 'Blocklist de IPs e domínios no pfSense com pfBlockerNG',
      en: 'IP and domain blocklists on pfSense with pfBlockerNG',
    },
    description: {
      pt: 'Como adicionar os feeds de IPv4 e domínios ao pfBlockerNG no pfSense, com atualização a cada hora e bloqueio de entrada e saída.',
      en: 'How to add the IPv4 and domain feeds to pfBlockerNG on pfSense, with hourly updates and inbound/outbound blocking.',
    },
    intro: {
      pt: 'O pfBlockerNG transforma listas de IP em aliases com regras automáticas e listas de domínios em zonas do Unbound (DNSBL).',
      en: 'pfBlockerNG turns IP lists into aliases with automatic rules and domain lists into Unbound zones (DNSBL).',
    },
    steps: {
      pt: [
        'Instale o pacote **pfBlockerNG** em **System › Package Manager**, se ainda não tiver.',
        'Em **Firewall › pfBlockerNG › IP › IPv4**, clique em **Add**. Nome `Segark`, e em **IPv4 Source Definitions** use **Format: Auto**, **State: ON**, **Source** `{SITE}/feeds/ipv4.txt` e **Header** `segark_ipv4`.',
        '**List Action: Deny Both** e **Update Frequency: Every hour**. Salve.',
        'Para domínios, em **Firewall › pfBlockerNG › DNSBL › DNSBL Groups**, clique em **Add**, use **Source** `{SITE}/feeds/domains.txt`, **Header** `segark_domains` e **List Action: Unbound**.',
        'Em **Firewall › pfBlockerNG › Update**, escolha **Force › Update** e clique em **Run** para a primeira carga.',
      ],
      en: [
        'Install the **pfBlockerNG** package from **System › Package Manager** if you have not yet.',
        'In **Firewall › pfBlockerNG › IP › IPv4**, click **Add**. Name `Segark`, and under **IPv4 Source Definitions** use **Format: Auto**, **State: ON**, **Source** `{SITE}/feeds/ipv4.txt` and **Header** `segark_ipv4`.',
        '**List Action: Deny Both** and **Update Frequency: Every hour**. Save.',
        'For domains, go to **Firewall › pfBlockerNG › DNSBL › DNSBL Groups**, click **Add**, use **Source** `{SITE}/feeds/domains.txt`, **Header** `segark_domains` and **List Action: Unbound**.',
        'In **Firewall › pfBlockerNG › Update**, pick **Force › Update** and click **Run** for the first load.',
      ],
    },
    code: [
      {
        label: { pt: 'Conferir a tabela carregada (shell do pfSense)', en: 'Check the loaded table (pfSense shell)' },
        lang: 'sh',
        body: `pfctl -s Tables | grep -i segark
pfctl -t pfB_Segark_v4 -T show | head`,
      },
    ],
    notes: {
      pt: [
        'O nome da tabela segue o padrão `pfB_<Nome>_v4`; ajuste o comando acima se usar outro nome.',
        'O DNSBL só protege clientes que usam o pfSense como resolvedor DNS.',
      ],
      en: [
        'The table name follows the `pfB_<Name>_v4` pattern; adjust the command above if you picked another name.',
        'DNSBL only protects clients that use pfSense as their DNS resolver.',
      ],
    },
  },
  {
    slug: 'opnsense',
    name: 'OPNsense',
    vendor: 'Deciso OPNsense',
    feeds: ['ipv4', 'domain'],
    mechanism: { pt: 'Aliases URL Table e Unbound Blocklist', en: 'URL Table aliases and Unbound blocklist' },
    title: {
      pt: 'Bloquear IPs e domínios maliciosos no OPNsense',
      en: 'Block malicious IPs and domains on OPNsense',
    },
    description: {
      pt: 'Use o feed de IPv4 como alias do tipo URL Table nas regras do OPNsense e o feed de domínios na blocklist do Unbound DNS.',
      en: 'Use the IPv4 feed as a URL Table alias in OPNsense rules and the domain feed in the Unbound DNS blocklist.',
    },
    intro: {
      pt: 'O OPNsense lê listas remotas nativamente: um alias **URL Table (IPs)** vira uma tabela do pf que as regras podem referenciar.',
      en: 'OPNsense reads remote lists natively: a **URL Table (IPs)** alias becomes a pf table that rules can reference.',
    },
    steps: {
      pt: [
        'Em **Firewall › Aliases**, clique em **+**. Nome `segark_ipv4`, **Type: URL Table (IPs)**, **Refresh Frequency** de 0 dias e 1 hora, **Content** `{SITE}/feeds/ipv4.txt`. Salve e clique em **Apply**.',
        'Em **Firewall › Rules › LAN**, crie uma regra **Block** com destino `segark_ipv4`. Na WAN, uma regra **Block** com origem `segark_ipv4`.',
        'Para domínios, em **Services › Unbound DNS › Blocklist**, ative a blocklist e adicione `{SITE}/feeds/domains.txt` em **URLs of Blocklists**. Aplique.',
      ],
      en: [
        'In **Firewall › Aliases**, click **+**. Name `segark_ipv4`, **Type: URL Table (IPs)**, **Refresh Frequency** 0 days and 1 hour, **Content** `{SITE}/feeds/ipv4.txt`. Save and click **Apply**.',
        'In **Firewall › Rules › LAN**, add a **Block** rule with destination `segark_ipv4`. On WAN, a **Block** rule with source `segark_ipv4`.',
        'For domains, in **Services › Unbound DNS › Blocklist**, enable the blocklist and add `{SITE}/feeds/domains.txt` under **URLs of Blocklists**. Apply.',
      ],
    },
    code: [
      {
        label: { pt: 'Recarregar aliases e conferir (shell)', en: 'Reload aliases and verify (shell)' },
        lang: 'sh',
        body: `configctl filter refresh_aliases
pfctl -t segark_ipv4 -T show | wc -l`,
      },
    ],
    notes: {
      pt: ['Regras são avaliadas na ordem: deixe o bloqueio acima das regras que liberam a saída.'],
      en: ['Rules are evaluated in order: keep the block above the rules that allow outbound traffic.'],
    },
  },
  {
    slug: 'linux-nftables',
    name: 'Linux',
    vendor: 'nftables / ipset + iptables',
    feeds: ['ipv4'],
    mechanism: { pt: 'nftables (set com atualização atômica)', en: 'nftables (atomically updated set)' },
    title: {
      pt: 'Blocklist de IPs no Linux com nftables e cron',
      en: 'IP blocklist on Linux with nftables and cron',
    },
    description: {
      pt: 'Script pronto para carregar o feed de IPv4 num set do nftables com troca atômica, mais a alternativa com ipset e iptables. Atualização por cron.',
      en: 'Ready-made script that loads the IPv4 feed into an nftables set with an atomic swap, plus the ipset and iptables alternative. Updated by cron.',
    },
    intro: {
      pt: 'Um set do nftables aguenta centenas de milhares de endereços com busca em tempo constante. O script baixa o feed, substitui o conteúdo do set numa única transação e não deixa janela sem proteção.',
      en: 'An nftables set holds hundreds of thousands of addresses with constant-time lookups. The script downloads the feed and replaces the set contents in a single transaction, leaving no unprotected window.',
    },
    steps: {
      pt: [
        'Salve o script em `/usr/local/sbin/segark-blocklist.sh` e dê permissão de execução (`chmod 750`).',
        'Rode uma vez como root e confira com `nft list set inet segark blocklist_v4 | head`.',
        'Agende no cron (exemplo abaixo). O script falha sem mexer no set se o download der erro.',
      ],
      en: [
        'Save the script as `/usr/local/sbin/segark-blocklist.sh` and make it executable (`chmod 750`).',
        'Run it once as root and check with `nft list set inet segark blocklist_v4 | head`.',
        'Schedule it with cron (example below). The script exits without touching the set if the download fails.',
      ],
    },
    code: [
      {
        label: { pt: 'segark-blocklist.sh (nftables)', en: 'segark-blocklist.sh (nftables)' },
        lang: 'sh',
        body: `#!/bin/sh
set -eu
FEED="{SITE}/feeds/ipv4.txt"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

curl -fsS --max-time 120 "$FEED" -o "$TMP"
# Keep only IPv4-shaped lines (defence against unexpected content).
grep -E '^([0-9]{1,3}\\.){3}[0-9]{1,3}$' "$TMP" > "$TMP.ok" || true
mv "$TMP.ok" "$TMP"

nft list table inet segark >/dev/null 2>&1 || nft -f - <<'NFT'
table inet segark {
  set blocklist_v4 { type ipv4_addr; flags interval; auto-merge; }
  chain input   { type filter hook input priority -10; policy accept; ip saddr @blocklist_v4 drop; }
  chain forward { type filter hook forward priority -10; policy accept; ip saddr @blocklist_v4 drop; ip daddr @blocklist_v4 drop; }
  chain output  { type filter hook output priority -10; policy accept; ip daddr @blocklist_v4 reject; }
}
NFT

{
  echo "flush set inet segark blocklist_v4"
  if [ -s "$TMP" ]; then
    printf 'add element inet segark blocklist_v4 { %s }\\n' "$(paste -sd, "$TMP")"
  fi
} | nft -f -`,
      },
      {
        label: { pt: '/etc/cron.d/segark-blocklist', en: '/etc/cron.d/segark-blocklist' },
        lang: 'cron',
        body: `17 * * * * root /usr/local/sbin/segark-blocklist.sh`,
      },
      {
        label: { pt: 'Alternativa: ipset + iptables', en: 'Alternative: ipset + iptables' },
        lang: 'sh',
        body: `ipset create segark-v4 hash:ip maxelem 1048576 -exist
ipset create segark-v4-new hash:ip maxelem 1048576 -exist
ipset flush segark-v4-new
curl -fsS "{SITE}/feeds/ipv4.txt" | sed 's/^/add segark-v4-new /' | ipset restore -exist
ipset swap segark-v4-new segark-v4
ipset destroy segark-v4-new
iptables -C INPUT -m set --match-set segark-v4 src -j DROP 2>/dev/null \\
  || iptables -I INPUT -m set --match-set segark-v4 src -j DROP`,
      },
    ],
    notes: {
      pt: [
        'O `flush` e o `add element` vão na mesma chamada do `nft -f`, então são aplicados como uma transação.',
        'Em servidores com Docker, o tráfego dos containers passa pela chain `forward`; ajuste conforme a sua topologia.',
      ],
      en: [
        'The `flush` and `add element` go in the same `nft -f` call, so they apply as one transaction.',
        'On Docker hosts, container traffic goes through the `forward` chain; adapt it to your topology.',
      ],
    },
  },
  {
    slug: 'pihole-adguard',
    name: 'Pi-hole · AdGuard Home',
    vendor: 'Pi-hole, AdGuard Home, Unbound',
    feeds: ['domain'],
    mechanism: { pt: 'Blocklist de DNS (sinkhole)', en: 'DNS blocklist (sinkhole)' },
    title: {
      pt: 'Bloquear domínios maliciosos no Pi-hole, AdGuard Home e Unbound',
      en: 'Block malicious domains in Pi-hole, AdGuard Home and Unbound',
    },
    description: {
      pt: 'Adicione o feed de domínios maliciosos como blocklist no Pi-hole e no AdGuard Home, ou gere zonas do Unbound com um script curto.',
      en: 'Add the malicious domain feed as a blocklist in Pi-hole and AdGuard Home, or generate Unbound zones with a short script.',
    },
    intro: {
      pt: 'O feed de domínios tem um nome por linha, o formato mais simples que resolvedores com bloqueio aceitam. Bloquear no DNS corta o acesso antes mesmo da conexão.',
      en: 'The domain feed has one name per line, the simplest format blocking resolvers accept. Blocking at DNS cuts access before a connection is even attempted.',
    },
    steps: {
      pt: [
        '**Pi-hole:** em **Lists**, cole `{SITE}/feeds/domains.txt` no campo de endereço, adicione um comentário e clique em **Add blocklist**. Depois rode **Tools › Update Gravity** (ou `pihole -g`).',
        '**AdGuard Home:** em **Filters › DNS blocklists**, clique em **Add blocklist › Add a custom list**, dê um nome e cole a mesma URL.',
        '**Unbound:** use o script abaixo para gerar um arquivo de `local-zone` e recarregar o serviço.',
      ],
      en: [
        '**Pi-hole:** under **Lists**, paste `{SITE}/feeds/domains.txt` into the address field, add a comment and click **Add blocklist**. Then run **Tools › Update Gravity** (or `pihole -g`).',
        '**AdGuard Home:** under **Filters › DNS blocklists**, click **Add blocklist › Add a custom list**, give it a name and paste the same URL.',
        '**Unbound:** use the script below to generate a `local-zone` file and reload the service.',
      ],
    },
    code: [
      {
        label: { pt: 'Unbound: gerar zonas a partir do feed', en: 'Unbound: build zones from the feed' },
        lang: 'sh',
        body: `#!/bin/sh
set -eu
OUT=/etc/unbound/unbound.conf.d/segark-blocklist.conf
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

{
  echo "server:"
  curl -fsS --max-time 120 "{SITE}/feeds/domains.txt" \\
    | grep -E '^[a-z0-9._-]+$' \\
    | awk '{ printf "  local-zone: \\"%s.\\" always_nxdomain\\n", $1 }'
} > "$TMP"

install -m 644 "$TMP" "$OUT"
unbound-checkconf && unbound-control reload`,
      },
    ],
    notes: {
      pt: [
        'O filtro `grep` descarta qualquer linha fora do formato de domínio antes de escrever a configuração.',
        'Bloqueio por DNS só vale para clientes que usam esse resolvedor; combine com bloqueio de DNS externo no firewall.',
      ],
      en: [
        'The `grep` filter drops anything that is not domain-shaped before writing the configuration.',
        'DNS blocking only covers clients using that resolver; pair it with blocking outbound DNS at the firewall.',
      ],
    },
  },
];

export function findIntegration(slug: string): Integration | undefined {
  return INTEGRATIONS.find((item) => item.slug === slug);
}
