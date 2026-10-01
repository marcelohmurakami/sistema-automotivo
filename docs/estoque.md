# Estoque integrado às ordens de serviço

Implementado em 29/09/2026, nos planos Intermediário e Completo (`inventory`). Migração `20260929000200_estoque_integrado_os.sql` aplicada ao Supabase `hzihxtjirttetnfdujcx`.

## Primeiro uso

1. Abra **Estoque**. As peças existentes no catálogo aparecem como **Não controlado**. Escolha **Ativar controle**, revise os dados e salve. Ou use **Nova peça**.
2. Informe código/SKU, unidade, preço de venda, custo de referência, estoque mínimo, localização e fornecedor de referência.
3. Use **Movimentar → Entrada** para lançar o saldo inicial real. O sistema não presume quantidades para peças antigas.
4. Entradas e saídas avulsas recebem quantidade, motivo e documento opcional. **Contagem física** recebe o total encontrado e registra a diferença em relação ao saldo atual. Quantidades têm até três casas decimais.
5. O filtro **Estoque baixo** mostra saldos iguais ou inferiores ao mínimo. A avaliação é saldo × custo de referência atual; não é custo médio contábil nem FIFO.

## Ligação com a OS

Na aba **Execução → Peças e estoque**, adicione uma peça cadastrada ou defina a origem de uma peça já lançada:

- **Estoque da oficina:** vincula o produto físico, com unidade compatível.
- **Trazida pelo cliente:** não movimenta estoque.
- **Compra externa não registrada no estoque:** não movimenta estoque. Se a compra foi lançada como entrada, selecione Estoque da oficina para evitar deixar saldo indevido.

Peças de orçamento convertido usam automaticamente o mesmo item do catálogo quando seu controle de estoque já estiver ativo. Caso contrário, é necessário definir a origem antes da entrega. O vínculo físico não altera o preço ou os valores aprovados. Em OS criada a partir de orçamento, peças adicionais continuam exigindo orçamento separado.

**A baixa acontece somente ao mudar a OS para Entregue.** Pronta para entrega ainda não baixa. Não há reserva: várias OS podem apontar para o mesmo saldo; a disponibilidade é verificada novamente na entrega.

A transação do PostgreSQL bloqueia as linhas dos produtos, confere quantidades e gera uma movimentação para cada item. Se faltar qualquer peça, todos os débitos e a mudança da OS são revertidos. Serviços e peças externas não são debitados. A baixa possui restrição única por item da OS; repetir a entrega não duplica o consumo. Não há baixa retroativa de OS já entregues antes da migração.

## Histórico, estornos e arquivamento

O extrato de cada peça é paginado, identifica quantidade, saldo resultante, custo de referência no momento, motivo, data, usuário autor no banco, documento e OS de origem. O link permite abrir a OS. Movimentos não podem ser alterados ou apagados pela aplicação.

Proprietário/gerente pode estornar integralmente um movimento com motivo obrigatório. O sistema lança a operação inversa e impede estorno repetido ou saldo negativo. Para consumo em OS, registra também anotação no histórico da OS. A devolução não reabre nem altera o valor comercial da OS. Devoluções parciais não têm fluxo específico nesta versão.

Arquivar uma peça preserva seu histórico e exige saldo zero e ausência de OS aberta vinculada. É possível restaurá-la. Não há exclusão definitiva nem mudança de unidade de um produto já controlado. O fornecedor é um campo de referência, sem cadastro de compras/contas a pagar nesta entrega.

## Estrutura e acesso

- `estoque_produtos`: saldo, mínimo, custo, código, localização, fornecedor e revisão por oficina/produto.
- `movimentacoes_estoque`: extrato imutável e chaves de deduplicação.
- `itens_ordem_servico`: origem da peça e vínculo ao produto físico, sem substituir o vínculo comercial ao orçamento.
- RPCs: `listar_estoque`, `salvar_produto_estoque`, `movimentar_estoque`, `consultar_movimentacoes_estoque`, `estornar_movimentacao_estoque`, `arquivar_produto_estoque`, `vincular_estoque_item_os`, `adicionar_peca_estoque_os`.
- Trigger `os_baixar_estoque` executa a integração. Alterações de saldo somente por RPC/trigger autorizado; RLS exige oficina e plano. Custos e saldos não são adicionados à tabela pública de catálogo acessível no Básico.
- Movimentações geram eventos na outbox para futuras automações. A execução de n8n ainda não está conectada.

A tela antiga de catálogo de serviços ainda é um protótipo; as peças deste módulo são gravadas no catálogo real usado por orçamentos. O modo demonstração mantém estoque próprio no navegador e não grava no Supabase.

## Validação

- `npm run build` e `npm run lint` aprovados.
- `supabase/tests/validate-estoque.mjs`: 27 verificações em PGlite, com Auth simulado. Inclui isolamento, plano, concorrência otimista, contagem, duplicidade, estorno, arquivamento, soma de peças e rollback integral na falta de saldo. Não é um teste de carga de sessões simultâneas.
- Navegador em demonstração: cadastro, entrada de 10 unidades, inclusão de 2 em uma OS, conclusão/entrega, saldo final 8 e extrato com link para a OS. Layout móvel sem rolagem horizontal.
- Supabase real: migração aplicada com sucesso; consulta `listar_estoque` validada em transação com papel authenticated e identidade do proprietário, retornando as 6 peças existentes. Sem alteração de saldos reais nesse teste. O ciclo completo com gravações foi validado localmente e na demonstração.

Antes de usar Supabase CLI `db push`, concilie o histórico das migrações aplicadas pelo painel. Não reaplique a migração no banco atual.
