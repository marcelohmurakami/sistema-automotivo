begin;
-- Indicadores operacionais atuais, independentes do período das entregas.
create or replace function public.consultar_relatorios(p_oficina uuid,p_inicio date,p_fim date) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;atual jsonb;anterior jsonb;inicio_ant date;fim_ant date;d1 date;d2 date;i integer;operacao jsonb;atrasados jsonb;clientes jsonb;estoque jsonb;paradas_motivos jsonb;begin
 perform private.exigir_gestao(p_oficina,'reports');
 if p_inicio is null or p_fim is null or p_inicio>p_fim or p_fim-p_inicio>366 then raise exception 'Escolha um período de até 367 dias.' using errcode='22023';end if;
 fim_ant:=p_inicio-1;inicio_ant:=p_inicio-(p_fim-p_inicio+1);
 for i in 1..2 loop
 d1:=case when i=1 then p_inicio else inicio_ant end;d2:=case when i=1 then p_fim else fim_ant end;
 select jsonb_build_object('entregues',count(*),'vendido',coalesce(sum(total_centavos),0),'ticket',coalesce(round(avg(total_centavos)),0),'prazo_medio',round(avg(extract(epoch from (entregue_em-recebido_em))/86400)::numeric,1),'no_prazo',count(*) filter(where entrega_prevista_em is not null and entregue_em<=entrega_prevista_em),'com_previsao',count(*) filter(where entrega_prevista_em is not null)) into r from public.ordens_servico where oficina_id=p_oficina and situacao='delivered' and (entregue_em at time zone 'America/Sao_Paulo')::date between d1 and d2;
 select r||jsonb_build_object('orcamentos',count(*),'enviados',count(*) filter(where situacao not in ('draft','cancelled')),'aprovados',count(*) filter(where situacao='approved'),'recusados',count(*) filter(where situacao='declined')) into r from public.orcamentos where oficina_id=p_oficina and arquivado_em is null and (criado_em at time zone 'America/Sao_Paulo')::date between d1 and d2;
 if i=1 then atual:=r;else anterior:=r;end if;end loop;
 select jsonb_build_object('ativas',count(*),'atrasadas',count(*) filter(where entrega_prevista_em<now()),'prontas',count(*) filter(where situacao='ready'),'sem_previsao',count(*) filter(where entrega_prevista_em is null),'paradas',count(*) filter(where exists(select 1 from public.paradas_ordem_servico p where p.ordem_servico_id=w.id and p.oficina_id=p_oficina and p.encerrado_em is null))) into operacao from public.ordens_servico w where oficina_id=p_oficina and situacao not in ('delivered','cancelled');
 select operacao||jsonb_build_object('aguardando_aprovacao',count(*)) into operacao from public.orcamentos where oficina_id=p_oficina and arquivado_em is null and situacao='awaiting_approval';

 -- Cada OS conta uma vez por motivo, mesmo se houver duas paradas do mesmo tipo.
 select coalesce(jsonb_agg(to_jsonb(x) order by x.quantidade desc,x.motivo),'[]') into paradas_motivos
 from (
   select p.motivo,count(distinct w.id) quantidade
   from public.paradas_ordem_servico p
   join public.ordens_servico w on w.id=p.ordem_servico_id and w.oficina_id=p.oficina_id
   where w.oficina_id=p_oficina and w.situacao not in ('delivered','cancelled') and p.encerrado_em is null
   group by p.motivo
 ) x;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.atrasada desc,x.parada desc,x.entrega_prevista_em nulls last,x.id),'[]') into atrasados
 from (
   select w.id,w.numero,w.dados_cliente->>'nome' cliente,w.dados_veiculo->>'modelo' veiculo,
     w.entrega_prevista_em,w.situacao,coalesce(w.entrega_prevista_em<now(),false) atrasada,
     exists(select 1 from public.paradas_ordem_servico p where p.oficina_id=p_oficina and p.ordem_servico_id=w.id and p.encerrado_em is null) parada,
     (select string_agg(coalesce(nullif(btrim(p.detalhes),''),case p.motivo
       when 'parts' then 'Aguardando peças' when 'approval' then 'Aguardando aprovação'
       when 'third_party' then 'Aguardando terceiros' when 'capacity' then 'Sem capacidade disponível'
       when 'diagnosis' then 'Aguardando diagnóstico' else 'Outra pendência' end),'; ' order by p.iniciado_em,p.id)
      from public.paradas_ordem_servico p where p.oficina_id=p_oficina and p.ordem_servico_id=w.id and p.encerrado_em is null) motivo
   from public.ordens_servico w where w.oficina_id=p_oficina and w.situacao not in ('delivered','cancelled')
     and (w.entrega_prevista_em<now() or w.situacao='ready' or exists(select 1 from public.paradas_ordem_servico p where p.oficina_id=p_oficina and p.ordem_servico_id=w.id and p.encerrado_em is null))
   order by atrasada desc,parada desc,w.entrega_prevista_em nulls last,w.id limit 15
 ) x;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into clientes from (select cliente_id,min(dados_cliente->>'nome') nome,count(*) atendimentos,sum(total_centavos)::bigint total from public.ordens_servico where oficina_id=p_oficina and situacao='delivered' and (entregue_em at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim group by cliente_id order by sum(total_centavos) desc,cliente_id limit 10)x;
 select jsonb_build_object('baixo',count(*) filter(where e.saldo<=e.minimo),'sem_custo',count(*) filter(where e.custo_centavos=0),'controlados',count(*)) into estoque from public.estoque_produtos e join public.itens_catalogo c on c.oficina_id=e.oficina_id and c.id=e.item_catalogo_id where e.oficina_id=p_oficina and c.arquivado_em is null;
 return jsonb_build_object('atual',atual,'anterior',anterior,'inicio_anterior',inicio_ant,'fim_anterior',fim_ant,'operacao',operacao,'paradas_motivos',paradas_motivos,'atencao',atrasados,'clientes',clientes,'estoque',estoque);end $$;

revoke all on function public.consultar_relatorios(uuid,date,date) from public,anon;
grant execute on function public.consultar_relatorios(uuid,date,date) to authenticated;
notify pgrst,'reload schema';
commit;
