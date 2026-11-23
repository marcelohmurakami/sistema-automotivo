# Validação do mini site e da área do cliente

Data: 13/10/2026. Escopo: administração do site, publicação, peças do estoque, pedidos, acesso dos clientes, OS, histórico e manutenção. Todos os cadastros usados nos testes de escrita eram fictícios, em banco descartável.

## Resultado

**246 verificações automatizadas aprovadas**: 97 específicas do site/portal, 3 do retorno da recuperação de senha e 146 regressões relacionadas. TypeScript, ESLint dos arquivos alterados e build de produção passaram.

| Suíte | Verificações |
| --- | ---: |
| `validate-site-portal.mjs` | 97 |
| `testar-retorno-portal.mjs` | 3 |
| `validate-expansao.mjs` | 40 |
| `validate-clientes-planos.mjs` | 39 |
| `validate-produtividade.mjs` | 67 |

Reexecução: `npm run test:site`. O comando usa o PGlite já instalado no projeto e aplica as migrações até `20261013000500` em memória. Não conecta ao Supabase real. Saída da execução: `output/qa-site-suite-completa.log`.

## Falhas reproduzidas e corrigidas

- OS arquivadas apareciam no portal e ainda permitiam consultar histórico e manutenções vinculadas. As três consultas agora excluem essas OS.
- Um identificador antigo permitia pedir uma peça já arquivada. O envio agora confere novamente publicação, oficina, cadastro ativo e vínculo ao estoque.
- Peças do catálogo antigo podiam ser publicadas sem cadastro no estoque. Tanto o seletor administrativo quanto o banco passam a exigir esse vínculo. Itens com saldo zero continuam aceitando consultas: o pedido não promete disponibilidade, não reserva nem cobra.
- A resposta pública incluía toda a identidade de impressão, inclusive campos desnecessários como QR Pix e rodapé. Agora retorna somente logo e cor.
- Entradas inválidas produziam exceções genéricas ou erros de conversão. Configuração e pedidos agora devolvem mensagens próprias, inclusive para endereço já utilizado, quantidade, precisão, itens, observações e dependência da área do cliente.
- A recuperação de senha perdia a oficina de origem. Agora preserva a rota pública e rejeita destinos externos ou rotas internas arbitrárias.
- Mensagens e rascunhos de pedidos podiam permanecer no estado local depois do logout. O conteúdo do portal é reiniciado ao mudar conta/oficina/modo de demonstração.
- O envio tinha apenas bloqueio visual; agora há trava síncrona contra cliques repetidos. O formulário é limpo após sucesso e a chave de repetição também muda quando o cliente selecionado muda.
- Erros ao sair e ao consultar clientes não tinham apresentação adequada. Agora são exibidos. Os checkboxes administrativos receberam tamanho próprio, sem herdar o tamanho dos campos de texto.
- A alteração do e-mail do cadastro agora revoga os acessos anteriores e exige nova conferência pela oficina.

## Cobertura de banco

Visitante, cliente autorizado, cliente sem acesso, gestor de outra oficina e funcionário sem permissão de gestão; leitura direta protegida por RLS; assinatura básica, intermediária, vencida e suspensa; despublicação; portal desabilitado; revogação; conta não confirmada; e-mail divergente; isolamento entre oficinas e cadastros; ausência de observações e anotações internas; arquivo de OS e cliente; validação e ciclo de pedidos; reenvio com mesma chave; conflito de conteúdo; rollback integral de pedido inválido; evento único por pedido; ausência de movimentação de estoque; quantidades fracionadas e limites.

O teste de oito reenvios via `Promise.all` valida a repetição no cliente de teste. O PGlite serializa a execução: isso **não substitui um ensaio de concorrência com múltiplas conexões PostgreSQL nem um teste de carga do serviço hospedado**.

## Verificação na interface

Aplicação real React e suas consultas SQL, com Supabase JS apontado para o adaptador HTTP local `scripts/qa-site-local.mjs`. Somente Auth e envio de e-mail foram simulados; as operações de negócio executaram as funções reais no PGlite.

- Site público, preço e catálogo carregam.
- Senha incorreta e e-mail não confirmado apresentam orientação específica.
- Cliente liberado vê sua OS e somente o histórico compartilhado.
- Conta sem liberação não recebe OS, histórico, manutenção ou pedidos de outro cliente.
- Busca sem resultado apresenta estado vazio explicativo.
- Pedido enviado persiste, aparece para o gestor e limpa o formulário.
- Gestor muda pedido para “Pronto para retirada”; cliente vê a nova situação.
- Salvar apresentação persiste após recarregar; desabilitar portal desabilita pedidos.
- Ocultar e republicar uma peça funciona; peças sem estoque não aparecem no seletor.
- A liberação de conta não confirmada é bloqueada com mensagem clara.
- Revogação e nova liberação funcionam.
- Recuperação preserva a oficina no endereço de retorno e no `redirectTo` solicitado ao simulador.
- Logout retira dados privados da tela; novo login não recupera o rascunho anterior.
- Interrupção do servidor de teste seguida de atualização apresenta indisponibilidade e botão de nova tentativa, sem manter OS e pedidos visíveis na tela de erro.
- Desktop (1440 × 1000) e celular (390 × 844): sem rolagem horizontal na administração e no portal.

Evidências: `output/qa-site-admin-desktop.png`, `output/qa-site-admin-mobile.png`, `output/qa-site-portal-desktop.png` e `output/qa-site-portal-mobile.png`.

## Banco conectado

A migração `20261013000500_qualidade_site_portal.sql` foi aplicada com sucesso no projeto conectado. A consulta anterior à aplicação retornou zero sites publicados e zero peças publicadas sem vínculo ao estoque. A consulta posterior confirmou a existência da correção. Não foram criados clientes, contas ou pedidos de teste nesse banco.

## Limites para homologação comercial

Ainda não homologados: entrega real de e-mails de confirmação/recuperação (SMTP, spam, expiração e redirecionamentos permitidos), fluxo completo de criação de conta no Auth hospedado, domínio público/HTTPS e navegação em aparelhos físicos/Safari. Também não foi executado teste de carga com usuários simultâneos contra produção.

Antes de oferecer a funcionalidade comercialmente, repetir esses fluxos em ambiente de homologação com domínio e remetente definitivos e contas de teste autorizadas. As verificações locais aprovadas não significam garantia de ausência de falhas, nem validam a entrega de e-mails externos.
