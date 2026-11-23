begin;

-- Amplia somente as voltas operacionais. Entregues e canceladas permanecem encerradas.
do $$
declare d text; antigo text; novo text;
begin
  d := pg_get_functiondef('public.atualizar_mapa_ordem_servico(uuid,uuid,integer,text,uuid,uuid,timestamptz,timestamptz,text)'::regprocedure);
  antigo := '(w.situacao=''in_progress'' and p_situacao in (''quality_check'',''cancelled''))';
  novo := '(w.situacao=''in_progress'' and p_situacao in (''open'',''quality_check'',''cancelled''))';
  if position(antigo in d)=0 then raise exception 'Definição de andamento inesperada; migração interrompida.'; end if;
  d := replace(d, antigo, novo);
  antigo := '(w.situacao=''ready'' and p_situacao in (''in_progress'',''delivered'',''cancelled''))';
  novo := '(w.situacao=''ready'' and p_situacao in (''quality_check'',''in_progress'',''delivered'',''cancelled''))';
  if position(antigo in d)=0 then raise exception 'Definição de entrega inesperada; migração interrompida.'; end if;
  d := replace(d, antigo, novo);
  antigo := 'when p_situacao=''in_progress'' then null else concluido_em';
  novo := 'when p_situacao in (''open'',''in_progress'',''quality_check'') then null else concluido_em';
  if position(antigo in d)=0 then raise exception 'Definição de conclusão inesperada; migração interrompida.'; end if;
  execute replace(d, antigo, novo);
end $$;

-- Uma chamada preserva os dados atuais e reutiliza as validações e integrações da OS.
create function public.mover_ordem_no_mapa(p_oficina uuid, p_os uuid, p_revisao integer, p_direcao text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.ordens_servico%rowtype; destino text; revisao_nova integer;
begin
  perform private.require_staff(p_oficina);
  if not private.has_feature(p_oficina,'production_board') then
    raise exception 'Recurso indisponível' using errcode='42501';
  end if;
  if p_direcao is null or p_direcao not in ('voltar','avancar') then
    raise exception 'Direção inválida.' using errcode='22023';
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
  if exists(select 1 from public.paradas_ordem_servico where oficina_id=p_oficina and ordem_servico_id=p_os and encerrado_em is null) then
    raise exception 'Resolva a parada na OS antes de mudar a etapa.' using errcode='23514';
  end if;
  destino := case when p_direcao='avancar' then
    case o.situacao when 'open' then 'in_progress' when 'in_progress' then 'quality_check' when 'quality_check' then 'ready' when 'ready' then 'delivered' end
  else
    case o.situacao when 'in_progress' then 'open' when 'quality_check' then 'in_progress' when 'ready' then 'quality_check' end
  end;
  if destino is null then raise exception 'Não há outra etapa nesta direção.' using errcode='23514'; end if;
  revisao_nova := public.atualizar_mapa_ordem_servico(p_oficina,p_os,p_revisao,destino,o.etapa_id,o.local_id,o.entrega_prevista_em,o.recebido_em,null);
  return jsonb_build_object('situacao',destino,'revisao',revisao_nova,'recebido_em',o.recebido_em);
end $$;

revoke all on function public.mover_ordem_no_mapa(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.mover_ordem_no_mapa(uuid,uuid,integer,text) to authenticated;
notify pgrst, 'reload schema';
commit;
