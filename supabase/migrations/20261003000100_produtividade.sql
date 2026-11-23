begin;
create table public.pacotes_servicos (
 id uuid primary key, oficina_id uuid not null references public.oficinas(id), nome text not null check(length(trim(nome)) between 2 and 120), itens jsonb not null check(jsonb_typeof(itens)='array'), ativo boolean not null default true, revisao integer not null default 1, unique(oficina_id,id)
);
create table public.agenda_atendimentos (
 id uuid primary key, oficina_id uuid not null references public.oficinas(id), cliente_id uuid not null, veiculo_id uuid not null, recurso text not null check(length(trim(recurso)) between 2 and 100), inicio timestamptz not null, fim timestamptz not null, servico text not null check(length(trim(servico)) between 2 and 500), situacao text not null default 'agendado' check(situacao in ('agendado','cancelado','convertido')), ordem_servico_id uuid, revisao integer not null default 1,
 check(fim>inicio and fim<=inicio+interval '24 hours'), foreign key(oficina_id,cliente_id) references public.clientes(oficina_id,id), foreign key(oficina_id,veiculo_id) references public.veiculos(oficina_id,id), foreign key(oficina_id,ordem_servico_id) references public.ordens_servico(oficina_id,id), unique(oficina_id,id)
);
create index pacotes_por_oficina on public.pacotes_servicos(oficina_id);
create index agenda_periodo on public.agenda_atendimentos(oficina_id,inicio,fim) where situacao='agendado';
create table public.manutencoes_programadas (
 id uuid primary key, oficina_id uuid not null references public.oficinas(id), ordem_servico_id uuid not null, descricao text not null check(length(trim(descricao)) between 2 and 500), data_prevista date, quilometragem_prevista integer check(quilometragem_prevista>=0), concluida_em timestamptz, criado_em timestamptz not null default now(), check(data_prevista is not null or quilometragem_prevista is not null), foreign key(oficina_id,ordem_servico_id) references public.ordens_servico(oficina_id,id), unique(oficina_id,id)
);
create table public.complementos_ordem_servico (
 oficina_id uuid not null, ordem_servico_id uuid not null, orcamento_id uuid not null unique, versao_aplicada_id uuid, aplicado_em timestamptz, criado_em timestamptz not null default now(), primary key(oficina_id,orcamento_id), foreign key(oficina_id,ordem_servico_id) references public.ordens_servico(oficina_id,id), foreign key(oficina_id,orcamento_id) references public.orcamentos(oficina_id,id)
);
create table public.retornos_garantia (
 id uuid primary key, oficina_id uuid not null, ordem_original_id uuid not null, ordem_retorno_id uuid not null unique, motivo text not null check(length(trim(motivo)) between 5 and 2000), criado_em timestamptz not null default now(), foreign key(oficina_id,ordem_original_id) references public.ordens_servico(oficina_id,id), foreign key(oficina_id,ordem_retorno_id) references public.ordens_servico(oficina_id,id), check(ordem_original_id<>ordem_retorno_id)
);
create table public.apontamentos_tempo (
 id uuid primary key, oficina_id uuid not null, ordem_servico_id uuid not null, usuario_id uuid not null references auth.users(id), iniciado_em timestamptz not null default now(), encerrado_em timestamptz, custo_hora_centavos integer not null check(custo_hora_centavos between 0 and 10000000), check(encerrado_em is null or encerrado_em>=iniciado_em), foreign key(oficina_id,ordem_servico_id) references public.ordens_servico(oficina_id,id)
);
create unique index um_cronometro_por_pessoa on public.apontamentos_tempo(oficina_id,usuario_id) where encerrado_em is null;
create table public.vistorias_entrada (
 oficina_id uuid not null, ordem_servico_id uuid not null, dados jsonb not null default '{}', revisao integer not null default 1, hash_token text unique, expira_em timestamptz, confirmado_em timestamptz, nome_confirmacao text, primary key(oficina_id,ordem_servico_id), foreign key(oficina_id,ordem_servico_id) references public.ordens_servico(oficina_id,id), check(length(dados::text)<=15000)
);
create index manutencoes_por_oficina_os on public.manutencoes_programadas(oficina_id,ordem_servico_id);
create index tempos_por_oficina_os on public.apontamentos_tempo(oficina_id,ordem_servico_id);
create index complementos_por_oficina_os on public.complementos_ordem_servico(oficina_id,ordem_servico_id);
create index retornos_por_oficina_original on public.retornos_garantia(oficina_id,ordem_original_id);
alter table public.ordens_servico add column minutos_previstos integer not null default 0 check(minutos_previstos between 0 and 100000), add column custo_hora_centavos integer not null default 0 check(custo_hora_centavos between 0 and 10000000);
do $$declare t text;begin foreach t in array array['pacotes_servicos','agenda_atendimentos','manutencoes_programadas','complementos_ordem_servico','retornos_garantia','apontamentos_tempo','vistorias_entrada'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon,authenticated',t);end loop;end $$;
create function private.validar_itens_pacote(p_oficina uuid,p_itens jsonb) returns void language plpgsql set search_path='' as $$
declare i jsonb;begin
 if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) not between 1 and 50 then raise exception 'Selecione de 1 a 50 itens.' using errcode='22023';end if;
 for i in select value from jsonb_array_elements(p_itens) loop
 if not exists(select 1 from public.itens_catalogo where oficina_id=p_oficina and id=(i->>'item_catalogo_id')::uuid and arquivado_em is null) or coalesce((i->>'quantidade')::numeric,0) not between 0.001 and 100000 or (i->>'quantidade')::numeric<>round((i->>'quantidade')::numeric,3) then raise exception 'Confira os itens e quantidades do pacote.' using errcode='22023';end if;
 end loop;
