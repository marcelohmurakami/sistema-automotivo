# Acesso inicial e carga de exemplos — 28/09/2026

Projeto: `sistema_automotivo` (`hzihxtjirttetnfdujcx`).

- Empresa: **Oficina do Marcelo**.
- Oficina: `7d2e8401-b6fc-45b8-9582-e825e7c08681`.
- Usuário: `ef17b401-a899-4a48-9452-99b34f53bf6b`, criado por convite no Supabase Auth para o e-mail informado pelo proprietário.
- Perfil: proprietário (`owner`), ativo.
- Plano inicial: Básico (`basic`), ativo. Nenhuma cobrança foi criada.
- Dados fictícios persistidos: 8 clientes, 8 veículos, 8 vínculos e 12 itens de catálogo. As cinco etapas padrão também foram criadas pelo gatilho da oficina.
- Clientes e itens de catálogo são identificados por `[Exemplo]`. Contatos usam `example.com`; veículos não receberam placas reais. Não foram disparadas mensagens aos contatos de exemplo.

A carga está em `supabase/seeds/oficina-marcelo.sql`, separada das migrações estruturais. Possui IDs fixos, transação e proteção para não reivindicar uma oficina de outro usuário. Reexecutar não duplica nem sobrescreve registros existentes. O teste local `supabase/tests/validate-carga-inicial.mjs` aplicou a carga duas vezes e confirmou o acesso do proprietário aos oito clientes.

## Definir a senha

O convite foi enviado pelo Supabase e seu registro foi confirmado em `auth.users.invited_at`. A senha deve ser definida pelo próprio usuário; não foi criada senha temporária, armazenada senha em arquivo ou alterada a tabela de senhas diretamente.

A Site URL do projeto foi alterada do valor inicial `http://localhost:3000` para `http://127.0.0.1:5173/definir-senha`. Não foram incluídos curingas nos retornos de autenticação. Esta configuração é local: o convite deve ser aberto no computador em que `npm run dev` está rodando. Ao publicar o sistema, atualizar a Site URL para a URL HTTPS do domínio e manter somente retornos autorizados.

A rota `/definir-senha` valida a presença de sessão obtida pelo convite, solicita senha e confirmação, chama `auth.updateUser` e sai do modo demonstração após o sucesso. Sem convite/sessão, apresenta instrução para abrir o e-mail, sem permitir alteração de senha. A definição e a confirmação da senha não foram executadas pelo agente.

Verificados: build, lint, carga local sem duplicações e quantidades no Supabase remoto. O usuário precisa concluir o convite para testar o login autenticado no navegador.
