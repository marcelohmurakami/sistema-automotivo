# Ativação dos serviços preparados

Atualizado em 15/10/2026. O código contempla cobrança Stripe de teste e produção, com ambientes separados. Nenhuma credencial real foi configurada nesta revisão, nenhuma cobrança foi executada e nenhum deploy foi realizado. O inventário desta entrega está em [pré-deploy de 15/10](pre-deploy-2026-10-15.md).

## 1. Conferir o código antes de publicar

Na raiz do projeto, com Node e dependências instaladas:

```powershell
npm ci
npm run check
node scripts/preparar-release.mjs
```

O teste de banco usa PGlite em um banco isolado. O comando `check` encontra o runtime em `node_modules` e verifica todas as migrações locais. Para executar uma suíte de banco individual, defina `DB_VALIDATION_RUNTIME` com o caminho absoluto de `node_modules/@electric-sql/pglite/dist/index.js`. Os testes não utilizam nem apagam dados do Supabase.

O frontend usa apenas as variáveis públicas de `.env.example`. As variáveis de `supabase/functions/.env.example` pertencem ao servidor. Nunca colocar chaves Stripe, OpenAI ou service_role em variáveis `VITE_`.

## 2. Cobrança Stripe de teste

1. Criar uma conta no Stripe e usar o ambiente de teste.
2. Criar três produtos com preços recorrentes mensais em BRL: Básico R$49, Intermediário R$99 e Completo R$199. Copiar seus IDs `price_...`. O servidor confere moeda, valor e periodicidade.
3. Configurar o Customer Portal de teste: gerenciamento de cartão e faturas, mudança somente entre esses três preços, quantidade fixa em um e cancelamento ao final do período. Definir as regras de rateio no portal e conferir o resultado em teste.
4. Criar um endpoint de webhook: `https://hzihxtjirttetnfdujcx.supabase.co/functions/v1/webhook-cobranca`. Usar a versão de eventos `2025-03-31.basil`, compatível com o código, e eventos `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid` e `invoice.payment_failed`.
5. No Supabase, Edge Functions → Secrets, preencher `COBRANCA_AMBIENTE=teste`, `COBRANCA_PRODUCAO_HABILITADA=false`, `STRIPE_SECRET_KEY` (`sk_test_...` ou `rk_test_...` com as permissões necessárias), `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_BASIC`, `STRIPE_PRICE_INTERMEDIATE`, `STRIPE_PRICE_COMPLETE`. Opcionalmente preencher `STRIPE_PORTAL_CONFIGURATION` com a configuração criada. Não enviar chaves pelo chat.
6. Definir `APP_URL` com a origem HTTPS do frontend, sem caminho. Na hospedagem atual: `https://patio-automotivo-marcelo-teste.marcelo-murakami100.chatgpt.site`.
7. Somente depois, definir `COBRANCA_HABILITADA=true`. Sem todas as configurações válidas, o serviço permanece fechado para contratação.
8. Entrar como proprietário de uma oficina de teste, abrir Planos e testar: pagamento aprovado, recusa, mudança de plano, atraso, regularização e cancelamento ao final do período. Usar exclusivamente dados de pagamento de teste fornecidos pelo Stripe.
9. Conferir eventos no Stripe e histórico em Planos. Reenviar um evento para verificar que não duplica a assinatura. Testar dois cliques/sessões simultâneos. A liberação depende do webhook validado, nunca da URL de retorno.

Uma tentativa de checkout mantém o mesmo identificador por 45 minutos. Para mudar de plano antes de pagar, aguardar a expiração ou concluir o plano escolhido e usar o portal. Depois de criada uma assinatura, utilizar Gerenciar assinatura; o servidor impede iniciar outra assinatura ativa.

O webhook consulta o estado atual no Stripe antes de atualizar o banco. Eventos repetidos são ignorados; falhas temporárias retornam erro para nova entrega. Pagamento atrasado bloqueia os recursos pelo banco. Cancelamento agendado preserva o acesso enquanto a assinatura estiver válida. A assinatura do SaaS não é lançada no financeiro dos clientes da oficina.

### Ativar produção após homologar o provedor

1. Aplicar as migrações pendentes, incluindo `20261015000100_cobranca_producao.sql`, e publicar as duas Edge Functions de cobrança.
2. Definir os preços comerciais e criar produtos/preços mensais em BRL no ambiente real. Os preços de teste não são impostos à operação comercial.
3. Configurar `COBRANCA_AMBIENTE=producao`, `COBRANCA_HABILITADA=true`, `COBRANCA_PRODUCAO_HABILITADA=true`.
4. Preencher `STRIPE_AMOUNT_BASIC`, `STRIPE_AMOUNT_INTERMEDIATE`, `STRIPE_AMOUNT_COMPLETE` com os valores mensais definitivos em centavos. Preencher os IDs de preços, a chave `sk_live_...` ou `rk_live_...`, o segredo do webhook real e a configuração do portal real.
5. Conferir domínio HTTPS em `APP_URL`, versão de eventos e configuração do Customer Portal. Em produção o servidor exige preços explícitos e confere valor, moeda, recorrência e ambiente no Stripe.
6. Validar checkout, atualização, atraso, cancelamento e reentrega do webhook no ambiente configurado. Uma operação financeira real deve ser conduzida pelo responsável.

Não é necessária outra alteração de código para habilitar produção. Eventos de teste não podem substituir uma assinatura já vinculada à produção. Clientes Stripe são separados por ambiente. A interface mostra os valores retornados pelo servidor; não apresenta os preços de teste como oferta comercial.