end $$;
create function public.itens_do_pacote(p_oficina uuid,p_pacote uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.pacotes_servicos;begin perform private.exigir_os(p_oficina);select * into p from public.pacotes_servicos where oficina_id=p_oficina and id=p_pacote and ativo;if not found then raise exception 'Pacote indisponível.' using errcode='22023';end if;perform private.validar_itens_pacote(p_oficina,p.itens);
 return (select jsonb_agg(jsonb_build_object('item_catalogo_id',c.id,'descricao',c.descricao,'tipo',c.tipo,'unidade',c.unidade,'quantidade',(i->>'quantidade')::numeric,'preco_unitario_centavos',c.preco_padrao_centavos) order by n) from jsonb_array_elements(p.itens) with ordinality x(i,n) join public.itens_catalogo c on c.oficina_id=p_oficina and c.id=(i->>'item_catalogo_id')::uuid);
end $$;
create function public.consultar_produtividade(p_oficina uuid,p_os uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform private.exigir_os(p_oficina);return jsonb_build_object(
 'pacotes',(select coalesce(jsonb_agg(to_jsonb(p) order by nome),'[]') from public.pacotes_servicos p where oficina_id=p_oficina),
 'agenda',(select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('cliente',c.nome,'veiculo',v.modelo,'placa',v.placa) order by inicio),'[]') from public.agenda_atendimentos a join public.clientes c on c.oficina_id=a.oficina_id and c.id=a.cliente_id join public.veiculos v on v.oficina_id=a.oficina_id and v.id=a.veiculo_id where a.oficina_id=p_oficina and inicio>now()-interval '90 days'),
 'manutencoes',(select coalesce(jsonb_agg(to_jsonb(m)||jsonb_build_object('numero_os',o.numero,'cliente',o.dados_cliente->>'nome','veiculo',o.dados_veiculo->>'modelo','placa',o.dados_veiculo->>'placa') order by m.data_prevista nulls last),'[]') from public.manutencoes_programadas m join public.ordens_servico o on o.oficina_id=m.oficina_id and o.id=m.ordem_servico_id where m.oficina_id=p_oficina and (p_os is null or m.ordem_servico_id=p_os)),
 'adicionais',(select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('numero',q.numero,'situacao',q.situacao,'total_centavos',v.total_centavos)),'[]') from public.complementos_ordem_servico c join public.orcamentos q on q.oficina_id=c.oficina_id and q.id=c.orcamento_id join public.versoes_orcamento v on v.oficina_id=q.oficina_id and v.id=q.versao_atual_id where c.oficina_id=p_oficina and c.ordem_servico_id=p_os),
 'tempos',(select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'usuario_id',t.usuario_id,'meu',t.usuario_id=auth.uid(),'iniciado_em',t.iniciado_em,'encerrado_em',t.encerrado_em,'segundos',greatest(0,extract(epoch from(coalesce(t.encerrado_em,now())-t.iniciado_em))),'custo_centavos',round(greatest(0,extract(epoch from(coalesce(t.encerrado_em,now())-t.iniciado_em)))*t.custo_hora_centavos/3600)) order by t.iniciado_em desc),'[]') from public.apontamentos_tempo t where t.oficina_id=p_oficina and t.ordem_servico_id=p_os),
 'retornos',(select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('numero',o.numero,'situacao',o.situacao,'total_centavos',o.total_centavos)),'[]') from public.retornos_garantia r join public.ordens_servico o on o.oficina_id=r.oficina_id and o.id=r.ordem_retorno_id where r.oficina_id=p_oficina and (r.ordem_original_id=p_os or r.ordem_retorno_id=p_os)),
 'vistoria',(select jsonb_build_object('dados',dados,'revisao',revisao,'confirmado_em',confirmado_em,'nome_confirmacao',nome_confirmacao) from public.vistorias_entrada where oficina_id=p_oficina and ordem_servico_id=p_os));end $$;
