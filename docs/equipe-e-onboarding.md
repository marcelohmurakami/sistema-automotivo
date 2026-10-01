# Equipe e entrada de oficinas

Implementado em 30/09/2026. Migração `20260930000300_equipe_onboarding.sql` aplicada no projeto Supabase `hzihxtjirttetnfdujcx`. Não reaplicar.

## Uso

- `/equipe`: proprietário visualiza membros e até 100 convites recentes, convida, altera gerente/funcionário, suspende e reativa.
- Convites: informar e-mail e perfil; copiar o link e compartilhar manualmente. Nenhum e-mail ou WhatsApp é enviado pela tela. O link só aparece após a criação; para recuperar, gerar outro (revoga o anterior para o mesmo e-mail).
- `/convite#TOKEN`: entrar ou cadastrar conta com o e-mail convidado e confirmado. Antes do aceite, o destinatário vê nome da oficina e perfil. O aceite é explícito e adiciona a oficina ao seletor.
- `/cadastro`: criação de conta pelo Supabase Auth e instrução de confirmação por e-mail. A entrega depende da configuração de e-mail/SMTP do projeto. Em produção, cadastrar o domínio em Auth > URL Configuration (Site URL e redirects permitidos para `/entrar`). Não foram enviados e-mails de teste nesta implementação.
- `/nova-oficina`: dados de contato e endereço, revisão em um segundo passo, criação no Básico, proprietário automático. Também disponível como “Cadastrar outra oficina”. Retentativa com a mesma chave no navegador não duplica a empresa.
- Dados cadastrados podem ser alterados nas Configurações existentes. Recursos continuam limitados à assinatura da oficina.

## Permissões e segurança

Somente proprietário administra equipe. Gerente mantém acesso à operação, configurações e financeiro/relatórios contratados; funcionário mantém acesso operacional. Rotas de financeiro e relatórios também bloqueiam funcionários no frontend. O banco continua sendo a autoridade para cada operação.

Não há transferência de propriedade nesta tela; não se pode convidar um proprietário nem suspender/alterar um proprietário. A equipe só recebe novas permissões após ação explícita do responsável.

Convites duram sete dias, são vinculados ao e-mail confirmado e guardam somente SHA-256 de token aleatório de 256 bits. Hash e token não são expostos pela listagem. Convite usado não reativa acesso suspenso; repetição do aceite por membro ainda ativo é idempotente. Expiração, revogação e assinatura são conferidas no servidor. Limite de 30 convites por hora por oficina.

Mutações de equipe são serializadas por oficina e alterações de membros usam revisão otimista (PT409). Ações são registradas em auditoria. Novas tabelas têm RLS e nenhuma leitura/escrita direta para anon/authenticated; acesso por RPC restrita. Gestão de acessos pelo proprietário permanece disponível mesmo com plano suspenso, inclusive para revogar/suspender.

Permissões da sessão são consultadas a cada 30 segundos e ao refocar a página. Novas operações no servidor verificam o vínculo ativo. A mudança de perfil remonta o conteúdo protegido. Arquivos ou dados já entregues anteriormente não são recolhidos por suspensão de membro.

O token permanece no fragmento do link e em sessionStorage durante login/cadastro, sendo removido ao aceitar ou sair do fluxo. Se a confirmação do e-mail abrir outro navegador, reabrir o convite original nesse navegador. Senhas e credenciais administrativas não são armazenadas na aplicação.

## Validação

- 34 verificações locais de equipe/onboarding em PGlite, com Auth simulado: confirmação de e-mail, idempotência, Básico, dados iniciais, e-mail incorreto, isolamento, perfis, escrita direta, proprietário protegido, revisão, suspensão/reativação, convites substituídos/revogados/expirados, assinatura e auditoria.
- 25 verificações de orçamentos e 28 de OS sobre o novo esquema: aprovadas (87 verificações no total).
- TypeScript/Vite e lint: aprovados.
- Navegador: tela da equipe em demonstração, diálogo de acesso, mudança para gerente suspenso, cadastro público e viewport 390 × 844 sem overflow horizontal. Tema escuro conferido. Alterações de equipe da demonstração são temporárias e não geram convites reais.
- Remoto: aplicação SQL concluída; consulta confirmou 7 RPCs, RLS ativo, convites sem SELECT direto, aceite permitido a authenticated e negado a anon.
- Ainda não exercitado: convite real aceito pela interface em duas contas, cadastro real com entrega de confirmação por e-mail e configuração inicial via navegador autenticado. Não confundir testes locais/checagem de implantação com esses testes completos.

Arquivos principais: `src/pages/Equipe.tsx`, `src/pages/EntradaOficina.tsx`, `src/services/equipe.ts`, `src/pages/Equipe.css`. Teste: `supabase/tests/validate-equipe.mjs`, com `DB_VALIDATION_RUNTIME` apontando para PGlite.