Referências: [chaves e ambientes](https://docs.stripe.com/keys), [Checkout](https://docs.stripe.com/api/checkout/sessions/create), [portal](https://docs.stripe.com/customer-management/configure-portal), [assinaturas de webhook](https://docs.stripe.com/webhooks/signature).

## 3. E-mail de autenticação

1. Escolher um serviço compatível com SMTP e cadastrar/verificar seu domínio remetente.
2. Aplicar no DNS exatamente os registros fornecidos pelo serviço para autenticação do remetente.
3. Em Supabase → Authentication → SMTP Settings, cadastrar host, porta, usuário, senha, nome e endereço do remetente fornecidos pelo provedor. Essas credenciais não pertencem ao frontend.
4. Em Email Templates, usar os HTMLs de `supabase/templates/` nos tipos correspondentes. Eles preservam a variável `{{ .ConfirmationURL }}` do Supabase.
5. Conferir as URLs permitidas do Auth para o domínio publicado e a rota `/definir-senha`.
6. Validar criação de conta, confirmação, recuperação e convite com caixas de e-mail controladas pelo responsável. Conferir também link expirado e retorno ao sistema.

O SMTP padrão do Supabase tem restrições para destinatários e não deve ser tratado como envio comercial pronto. [Configuração oficial de SMTP](https://supabase.com/docs/guides/auth/auth-smtp). Os modelos seguem as [variáveis oficiais](https://supabase.com/docs/guides/auth/auth-email-templates).

## 4. IA, WhatsApp e n8n

Atualização de 02/10: o [atendimento de entrada por WhatsApp](atendimento-whatsapp.md) foi publicado para a instância de estudos, com conexão aberta verificada. Os dois fluxos de salões foram desativados. A validação de entrega real ainda depende de mensagem enviada de outro WhatsApp. Isso é independente dos lembretes e da IA descritos abaixo.

O fluxo existente está salvo e inativo. Seguir `expansao-documentos-site-automacoes.md` para configurar os segredos do servidor e o canal `estudos-whatsapp`. A interface exige revisão dos avisos; não habilitar disparos antes de validar um destinatário controlado. A chave de IA, modelo e limites precisam ser configurados e testados antes de declarar as sugestões operacionais.

## 5. Backup e recuperação

O backup do banco não contém os arquivos reais do Storage. [Documentação do Supabase](https://supabase.com/docs/guides/platform/backups).

1. Exportar o banco com `scripts/backup-banco.ps1`, informando a senha no prompt oculto. O destino precisa ser um arquivo novo `.dump` em pasta existente.
2. Disponibilizar a chave de servidor somente no ambiente local da sessão como `SUPABASE_BACKUP_SERVICE_ROLE_KEY` e executar `node scripts/backup-storage.mjs`. Não gravar a chave em comandos compartilhados ou no histórico do terminal.
3. O script copia os objetos de `workshop-files` para `backups/storage-DATA`, com tamanho, caminho e SHA-256. Só um `manifesto.json` marcado completo indica término. Um manifesto parcial não deve ser usado como backup concluído.
4. Executar `node scripts/verificar-backup-storage.mjs CAMINHO_DA_PASTA` para verificar integridade. Guardar cópias do banco e Storage juntas, criptografadas e fora desta máquina.
5. Para consistência entre registros e fotos, realizar o conjunto durante uma janela sem alterações. A cópia do Storage não é um snapshot transacional.
6. Restaurar o banco em projeto separado seguindo o [procedimento oficial de recuperação](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore). Não executar limpeza no banco ativo.
7. Criar o bucket privado `workshop-files` na cópia, se necessário. Disponibilizar `SUPABASE_RESTORE_SERVICE_ROLE_KEY` do destino e executar `node scripts/restaurar-storage.mjs CAMINHO_DA_PASTA REFERENCIA_DO_PROJETO_ISOLADO --confirmar-copia-isolada`.
8. A restauração das fotos recusa o projeto original e não sobrescreve objetos existentes. Uma falha pode deixar uma cópia parcial; revisar o destino antes de repetir.
9. Conferir login, permissões, contagens, fotos e atendimento completo na cópia. Só então registrar a recuperação como validada.

Os utilitários estão preparados; ainda não foi realizado backup remoto completo nem ensaio de recuperação com credenciais reais.

## 6. Publicação

O novo frontend é gerado em `dist/`. Publicar no provedor e domínio escolhidos, preservando o fallback SPA. A hospedagem e sua audiência não foram alteradas nesta revisão. Conferir as URLs do Auth caso o domínio mude. Links de orçamento e site destinados a clientes externos precisam estar acessíveis ao público.

Preencher as variáveis públicas de suporte, termos, privacidade e versão descritas em `.env.example`, usando documentos aprovados pelo responsável. Quando os dois documentos são configurados, a abertura da empresa pede o aceite e registra versão/data nos metadados da conta. Esse registro não substitui revisão jurídica nem auditoria imutável.

Depois da publicação, executar `node scripts/verificar-publicacao.mjs https://DOMINIO`. O comando consulta apenas `health.json` e rotas públicas. Ele não comprova saúde do banco, envio de e-mails ou funcionamento dos provedores. Configurar alertas externos e backups na infraestrutura escolhida; o código oferece diagnóstico local sanitizado em `/ajuda` e identificação do build, sem transmitir dados de clientes a um coletor externo.

Referência de infraestrutura: [checklist de produção do Supabase](https://supabase.com/docs/guides/deployment/going-into-prod).

Antes da abertura comercial ainda são necessários os ensaios reais de SMTP, provedor de cobrança, restauração e atendimento com duas sessões autenticadas. Build e testes locais aprovados não substituem esses ensaios.