create function public.operar_produtividade(p_oficina uuid,p_acao text,p_dados jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare u uuid; w public.ordens_servico; q public.orcamentos; v public.versoes_orcamento; c public.complementos_ordem_servico; a public.agenda_atendimentos; vi public.vistorias_entrada; id uuid; r jsonb; i jsonb; n integer; dt timestamptz; fim timestamptz; recurso text;
begin
 u:=private.exigir_os(p_oficina);id:=nullif(p_dados->>'id','')::uuid;
 -- Serializa mutações da oficina e valida revisão antes de modificar dados concorrentes.
 perform pg_advisory_xact_lock(hashtextextended('produtividade:'||p_oficina::text,0));
 if p_acao='salvar_pacote' then
 perform private.exigir_gestao(p_oficina,'catalog');perform private.validar_itens_pacote(p_oficina,p_dados->'itens');
 if exists(select 1 from public.pacotes_servicos where pacotes_servicos.id=id and oficina_id<>p_oficina) then raise exception 'Identificador indisponível.' using errcode='22023';end if;
 if id is null then raise exception 'Identificador obrigatório.' using errcode='22023';end if;
 if exists(select 1 from public.pacotes_servicos where oficina_id=p_oficina and pacotes_servicos.id=id) and not exists(select 1 from public.pacotes_servicos where oficina_id=p_oficina and pacotes_servicos.id=id and revisao=(p_dados->>'revisao')::integer) then raise exception 'Pacote alterado. Atualize.' using errcode='PT409';end if;
 insert into public.pacotes_servicos(id,oficina_id,nome,itens,ativo) values(id,p_oficina,p_dados->>'nome',p_dados->'itens',coalesce((p_dados->>'ativo')::boolean,true)) on conflict on constraint pacotes_servicos_pkey do update set nome=excluded.nome,itens=excluded.itens,ativo=excluded.ativo,revisao=pacotes_servicos.revisao+1 where pacotes_servicos.oficina_id=p_oficina;
 return jsonb_build_object('id',id);
 elsif p_acao='salvar_agenda' then
 if exists(select 1 from public.agenda_atendimentos where agenda_atendimentos.id=id and oficina_id<>p_oficina) then raise exception 'Identificador indisponível.' using errcode='22023';end if;
 dt:=(p_dados->>'inicio')::timestamptz;fim:=(p_dados->>'fim')::timestamptz;recurso:=lower(trim(p_dados->>'recurso'));
 if id is null or dt is null or fim is null or recurso is null then raise exception 'Preencha os horários e recurso.' using errcode='22023';end if;
 if not exists(select 1 from public.clientes_veiculos cv join public.clientes cl on cl.id=cv.cliente_id and cl.oficina_id=cv.oficina_id join public.veiculos ve on ve.id=cv.veiculo_id and ve.oficina_id=cv.oficina_id where cv.oficina_id=p_oficina and cv.cliente_id=(p_dados->>'cliente_id')::uuid and cv.veiculo_id=(p_dados->>'veiculo_id')::uuid and cv.encerrado_em is null and cl.arquivado_em is null and ve.arquivado_em is null) then raise exception 'Cliente e veículo não vinculados.' using errcode='22023';end if;
 select * into a from public.agenda_atendimentos where oficina_id=p_oficina and agenda_atendimentos.id=id for update;
 if found and (a.situacao<>'agendado' or a.revisao is distinct from (p_dados->>'revisao')::integer) then raise exception 'Agendamento alterado ou encerrado.' using errcode='PT409';end if;
 if exists(select 1 from public.agenda_atendimentos where oficina_id=p_oficina and situacao in ('agendado','convertido') and agenda_atendimentos.id<>id and inicio<fim and agenda_atendimentos.fim>dt and (agenda_atendimentos.recurso=recurso or veiculo_id=(p_dados->>'veiculo_id')::uuid)) then raise exception 'Este box/responsável ou veículo já está ocupado nesse horário.' using errcode='23P01';end if;
 insert into public.agenda_atendimentos(id,oficina_id,cliente_id,veiculo_id,recurso,inicio,fim,servico) values(id,p_oficina,(p_dados->>'cliente_id')::uuid,(p_dados->>'veiculo_id')::uuid,recurso,dt,fim,p_dados->>'servico') on conflict on constraint agenda_atendimentos_pkey do update set recurso=excluded.recurso,inicio=excluded.inicio,fim=excluded.fim,servico=excluded.servico,cliente_id=excluded.cliente_id,veiculo_id=excluded.veiculo_id,revisao=agenda_atendimentos.revisao+1 where agenda_atendimentos.oficina_id=p_oficina;return jsonb_build_object('id',id);
 elsif p_acao in ('cancelar_agenda','converter_agenda') then
 select * into a from public.agenda_atendimentos where oficina_id=p_oficina and agenda_atendimentos.id=id for update;if not found then raise exception 'Agendamento não encontrado.' using errcode='P0002';end if;
 if p_acao='converter_agenda' and a.situacao='convertido' then return jsonb_build_object('os',a.ordem_servico_id);end if;
 if a.situacao<>'agendado' or a.revisao is distinct from (p_dados->>'revisao')::integer then raise exception 'Agendamento alterado. Atualize.' using errcode='PT409';end if;
 if p_acao='cancelar_agenda' then update public.agenda_atendimentos set situacao='cancelado',revisao=revisao+1 where agenda_atendimentos.id=id;return '{}';end if;
 r:=public.salvar_ordem_servico(p_oficina,jsonb_build_object('cliente_id',a.cliente_id,'veiculo_id',a.veiculo_id,'queixa_cliente',a.servico,'responsavel',a.recurso,'entrega_prevista_em',a.fim),a.id);
 update public.agenda_atendimentos set situacao='convertido',ordem_servico_id=(r->>'id')::uuid,revisao=revisao+1 where agenda_atendimentos.id=id;return jsonb_build_object('os',r->>'id');
 elsif p_acao='concluir_manutencao' then
 update public.manutencoes_programadas set concluida_em=coalesce(concluida_em,now()) where oficina_id=p_oficina and manutencoes_programadas.id=id;if not found then raise exception 'Manutenção não encontrada.' using errcode='P0002';end if;return '{}';
 end if;
 select * into w from public.ordens_servico where oficina_id=p_oficina and ordens_servico.id=(p_dados->>'os')::uuid for update;if not found then raise exception 'OS não encontrada.' using errcode='P0002';end if;
 if p_acao='manutencao' then
 if exists(select 1 from public.manutencoes_programadas where manutencoes_programadas.id=id and (oficina_id<>p_oficina or ordem_servico_id<>w.id)) then raise exception 'Identificador indisponível.' using errcode='22023';end if;
 insert into public.manutencoes_programadas(id,oficina_id,ordem_servico_id,descricao,data_prevista,quilometragem_prevista) values(id,p_oficina,w.id,p_dados->>'descricao',nullif(p_dados->>'data','')::date,nullif(p_dados->>'km','')::integer) on conflict on constraint manutencoes_programadas_pkey do nothing;return jsonb_build_object('id',id);
 elsif p_acao='retorno' then
 if w.situacao<>'delivered' then raise exception 'O retorno deve estar vinculado a uma OS entregue.' using errcode='22023';end if;
 select ordem_retorno_id into id from public.retornos_garantia where oficina_id=p_oficina and ordem_original_id=w.id and retornos_garantia.id=(p_dados->>'id')::uuid;if found then return jsonb_build_object('os',id);end if;
 r:=public.salvar_ordem_servico(p_oficina,jsonb_build_object('cliente_id',w.cliente_id,'veiculo_id',w.veiculo_id,'queixa_cliente','Retorno da OS #'||w.numero||': '||(p_dados->>'motivo'),'observacoes_internas','Retorno em análise. Cobertura de garantia deve ser conferida pela oficina.'),(p_dados->>'id')::uuid);
 insert into public.retornos_garantia values((p_dados->>'id')::uuid,p_oficina,w.id,(r->>'id')::uuid,p_dados->>'motivo',now());perform private.evento_os(p_oficina,w.id,'Retorno vinculado à OS #'||(r->>'numero'));return jsonb_build_object('os',r->>'id');
 elsif p_acao='pausar' then
 update public.apontamentos_tempo set encerrado_em=now() where oficina_id=p_oficina and ordem_servico_id=w.id and usuario_id=u and encerrado_em is null;return '{}';
 end if;
 if w.situacao in ('delivered','cancelled') then raise exception 'OS encerrada.' using errcode='22023';end if;
 if p_acao='iniciar' then
 if exists(select 1 from public.apontamentos_tempo where oficina_id=p_oficina and usuario_id=u and encerrado_em is null and ordem_servico_id=w.id) then return '{}';end if;
 if exists(select 1 from public.apontamentos_tempo where oficina_id=p_oficina and usuario_id=u and encerrado_em is null) then raise exception 'Pause o trabalho na outra OS antes de iniciar aqui.' using errcode='22023';end if;
 insert into public.apontamentos_tempo(id,oficina_id,ordem_servico_id,usuario_id,custo_hora_centavos) values(gen_random_uuid(),p_oficina,w.id,u,w.custo_hora_centavos);return '{}';
 elsif p_acao='previsao_tempo' then
 perform private.exigir_gestao(p_oficina,'work_orders');update public.ordens_servico set minutos_previstos=(p_dados->>'minutos')::integer,custo_hora_centavos=(p_dados->>'custo_hora_centavos')::integer where ordens_servico.id=w.id;perform private.evento_os(p_oficina,w.id,'Previsão de tempo e custo/hora atualizados.');return '{}';
 elsif p_acao='aplicar_pacote' then
 if w.revisao is distinct from (p_dados->>'revisao')::integer then raise exception 'OS alterada. Atualize.' using errcode='PT409';end if;
 for i in select value from jsonb_array_elements(public.itens_do_pacote(p_oficina,(p_dados->>'pacote')::uuid)) loop
 select revisao into n from public.ordens_servico where ordens_servico.id=w.id;perform public.salvar_item_os(p_oficina,w.id,n,i);
 update public.itens_ordem_servico set item_catalogo_id=(i->>'item_catalogo_id')::uuid,unidade=i->>'unidade' where itens_ordem_servico.id=(select x.id from public.itens_ordem_servico x where x.oficina_id=p_oficina and x.ordem_servico_id=w.id order by x.posicao desc limit 1);
 end loop;return '{}';
 elsif p_acao='criar_adicional' then
 if w.situacao in ('ready') then raise exception 'Retorne a OS à execução antes de incluir um adicional.' using errcode='22023';end if;
 if exists(select 1 from public.complementos_ordem_servico c0 join public.orcamentos q0 on q0.id=c0.orcamento_id and q0.oficina_id=c0.oficina_id where q0.chave_criacao=id and q0.oficina_id=p_oficina and c0.ordem_servico_id<>w.id) then raise exception 'Este adicional pertence a outra OS.' using errcode='22023';end if;
 r:=public.salvar_orcamento(p_oficina,jsonb_build_object('cliente_id',w.cliente_id,'veiculo_id',w.veiculo_id,'itens','[]'::jsonb,'observacoes','Complemento da OS #'||w.numero,'condicoes','Somente os itens adicionais desta proposta serão incluídos após sua aprovação.','desconto_centavos',0),id);
 insert into public.complementos_ordem_servico(oficina_id,ordem_servico_id,orcamento_id) values(p_oficina,w.id,(r->>'id')::uuid) on conflict do nothing;return jsonb_build_object('orcamento',r->>'id');
 elsif p_acao='aplicar_adicional' then
 select * into c from public.complementos_ordem_servico where oficina_id=p_oficina and ordem_servico_id=w.id and orcamento_id=id for update;if not found then raise exception 'Complemento não encontrado.' using errcode='P0002';end if;if c.aplicado_em is not null then return '{}';end if;
 select * into q from public.orcamentos where oficina_id=p_oficina and orcamentos.id=id for update;select * into v from public.versoes_orcamento where oficina_id=p_oficina and versoes_orcamento.id=q.versao_atual_id;
 if q.situacao<>'approved' or not exists(select 1 from public.aprovacoes_orcamento where oficina_id=p_oficina and versao_orcamento_id=v.id and decisao='approved') then raise exception 'O cliente precisa aprovar o adicional.' using errcode='22023';end if;
 if w.situacao='ready' or exists(select 1 from public.ordens_servico where oficina_id=p_oficina and orcamento_origem_id=q.id) then raise exception 'Adicional indisponível: verifique a OS e sua conversão.' using errcode='22023';end if;
 select count(*) into n from public.itens_ordem_servico where oficina_id=p_oficina and ordem_servico_id=w.id;
 if n+(select count(*) from public.itens_orcamento where oficina_id=p_oficina and versao_orcamento_id=v.id)>100 then raise exception 'Limite de 100 itens.' using errcode='22023';end if;
 select coalesce(max(posicao)+1,0) into n from public.itens_ordem_servico where oficina_id=p_oficina and ordem_servico_id=w.id;
 insert into public.itens_ordem_servico(oficina_id,ordem_servico_id,item_catalogo_id,item_orcamento_origem_id,posicao,tipo,descricao,unidade,quantidade,preco_unitario_centavos)
 select p_oficina,w.id,item_catalogo_id,itens_orcamento.id,n+row_number() over(order by posicao)-1,tipo,descricao,unidade,quantidade,preco_unitario_centavos from public.itens_orcamento where oficina_id=p_oficina and versao_orcamento_id=v.id;
 update public.ordens_servico set subtotal_centavos=subtotal_centavos+v.subtotal_centavos,desconto_centavos=desconto_centavos+v.desconto_centavos where ordens_servico.id=w.id;
 update public.complementos_ordem_servico set aplicado_em=now(),versao_aplicada_id=v.id where oficina_id=p_oficina and orcamento_id=q.id;perform private.evento_os(p_oficina,w.id,'Adicional aprovado #'||q.numero||' incorporado à OS.');return '{}';
 elsif p_acao='salvar_vistoria' then
 select * into vi from public.vistorias_entrada where oficina_id=p_oficina and ordem_servico_id=w.id for update;
 if vi.confirmado_em is not null then raise exception 'Vistoria confirmada: registro preservado.' using errcode='22023';end if;
 if vi.ordem_servico_id is not null and vi.revisao is distinct from (p_dados->>'revisao')::integer then raise exception 'Vistoria alterada. Atualize.' using errcode='PT409';end if;
 if jsonb_typeof(p_dados->'dados') is distinct from 'object' or jsonb_typeof(p_dados->'dados'->'avarias') is distinct from 'array' or jsonb_array_length(p_dados->'dados'->'avarias')>30 then raise exception 'Confira a vistoria.' using errcode='22023';end if;
 for i in select value from jsonb_array_elements(p_dados->'dados'->'avarias') loop if coalesce(i->>'local','') not in ('frente','traseira','esquerda','direita','teto','interior') or length(trim(coalesce(i->>'descricao',''))) not between 2 and 500 then raise exception 'Confira local e descrição da avaria.' using errcode='22023';end if;end loop;
 if coalesce((p_dados->'dados'->>'combustivel')::integer,0) not between 0 and 100 or length(coalesce(p_dados->'dados'->>'pertences',''))>2000 then raise exception 'Confira combustível e pertences.' using errcode='22023';end if;
 insert into public.vistorias_entrada(oficina_id,ordem_servico_id,dados) values(p_oficina,w.id,jsonb_build_object('avarias',p_dados->'dados'->'avarias','combustivel',coalesce((p_dados->'dados'->>'combustivel')::integer,0),'pertences',coalesce(p_dados->'dados'->>'pertences',''))) on conflict(oficina_id,ordem_servico_id) do update set dados=excluded.dados,revisao=vistorias_entrada.revisao+1,hash_token=null,expira_em=null;update public.ordens_servico set combustivel_percentual=coalesce((p_dados->'dados'->>'combustivel')::integer,0),pertences=coalesce(p_dados->'dados'->>'pertences',''),checklist=coalesce(checklist,'{}'::jsonb)||jsonb_build_object('Avarias de entrada registradas',true,'Pertences conferidos',true) where ordens_servico.id=w.id;perform private.evento_os(p_oficina,w.id,'Vistoria de entrada registrada.');return '{}';
 elsif p_acao='link_vistoria' then
 if coalesce(p_dados->>'hash','') !~ '^[0-9a-f]{64}$' then raise exception 'Token inválido.' using errcode='22023';end if;
 update public.vistorias_entrada set hash_token=p_dados->>'hash',expira_em=now()+interval '7 days' where oficina_id=p_oficina and ordem_servico_id=w.id and confirmado_em is null;if not found then raise exception 'Salve a vistoria ainda não confirmada.' using errcode='22023';end if;return '{}';
 end if;
 raise exception 'Operação inválida.' using errcode='22023';
end $$;
create function public.consultar_vistoria_publica(p_token text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v public.vistorias_entrada;w public.ordens_servico;begin
 if coalesce(p_token,'') !~ '^[0-9a-f]{64}$' then raise exception 'Link indisponível.' using errcode='P0002';end if;
 select * into v from public.vistorias_entrada where hash_token=encode(sha256(convert_to(p_token,'UTF8')),'hex') and expira_em>now();if not found or not private.has_feature(v.oficina_id,'work_orders') then raise exception 'Link indisponível.' using errcode='P0002';end if;
 select * into w from public.ordens_servico where oficina_id=v.oficina_id and id=v.ordem_servico_id;return jsonb_build_object('oficina',(select nome from public.oficinas where id=v.oficina_id),'numero',w.numero,'veiculo',w.dados_veiculo,'dados',v.dados,'confirmado_em',v.confirmado_em,'nome_confirmacao',v.nome_confirmacao);end $$;
create function public.confirmar_vistoria(p_token text,p_nome text,p_confirmo boolean) returns void language plpgsql security definer set search_path='' as $$
declare v public.vistorias_entrada;begin
 perform public.consultar_vistoria_publica(p_token);if p_confirmo is distinct from true or length(trim(coalesce(p_nome,''))) not between 2 and 160 then raise exception 'Informe o nome e confirme a vistoria.' using errcode='22023';end if;
 select * into v from public.vistorias_entrada where hash_token=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 if not found or v.expira_em<=now() then raise exception 'Link indisponível.' using errcode='P0002';end if;if v.confirmado_em is not null then return;end if;
 update public.vistorias_entrada set confirmado_em=now(),nome_confirmacao=trim(p_nome) where oficina_id=v.oficina_id and ordem_servico_id=v.ordem_servico_id;perform private.evento_os(v.oficina_id,v.ordem_servico_id,'Vistoria confirmada pelo cliente.');end $$;
create function public.minhas_manutencoes(p_oficina uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'descricao',m.descricao,'data_prevista',m.data_prevista,'quilometragem_prevista',m.quilometragem_prevista,'concluida_em',m.concluida_em,'veiculo',w.dados_veiculo->>'modelo','placa',w.dados_veiculo->>'placa') order by m.data_prevista nulls last),'[]') from public.manutencoes_programadas m join public.ordens_servico w on w.oficina_id=m.oficina_id and w.id=m.ordem_servico_id where m.oficina_id=p_oficina and private.has_portal_access(w.oficina_id,w.cliente_id);
$$;
-- Complementos aplicados não podem ser convertidos novamente em uma OS independente.
create function private.bloquear_conversao_complemento() returns trigger language plpgsql set search_path='' as $$begin if exists(select 1 from public.complementos_ordem_servico where oficina_id=new.oficina_id and orcamento_id=new.orcamento_origem_id) then raise exception 'Orçamento adicional: incorpore à OS original na aba Produtividade.' using errcode='22023';end if;return new;end $$;
create trigger bloquear_conversao_complemento before insert or update of orcamento_origem_id on public.ordens_servico for each row execute function private.bloquear_conversao_complemento();
create function private.encerrar_tempos_os() returns trigger language plpgsql security definer set search_path='' as $$begin if new.situacao in ('delivered','cancelled') and old.situacao is distinct from new.situacao then update public.apontamentos_tempo set encerrado_em=now() where oficina_id=new.oficina_id and ordem_servico_id=new.id and encerrado_em is null;end if;return new;end $$;
create trigger encerrar_tempos_os after update of situacao on public.ordens_servico for each row execute function private.encerrar_tempos_os();
-- A origem de cada item continua validada, inclusive para versões adicionais aprovadas.
create or replace function private.validate_work_order_item_source() returns trigger language plpgsql set search_path='' as $$
begin
 if new.item_orcamento_origem_id is not null and not exists(select 1 from public.itens_orcamento i where i.oficina_id=new.oficina_id and i.id=new.item_orcamento_origem_id and (i.descricao,i.tipo,i.quantidade,i.preco_unitario_centavos,i.unidade)=(new.descricao,new.tipo,new.quantidade,new.preco_unitario_centavos,new.unidade)) then raise exception 'Os valores e itens aprovados pelo cliente devem ser preservados.' using errcode='22023';end if;
 if new.item_orcamento_origem_id is not null and not exists(
 select 1 from public.itens_orcamento i join public.ordens_servico o on o.oficina_id=i.oficina_id and o.id=new.ordem_servico_id
 where i.oficina_id=new.oficina_id and i.id=new.item_orcamento_origem_id and (
 i.versao_orcamento_id=o.versao_orcamento_origem_id or exists(
 select 1 from public.complementos_ordem_servico c join public.orcamentos q on q.oficina_id=c.oficina_id and q.id=c.orcamento_id
 where c.oficina_id=o.oficina_id and c.ordem_servico_id=o.id
 and i.versao_orcamento_id=coalesce(c.versao_aplicada_id,q.versao_atual_id)
 and exists(select 1 from public.aprovacoes_orcamento a where a.oficina_id=i.oficina_id and a.versao_orcamento_id=i.versao_orcamento_id and a.decisao='approved')
 ))) then raise exception 'O item não pertence a uma proposta aprovada desta OS.' using errcode='23514';end if;
 return new;
