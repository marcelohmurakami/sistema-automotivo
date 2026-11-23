-- Criação atômica com itens: os mesmos controles da conclusão normal continuam ativos.
begin;
create or replace function public.criar_atendimento_com_itens(p_oficina uuid,p_id uuid,p_dados jsonb,p_itens jsonb,p_desconto bigint default 0,p_revisao integer default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare
 revisao_atual integer;
 situacao_final text := coalesce(p_dados->>'situacao','orcamento');
 inicial jsonb := p_dados;
 final jsonb;
 ficha jsonb := p_dados->'ficha_especialidade';
begin
 perform private.conferir_operacao(p_oficina,'criar_atendimento_com_itens');
 perform private.exigir_servicos(p_oficina,'work_orders');
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_id::text,0));
 if exists(select 1 from public.atendimentos_servicos where oficina_id=p_oficina and id=p_id) then return p_id; end if;
 if p_revisao is not null or p_id is null or situacao_final not in ('orcamento','aprovado','em_execucao','aguardando','concluido') then
  raise exception 'Situação inválida para abrir o atendimento.' using errcode='22023';
 end if;
 if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens)>100 then raise exception 'Lista de itens inválida.' using errcode='22023';end if;
 -- A etapa final e o aceite só entram na conclusão, depois da gravação dos itens.
 -- Nenhuma etapa intermediária fica visível fora desta transação.
 if situacao_final='concluido' and jsonb_typeof(ficha)='object' then
  inicial := jsonb_set(inicial,'{ficha_especialidade}',jsonb_set(
    jsonb_set(ficha,'{etapa}',coalesce(private.perfis_atendimento()->(ficha->>'especialidade')->'etapas'->0,'""'::jsonb)),
    '{campos}',coalesce(ficha->'campos','{}'::jsonb)-'situacao_aceite'-'aceite'-'data_aceite'-'ressalvas_aceite'));
 end if;
 perform public.salvar_atendimento_servico(p_oficina,p_id,inicial||'{"situacao":"orcamento","valor_centavos":0}'::jsonb,null);
 select revisao into revisao_atual from public.atendimentos_servicos where oficina_id=p_oficina and id=p_id;
 perform public.salvar_itens_atendimento(p_oficina,p_id,revisao_atual,p_itens,p_desconto,0,'');
 if situacao_final<>'orcamento' then
  select revisao,to_jsonb(a)||jsonb_build_object('situacao',situacao_final) into revisao_atual,final from public.atendimentos_servicos a where oficina_id=p_oficina and id=p_id;
  if situacao_final='concluido' and jsonb_typeof(ficha)='object' then final:=jsonb_set(final,'{ficha_especialidade}',ficha); end if;
  perform public.salvar_atendimento_servico(p_oficina,p_id,final,revisao_atual);
 end if;
 return p_id;
end $$;
revoke all on function public.criar_atendimento_com_itens(uuid,uuid,jsonb,jsonb,bigint,integer) from public,anon;
grant execute on function public.criar_atendimento_com_itens(uuid,uuid,jsonb,jsonb,bigint,integer) to authenticated;
commit;
