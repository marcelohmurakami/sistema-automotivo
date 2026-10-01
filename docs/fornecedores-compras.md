# Fornecedores, compras e pagamentos das OS

Implementado em 29/09/2026. Migração: `20260929000600_fornecedores_compras_pagamentos_os.sql`.

## Uso

- **Fornecedores**: cadastrar, buscar, editar, arquivar e restaurar. Nome obrigatório; documento, telefone, e-mail, endereço e observações opcionais. Arquivar preserva as compras anteriores.
- **Estoque → Registrar compras**: selecionar ou cadastrar rapidamente um fornecedor; adicionar peças com estoque controlado; informar quantidade e custo efetivo; registrar documento, data e vencimento; escolher pagamento posterior, parcial ou integral.
- Confirmar uma compra significa que as peças **já foram recebidas**. Entrada, atualização do custo médio ponderado, conta a pagar e pagamento inicial são uma transação no banco.
- **Compras → Detalhes**: itens recebidos, total, já pago, restante, vencimento, pagamentos e estornos. O financeiro oferece um link de volta à compra e o histórico de estoque também aponta a origem.
- **OS → Pagamento do cliente**: receber sinal antes da entrega, registrar pagamentos parciais ou quitar, informar taxas, combinar data e consultar/estornar pagamentos.
- Combinar data não significa receber: somente uma baixa financeira reduz o saldo. Pagamentos não mudam a situação operacional da OS.

## Regras de valores

Valores monetários são centavos inteiros. Quantidades têm até três casas decimais; os subtotais são arredondados em centavos.

Compras aumentam o estoque e geram contas a pagar. Só pagamentos movimentam o caixa. A compra para estoque não entra novamente como despesa no resultado: o custo das peças usadas na OS é reconhecido pelo consumo na entrega, com o custo congelado da movimentação.

Uma OS possui uma única cobrança automática. Antes da entrega, ela é provisória: seus pagamentos entram no caixa, mas seu valor não compõe receita nem margem das OS entregues. A entrega atualiza a mesma cobrança, preservando pagamentos e vencimento combinado. Reduzir a OS abaixo do recebido ou cancelar uma OS com pagamento líquido ativo é bloqueado; estorne primeiro.

## Correções e limites

- Documentos não vazios não podem se repetir em compras ativas do mesmo fornecedor e oficina.
- Reenviar a mesma compra ou pagamento com a mesma chave não duplica os registros.
- Uma compra confirmada preserva seus itens e custos. Para corrigir, cancele e registre novamente quando as regras permitirem.
- Cancelamento exige pagamentos estornados e nenhuma alteração posterior nas peças envolvidas. Restaura saldos/custos anteriores e cancela a conta em conjunto, mantendo histórico. Não é um fluxo geral de devolução parcial ao fornecedor.
- Movimentações de uma compra não podem ser estornadas isoladamente pelo estoque; sua conta não pode ser cancelada isoladamente pelo financeiro.
- Entradas manuais de estoque continuam disponíveis para ajustes e saldos iniciais; não geram automaticamente uma compra ou conta a pagar.
- Compras têm um vencimento para o saldo restante e permitem várias baixas. Parcelas com vencimentos individuais, pedidos ainda não recebidos, importação de NF-e e conciliação bancária não integram este fluxo.

## Acesso e persistência

Fornecedores exigem estoque habilitado. Compras exigem estoque e financeiro habilitados e perfil proprietário/gerente. Pagamentos de OS exigem financeiro e OS habilitados, com perfil proprietário/gerente. RLS e funções validam oficina, usuário e recursos; não depende apenas da navegação. Escritas passam por funções transacionais.

Na demonstração, os dados ficam no navegador e as alterações de compra são calculadas antes de persistir; se a gravação falhar, os valores anteriores são restaurados. O isolamento multiusuário e a concorrência são garantidos pelo banco no modo autenticado.

## Validação

- 36 verificações específicas em `supabase/tests/validate-compras.mjs`: custo médio, parcial, idempotência, reversão, rollback integral, proteção dos vínculos, adiantamentos, entrega sem duplicação, acesso por plano/perfil/oficina.
- Regressões executadas com todas as migrações até `20260929000600`: financeiro (37), estoque (27) e gestão (22).
- `npm run build` e `npm run lint` aprovados. O build mantém o aviso já existente de chunk principal acima de 500 kB.
- Navegador, modo demonstrativo: cadastro de fornecedor; compra de R$ 100 com R$ 40 pagos e quitação dos R$ 60 restantes; OS com vencimento combinado e novo recebimento parcial; histórico e visualização em tema escuro com largura de celular sem transbordamento horizontal.
- Banco Supabase: migração aplicada e consultas de fornecedores, compras e financeiro verificadas com papel authenticated e usuário da oficina. Os registros fictícios de teste ficaram na demonstração/local, sem popular o banco real.

Para repetir as regressões locais em PowerShell, configure `DB_VALIDATION_RUNTIME` com o caminho da instalação do PGlite e `DB_VALIDATION_MIGRATION_LIMIT=20260929000600`. O limite permite testar os fluxos anteriores sobre o esquema atualizado; remova-o para verificar um estágio histórico específico.
