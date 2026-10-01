# Catálogo de peças e serviços

A rota `/catalogo` administra a tabela `itens_catalogo`. Serviços e produtos têm descrição, tipo, unidade, preço em centavos, favorito e arquivamento reversível. Disponível desde o Básico; estoque, OS e orçamentos continuam condicionados aos respectivos recursos contratados.

## Fluxo

- Cadastre pelo botão Novo cadastro. Produtos passam a aparecer no estoque como Ativar controle; saldo inicial só é registrado por movimentação/compra.
- Favoritos aparecem primeiro na lista e nas seleções rápidas de orçamento e OS.
- Busca sem acentos, filtros por tipo, ativos/arquivados e favoritos; interface paginada em 24 registros. Leitura por cursor em lotes de 200 para evitar truncamento pelo limite da API.
- Edição de produto usa o mesmo registro do estoque. Preserva código, custo, saldo, fornecedor e localização. Invalida a revisão de formulários de estoque abertos quando altera descrição, unidade ou preço.
- O tipo não muda depois da criação; a unidade de itens vinculados a estoque, OS ou orçamento é preservada.
- Arquivamento mantém históricos. O banco impede arquivar itens com saldo ou vínculo com OS aberta. É possível restaurar pela aba Arquivados.
- A OS permite adicionar serviços do catálogo com um toque na seção Execução. Usa a revisão da OS e copia os dados atuais do serviço, preservando os valores de atendimentos anteriores. Peças continuam no fluxo existente de estoque/origem da peça.
- Orçamentos consultam o mesmo catálogo; alterações não recalculam itens já adicionados. Na demonstração, cadastro, estoque e seleções também compartilham os dados locais.

## Banco e segurança

Migração `20260930000100_catalogo_completo.sql` aplicada no projeto `hzihxtjirttetnfdujcx` em 30/09/2026 pelo SQL Editor. Não reaplicar; conciliar histórico do CLI antes de `db push`. Comprovante em `database/implantacao-catalogo-2026-09-30.json`.

Nova coluna revisao e gatilhos que a incrementam também em alterações feitas pelo estoque. RPCs `salvar_item_catalogo` e `adicionar_servico_catalogo_os` validam sessão, oficina, plano e concorrência. A leitura preserva RLS existente; escrita direta continua bloqueada. Eventos `catalogo.cadastrado` e `catalogo.alterado` são registrados na outbox para integrações futuras. A migração não habilita automações para planos sem esse recurso.

## Validação

- `npm run build` e `npm run lint`.
- `node supabase/tests/validate-catalogo.mjs`: 25 verificações de banco.
- `node --experimental-strip-types supabase/tests/validate-catalogo-ui.mjs`: 9 verificações de dados locais e filtros.
- Suítes existentes de estoque (27), OS (28) e orçamentos (25), com a nova migração carregada: aprovadas.
- PGlite usa Auth/Storage simulados. No Supabase real: leitura como authenticated com a identidade da oficina retornou 12 itens com revisões válidas; RPC de gravação validada em transação com rollback. Não houve alteração persistente dos cadastros reais nesses testes.
- Navegador em demonstração: criação de serviço favorito, mudança de preço, arquivamento/restauração e inclusão em OS com total correto.

Conferência visual em tema escuro: 1280 px e 390 px, sem rolagem horizontal da página. Busca sem acentos e preço atualizado na seleção de novo orçamento também conferidos.
