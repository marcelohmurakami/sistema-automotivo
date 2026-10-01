# Financeiro da oficina

Rota: `/financeiro`. Recurso `finance`, planos Intermediário e Completo. Somente proprietário e gerente; a restrição também é validada no Supabase por RPCs e RLS.

## Uso diário

1. Cadastre o saldo anterior em **Informar saldo inicial**. Depois abra o lançamento e registre o recebimento na conta correspondente. Para saldo negativo, use Nova despesa → Saldo anterior ao sistema. O saldo inicial não entra no lucro.
2. Entregue uma OS: uma única conta a receber é criada automaticamente, com o valor final. O vencimento inicial é o dia da entrega e pode ser editado. Entregar não significa receber.
3. Em **Contas e pagamentos**, abra a conta e toque em **Receber agora** ou **Pagar agora**. É possível registrar vários pagamentos parciais, contas, formas e datas. Cartão: registre a entrada quando o dinheiro efetivamente cair no banco e informe a taxa descontada.
4. Cadastre aluguel, salários, impostos e demais gastos em **Nova despesa**. A data para o resultado representa quando o gasto aconteceu; o vencimento é o prazo para pagar.
5. Em **Resultado por OS**, adicione custos externos ligados ao serviço, confira o custo das peças e confirme a revisão. Os custos de estoque são trazidos dos movimentos da entrega, com o custo unitário preservado naquela movimentação.
6. Corrija pagamentos pelo histórico, usando **Estornar** com data e motivo. A conta volta a ficar pendente; o movimento original continua visível. Um lançamento manual sem pagamento ativo pode ser cancelado. Receita de OS entregue não é cancelada ou alterada financeiramente pela tela.
7. Registre transferências internas já realizadas entre caixa e banco. As duas pontas são criadas juntas; o estorno também corrige as duas. Não há envio de dinheiro a bancos.

## O que cada número significa

- **Dinheiro disponível:** soma de todos os recebimentos líquidos menos pagamentos, considerando saldos iniciais e estornos. É saldo registrado, não sincronizado com banco. As duas contas são agregadores: dinheiro físico e banco/conta digital.
- **Falta receber / pagar:** pendências de todas as datas, com destaque do valor atrasado. Atraso é vencimento anterior ao dia atual em São Paulo.
- **Resultado estimado no período:** receitas por competência − despesas operacionais por competência − peças consumidas no período − taxas de recebimentos no período. Custos de estoque estornados são revertidos na data do estorno. Cancelar uma despesa/receita manual corrige seu período original; não apaga movimentos de caixa de períodos anteriores.
- **Entrou e saiu:** dinheiro efetivamente movimentado no período, incluindo aportes e retiradas. Transferências internas são excluídas dos dois totais para não inflá-los, mas alteram os saldos das contas.
- **Resultado por OS:** valor vendido − custo das peças consumidas − despesas operacionais vinculadas − taxas. É contribuição antes das despesas gerais, não lucro líquido individual. Considera todos os custos vinculados, inclusive os registrados fora do período selecionado.

Compra para estoque afeta contas a pagar e caixa; não é despesa operacional de novo quando a peça já entra como consumo. Entradas no módulo Estoque não criam contas automaticamente: registrar o fornecedor no financeiro continua necessário. Ajustes/perdas de estoque avulsos não geram despesas; perdas precisam de lançamento operacional próprio. Mão de obra, impostos, peças externas e demais custos não informados não podem ser estimados automaticamente. Por isso a interface usa **lucro/prejuízo estimado** e pede conferência dos custos.

## Dados, segurança e automação

- Migração: `supabase/migrations/20260929000300_financeiro.sql`.
- `titulos_financeiros`: contas, competência, vencimento, natureza, categoria, vínculo com OS e revisão.
- `baixas_financeiras`: histórico imutável de pagamentos e estornos; valores inteiros em centavos.
- Escrita exclusivamente por RPCs com conferência de oficina, assinatura e perfil. Revisão protege edição concorrente; bloqueio de linha protege o saldo contra pagamentos simultâneos. Chaves únicas evitam repetição de pagamentos, títulos e transferências.
- Trigger da entrega gera a receita na mesma transação da OS/estoque. Falhas revertem a transação. A migração importa OS já entregues como contas a receber, sem presumir pagamentos antigos.
- Eventos `finance.*` na fila `eventos_negocio` e registros de auditoria permitem integração posterior com automações/n8n, sem disponibilizar chaves privilegiadas no navegador.
- Saldos e totais calculados no servidor sobre todos os registros. Lista paginada em 30; exportação percorre todas as páginas do filtro atual. Resultado individual mostra até 100 OS recentes, informado na tela. Os indicadores gerais não têm esse corte. Período máximo: 367 dias.
- Em demonstração, dados fictícios ficam no navegador, em `patio_financeiro_v1`. As receitas são sincronizadas com as OS demonstrativas entregues.

Não inclui emissão fiscal, integração bancária, conciliação de extrato, cobrança automática ou parcelamento com calendário próprio. Pagamentos parciais são suportados, com saldo restante e vencimento editável. Nenhum botão realiza transferência bancária ou cobrança real.

## Validação

`supabase/tests/validate-financeiro.mjs`: 37 verificações de cálculos, taxas, estornos, integração OS/estoque, transferência atômica, isolamento por oficina, perfil e assinatura. Executa migrations completas em PostgreSQL local com Auth/Storage simulados via PGlite.

Build TypeScript/Vite e lint. Teste pelo navegador em modo demonstrativo: OS de R$ 165,00, custo de peças de R$ 40,00, recebimento parcial de R$ 100,00 com taxa de R$ 3,00 e despesa de R$ 150,00. Resultado esperado e observado: R$ 97,00 no banco, R$ 65,00 a receber, R$ 150,00 a pagar e prejuízo estimado de R$ 28,00.

Banco remoto: migração aplicada no projeto automotivo e consulta da RPC com papel `authenticated` e identidade do proprietário validada em transação finalizada com rollback. Nenhum lançamento fictício foi inserido no banco remoto.
