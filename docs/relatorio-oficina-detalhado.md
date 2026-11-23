# Relatório da oficina

A aba Oficina compartilha o filtro de datas com Financeiro e Produção. A abertura usa o primeiro e o último dia do mês do aparelho do usuário. Há atalhos para este mês e o anterior; o período personalizado admite até 367 dias.

## O que cada período significa

- **Entradas:** data do serviço informada na OS. Registros antigos sem esse campo usam a data da entrada física, com criação como último recurso. Inclui as que depois foram canceladas.
- **Conclusões:** última conclusão registrada de OS atualmente prontas ou entregues. OS devolvidas ao atendimento não contam até serem concluídas novamente.
- **Entregas e cancelamentos:** respectivas datas do evento, independentemente de quando a OS entrou.
- **Etapas, responsáveis em aberto, atrasos, permanência e lista:** situação atual das entradas do período. Não são uma reconstrução histórica do mapa.
- **Pendências anteriores:** OS anteriores ao início do período que ainda estão abertas. Lista e exportação próprias, sem inflar os totais do período.
- **Responsáveis / entregas:** todas as entregas ocorridas no período, agrupadas pelo responsável atualmente salvo. Não é uma medição de horas de trabalho ou atribuição histórica.

Comparação com o intervalo imediatamente anterior de igual número de dias. O mês em curso pode estar incompleto; as datas comparadas ficam visíveis. Datas dos eventos seguem America/Sao_Paulo, como os demais relatórios. O padrão do seletor segue o mês local do usuário.

## Tempos, prazos e paradas

Tempos de conclusão, permanência total e espera pela retirada usam intervalos válidos entre timestamps físicos, em dias corridos. Cada média exibe sua amostra. Datas ausentes ou invertidas ficam fora da média, em vez de virarem zero. O campo manual data do serviço não altera duração.

Pontualidade usa o prazo atualmente salvo e mostra separadamente conclusão e retirada. OS sem promessa ficam fora do percentual e aparecem na contagem de dados ausentes.

Paradas incluem as abertas e resolvidas que se sobrepõem ao intervalo, mesmo em OS anteriores. A duração é recortada no período, até agora, entrega ou cancelamento. Intervalos sobrepostos da mesma OS são unidos antes de somar. A mesma OS pode participar de vários motivos; o somatório de horas por motivo pode exceder o total líquido. Registros demo antigos sem início não ganham datas inventadas.

## Detalhamento e acesso

A RPC `consultar_relatorio_oficina` exige proprietário/gerente e recurso reports. Retorna somente os campos operacionais necessários, da oficina autorizada. Registros arquivados ficam fora. Não retorna telefone, anotações privadas ou valores financeiros.

A agregação compartilhada entre produção e demo fica em `src/lib/relatorioOficina.ts`. A RPC recorta a base para período atual/anterior, eventos relevantes e pendências anteriores. A série diária é construída em uma passagem; datas formatadas são reutilizadas. Os totais não são limitados às linhas visíveis. A UI pagina 20 OS, permite busca e filtros, e abre a ordem correspondente. O CSV inclui todos os detalhes, série diária, tempos, prazos, motivos, equipe e serviços.

Serviços mais realizados contam itens de serviço em OS entregues no período, sem peças e itens cancelados. Várias linhas com a mesma descrição na mesma OS somam quantidades, mas contam uma só OS.

## Validação

`supabase/tests/validate-relatorio-oficina.mjs`: meses e ano bissexto, datas inválidas, períodos vazios e personalizados, fronteira de fuso, clientes particulares, datas independentes, exclusões, reabertura, médias e amostras, pontualidade, paradas sobrepostas/encerradas/canceladas, histórico anterior, responsáveis, itens de serviço, série e CSV com mais de 100 OS e isolamento por oficina/perfil/plano.

Regressões: relatórios operacionais anteriores, ações do mapa e criação de OS pronta. Validação visual com dados fictícios em `output/preview-oficina.html` e teste do filtro na aplicação de demonstração.
