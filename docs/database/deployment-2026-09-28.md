# Implantacao do banco em 28/09/2026

## Projetos

- Organizacao: Murakami dev org (`lptdgoxbkxfxsclqgxwb`).
- Pausado por solicitacao do usuario: teste do salao `murakami-homologacao-limpa-20260924` (`ofbihkqtelxvfcuomvlc`). O painel confirmou o estado pausado.
- Reativado: `sistema_automotivo` (`hzihxtjirttetnfdujcx`). O painel mostrou Healthy e consultas SQL responderam.
- O terceiro projeto da organizacao nao foi alterado.

## Fundacao preservada

O preflight remoto encontrou 27 tabelas, cinco funcoes privadas e nenhum bucket. A migration 1 nao foi executada novamente. As assinaturas estruturais remotas coincidiram com a migration 1 aplicada localmente, normalizando espacos e ordenacao. A comparacao exclui constraints NOT NULL do catalogo pg_constraint (diferenca entre PostgreSQL 17 remoto e PGlite), mas verifica nulabilidade na assinatura das colunas.

| Categoria | Quantidade | MD5 da estrutura normalizada |
| --- | ---: | --- |
| Colunas | 289 | 6466f8359cbfdf8efabf4b8f0ed7a423 |
| Constraints | 191 | 24c6529aaa0ad5e21691c79baf347e03 |
| Funcoes privadas | 5 | b3940e42cbf3ff518abd1cd5ffed0d2a |
| Indices | 81 | dfaf8e2383b45885014e6bc0a5dc0d7f |
| Politicas RLS | 11 | e44a730282f42fe95c2ad42edb84eafa |
| Triggers | 19 | 018ac87db164acf68fc6b4fcafc63842 |

Consulta reproduzivel: `supabase/tests/foundation-fingerprint.sql`. Referencia local: `supabase/tests/fingerprint-foundation.mjs`, com o mesmo DB_VALIDATION_RUNTIME do teste de produto. Esta assinatura representa somente a fundacao antes da expansao; naturalmente muda apos o deploy.

## Aplicacao

Executadas sequencialmente pelo SQL Editor, cada uma confirmada com `Success. No rows returned`:

1. `20260928000200_workshop_product.sql`.
2. `20260928000300_product_operations.sql`.
3. `20260928000400_storage_and_guards.sql`.

O detector do editor nao reconheceu o bloco dinamico que habilita RLS na migration 2. O SQL original foi executado sem injecao automatica adicional; todas as tabelas tiveram RLS habilitada pela propria migration na transacao. A verificacao posterior confirmou isso.

## Verificacao remota

- 48 tabelas no schema public; todas as 48 com RLS habilitada.
- Planos basic, intermediate e complete presentes.
- Nove RPCs do produto presentes.
- Bucket workshop-files privado (`public=false`).
- View workshop_board com `security_invoker=true`.
- Zero tabelas public com privilegios SELECT/INSERT/UPDATE/DELETE para anon.

Nao foram criados clientes ou usuarios ficticios no projeto. Os 60 testes de comportamento anteriormente executados continuam sendo testes locais, com Auth/Storage simulados. JWT, PostgREST, uploads, concorrencia real, frontend, WhatsApp e n8n ainda precisam ser integrados e homologados.

## Historico de migrations

Os hashes dos arquivos locais estao em `deployment-2026-09-28.json`. Este documento e o manifesto sao o registro desta aplicacao manual; nao substituem o historico remoto do Supabase CLI.

Antes de usar `supabase db push`, vincular e conferir o projeto correto, consultar `supabase migration list` e reconciliar o historico das quatro versoes implantadas. A primeira e baseline de estrutura preexistente verificada; as demais foram executadas nesta entrega. Nao reaplicar as migrations sobre o banco atual. Novas mudancas devem ser novos arquivos de migration.

## Atualização posterior: nomes em português

A migração 20260928000500_nomes_em_portugues.sql foi aplicada com sucesso pelo Editor SQL. As 48 tabelas, 526 campos de tabelas e mapa e nove operações públicas passaram a usar os nomes documentados em dicionario-portugues.md. O mapa agora se chama mapa_oficina. Foram preservados os controles RLS, relacionamentos, dados e códigos de integração. O manifesto desta atualização está em implantacao-portugues-2026-09-28.json. O histórico do CLI precisa considerar agora cinco versões aplicadas.

