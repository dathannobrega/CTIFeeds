import type { Lang } from '../i18n/routes.ts';

export interface FaqItem {
  q: string;
  a: string;
}

/** Perguntas frequentes da home (também viram JSON-LD FAQPage). */
export function faq(lang: Lang): FaqItem[] {
  return lang === 'pt'
    ? [
        {
          q: 'O que é um feed de IoC?',
          a: 'É uma lista de indicadores de comprometimento (URLs, domínios e endereços IP ligados a malware, phishing e infraestrutura de ataque) num formato que firewalls, resolvedores DNS e SIEMs importam e bloqueiam automaticamente.',
        },
        {
          q: 'Os feeds são gratuitos? Preciso de cadastro?',
          a: 'São gratuitos e não exigem cadastro nem chave de API. Basta apontar a sua ferramenta para a URL do arquivo de texto.',
        },
        {
          q: 'Com que frequência os dados são atualizados?',
          a: 'As fontes são coletadas a cada hora. Remoções da lista de exclusão entram em vigor na hora, sem esperar a próxima coleta. Configure a sua ferramenta para buscar o arquivo de hora em hora.',
        },
        {
          q: 'De onde vêm os indicadores?',
          a: 'De fontes públicas de inteligência de ameaças. A página de fontes mostra cada uma com estado, contagem e horário da última coleta.',
        },
        {
          q: 'O que acontece se uma fonte sair do ar?',
          a: 'A última cópia válida daquela fonte continua sendo usada e ela aparece como obsoleta na página de fontes. Assim a blocklist não encolhe de repente por uma falha temporária.',
        },
        {
          q: 'E se um indicador for falso positivo?',
          a: 'Confirme pela consulta e abra um relato no repositório do projeto. Depois da revisão, o indicador entra na lista de exclusão e sai de todos os feeds imediatamente.',
        },
        {
          q: 'Posso usar em produção?',
          a: 'Pode, com o cuidado de qualquer lista de terceiros: comece registrando ou bloqueando só o tráfego de saída, acompanhe os logs e depois amplie. Os feeds são fornecidos como estão, sem garantia.',
        },
        {
          q: 'Por que os indicadores aparecem como hxxp e [.] neste site?',
          a: 'É o defang, uma convenção para que indicadores maliciosos não virem links clicáveis. Os arquivos de feed trazem os valores reais, prontos para bloqueio.',
        },
      ]
    : [
        {
          q: 'What is an IoC feed?',
          a: 'It is a list of indicators of compromise (URLs, domains and IP addresses tied to malware, phishing and attack infrastructure) in a format that firewalls, DNS resolvers and SIEMs can import and block automatically.',
        },
        {
          q: 'Are the feeds free? Do I need to sign up?',
          a: 'They are free and need no sign-up or API key. Just point your tool at the text file URL.',
        },
        {
          q: 'How often is the data refreshed?',
          a: 'Sources are collected every hour. Removals from the exclusion list take effect immediately, without waiting for the next collection. Configure your tool to fetch the file hourly.',
        },
        {
          q: 'Where do the indicators come from?',
          a: 'From public threat intelligence sources. The sources page lists each one with its status, count and last collection time.',
        },
        {
          q: 'What happens if a source goes down?',
          a: 'The last valid copy of that source stays in use and it is flagged as stale on the sources page. That way the blocklist does not suddenly shrink because of a temporary failure.',
        },
        {
          q: 'What if an indicator is a false positive?',
          a: 'Confirm it with the lookup and open a report in the project repository. After review, the indicator goes on the exclusion list and leaves every feed immediately.',
        },
        {
          q: 'Can I use it in production?',
          a: 'Yes, with the care you would give any third-party list: start by logging or blocking outbound traffic only, watch the logs, then widen. The feeds are provided as is, without warranty.',
        },
        {
          q: 'Why do indicators show up as hxxp and [.] on this site?',
          a: 'That is defanging, a convention that keeps malicious indicators from becoming clickable links. The feed files carry the real values, ready to block.',
        },
      ];
}
