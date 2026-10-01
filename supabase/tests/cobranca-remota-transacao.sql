-- Executar no SQL Editor administrativo. Nenhuma alteração persiste após ROLLBACK.
begin;
select set_config('request.jwt.claim.sub','ef17b401-a899-4a48-9452-99b34f53bf6b',true);
set local role authenticated;
do $$
declare oficina uuid:='7d2e8401-b6fc-45b8-9582-e825e7c08681'; chave uuid:=gen_random_uuid(); evento uuid; acesso jsonb;
begin
  if not (public.consultar_cobranca_teste(oficina)->>'habilitado')::boolean then raise exception 'Simulador não habilitado'; end if;
  evento:=public.simular_cobranca(oficina,chave,'aprovar','complete');
  if evento is distinct from public.simular_cobranca(oficina,chave,'aprovar','complete') then raise exception 'Duplicação de operação'; end if;
  select x into acesso from jsonb_array_elements(public.consultar_meu_acesso()) x where x->>'id'=oficina::text;
  if acesso->>'codigo_plano'<>'complete' or not (acesso->'recursos' ? 'ai') then raise exception 'Falha na liberação do plano'; end if;
  perform public.simular_cobranca(oficina,gen_random_uuid(),'atrasar','complete');
  select x into acesso from jsonb_array_elements(public.consultar_meu_acesso()) x where x->>'id'=oficina::text;
  if acesso->>'situacao'<>'past_due' or jsonb_array_length(acesso->'recursos')<>0 then raise exception 'Falha no bloqueio por atraso'; end if;
  perform public.simular_cobranca(oficina,gen_random_uuid(),'aprovar','basic');
  select x into acesso from jsonb_array_elements(public.consultar_meu_acesso()) x where x->>'id'=oficina::text;
  if acesso->>'codigo_plano'<>'basic' or jsonb_array_length(acesso->'recursos')<>3 then raise exception 'Falha na regularização'; end if;
end $$;
select 'APROVADO: idempotência, plano Completo, atraso e regularização. Tudo será revertido.' as resultado;
rollback;
