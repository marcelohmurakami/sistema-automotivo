# Clientes e acesso por plano

Implementado em 28/09/2026. Migração `20260928000600_clientes_e_acesso_por_plano.sql` aplicada no projeto Supabase `sistema_automotivo` (`hzihxtjirttetnfdujcx`).

## O que está conectado

- Login com e-mail e senha pelo Supabase Auth.
- Seleção entre oficinas às quais o usuário pertence.
- Cadastro, listagem paginada, busca, edição, exclusão reversível e restauração de clientes.
- Consulta de assinatura e recursos autorizados no servidor.
- React Query com chaves por usuário, oficina e modo de uso; sem persistir clientes reais no armazenamento local.
- Rotas e atalhos protegidos por recurso. Se a consulta de acesso falha, o front bloqueia os módulos em vez de aproveitar permissões antigas.

As demais telas continuam como protótipos na demonstração. No modo real, exibem que a integração ainda está em desenvolvimento. Estar previsto em um plano não significa que um módulo já foi implementado.

## Executar

Copie `.env.example` para `.env.local` e informe `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. Neste computador, o arquivo local já foi configurado para o projeto automotivo. Use somente a chave publicável. Nunca coloque `service_role`, segredo de webhook ou senha do banco no Vite.

Execute `npm install` e `npm run dev`. Em `/entrar`, use uma conta existente no Supabase Auth. A sessão precisa de vínculo ativo em `membros_oficina`. Se ainda não pertence a uma oficina, o usuário pode cadastrar uma pelo fluxo existente `criar_oficina`, que inicia no Básico. Para equipes, o administrador deve provisionar o vínculo de cada conta; ainda não há uma tela de convites.

“Explorar demonstração” usa dados fictícios, persistidos somente neste navegador. “Meu plano” permite simular os três planos sem atualizar o Supabase. Ao sair da demonstração, é necessário autenticar para acessar dados reais.

## Matriz inicial

| Plano | Recursos |
|---|---|
| Básico (`basic`) | Clientes e veículos, catálogo, notas de atendimento |
| Intermediário (`intermediate`) | Básico + orçamentos, OS, mapa, fotos e checklist |
| Completo (`complete`) | Intermediário + site, portal do cliente, pedidos de peças, automações e IA |

O banco usa `planos`, `recursos`, `recursos_plano` e `assinaturas_oficina` como fonte de autorização. As descrições da comparação visual correspondem à matriz inicial; mantenha-as alinhadas ao evoluir a oferta. O front obtém os recursos efetivamente autorizados por `consultar_meu_acesso`.

Assinatura `active` ou `trialing`, com plano ativo e dentro de `valido_ate`, autoriza somente os recursos habilitados. `past_due`, `cancelled`, `suspended`, validade vencida e oficina arquivada bloqueiam os recursos. A assinatura permanece consultável para explicar o bloqueio.

## Administração das assinaturas

A empresa não tem permissão para escrever em `assinaturas_oficina`, `planos` ou `recursos_plano`. O seletor de demonstração nunca chama uma operação de cobrança ou atualização de assinatura.

Para registrar um contrato real, um administrador confiável altera a assinatura da oficina identificada por UUID, no Supabase ou em um backend administrativo. Configure `codigo_plano`, `situacao` e `valido_ate` de acordo com o contrato efetivo. `valido_ate = null` significa sem expiração automática; não equivale a confirmação de pagamento.

O gateway de pagamentos e a sincronização de cobrança ainda não estão implementados. No futuro, uma Edge Function deve validar a assinatura do webhook do provedor, conferir o vínculo entre assinatura externa e oficina e aplicar alterações de forma idempotente. Nunca aceite o plano informado pelo navegador como comprovação de contratação. Workers de n8n/IA também precisam verificar o recurso no servidor antes de cada execução: a chave `service_role` é administrativa e ultrapassa RLS.

A interface revalida permissões a cada 30 segundos e ao recuperar foco. O banco verifica a assinatura na operação; portanto, revogação e vencimento não dependem do menu atualizar. Downloads já concedidos por URL assinada precisam de validade curta quando esse fluxo for implementado.

## Clientes e integridade

Campos novos: `tipo` (`pessoa_fisica`/`pessoa_juridica`), `endereco`, `observacoes` e `revisao`. Nome obrigatório; telefone, e-mail e demais detalhes opcionais. Telefone é normalizado para E.164; números brasileiros sem código recebem +55. Telefones não são únicos, pois familiares e frotas podem compartilhar contato.

| Operação pública | Finalidade |
|---|---|
| `consultar_meu_acesso()` | Oficinas, perfil, assinatura e recursos do usuário autenticado |
| `listar_clientes(p_oficina, p_busca, p_arquivados, p_pagina)` | Busca literal, páginas de 24 registros e total |
| `salvar_cliente(p_oficina, p_dados, p_cliente, p_revisao)` | Criação ou edição com validação no servidor |
| `definir_arquivamento_cliente(p_oficina, p_cliente, p_revisao, p_arquivar)` | Excluir reversivelmente ou restaurar |

Colaboradores ativos podem cadastrar e editar. Apenas proprietário e gerente acessam a lixeira, excluem e restauram. Exclusão preenche `arquivado_em`, preserva IDs e relacionamentos e revoga a concessão ao portal. Restaurar o cadastro não restaura essa concessão automaticamente. Edição concorrente retorna `40001`; o usuário precisa atualizar e reabrir o cadastro, sem sobrescrever silenciosamente.

Cada alteração gera auditoria e evento em `eventos_negocio` na mesma transação. Eventos: `cliente.cadastrado`, `cliente.editado`, `cliente.arquivado`, `cliente.restaurado`. O payload contém ID e revisão, sem replicar telefone/endereço. Um consumidor futuro deve deduplicar pelo ID do evento e respeitar o plano da oficina.

## Proteções e validação

- 48 tabelas continuam com RLS.
- 37 políticas restritivas adicionam a exigência do recurso às leituras por oficina.
- Política adicional restringe leitura de clientes arquivados à gerência.
- Escrita de clientes pelo front passa pelas RPCs; sem INSERT/UPDATE/DELETE direto.
- Armazenamento privado também verifica recurso de orçamento ou mídia.
- Assinaturas e matriz de recursos não podem ser alteradas por usuários comuns.

A suíte `supabase/tests/validate-clientes-planos.mjs` passou 39 verificações em PostgreSQL local (PGlite), incluindo isolamento, plano, concorrência, validação, revogação e auditoria. A suíte histórica continua cobrindo as migrações 1–5, com seu cenário de upgrade separado.

```powershell
$env:DB_VALIDATION_RUNTIME = "$env:TEMP/sistema-automotivo-db-validation/node_modules/@electric-sql/pglite/dist/index.js"
node supabase/tests/validate-clientes-planos.mjs
node supabase/tests/validate-product.mjs
npm run lint
npm run build
```

No Supabase remoto foram confirmadas as 37 políticas, as quatro RPCs, os quatro novos campos, o bloqueio de atualização de assinatura e o bloqueio de cadastro anônimo. No navegador foram exercitados criação, edição, busca, lixeira, restauração e bloqueio por plano usando a demonstração. O fluxo autenticado completo ainda precisa ser homologado com uma conta de usuário real; nenhuma senha de usuário foi criada ou usada pelo agente.
