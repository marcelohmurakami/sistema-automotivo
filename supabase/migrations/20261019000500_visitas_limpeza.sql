begin;
-- Cada visita é uma unidade independente de execução, consumo e faturamento.
create table public.series_visitas_limpeza (
 id uuid primary key, oficina_id uuid not null references public.oficinas(id),
 solicitacao jsonb not null, atendimentos jsonb not null, criado_em timestamptz not null default now()
);
alter table public.series_visitas_limpeza enable row level security;
revoke all on public.series_visitas_limpeza from public,anon,authenticated;

create function public.programar_visitas_limpeza(p_oficina uuid,p_chave uuid,p_dados jsonb,p_quantidade integer,p_intervalo integer,p_revisao integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.atendimentos_servicos; c public.comercial_atendimento; serie public.series_visitas_limpeza;
 pedido jsonb; campos jsonb; ficha jsonb; itens jsonb; equipe jsonb; lista jsonb := '[]';
 i integer; idv uuid; revisao integer; ini timestamptz; fimv timestamptz; dia date;
begin
 perform private.gerencia_servicos(p_oficina);
 if not exists(select 1 from public.oficinas where id=p_oficina and ramo='limpeza') then raise exception 'Esta programação é exclusiva de limpeza.' using errcode='22023'; end if;
 if p_chave is null or p_quantidade is null or p_quantidade not between 1 and 52 or p_intervalo is null or p_intervalo not in (1,7,14,30)
 or coalesce(p_dados->>'situacao','') not in ('agendado','confirmado') or coalesce(p_dados->>'nova_situacao','') not in ('orcamento','aprovado') then
  raise exception 'Confira a repetição, o agendamento e a situação das novas visitas.' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('serie-limpeza:'||p_oficina||p_chave,0));
 pedido := jsonb_build_object('dados',p_dados,'quantidade',p_quantidade,'intervalo',p_intervalo,'revisao',p_revisao);
 select * into serie from public.series_visitas_limpeza where id=p_chave;
 if found then
  if serie.oficina_id<>p_oficina then raise exception 'Programação indisponível.' using errcode='42501';end if;
  if serie.solicitacao<>pedido then raise exception 'Esta programação já foi criada com outros dados. Atualize a tela.' using errcode='22023';end if;
  return serie.atendimentos;
 end if;
 select * into a from public.atendimentos_servicos where oficina_id=p_oficina and id=(p_dados->>'atendimento_id')::uuid for update;
 if not found then raise exception 'Atendimento indisponível.' using errcode='42501';end if;
 if a.revisao is distinct from p_revisao then raise exception 'Atendimento alterado. Atualize a tela.' using errcode='40001';end if;
 if a.situacao='cancelado' or coalesce(a.ficha_especialidade->>'especialidade','') not like 'limpeza_%' then raise exception 'Selecione um atendimento de limpeza não cancelado.' using errcode='22023';end if;
 select coalesce(jsonb_object_agg(key,value),'{}') into campos from jsonb_each(a.ficha_especialidade->'campos') where private.campos_planejamento_limpeza() ? key;
 ficha := jsonb_build_object('versao',1,'especialidade',a.ficha_especialidade->>'especialidade','campos',campos,'checklist','{}'::jsonb,'etapa','');
 select * into c from public.comercial_atendimento where oficina_id=p_oficina and atendimento_id=a.id;
 select coalesce(jsonb_agg(jsonb_build_object('funcionario_id',funcionario_id,'percentual',percentual,'custo_hora_centavos',custo_hora_centavos)),'[]') into equipe from public.equipe_atendimento where oficina_id=p_oficina and atendimento_id=a.id;
 for i in 0..p_quantidade-1 loop
  idv := md5('visita:'||p_oficina||':'||p_chave||':'||i)::uuid;
  ini := (p_dados->>'inicio')::timestamptz + make_interval(days=>i*p_intervalo);
  fimv := (p_dados->>'fim')::timestamptz + make_interval(days=>i*p_intervalo);
  if ini is null or fimv is null or fimv<=ini then raise exception 'O término deve ser posterior ao início.' using errcode='22023';end if;
  dia := (ini at time zone 'America/Sao_Paulo')::date;
  ficha := jsonb_set(ficha,'{campos,prazo_servico}',to_jsonb(((fimv at time zone 'America/Sao_Paulo')::date)::text));
  perform public.salvar_atendimento_servico(p_oficina,idv,jsonb_build_object(
   'cliente_id',a.cliente_id,'objeto_id',a.objeto_id,'titulo',a.titulo,'situacao','orcamento',
   'valor_centavos',a.valor_centavos,'vencimento',dia,'data_servico',dia,'ficha_especialidade',ficha,
   'dados',jsonb_build_object('solicitacao',coalesce(a.dados->>'solicitacao',''),'tipo_servico',coalesce(a.dados->>'tipo_servico',''))),null);
  select coalesce(jsonb_agg((to_jsonb(t)-array['oficina_id','atendimento_id','id'])||jsonb_build_object('id',gen_random_uuid())),'[]') into itens
   from public.itens_atendimento_servico t where oficina_id=p_oficina and atendimento_id=a.id;
  if jsonb_array_length(itens)>0 then
   select x.revisao into revisao from public.atendimentos_servicos x where id=idv;
   perform public.salvar_itens_atendimento(p_oficina,idv,revisao,itens,coalesce(c.desconto_centavos,0),0,'');
  end if;
  if jsonb_array_length(equipe)>0 then
   select x.revisao into revisao from public.atendimentos_servicos x where id=idv;
   perform public.salvar_equipe_atendimento(p_oficina,idv,revisao,equipe);
  end if;
  if p_dados->>'nova_situacao'='aprovado' then
   perform public.salvar_atendimento_servico(p_oficina,idv,(select to_jsonb(x)||'{"situacao":"aprovado"}'::jsonb from public.atendimentos_servicos x where id=idv),(select x.revisao from public.atendimentos_servicos x where id=idv));
  end if;
  perform public.salvar_agenda_servico(p_oficina,idv,p_dados||jsonb_build_object('atendimento_id',idv,'inicio',ini,'fim',fimv),null);
  insert into public.eventos_atendimento(oficina_id,atendimento_id,tipo,depois,autor) values(p_oficina,idv,'programacao','Visita '||(i+1)||' de '||p_quantidade||' · baseada no atendimento #'||a.numero,auth.uid());
  lista := lista || jsonb_build_array(idv);
 end loop;
 insert into public.series_visitas_limpeza(id,oficina_id,solicitacao,atendimentos) values(p_chave,p_oficina,pedido,lista);
 return lista;
end $$;
revoke all on function public.programar_visitas_limpeza(uuid,uuid,jsonb,integer,integer,integer) from public,anon;
grant execute on function public.programar_visitas_limpeza(uuid,uuid,jsonb,integer,integer,integer) to authenticated;
notify pgrst,'reload schema';
commit;
