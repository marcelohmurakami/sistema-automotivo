begin;
-- Mantém as devoluções vinculadas à reabertura do atendimento, com auditoria.
alter function public.estornar_movimentacao_estoque(uuid,uuid,text) rename to estornar_movimentacao_estoque_base;
revoke all on function public.estornar_movimentacao_estoque_base(uuid,uuid,text) from public,anon,authenticated;
create function public.estornar_movimentacao_estoque(p_oficina uuid,p_movimento uuid,p_motivo text) returns uuid language plpgsql security definer set search_path='' as $$
begin
 perform private.exigir_estoque(p_oficina);
 if exists(select 1 from public.movimentacoes_estoque where oficina_id=p_oficina and id=p_movimento and atendimento_id is not null) then raise exception 'Reabra o atendimento para devolver os materiais e manter os custos corretos.' using errcode='22023';end if;
 return public.estornar_movimentacao_estoque_base(p_oficina,p_movimento,p_motivo);
end $$;
alter function public.arquivar_produto_estoque(uuid,uuid,boolean) rename to arquivar_produto_estoque_base;
revoke all on function public.arquivar_produto_estoque_base(uuid,uuid,boolean) from public,anon,authenticated;
create function public.arquivar_produto_estoque(p_oficina uuid,p_produto uuid,p_arquivar boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.exigir_estoque(p_oficina);
 perform 1 from public.estoque_produtos where oficina_id=p_oficina and item_catalogo_id=p_produto for update;
 if p_arquivar and exists(select 1 from public.itens_atendimento_servico i join public.atendimentos_servicos a on a.id=i.atendimento_id where i.oficina_id=p_oficina and i.produto_id=p_produto and a.situacao not in ('concluido','cancelado')) then raise exception 'Conclua os atendimentos vinculados antes de arquivar o material.' using errcode='22023';end if;
 perform public.arquivar_produto_estoque_base(p_oficina,p_produto,p_arquivar);
end $$;
revoke all on function public.estornar_movimentacao_estoque(uuid,uuid,text),public.arquivar_produto_estoque(uuid,uuid,boolean) from public,anon;
grant execute on function public.estornar_movimentacao_estoque(uuid,uuid,text),public.arquivar_produto_estoque(uuid,uuid,boolean) to authenticated;
create index atendimentos_servicos_periodo on public.atendimentos_servicos(oficina_id,data_servico);
create index itens_atendimento_servico_atendimento on public.itens_atendimento_servico(atendimento_id);
create index itens_atendimento_servico_produto on public.itens_atendimento_servico(oficina_id,produto_id) where produto_id is not null;
create index eventos_atendimento_consulta on public.eventos_atendimento(atendimento_id,criado_em desc);
create index qualidade_atendimento_periodo on public.qualidade_atendimento(oficina_id,aberto_em);
create index qualidade_atendimento_consulta on public.qualidade_atendimento(atendimento_id);
create index horas_atendimento_consulta on public.horas_atendimento(atendimento_id);
create index horas_atendimento_funcionario on public.horas_atendimento(oficina_id,funcionario_id,inicio);
notify pgrst,'reload schema';
commit;
