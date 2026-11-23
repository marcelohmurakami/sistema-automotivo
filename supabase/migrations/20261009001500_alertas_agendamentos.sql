begin;
create or replace function public.consultar_alertas(p_oficina uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare lista jsonb; extra jsonb; u uuid; hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
 u := private.require_staff(p_oficina);
 lista := public.consultar_alertas_incluindo_excluidos(p_oficina);
 if private.has_feature(p_oficina,'work_orders') then
  with fontes as (
   select g.id, c.nome || ' · ' || g.servico titulo, g.inicio,
    (g.inicio at time zone 'America/Sao_Paulo')::date data,
    g.inicio < now() horario_passou
   from public.agenda_atendimentos g
   join public.clientes c on c.id=g.cliente_id and c.oficina_id=g.oficina_id
   where g.oficina_id=p_oficina and g.situacao='agendado'
    and g.inicio > now()-interval '90 days'
    and (g.inicio at time zone 'America/Sao_Paulo')::date <= hoje+5
  ), chaves as (
   select *, 'agenda-oficina:'||id||':'||extract(epoch from inicio)::text||':'||private.marco_alerta(data-hoje)||':'||horario_passou::text chave
   from fontes
  )
  select coalesce(jsonb_agg(jsonb_build_object(
   'tipo','agenda','id',id,'titulo',titulo,'inicio',inicio,'data',data,'dias',data-hoje,
   'horario_passou',horario_passou,'chave',chave,'natureza',null,'valor_centavos',null,
   'destino','/produtividade?agendamento='||id,'pronto',false,
   'lido',exists(select 1 from public.alertas_lidos l where l.oficina_id=p_oficina and l.usuario_id=u and l.chave=c.chave)
  ) order by inicio),'[]'::jsonb) into extra from chaves c;
  lista := lista || extra;
 end if;
 return coalesce((select jsonb_agg(a.item || jsonb_build_object('valor_pendente',coalesce(t.valor_variavel and t.valor_confirmado_em is null,false)) order by a.posicao)
 from jsonb_array_elements(lista) with ordinality a(item,posicao)
 left join public.titulos_financeiros t on a.item->>'tipo'='financeiro' and t.id::text=a.item->>'id' and t.oficina_id=p_oficina
 where not exists(select 1 from public.alertas_lidos l where l.oficina_id=p_oficina and l.usuario_id=u and l.chave=a.item->>'chave' and l.excluido_em is not null)), '[]'::jsonb);
end $$;
revoke all on function public.consultar_alertas(uuid) from public,anon;
grant execute on function public.consultar_alertas(uuid) to authenticated;
commit;
