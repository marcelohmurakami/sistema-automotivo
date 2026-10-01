# Banco do sistema automotivo

Comece pelo [dicionário em português](../docs/database/dicionario-portugues.md). Ele lista as 48 tabelas, os campos e as nove operações públicas. Veja também o [modelo do produto](../docs/database/product-v2.md).

## Estado do banco

Projeto Supabase: `sistema_automotivo` (`hzihxtjirttetnfdujcx`).

- Cinco migrações compõem a estrutura atual. As quatro primeiras são o histórico original; a quinta traduz os nomes.
- 48 tabelas com segurança por linha (RLS), três planos e armazenamento privado para fotos e PDFs.
- Nomes atuais incluem `oficinas`, `clientes`, `veiculos`, `orcamentos`, `ordens_servico` e `mapa_oficina`.
- A migração de tradução preserva dados, relacionamentos, documentos já emitidos e permissões.
- O histórico do Supabase CLI ainda precisa ser conciliado antes de usar `db push`. Não reaplique as cinco migrações no banco atual.

## Arquivos

- `migrations/`: mudanças do banco, executadas em ordem num ambiente novo.
- `tests/validate-product.mjs`: testes de comportamento e segurança.
- `tests/nomes-portugues.mjs`: correspondência entre nomes anteriores e atuais.
- `tests/gerar-migracao-portugues.mjs`: origem reproduzível da migração 5 e do dicionário; não execute para alterar uma migração já aplicada.

## Validação local

Com `DB_VALIDATION_RUNTIME` configurado para o PGlite, execute:

```powershell
node supabase/tests/validate-product.mjs
$env:DB_TESTAR_UPGRADE = '1'
node supabase/tests/validate-product.mjs
Remove-Item Env:DB_TESTAR_UPGRADE
```

Resultados: 63 verificações no banco traduzido e 115 no cenário de migração com dados. Auth e Storage são simulados nesses testes. A aplicação no Supabase e a verificação do catálogo remoto foram realizadas pelo painel; isso ainda não substitui testes reais do aplicativo.

Login, clientes e orçamentos estão integrados. As demais telas, WhatsApp automático e execução de automações ainda precisam ser implementados.

## Clientes e planos — migração 6

Aplicada em 28/09/2026: `20260928000600_clientes_e_acesso_por_plano.sql`.
Veja `docs/clientes-e-planos.md` para as quatro RPCs novas, os campos de clientes, a matriz de acesso e a suíte `supabase/tests/validate-clientes-planos.mjs` (39 verificações).

## Orçamentos — migração 7

Aplicada em 28/09/2026: `20260928000700_fluxo_orcamentos.sql`. Não reaplicar. Consulte `docs/orcamentos.md`. Testes: `node supabase/tests/validate-orcamentos.mjs`, usando o mesmo DB_VALIDATION_RUNTIME.

## Ordens de serviço — migrações 8 e 9

Aplicadas em 29/09/2026: `20260928000800_modulo_ordens_servico.sql` e `20260929000100_correcao_itens_os.sql`. Consulte `docs/ordens-servico.md`. A suíte `tests/validate-ordens-servico.mjs` valida 28 cenários locais.

## Estoque — migração 10

Aplicada em 29/09/2026: `20260929000200_estoque_integrado_os.sql`. Consulte `docs/estoque.md`. A suíte `tests/validate-estoque.mjs` valida 27 cenários locais. Duas tabelas novas com RLS e baixa transacional da OS na entrega.
