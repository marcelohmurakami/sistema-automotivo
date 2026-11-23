begin;
-- Base mínima para o relatório operacional. Não retorna observações privadas,
-- valores financeiros ou telefones. As métricas usam a mesma função no modo demo.
create or replace function public.consultar_relatorio_oficina(p_oficina uuid,p_inicio date,p_fim date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare inicio_ant date; limite timestamptz; resultado jsonb;
begin
 perform private.exigir_gestao(p_oficina,'reports');
 if p_inicio is null or p_fim is null or p_inicio>p_fim or p_fim-p_inicio>366 then
   raise exception 'Escolha um período de até 367 dias.' using errcode='22023';
 end if;
 inicio_ant:=p_inicio-(p_fim-p_inicio+1);
 limite:=least(now(),(p_fim+1)::timestamp at time zone 'America/Sao_Paulo');
 select coalesce(jsonb_agg(to_jsonb(x) order by x.numero),'[]') into resultado from (
   select w.id,w.numero,coalesce(w.dados_cliente->>'nome','Cliente não informado') cliente,
     coalesce(w.dados_veiculo->>'modelo','Não informado') veiculo,w.responsavel,w.situacao,
     w.data_servico,w.criado_em,w.recebido_em,w.concluido_em,w.entregue_em,w.cancelado_em,w.entrega_prevista_em,
     coalesce((select jsonb_agg(jsonb_build_object('motivo',p.motivo,'iniciado_em',p.iniciado_em,'encerrado_em',p.encerrado_em))
       from public.paradas_ordem_servico p where p.oficina_id=p_oficina and p.ordem_servico_id=w.id
       and (p.encerrado_em is null or (p.iniciado_em<limite and p.encerrado_em>p_inicio::timestamp at time zone 'America/Sao_Paulo'))),'[]') paradas,
     coalesce((select jsonb_agg(jsonb_build_object('descricao',i.descricao,'quantidade',i.quantidade))
       from public.itens_ordem_servico i where i.oficina_id=p_oficina and i.ordem_servico_id=w.id
       and i.tipo='service' and i.situacao<>'cancelled' and w.situacao='delivered'
       and (w.entregue_em at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim),'[]') servicos
   from public.ordens_servico w where w.oficina_id=p_oficina and w.arquivado_em is null and (
     coalesce(w.data_servico,(coalesce(w.recebido_em,w.criado_em) at time zone 'America/Sao_Paulo')::date) between inicio_ant and p_fim
     or (w.concluido_em at time zone 'America/Sao_Paulo')::date between inicio_ant and p_fim
     or (w.entregue_em at time zone 'America/Sao_Paulo')::date between inicio_ant and p_fim
     or (w.cancelado_em at time zone 'America/Sao_Paulo')::date between inicio_ant and p_fim
     or (w.situacao not in ('delivered','cancelled') and coalesce(w.data_servico,(coalesce(w.recebido_em,w.criado_em) at time zone 'America/Sao_Paulo')::date)<p_inicio)
     or exists(select 1 from public.paradas_ordem_servico p where p.oficina_id=p_oficina and p.ordem_servico_id=w.id and p.iniciado_em<limite
       and coalesce(p.encerrado_em,w.entregue_em,w.cancelado_em,now())>p_inicio::timestamp at time zone 'America/Sao_Paulo')
   )
 ) x;
 return jsonb_build_object('agora',now(),'ordens',resultado);
end $$;
revoke all on function public.consultar_relatorio_oficina(uuid,date,date) from public,anon;
grant execute on function public.consultar_relatorio_oficina(uuid,date,date) to authenticated;
notify pgrst,'reload schema';
commit;
