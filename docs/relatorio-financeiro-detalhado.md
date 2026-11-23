# Relatório financeiro detalhado

Implementado em 13/10/2026. Consulta `consultar_relatorio_financeiro`, disponível somente à gerência com os recursos `reports` e `finance`. Migração `20261013000200` aplicada e conciliada no banco da oficina.

## Conteúdo

- Resultado: receitas, custos, lucro/prejuízo, margem e comparação com período anterior de igual duração.
- Evolução diária ou mensal, alternando resultado e caixa; pontos consultáveis por teclado e tabela com os valores completos.
- Demonstrativo de resultado e distribuição dos gastos por categoria, incluindo consumo de estoque e taxas.
- Caixa: saldo anterior, entradas líquidas, saídas, movimento e saldo final; categorias e formas de recebimento com bruto/taxa/líquido.
- Contas atuais: saldos em dinheiro/banco, valores a receber/pagar, faixas de vencimento e tempo de atraso.
- Projeção de 30 dias e até oito pendências por natureza, com links para os lançamentos.
- CSV com os detalhes, além dos resumos já existentes.

## Regras dos valores

O resumo usa a mesma função do financeiro existente. Receitas e despesas seguem a competência; consumo de estoque segue a data da movimentação em São Paulo; taxas e caixa seguem a data da baixa. A receita contém o preço integral vendido e o estoque consumido é descontado pelo custo registrado na movimentação. Compra de estoque, aportes, retiradas e saldos iniciais não duplicam receita/despesa no resultado.

Estornos têm sinal inverso. O cancelamento posterior de um título não apaga o histórico de caixa. Transferências alteram os saldos individuais, sem inflar entradas/saídas externas. Saldos quitados no legado reduzem as pendências sem inventar recebimento com data desconhecida.

Os agregados consideram toda a base; limites da listagem financeira (30 contas e 100 OS) não limitam o relatório. Apenas a lista de pendências prioritárias é limitada a oito por natureza. O resultado estimado sinaliza custos de OS não revisados e valores variáveis ainda não confirmados.

A projeção usa o saldo atual mais recebimentos menos pagamentos em aberto com vencimento até hoje + 30 dias, incluindo atrasados. É condicional ao recebimento e pagamento dessas contas: não inclui novas vendas, taxas futuras ou despesas/recorrências ainda não geradas. Vencimentos e atrasos são a posição de hoje, independente do período escolhido para o resultado.

## Validação

- `supabase/tests/validate-relatorio-financeiro.mjs`: conciliação entre resumo, série, categorias, formas e vencimentos; mais de 100 títulos; pagamentos parciais; parcelas; estornos; consumo/devolução de estoque; transferências; quitação do legado; ano bissexto; limites e permissões. Compara os detalhes da demonstração com os do PostgreSQL.
- `validate-financeiro.mjs`: 37 verificações aprovadas com a migração nova.
- `validate-relatorios-operacao.mjs`: regressão das demais abas aprovada.
- TypeScript, ESLint dos arquivos alterados e build de produção aprovados.
- Banco da oficina: consulta autenticada e somente leitura confirmou igualdade de receitas, custos, caixa, contas a receber/pagar e reconciliação do saldo inicial/final no período de 01 a 13/10/2026.
- Navegador: estado vazio na aplicação e cenário com dados fictícios; alternância resultado/caixa, agrupamento diário/mensal e navegação entre seções.

Para executar o teste novo no PowerShell:

```powershell
$env:DB_VALIDATION_RUNTIME=(Resolve-Path 'node_modules/@electric-sql/pglite/dist/index.js').Path
node supabase/tests/validate-relatorio-financeiro.mjs
```
