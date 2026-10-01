# Homologação — 1º de outubro de 2026

Este ambiente usa o Supabase `hzihxtjirttetnfdujcx`. O nome `main / PRODUCTION` mostrado no painel indica a branch principal do Supabase; não certifica que o produto esteja pronto para uso comercial.

## Cobrança de teste

Preços de referência autorizados para teste: Básico R$ 49, Intermediário R$ 99 e Completo R$ 199 por mês. Não há gateway contratado ou cobrança real. `/planos` permite simular aprovação, recusa, atraso e cancelamento.

A migração `20261001000600` cria a configuração de oficinas permitidas e o histórico imutável das simulações. Somente o proprietário de uma oficina habilitada pela administração pode operar. A Oficina do Marcelo foi habilitada; a assinatura atual não foi trocada automaticamente. Novas oficinas não entram nesse modo por padrão. Não habilitar clientes comerciais nessa lista.

- Aprovar: muda o plano e libera acesso por 30 dias.
- Recusar: registra a tentativa sem alterar o plano atual.
- Atrasar/cancelar: bloqueia os módulos pelo banco; `/planos` continua acessível para regularização de teste.
- O simulador rejeita assinaturas vinculadas a provedores reais.
- Uma chave por operação impede duplicação quando a conexão cai e o cliente repete a solicitação.

O histórico não é uma fatura e nunca entra no financeiro da oficina. Pagamentos recorrentes, webhooks assinados de um gateway, conciliação e cobrança automática real continuam pendentes.

## Acesso e implantação

O frontend é uma aplicação estática com fallback SPA, configurada em `.openai/hosting.json`. O projeto Sites é privado: só o proprietário consegue abrir a hospedagem. Compartilhamento com clientes externos exige uma publicação com audiência apropriada; um link de orçamento hospedado nessa versão privada não substitui essa liberação.

`/recuperar-senha` solicita o e-mail pelo Supabase; `/definir-senha` conclui a troca. A confirmação de conta continua obrigatória. O domínio da hospedagem e os endereços locais precisam constar na lista de retorno do Auth. O arquivo `.env.local` contém apenas a URL e a chave pública do Supabase e não entra no repositório. Chaves de servidor nunca devem usar prefixo `VITE_`.

## Verificações

328 verificações locais aprovadas com todas as migrações até `20261001000600`: clientes/planos (39), orçamentos (25), OS (28), estoque (27), financeiro (37), compras (36), gestão (22), catálogo (25), mapa (3), equipe (34), documentos/portal/automações (35), cobrança de homologação (17).

Testes antigos foram atualizados para o contrato HTTP 409 e para a matriz atual de recursos. PGlite exercita SQL/RLS e transações, mas não substitui o serviço Auth, uploads de Storage e sessões reais no navegador.

Também aprovado no Supabase remoto: simulação idempotente, liberação do Completo, bloqueio por atraso e regularização no Básico, usando o papel `authenticated` dentro de uma transação revertida ao final. A assinatura original da Oficina do Marcelo foi preservada. Esse teste do banco não equivale a autenticar duas pessoas no navegador.

TypeScript e ESLint aprovados. URLs de Auth gravadas para a hospedagem e para desenvolvimento local. Interface de planos e recuperação de senha conferida no navegador.

## Dependências ainda não validadas

- IA e WhatsApp: faltam segredos de servidor e destinatário de teste confirmado. Workflow n8n salvo e inativo; não há envio automático ativo.
- E-mail: SMTP próprio e entrega/recuperação pelo domínio final ainda precisam de validação real.
- Portal e fotos de orçamento: fluxo de duas contas e upload real até a proposta pública ainda precisam de teste autenticado. As senhas das contas de QA não estão disponíveis nesta sessão.
- Backup: há utilitários PostgreSQL 17 instalados, mas a senha da conexão do banco não está disponível; não foi produzido um dump nem concluído um teste de restauração.

Não considerar estes itens concluídos só porque o build passou. Consulte também `expansao-documentos-site-automacoes.md` para os nomes dos segredos e o fluxo de ativação.

## Backup e recuperação

1. Criar uma pasta protegida fora do código ou `backups/` (ignorada pelo Git).
2. Executar `scripts/backup-banco.ps1 -Destino CAMINHO_ABSOLUTO.dump`. Informar a senha existente apenas no prompt oculto. Para conexão por pooler, informar host e usuário do painel Connect; usar modo sessão, porta 5432.
3. Guardar o dump e o SHA-256 em armazenamento protegido. O dump contém dados privados, inclusive dados do Auth. Não anexar ao Git nem a conversas.
4. Copiar separadamente os objetos do bucket `workshop-files`: o dump guarda metadados, não o conteúdo das fotos.
5. Restaurar em um projeto isolado seguindo o procedimento de recuperação do Supabase para a versão usada. Nunca executar `--clean` no banco ativo.
6. Conferir contagens, vínculos, login, RLS, fotos e um atendimento completo na cópia. Registrar data, duração e evidências antes de declarar a restauração validada.
7. Antes do uso comercial, definir periodicidade, retenção e alerta para falhas de backup, com um teste recorrente de restauração.

Para recuperar o frontend, republicar um commit conhecido e seu build correspondente. Não reverter migrações apagando tabelas: corrigir com uma nova migração compatível com os dados existentes.
