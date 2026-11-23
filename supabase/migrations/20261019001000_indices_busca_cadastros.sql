-- A busca por trecho usa trigramas. Não basta limitar o resultado se o banco
-- ainda precisa percorrer todos os cadastros para encontrar as 30 opções.
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
do $$
declare ns text;
begin
 select n.nspname into ns from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pg_trgm';
 execute format('create index if not exists clientes_busca_trgm on public.clientes using gin ((private.texto_busca(nome||'' ''||coalesce(telefone_e164,'''')||'' ''||coalesce(email,''''))) %I.gin_trgm_ops)',ns);
 execute format('create index if not exists veiculos_placa_busca_trgm on public.veiculos using gin ((lower(replace(coalesce(placa,''''),''-'',''''))) %I.gin_trgm_ops) where arquivado_em is null',ns);
 execute format('create index if not exists catalogo_descricao_busca_trgm on public.itens_catalogo using gin ((private.texto_busca(descricao)) %I.gin_trgm_ops)',ns);
 execute format('create index if not exists estoque_codigo_busca_trgm on public.estoque_produtos using gin ((private.texto_busca(coalesce(codigo,''''))) %I.gin_trgm_ops)',ns);
end $$;
