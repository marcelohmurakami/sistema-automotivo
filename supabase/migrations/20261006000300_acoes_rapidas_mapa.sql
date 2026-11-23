begin;

-- Ações do cartão são atômicas e exigem a revisão que o funcionário está vendo.
create function public.operar_mapa_rapido(
  p_oficina uuid, p_os uuid, p_revisao integer, p_acao text,
  p_motivo text default null, p_detalhes text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  o public.ordens_servico%rowtype;
  parada record;
  alterados jsonb;
  detalhe text;
begin
  perform private.require_staff(p_oficina);
  if not private.has_feature(p_oficina,'production_board') then
    raise exception 'Recurso indisponível' using errcode='42501';
  end if;
  if p_acao is null or p_acao not in ('concluir','parar','retomar') then
    raise exception 'Ação inválida.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('financeiro-os:'||p_oficina||':'||p_os,0));
  select * into o from public.ordens_servico where oficina_id=p_oficina and id=p_os for update;
  if not found then raise exception 'OS não encontrada.' using errcode='P0002'; end if;
  if p_revisao is null or o.revisao<>p_revisao then
    raise exception 'Esta OS foi alterada. Confira o mapa atualizado e tente novamente.' using errcode='40001';
  end if;
  if o.situacao in ('delivered','cancelled') then
    raise exception 'OS encerrada: histórico preservado.' using errcode='23514';
  end if;

  if p_acao='concluir' then
    if o.situacao<>'quality_check' then
      raise exception 'Leve o serviço à conferência antes de concluir.' using errcode='23514';
    end if;
    if exists(select 1 from public.paradas_ordem_servico where oficina_id=p_oficina and ordem_servico_id=p_os and encerrado_em is null) then
      raise exception 'Retome o serviço e resolva as paradas antes de concluir.' using errcode='23514';
    end if;
    with itens as (
      update public.itens_ordem_servico set situacao='done',concluido_em=now()
      where oficina_id=p_oficina and ordem_servico_id=p_os and situacao not in ('done','cancelled')
      returning id
    ) select coalesce(jsonb_agg(id),'[]'::jsonb) into alterados from itens;
    if jsonb_array_length(alterados)>0 then
      perform private.evento_os(p_oficina,p_os,'Itens concluídos pelo mapa da oficina.',jsonb_build_object('acao','concluir_no_mapa','itens',alterados));
      select revisao into o.revisao from public.ordens_servico where oficina_id=p_oficina and id=p_os;
    end if;
    perform public.atualizar_mapa_ordem_servico(p_oficina,p_os,o.revisao,'ready',o.etapa_id,o.local_id,o.entrega_prevista_em,o.recebido_em,null);
  elsif p_acao='parar' then
    if o.situacao not in ('open','in_progress','quality_check') then
      raise exception 'Volte à conferência antes de parar um serviço concluído.' using errcode='23514';
    end if;
    if exists(select 1 from public.paradas_ordem_servico where oficina_id=p_oficina and ordem_servico_id=p_os and encerrado_em is null) then
      raise exception 'Este serviço já está parado. Confira a pendência no mapa.' using errcode='23514';
    end if;
    if p_motivo is null or p_motivo not in ('parts','approval','third_party','capacity','diagnosis','other') or length(p_detalhes)>2000 then
      raise exception 'Selecione um motivo e use detalhes com até 2.000 caracteres.' using errcode='22023';
    end if;
    detalhe:=coalesce(nullif(trim(p_detalhes),''),case p_motivo
      when 'parts' then 'Aguardando peças' when 'approval' then 'Aguardando aprovação'
      when 'third_party' then 'Aguardando terceiros' when 'capacity' then 'Sem capacidade disponível'
      when 'diagnosis' then 'Aguardando diagnóstico' else 'Outra pendência' end);
    perform public.registrar_parada_os(p_oficina,p_os,p_motivo,detalhe);
  else
    if not exists(select 1 from public.paradas_ordem_servico where oficina_id=p_oficina and ordem_servico_id=p_os and encerrado_em is null) then
      raise exception 'Este serviço não está parado.' using errcode='23514';
    end if;
    -- Retomar resolve as pendências exibidas no cartão, preservando a etapa anterior.
    for parada in select id from public.paradas_ordem_servico where oficina_id=p_oficina and ordem_servico_id=p_os and encerrado_em is null order by id loop
      perform public.resolver_parada_os(p_oficina,p_os,parada.id);
    end loop;
  end if;
  select * into o from public.ordens_servico where oficina_id=p_oficina and id=p_os;
  return jsonb_build_object('situacao',o.situacao,'revisao',o.revisao,'recebido_em',o.recebido_em,
    'paradas',coalesce((select jsonb_agg(jsonb_build_object('id',id,'motivo',motivo,'detalhes',detalhes,'encerrado_em',encerrado_em) order by iniciado_em desc,id)
      from public.paradas_ordem_servico where oficina_id=p_oficina and ordem_servico_id=p_os),'[]'::jsonb));
end $$;

revoke all on function public.operar_mapa_rapido(uuid,uuid,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.operar_mapa_rapido(uuid,uuid,integer,text,text,text) to authenticated;
notify pgrst, 'reload schema';
commit;
