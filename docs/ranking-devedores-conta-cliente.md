# Ranking de devedores e conta em PDF

Disponível em **Relatórios > Financeiro > Clientes com saldo em aberto** para proprietário/gerente com Financeiro e Relatórios habilitados.

- Posição atual de todas as competências. O período mensal dos indicadores de resultado não esconde dívidas antigas.
- Ordenação por saldo total ou valor vencido; busca por cliente, telefone, número da OS, veículo e placa; filtro de clientes com atraso.
- O nome do cliente abre a seleção de OS. Marcar/desmarcar atualiza total, vencido e a vencer. Sem seleção, a exportação fica desabilitada.
- PDF com identidade da oficina, cliente, data/hora da consulta, OS, data do serviço, veículo, descrição dos serviços, valores, recebimentos descontados, vencimentos e total selecionado. Paginação automática e identificação da OS em continuação.
- Os saldos são consultados novamente antes da exportação. Alterações em uma OS selecionada impedem geração silenciosa e exigem nova conferência. Fechar durante a consulta cancela a geração local.
- Nenhuma cobrança é enviada automaticamente. A ação baixa o arquivo para envio pelo usuário.

## Regras de saldo

A consulta usa `private.financeiro_saldos`: pagamentos parciais, estornos e recebimentos importados são considerados. Taxas de recebimento não aumentam a dívida do cliente. Vencimento hoje não conta como atraso.

Só entram títulos a receber definitivos vinculados a OS não canceladas. Títulos cancelados, provisórios, transferências e contas quitadas não são cobrados. Arquivar uma OS não apaga sua dívida. Títulos quitados da mesma OS entram no valor/recebido para manter o extrato conciliado; somente os saldos positivos aparecem nos vencimentos.

Clientes cadastrados são agrupados pelo ID; homônimos não são misturados. Sem cadastro, cada OS permanece como conta independente. Receitas manuais sem vínculo com OS não têm identificação confiável do cliente e permanecem na tela Financeiro, fora deste ranking.

## Validação

- `supabase/tests/validate-contas-clientes.mjs`: saldo parcial, taxas, estorno, histórico importado, competências antigas, vencimento hoje, quitados, cancelados, provisórios, arquivos, homônimos, avulsos, mais de 1.000 títulos, plano, perfil, anônimo e isolamento entre oficinas.
- `scripts/testar-contas-clientes.mjs`: PDF individual/seleção, 24 OS em 6 páginas, descrição longa, validações contra duplicação/mistura de clientes e paridade de saldos demo.
- PDF renderizado com Poppler e texto verificado com pdfplumber. Arquivo baixado pela interface conferido: só OS #8052, saldo R$ 1.350,50.
- Interface: filtros, seleção/desmarcar todas, download, Escape, consulta após pagamento em outra aba, desktop e celular de 390 px sem transbordamento.
- TypeScript, ESLint e build de produção aprovados.

Migração: `20261013000800_contas_clientes_relatorio.sql` (consulta somente leitura; não altera lançamentos existentes).

Aplicada ao projeto Supabase `hzihxtjirttetnfdujcx` em 13/10/2026; resultado confirmou `consultar_contas_clientes(uuid)` instalada.
