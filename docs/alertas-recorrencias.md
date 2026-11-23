# Alertas da oficina e contas recorrentes

O sininho do header consulta pendências ao entrar no sistema, ao abrir o painel, ao voltar à janela e a cada 60 segundos enquanto a aba está ativa. Alterações integradas ao financeiro invalidam a consulta imediatamente.

## Regras

- Avisos em 5 e 1 dia antes, no vencimento, em 1, 5, 10 e 30 dias de atraso; depois a cada 30 dias (60, 90, 120…).
- Cada pendência tem apenas um aviso no marco atual. Ele permanece entre marcos, mesmo se a oficina não acessar no dia exato. Marcar como lido não quita nem esconde uma pendência; o marco seguinte volta a aparecer como não lido.
- Dias civis e datas de entrega usam America/Sao_Paulo. O sininho usa dias; a OS mantém seu indicador detalhado por horário.
- Contas quitadas ou canceladas e OS entregues, canceladas ou arquivadas deixam de aparecer. Recebimentos provisórios de OS só alertam quando existe vencimento combinado.
- Veículos prontos também aparecem sem data prevista. O link abre a OS; o link financeiro mostra o título exato, independentemente de página, período e filtros anteriores.
- Leituras pertencem ao usuário e à oficina. Colaboradores não recebem dados financeiros. Os recursos respeitam os planos.

## Ações pelo sininho

O título de cada notificação abre suas ações, sem sair da página atual. Contas oferecem "Já paguei"/"Já recebi", pagamento parcial e alteração de vencimento. O formulário registra valor, data, conta, forma e observação usando as mesmas regras e chave de idempotência do financeiro. O saldo é consultado novamente ao abrir; pagamentos parciais mantêm o saldo restante no alerta, e quitação remove a pendência. Comissões direcionam ao módulo próprio para respeitar o valor liberado.

Entregas permitem alterar o prazo e, se a OS estiver pronta e tiver entrada registrada, confirmar a retirada. A confirmação reutiliza a operação de entrega da OS, incluindo revisão concorrente, conferência de itens e paradas, estoque e financeiro. Entregar não registra recebimento automaticamente.

Essa extensão reutiliza os RPCs existentes e a migração de alertas acima; não exige outra migração. Conferência em demonstração: conta de R$ 125,50, pagamento parcial de R$ 50,00, saldo de R$ 75,50 e quitação do restante pelo sininho.

## Cadastro de recorrências

Em Financeiro → Contas recorrentes, cadastrar descrição, pagar/receber, categoria, valor, dia mensal, início e fim opcional. Dias inexistentes usam o último dia do mês, inclusive fevereiro bissexto.

A geração é transacional e executada nas consultas autenticadas ao financeiro/sininho e no salvamento das regras. Cria meses pendentes desde o início até cinco dias à frente, com chave única por recorrência/competência. Não depende de o navegador permanecer aberto: meses passados são recuperados no próximo acesso. Não há envio de e-mail, push, WhatsApp ou pagamento automático.

Editar altera apenas títulos ainda não gerados. Para despesas variáveis, editar o título mensal antes de registrar o pagamento. Pausar preserva títulos existentes; retomar pula meses anteriores ao mês atual que não tenham sido gerados. Títulos já criados, inclusive os próximos cinco dias, devem ser cancelados individualmente se necessário. O início é imutável após o cadastro.

## Implantação

Migração: `supabase/migrations/20261007000300_alertas_recorrencias.sql`.

Aplicada em 07/10/2026 pelo SQL Editor autenticado do projeto `hzihxtjirttetnfdujcx`, depois de confirmar a ausência do módulo e a existência da dependência `consultar_ficha_cliente`. Resultado remoto: sucesso. Não reaplicar. Não usar `db push` indiscriminadamente: o README do banco registra pendência na conciliação do histórico remoto.

Sem a migração, as novas telas informam a atualização pendente, e o financeiro anterior continua consultável. Em demonstração os dados ficam no navegador.

## Verificação

- `node --experimental-strip-types --test scripts/testar-alertas.mjs`
- `node supabase/tests/validate-alertas.mjs` com `DB_VALIDATION_RUNTIME` apontando para `node_modules/@electric-sql/pglite/dist/index.js`.
- A suíte está incluída em `scripts/validar-banco.mjs`.
- Conferência visual local: criar recorrência, abrir sininho, abrir título exato e marcar leitura.

## Dados fictícios para testes — 07/10/2026

População solicitada pelo usuário e aplicada na Oficina do Marcelo (`7d2e8401-b6fc-45b8-9582-e825e7c08681`) e na oficina de validação selecionada na sessão do aplicativo (`01f25297-5779-41b7-8acb-e0138da4c8e8`). Cada oficina recebeu:

- 18 contas manuais: pagar e receber em 5 e 1 dia, hoje e atrasadas em 1, 5, 10, 30, 60 e 90 dias.
- 3 recorrências: água dia 10, impostos dia 20 e equipe dia 5. Na data da execução geraram 2 títulos, totalizando 20 contas por oficina.
- 1 cliente fictício sem contato e 4 veículos/OS: entrega em 5 dias, hoje, atrasada 1 dia e pronto para retirada sem prazo.

Prefixo comum: `[TESTE ALERTAS 07/10]`. Os dados ficam separados por oficina; cadastros anteriores não foram modificados. Esses lançamentos entram nos relatórios do sistema enquanto estiverem ativos.

Scripts: `scripts/popular-alertas-teste.sql` (oficina principal) e `scripts/popular-alertas-validacao.sql` (oficina aberta no aplicativo). IDs e chaves estáveis evitam duplicações na reexecução e preservam testes já pagos/concluídos. `scripts/testar-populacao-alertas.mjs` validou geração e reexecução em banco local isolado antes da aplicação remota.

## Carga mensal — 08/10 a 06/11/2026

Aplicado `scripts/popular-mes-testes.sql` no Supabase em 07/10/2026, nas mesmas duas oficinas. Contagens remotas confirmadas, por oficina:

| Cadastro | Quantidade adicionada |
|---|---:|
| Clientes sem contato real | 15 |
| Veículos e OS, um prazo por dia | 30 |
| Contas manuais | 90 |
| Títulos vinculados às OS | 30 |
| Contas das compras | 4 |
| Parcelas recorrentes já geradas na data da carga | 2 |
| Total de títulos financeiros | 126 |
| Regras recorrentes com fim em 06/11 | 8 |
| Fornecedores | 4 |
| Produtos com saldo de estoque | 12 |
| Compras | 4 |

Prefixo: `[TESTE 30D OUT-NOV/26]`. Os títulos automáticos de OS e compras usam a descrição padrão do sistema e ficam ligados aos cadastros fictícios. Por oficina: 23 registros de pagamento em 07/10 (12 antecipações parciais de contas, 4 quitações antecipadas, 6 sinais de OS e 1 entrada em compra). Não foram criados pagamentos futuros. As OS estão distribuídas entre recebida (7), execução (8), conferência (8) e pronta (7). Nenhuma foi entregue automaticamente.

As contas futuras podem ser consultadas em A pagar e receber → Em aberto, e as quitadas no período correspondente. O sininho só mostra prazos a até 5 dias, atrasos e veículos prontos; novos vencimentos aparecem conforme o tempo passa. A carga anterior foi preservada.

Validação: `scripts/testar-populacao-mes.mjs` confirmou os 30 dias distintos, as quantidades, o estoque, as etapas e a reexecução sem duplicações em duas oficinas isoladas. Não alterar a data-base ou o prefixo para reexecutar o mesmo lote.
