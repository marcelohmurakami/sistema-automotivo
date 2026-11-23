begin;

-- Uma visita pode terminar sem encerrar a OS que reúne várias etapas.
alter table public.agenda_atendimentos drop constraint agenda_atendimentos_situacao_check;
alter table public.agenda_atendimentos add constraint agenda_atendimentos_situacao_check
  check(situacao in ('agendado','cancelado','convertido','concluido'));

do $$
declare s text; trecho text := 'resposta:=private.base_execucao_offline(p_oficina,auto,gid,did);';
begin
  s:=pg_get_functiondef('public.sincronizar_execucao_offline(uuid,uuid,jsonb,jsonb)'::regprocedure);
  if position(trecho in s)=0 then raise exception 'Contrato da sincronização offline alterado';end if;
  s:=replace(s,trecho,$patch$
    if p_dados ? 'visita_concluida' and jsonb_typeof(p_dados->'visita_concluida') is distinct from 'boolean' then
      raise exception 'Confira a conclusão da visita.' using errcode='22023';
    end if;
    if coalesce((p_dados->>'visita_concluida')::boolean,false) then
      if gid is null or inicio is null or fim is null then
        raise exception 'Registre início e término para concluir a visita.' using errcode='22023';
      end if;
      if auto then
        update public.agenda_atendimentos set situacao='concluido',revisao=revisao+1
          where oficina_id=p_oficina and id=gid and situacao in ('agendado','convertido');
      elsif g->>'situacao'<>'concluido' then
        perform public.salvar_agenda_servico(p_oficina,gid,g||'{"situacao":"concluido"}',(g->>'revisao')::int);
      end if;
    end if;
    resposta:=private.base_execucao_offline(p_oficina,auto,gid,did);
  $patch$);
  execute s;
end $$;
notify pgrst,'reload schema';
commit;
