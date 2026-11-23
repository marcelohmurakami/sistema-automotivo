begin;
-- Completa a ficha geral sem reclassificar empresas ou alterar fichas históricas.
-- Preserva os outros 25 perfis e os identificadores já persistidos.
do $migration$
declare perfis jsonb := private.perfis_atendimento();
begin
  perfis := jsonb_set(perfis, '{assistencia_geral,campos}',
    (perfis #> '{assistencia_geral,campos}') ||
    '{"defeito":{"tipo":"area"},"retirada_prevista":{"tipo":"data"},"recebedor":{"tipo":"texto"}}'::jsonb);
  if not (perfis #> '{assistencia_geral,etapas}') ? 'Entregue' then
    perfis := jsonb_set(perfis, '{assistencia_geral,etapas}',
      (perfis #> '{assistencia_geral,etapas}') || '["Entregue"]'::jsonb);
  end if;
  execute format(
    'create or replace function private.perfis_atendimento() returns jsonb language sql immutable set search_path='''' as %L',
    'select ' || quote_literal(perfis::text) || '::jsonb'
  );
end $migration$;
commit;
