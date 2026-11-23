# Garantias, retrabalhos e relatórios de gestão

## Onde usar

- **Gestão e ferramentas → Garantias e retrabalhos**: nova ocorrência vinculada à OS, serviço e funcionário. Registre motivo, reclamação, cobertura, diagnóstico, solução, datas, horas, custos e avaliação do cliente. Cancelamento preserva o histórico.
- A seção **Retorno e garantia** da OS também abre o registro de qualidade. O fluxo existente de criar uma OS de retorno gera automaticamente a ocorrência, inclusive para cliente sem cadastro.
- **Relatórios**: mantém as análises anteriores e acrescenta a análise detalhada em Financeiro, Oficina e Produção, além das abas Estoque e peças e Qualidade.
- **Capacidade e expediente**, dentro dos relatórios: quantidade de vagas/serviços simultâneos e horário de funcionamento.
- **Completar dados** nas tabelas: vínculo do funcionário e conferência de custos da OS; estoque máximo, fornecedor e reposição da peça; datas de pedido/entrega prometida e condições de pagamento da compra; classificação de despesas. Nenhuma alteração desses complementos movimenta o caixa ou o saldo de estoque.

## Critérios de cálculo

| Indicador | Base |
|---|---|
| Faturamento de serviços e peças | OS entregues no período; desconto distribuído em centavos entre os itens |
| Margem de contribuição da OS | Venda menos consumo de estoque, despesas vinculadas, tempo apontado, comissões, custos adicionais informados e garantias |
| Rentabilidade média | Média das margens percentuais das OS com custos conferidos e valor de venda positivo |
| Margem da peça | Valor vendido menos custo das movimentações de consumo; sem custo identificado, a margem fica sem estimativa |
| Garantia e prejuízo | Custos líquidos registrados na ocorrência: horas × custo/hora + peças + outros + reembolsos − recuperação |
| OS de retrabalho vinculada | Seus custos não são acrescentados novamente à margem; a ficha da ocorrência deve registrar o custo completo do retorno |
| Qualidade no período | Ocorrências abertas no período, excluindo canceladas |
| Retorno em garantia das OS entregues | OS entregues no período que tiveram retorno em garantia posterior até a consulta |
| Satisfação | Notas 4 e 5 / avaliações recebidas, somente entre clientes que avaliaram ocorrências; não representa todos os clientes da oficina |
| Funcionários | Receita de serviços atribuídos, após desconto; vínculo individual do comissionado prevalece sobre responsável da OS. Custos de retorno seguem o funcionário informado, sem presumir responsabilidade pelo problema |
| Ocupação média | Tempo de permanência dentro do período / tempo observado / capacidade informada; dias futuros ficam fora |
| Etapas | Tempo observado nas transições de cada OS durante o período; registros sem histórico suficiente são excluídos e contados como lacuna |
| Paradas | Intervalos sobrepostos da mesma OS unidos; corte nas datas selecionadas |
| Cliente recorrente | Cliente cadastrado com atendimento entregue anterior ao primeiro atendimento entregue no período; avulsos não são unidos pelo nome |
| Estoque disponível | Saldo físico − reservas de OS ativas; faltas de reserva são mostradas separadamente |
| Estoque parado | Dias desde última movimentação ou, quando nunca movimentado, desde o cadastro; faixas 90/120/150 são cumulativas |
| Fornecedores | Compras recebidas no período, excluídas as canceladas; prazo real apenas quando existe data de pedido; atraso quando existe promessa |
| Agenda livre | Próximos sete dias, por recurso já utilizado na agenda, dentro do expediente; compromissos sem fim impedem estimativa daquele dia |

Despesas fixas/variáveis são classificadas explicitamente. Valor variável de uma conta recorrente não determina automaticamente o comportamento do custo. Despesas gerais e fluxo de caixa permanecem no relatório financeiro anterior. A margem por OS não é lucro líquido da empresa.

Os filtros da análise detalhada não alteram os quadros gerais anteriores. Formas de pagamento e agenda têm escopo da oficina inteira, informado nas próprias seções. CSV de cada tabela contém todos os resultados filtrados, inclusive os que ficaram recolhidos, com proteção contra fórmulas.

## Acesso e persistência

Gerentes/proprietários usam as ocorrências e os relatórios; relatórios completos por funcionário exigem o recurso `employee_reports`, incluído no Plano Completo. As novas tabelas não têm acesso direto para clientes autenticados; as funções validam oficina, perfil, plano, vínculo e revisão. Alterações de ocorrência e complementos possuem histórico no banco. O histórico da ocorrência é consultável na ficha.

Migrações: `20261013000600_qualidade_retrabalho.sql` e `20261013000700_dados_relatorios_gestao.sql`.

As duas migrações foram aplicadas juntas, em uma transação, no projeto Supabase `hzihxtjirttetnfdujcx` em 13/10/2026. A consulta final confirmou a tabela de ocorrências e a função dos relatórios.

## Validação

- `supabase/tests/validate-qualidade-gestao.mjs`: migrações completas em PostgreSQL local isolado; CRUD, idempotência, concorrência por revisão, auditoria, resolução, custos/nota/datas inválidos, acesso direto bloqueado, perfil/plano/oficina, metadados de reposição e retorno de cliente avulso.
- `scripts/testar-relatorios-gestao.mjs`: margem, descontos/atribuição, comissões sem dupla contagem, custo de garantia sem duplicação da OS vinculada, filtros, satisfação, datas, reservas, estoque parado, prazos, intervalos sobrepostos e agenda sem previsão de fim.
- Navegador: formulário e busca de OS, gravação de ocorrência fictícia, total de R$ 160 para 1,5 h × R$ 80 + R$ 40 de peças, filtros de cliente/estoque, revisão concorrente e tela de 390 px sem transbordamento horizontal da página.
- Capacidade salva de 4 para 5 recalculou a ocupação atual de 25% para 20%. O CSV baixado com filtro de cliente continha somente o serviço e o faturamento daquele cliente. Console da prévia sem erros.
- TypeScript, lint dos arquivos alterados e build de produção.
- Regressão com as novas migrações: relatórios financeiro e de oficina, comissões e produtividade passaram na bancada isolada.

Dados históricos ausentes não são inventados. Informe os novos campos e confira os custos para completar as análises. A capacidade atual é aplicada ao histórico; não há uma série de alterações de capacidade por dia. Na demonstração, agenda compartilhada e comissões continuam exigindo a conta real, conforme o comportamento já existente desses módulos.
