-- Versão alinhada ao registro confirmado na migração do Supabase conectado.
-- A abertura enviada pelo aparelho já admite até cinco minutos de diferença.
-- Ao encerrar sem data explícita, respeitar essa abertura evita uma resolução
-- anterior à ocorrência quando o relógio do aparelho está alguns segundos adiantado.
-- Datas explicitamente informadas continuam sujeitas às validações existentes.
do $$
declare
  definicao text;
  original constant text := 'coalesce(novo.resolvido_em,now())';
  corrigido constant text := 'coalesce(novo.resolvido_em,greatest(now(),novo.aberto_em))';
begin
  definicao := pg_get_functiondef('public.salvar_ocorrencia_qualidade(uuid,uuid,jsonb,integer)'::regprocedure);
  if strpos(definicao, corrigido) = 0 then
    if strpos(definicao, original) = 0 then
      raise exception 'A função de qualidade mudou. Revise a correção de data antes de aplicar.';
    end if;
    execute replace(definicao, original, corrigido);
  end if;
end $$;

notify pgrst, 'reload schema';