end $$;
create function private.preservar_complemento_aplicado() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.cliente_id is distinct from old.cliente_id or new.veiculo_id is distinct from old.veiculo_id) and exists(select 1 from public.complementos_ordem_servico where oficina_id=old.oficina_id and orcamento_id=old.id) then raise exception 'O adicional deve manter o cliente e o veículo da OS original.' using errcode='22023';end if;
 if (new.versao_atual_id is distinct from old.versao_atual_id or new.situacao is distinct from old.situacao)
 and exists(select 1 from public.complementos_ordem_servico where oficina_id=old.oficina_id and orcamento_id=old.id and aplicado_em is not null)
 then raise exception 'Adicional já incorporado à OS. Crie outra proposta para novas alterações.' using errcode='22023';end if;
 return new;
end $$;
create trigger preservar_complemento_aplicado before update on public.orcamentos for each row execute function private.preservar_complemento_aplicado();
revoke all on function private.preservar_complemento_aplicado() from public,anon,authenticated;
revoke all on function private.validar_itens_pacote(uuid,jsonb),private.bloquear_conversao_complemento(),private.encerrar_tempos_os() from public,anon,authenticated;
revoke all on function public.itens_do_pacote(uuid,uuid),public.consultar_produtividade(uuid,uuid),public.operar_produtividade(uuid,text,jsonb),public.minhas_manutencoes(uuid) from public,anon;
grant execute on function public.itens_do_pacote(uuid,uuid),public.consultar_produtividade(uuid,uuid),public.operar_produtividade(uuid,text,jsonb),public.minhas_manutencoes(uuid) to authenticated;
revoke all on function public.consultar_vistoria_publica(text),public.confirmar_vistoria(text,text,boolean) from public;
grant execute on function public.consultar_vistoria_publica(text),public.confirmar_vistoria(text,text,boolean) to anon,authenticated;
create or replace function private.dados_orcamento(p_oficina uuid,p_id uuid,p_versao uuid default null) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(q)||jsonb_build_object('situacao',case when q.situacao='awaiting_approval' and atual.expira_em<=now() then 'expired' else q.situacao end,
 'versao',to_jsonb(v),'itens',(select coalesce(jsonb_agg(to_jsonb(i) order by i.posicao),'[]') from public.itens_orcamento i where i.oficina_id=q.oficina_id and i.versao_orcamento_id=v.id),
 'historico',(select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'numero_versao',h.numero_versao,'total_centavos',h.total_centavos,'publicado_em',h.publicado_em) order by h.numero_versao desc),'[]') from public.versoes_orcamento h where h.oficina_id=q.oficina_id and h.orcamento_id=q.id),
 'aprovacao',(select jsonb_build_object('decisao',a.decisao,'nome_informado',a.nome_informado,'confirmado_em',a.confirmado_em) from public.aprovacoes_orcamento a where a.oficina_id=q.oficina_id and a.versao_orcamento_id=v.id),
 'adicional_os_id',(select c.ordem_servico_id from public.complementos_ordem_servico c where c.oficina_id=q.oficina_id and c.orcamento_id=q.id),'adicional_aplicado_em',(select c.aplicado_em from public.complementos_ordem_servico c where c.oficina_id=q.oficina_id and c.orcamento_id=q.id),
 'ordem_servico_id',(select os.id from public.ordens_servico os where os.oficina_id=q.oficina_id and os.orcamento_origem_id=q.id))
 from public.orcamentos q join public.versoes_orcamento atual on atual.oficina_id=q.oficina_id and atual.id=q.versao_atual_id
 join public.versoes_orcamento v on v.oficina_id=q.oficina_id and v.orcamento_id=q.id and v.id=coalesce(p_versao,q.versao_atual_id)
 where q.oficina_id=p_oficina and q.id=p_id;
$$;

notify pgrst,'reload schema';
commit;
