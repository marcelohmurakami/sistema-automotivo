begin;

-- Vínculos explícitos: nenhuma relação é inferida por nome do cliente ou do serviço.
create table public.vinculos_analiticos (
 oficina_id uuid not null references public.oficinas(id), tipo text not null,
 id uuid not null, ativo boolean not null default true, dados jsonb not null, revisao integer not null default 1,
 atualizado_em timestamptz not null default now(), autor uuid not null references auth.users(id),
 primary key(oficina_id,tipo,id),
 check(tipo in ('contrato_documento','contrato_despesa','problema','visita','comparacao','jornada','interna')),
 check(jsonb_typeof(dados)='object' and octet_length(dados::text)<=16000)
);
create index vinculos_analiticos_contrato on public.vinculos_analiticos(oficina_id,(dados->>'contrato_id'),tipo);
create index vinculos_analiticos_problema on public.vinculos_analiticos(oficina_id,(dados->>'problema_id')) where tipo='visita';
create table public.historico_vinculos_analiticos (
 id bigint generated always as identity primary key, oficina_id uuid not null,
 tipo text not null, registro_id uuid not null, antes jsonb, depois jsonb not null,
 autor uuid not null references auth.users(id), criado_em timestamptz not null default now()
);
alter table public.vinculos_analiticos enable row level security;
alter table public.historico_vinculos_analiticos enable row level security;
revoke all on public.vinculos_analiticos,public.historico_vinculos_analiticos from public,anon,authenticated;

create view private.vinculos_analiticos_ativos as select * from public.vinculos_analiticos where ativo;
revoke all on private.vinculos_analiticos_ativos from public,anon,authenticated;
create trigger historico_vinculos_analiticos_imutavel before update or delete on public.historico_vinculos_analiticos for each row execute function private.reject_mutation();

create function private.exigir_analises(w uuid,financeiro boolean default true) returns void
language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from public.membros_oficina where oficina_id=w and usuario_id=auth.uid() and ativo and perfil in ('owner','manager')) or not private.has_feature(w,'reports') then
 raise exception 'Análises disponíveis para gestores com acesso aos relatórios.' using errcode='42501';end if;
 if financeiro then perform private.exigir_financeiro(w);end if;
end $$;

create view private.objetos_analiticos as
 select oficina_id,id,trim(concat_ws(' ',marca,modelo,nullif(placa,''))) nome,'veiculo'::text tipo from public.veiculos
 union all select oficina_id,id,nome,'equipamento' from public.objetos_atendimento;
create view private.documentos_analiticos as
 select d.*,o.veiculo_id objeto_id,o.recebido_em inicio,coalesce(o.concluido_em,o.entregue_em) fim from private.documentos_custeio d join public.ordens_servico o on o.oficina_id=d.oficina_id and o.id=d.id where d.automotivo
 union all select d.*,a.objeto_id,a.criado_em,a.concluido_em from private.documentos_custeio d join public.atendimentos_servicos a on a.oficina_id=d.oficina_id and a.id=d.id where not d.automotivo;

create function private.validar_jornada_analitica(j jsonb) returns void language plpgsql immutable set search_path='' as $$begin
 if jsonb_typeof(j) is distinct from 'array' or jsonb_array_length(j) not between 1 and 28 then raise exception 'Informe de 1 a 28 turnos semanais.' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(j) x where coalesce(x->>'dia','') !~ '^[0-6]$' or coalesce(x->>'inicio','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(x->>'fim','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or x->>'fim'<=x->>'inicio') then raise exception 'Confira os dias e os horários de cada turno.' using errcode='22023';end if;
end $$;

create function public.salvar_vinculo_analitico(p_oficina uuid,p_tipo text,p_id uuid,p_dados jsonb,p_revisao integer default null) returns void
language plpgsql security definer set search_path='' as $$
declare antigo public.vinculos_analiticos;doc record;c public.contratos_preventivos;t public.titulos_financeiros;outro public.titulos_financeiros;problema public.vinculos_analiticos;visita record;k text;v numeric;w2 uuid;inicio date;fim date;
begin
 perform private.exigir_analises(p_oficina,p_tipo not in ('problema','visita','jornada'));
 if p_tipo is null or p_tipo not in ('contrato_documento','contrato_despesa','problema','visita','comparacao','jornada','interna') or p_id is null or jsonb_typeof(p_dados) is distinct from 'object' or octet_length(p_dados::text)>16000 then raise exception 'Registro inválido.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('analise:'||p_tipo||':'||p_id,0));
 select * into antigo from public.vinculos_analiticos where oficina_id=p_oficina and tipo=p_tipo and id=p_id for update;
 if antigo.ativo and antigo.dados=p_dados then return;end if;
 if antigo.revisao is distinct from p_revisao then raise exception 'Registro alterado. Atualize antes de salvar.' using errcode='PT409';end if;
 if p_tipo in ('contrato_documento','problema') then
 select * into doc from private.documentos_analiticos where oficina_id=p_oficina and id=case when p_tipo='problema' then (p_dados->>'documento_id')::uuid else p_id end;
 if not found then raise exception 'Escolha uma OS ativa desta empresa.' using errcode='42501';end if;
 end if;
 if p_tipo in ('contrato_documento','contrato_despesa') then
 select * into c from public.contratos_preventivos where oficina_id=p_oficina and id=(p_dados->>'contrato_id')::uuid;
 if not found then raise exception 'Contrato indisponível.' using errcode='42501';end if;
 if p_tipo='contrato_documento' then
 if doc.cliente_id is distinct from c.cliente_id then raise exception 'A OS e o contrato devem pertencer ao mesmo cliente.' using errcode='22023';end if;
 inicio:=doc.data;
 else
 select * into t from public.titulos_financeiros where oficina_id=p_oficina and id=p_id for update;
 if not found or t.natureza<>'pagar' or t.cancelado_em is not null or t.provisorio or t.categoria in ('compra_estoque','transferencia','retirada','saldo_inicial','aporte') or t.ordem_servico_id is not null or exists(select 1 from public.apropriacoes_custo where oficina_id=p_oficina and titulo_id=p_id and cancelado_em is null) then raise exception 'Use uma despesa direta do contrato, sem apropriação em OS, para evitar duplicidade.' using errcode='22023';end if;
 inicio:=t.competencia;
 end if;
 if inicio<c.inicio or inicio>least(coalesce(c.fim,'infinity'::date),coalesce(c.encerrado_em,'infinity'::date)) then raise exception 'Registro fora da vigência do contrato.' using errcode='22023';end if;
 end if;
 if p_tipo='problema' then
 if length(trim(coalesce(p_dados->>'descricao',''))) not between 3 and 500 then raise exception 'Descreva o problema acompanhado.' using errcode='22023';end if;
 if antigo.id is not null and antigo.dados->>'documento_id' is distinct from p_dados->>'documento_id' then raise exception 'Mantenha a OS de origem do problema.' using errcode='22023';end if;
 end if;
 if p_tipo='visita' then
 select * into problema from private.vinculos_analiticos_ativos where oficina_id=p_oficina and tipo='problema' and id=(p_dados->>'problema_id')::uuid;
 if not found then raise exception 'Selecione um problema desta empresa.' using errcode='42501';end if;
 select * into visita from private.agenda_equipe where oficina_id=p_oficina and id=p_id;
 if not found or not coalesce((visita.dados->>'visita')::boolean,false) or visita.situacao not in ('concluido','convertido') or visita.fim is null or visita.fim>now() then raise exception 'Selecione uma visita encerrada, com início e término já ocorridos.' using errcode='22023';end if;
 select * into doc from private.documentos_analiticos where oficina_id=p_oficina and id=(problema.dados->>'documento_id')::uuid;
 if not exists(select 1 from private.documentos_analiticos x where x.oficina_id=p_oficina and x.id=coalesce(nullif(visita.dados->>'ordem_servico_id',''),nullif(visita.dados->>'atendimento_id',''))::uuid and x.cliente_id is not distinct from doc.cliente_id and x.objeto_id is not distinct from doc.objeto_id) then raise exception 'A visita deve atender ao mesmo cliente e equipamento/veículo do problema.' using errcode='22023';end if;
 if coalesce(p_dados->>'resultado','') not in ('resolvido','pendente','retorno') or length(trim(coalesce(p_dados->>'evidencia',''))) not between 3 and 1000 then raise exception 'Informe o resultado e a evidência da visita.' using errcode='22023';end if;
 end if;
 if p_tipo='comparacao' then
 if not exists(select 1 from private.objetos_analiticos where oficina_id=p_oficina and id=p_id) then raise exception 'Equipamento indisponível.' using errcode='42501';end if;
 foreach k in array array['reparo','manutencao_atual','troca','instalacao','revenda','manutencao_novo','hora_parada','horas_reparo','horas_troca','meses'] loop
 v:=(p_dados->>k)::numeric;
 if v is null or v<0 or v>10000000000 or v::text in ('NaN','Infinity','-Infinity') or (k not in ('horas_reparo','horas_troca') and v<>trunc(v)) then raise exception 'Confira o valor %.',k using errcode='22023';end if;
 end loop;
 if (p_dados->>'meses')::int not between 1 and 120 or (p_dados->>'revenda')::bigint>(p_dados->>'troca')::bigint+(p_dados->>'instalacao')::bigint or length(trim(coalesce(p_dados->>'evidencia',''))) not between 3 and 1000 then raise exception 'Confira o horizonte, o valor de revenda e as fontes dos valores.' using errcode='22023';end if;
 end if;
 if p_tipo='jornada' then
 if not exists(select 1 from public.ativos_agenda where oficina_id=p_oficina and id=p_id) then raise exception 'Recurso indisponível.' using errcode='42501';end if;
 perform private.validar_jornada_analitica(p_dados->'turnos');
 end if;
 if p_tipo='interna' then
 w2:=(p_dados->>'destino')::uuid;perform private.exigir_analises(w2);
 if w2=p_oficina then raise exception 'Escolha outra unidade.' using errcode='22023';end if;
 -- Bloqueia os dois títulos em ordem estável, inclusive pedidos simultâneos.
 perform 1 from public.titulos_financeiros where id in (p_id,(p_dados->>'despesa_id')::uuid) order by id for update;
 select * into t from public.titulos_financeiros where oficina_id=p_oficina and id=p_id;
 select * into outro from public.titulos_financeiros where oficina_id=w2 and id=(p_dados->>'despesa_id')::uuid;
 if t.id is null or outro.id is null or t.natureza<>'receber' or outro.natureza<>'pagar' or t.cancelado_em is not null or outro.cancelado_em is not null or t.provisorio or outro.provisorio or t.valor_centavos<>outro.valor_centavos or t.competencia<>outro.competencia or length(trim(coalesce(p_dados->>'motivo','')))<3 then raise exception 'Vincule receita e despesa internas ativas, com mesmo valor e competência, e informe o motivo.' using errcode='22023';end if;
 if exists(select 1 from private.vinculos_analiticos_ativos where tipo='interna' and dados->>'despesa_id'=outro.id::text and id<>p_id) then raise exception 'Despesa já vinculada a outra operação interna.' using errcode='22023';end if;
 if not exists(select 1 from private.linhas_apuracao(p_oficina,t.competencia,t.competencia) where chave='titulo:'||t.id and grupo='receita') or not exists(select 1 from private.linhas_apuracao(w2,outro.competencia,outro.competencia) where chave='titulo:'||outro.id and grupo in ('deducoes','custos','operacionais','despesa_financeira','tributo_lucro')) then raise exception 'Os lançamentos precisam compor receita e despesa na apuração.' using errcode='22023';end if;
 end if;
 insert into public.vinculos_analiticos(oficina_id,tipo,id,dados,autor) values(p_oficina,p_tipo,p_id,p_dados,auth.uid()) on conflict(oficina_id,tipo,id) do update set dados=excluded.dados,ativo=true,revisao=vinculos_analiticos.revisao+1,atualizado_em=now(),autor=auth.uid();
 insert into public.historico_vinculos_analiticos(oficina_id,tipo,registro_id,antes,depois,autor) values(p_oficina,p_tipo,p_id,antigo.dados,p_dados,auth.uid());
end $$;

-- Multiranges impedem somar duas vezes apontamentos simultâneos e reservas sobrepostas.
create function private.minutos_analiticos(r tstzmultirange) returns numeric language sql immutable set search_path='' as $$select coalesce(sum(extract(epoch from(upper(x)-lower(x)))/60),0) from unnest(r) x$$;

create function private.tempo_analitico(w uuid,d uuid,i timestamptz,f timestamptz) returns jsonb language plpgsql stable set search_path='' as $$
declare doc record;janela tstzmultirange;trabalho tstzmultirange;espera tstzmultirange;em_aberto int;horas numeric;
begin
 select * into doc from private.documentos_analiticos where oficina_id=w and id=d;
 if doc.inicio is null or least(coalesce(doc.fim,now()),f,now())<=greatest(doc.inicio,i) then return jsonb_build_object('trabalho',0,'espera',0,'sem_registro',0,'sobreposicao',0,'horas_pessoa',0,'abertos',0);end if;
 janela:=tstzmultirange(tstzrange(greatest(doc.inicio,i),least(coalesce(doc.fim,now()),f,now()),'[)'));
 select count(*) filter(where fim is null),coalesce(sum(private.minutos_analiticos(tstzmultirange(tstzrange(inicio,fim,'[)'))*janela)) filter(where fim is not null),0)
 into em_aberto,horas from private.horas_exportacao_equipe where oficina_id=w and documento_id=d and cancelado_em is null and inicio<least(f,now()) and (fim is null or fim>i);
 -- Apontamento aberto não afirma trabalho efetivo até agora.
 select coalesce(range_agg(tstzrange(inicio,fim,'[)')),'{}'::tstzmultirange) into trabalho from private.horas_exportacao_equipe where oficina_id=w and documento_id=d and cancelado_em is null and fim is not null and inicio<f and fim>i;
 if doc.automotivo then
 select coalesce(range_agg(tstzrange(iniciado_em,coalesce(encerrado_em,now()),'[)')),'{}'::tstzmultirange) into espera from public.paradas_ordem_servico where oficina_id=w and ordem_servico_id=d and iniciado_em<f and coalesce(encerrado_em,now())>i;
 else
 with eventos as (select depois,criado_em,lead(criado_em,1,now()) over(order by criado_em,id) fim from public.eventos_atendimento where oficina_id=w and atendimento_id=d and tipo='situacao') select coalesce(range_agg(tstzrange(criado_em,fim,'[)')),'{}'::tstzmultirange) into espera from eventos where depois='aguardando' and fim>criado_em;
 end if;
 trabalho:=trabalho*janela;espera:=espera*janela;
 return jsonb_build_object('trabalho',private.minutos_analiticos(trabalho),'espera',private.minutos_analiticos(espera-trabalho),'sem_registro',private.minutos_analiticos(janela-(trabalho+espera)),'sobreposicao',private.minutos_analiticos(trabalho*espera),'horas_pessoa',horas/60,'abertos',em_aberto);
end $$;

create function private.recursos_analiticos(w uuid,i date,f date) returns jsonb language plpgsql stable set search_path='' as $$
declare r record;j jsonb;bloq tstzmultirange;turnos tstzmultirange;reservas tstzmultirange;janela tstzrange;lista jsonb:='[]';sem_fim int;ausencias tstzmultirange;
begin
 janela:=tstzrange(i::timestamp at time zone 'America/Sao_Paulo',(f+1)::timestamp at time zone 'America/Sao_Paulo','[)');
 for r in select p.id,p.nome,'Técnico' tipo,p.jornada,p.bloqueios,p.funcionario_id,true movel,true tecnico from public.perfis_distribuicao p where p.oficina_id=w and p.ativo and (p.funcionario_id is null or exists(select 1 from public.funcionarios f where f.oficina_id=w and f.id=p.funcionario_id and f.ativo))
 union all select a.id,a.nome,case a.tipo when 'box' then 'Box' else 'Equipamento' end,v.dados->'turnos',a.bloqueios,null::uuid,a.movel,false from public.ativos_agenda a left join private.vinculos_analiticos_ativos v on v.oficina_id=w and v.tipo='jornada' and v.id=a.id where a.oficina_id=w and a.ativo loop
 j:=r.jornada;
 select coalesce(range_agg(tstzrange((d::date+(x->>'inicio')::time) at time zone 'America/Sao_Paulo',(d::date+(x->>'fim')::time) at time zone 'America/Sao_Paulo','[)')),'{}'::tstzmultirange) into turnos from generate_series(i::timestamp,f::timestamp,interval '1 day') d cross join jsonb_array_elements(coalesce(j,'[]')) x where (x->>'dia')::int=extract(dow from d);
 select coalesce(range_agg(tstzrange((x->>'inicio')::timestamptz,(x->>'fim')::timestamptz,'[)')),'{}'::tstzmultirange) into bloq from jsonb_array_elements(r.bloqueios) x;
 select coalesce(range_agg(tstzrange(inicio::timestamp at time zone 'America/Sao_Paulo',(coalesce(fim,inicio)+1)::timestamp at time zone 'America/Sao_Paulo','[)')),'{}'::tstzmultirange) into ausencias from public.registros_funcionario where oficina_id=w and funcionario_id=r.funcionario_id and tipo in ('ferias','ausencia','afastamento','treinamento') and situacao not in ('cancelado','cancelada','recusado') and inicio<=f and coalesce(fim,inicio)>=i;
 bloq:=bloq+ausencias;
 if r.funcionario_id is not null then select turnos*tstzmultirange(tstzrange(coalesce(admissao,'-infinity'::date)::timestamp at time zone 'America/Sao_Paulo',coalesce(desligamento,'infinity'::date)::timestamp at time zone 'America/Sao_Paulo','[)')) into turnos from public.funcionarios where oficina_id=w and id=r.funcionario_id;end if;
 with agenda as (select * from private.agenda_equipe a where a.oficina_id=w and a.situacao not in ('cancelado','faltou') and a.inicio<upper(janela)+interval '1 day' and coalesce(a.fim,a.inicio)>lower(janela)-interval '1 day' and case when r.tecnico then a.dados->'distribuicao'->>'perfil_id'=r.id::text else a.dados->'recursos_reservados' ? r.id::text end)
 select coalesce(range_agg(tstzrange(private.inicio_visita(inicio,coalesce((dados->>'visita')::boolean,false) and r.movel,coalesce((dados->>'deslocamento_minutos')::int,0),dados->'logistica'),private.fim_visita(fim,inicio,coalesce((dados->>'visita')::boolean,false) and r.movel,dados->'logistica'),'[)')) filter(where fim is not null),'{}'::tstzmultirange),count(*) filter(where fim is null) into reservas,sem_fim from agenda;
 reservas:=reservas*tstzmultirange(janela);
 lista:=lista||jsonb_build_array(jsonb_build_object('id',r.id,'nome',r.nome,'tipo',r.tipo,'capacidade',case when j is not null then private.minutos_analiticos(turnos-bloq)/60 end,'ocupacao',case when j is not null then round(100*private.minutos_analiticos(reservas*(turnos-bloq))/nullif(private.minutos_analiticos(turnos-bloq),0),1) end,'reservadas',private.minutos_analiticos(reservas*(turnos-bloq))/60,'livres',case when j is not null then private.minutos_analiticos((turnos-bloq)-reservas)/60 end,'bloqueadas',private.minutos_analiticos(turnos*bloq)/60,'fora_jornada',private.minutos_analiticos(reservas-(turnos-bloq))/60,'sem_fim',sem_fim,'cobertura',case when j is null then 'Cadastre a jornada' else 'Jornada informada' end));
 end loop;return lista;
end $$;

-- Toda consulta tem recorte, limite e paginação; os detalhes não são baixados em massa pelo navegador.
create function public.consultar_analise_gerencial(p_oficina uuid,p_tipo text,p_inicio date,p_fim date,p_filtros jsonb default '{}',p_pagina integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
<<analise>>
declare lista jsonb:='[]';resumo jsonb:='{}';criterios text;docs jsonb;d jsonb;linha jsonb;c record;v record;limite timestamptz;inicio timestamptz;total int;busca text;cliente text;objeto text;contrato text;w uuid;unidades uuid[];ap jsonb;eliminacoes jsonb:='[]';rec numeric;cus numeric;tempo jsonb;avaliavel boolean;primeira record;retornos int;n int;material numeric;despesa numeric;custo numeric;pendentes int;valor numeric;revisados int;
begin
 perform private.exigir_analises(p_oficina,p_tipo not in ('tempos','recursos','primeira_visita'));
 perform private.validar_periodo_apuracao(p_inicio,p_fim);
 if p_tipo is null or p_tipo not in ('clientes','dados','tempos','recursos','contratos','primeira_visita','equipamentos','comparacao','filiais') or p_pagina is null or p_pagina not between 0 and 100000 or jsonb_typeof(p_filtros) is distinct from 'object' or octet_length(p_filtros::text)>12000 then raise exception 'Revise os filtros.' using errcode='22023';end if;
 busca:=left(trim(coalesce(p_filtros->>'busca','')),120);cliente:=nullif(p_filtros->>'cliente','');objeto:=nullif(p_filtros->>'objeto','');contrato:=nullif(p_filtros->>'contrato','');
 inicio:=p_inicio::timestamp at time zone 'America/Sao_Paulo';limite:=(p_fim+1)::timestamp at time zone 'America/Sao_Paulo';
 if p_tipo in ('clientes','dados') and (select count(*) from (select 1 from private.documentos_analiticos x where x.oficina_id=p_oficina and x.data between p_inicio and p_fim and (analise.cliente is null or x.cliente_id::text=analise.cliente) and (busca='' or position(lower(busca) in lower(x.cliente||' '||x.titulo))>0) limit 5001)q)>5000 then raise exception 'Este recorte reúne mais de 5.000 serviços. Filtre pelo cliente ou reduza as datas.' using errcode='22023';end if;
 if p_tipo in ('clientes','dados') then
 select coalesce(jsonb_agg(private.detalhe_custeio(p_oficina,id)),'[]') into docs from private.documentos_analiticos where oficina_id=p_oficina and data between p_inicio and p_fim and (analise.cliente is null or cliente_id::text=analise.cliente) and (busca='' or position(lower(busca) in lower(cliente||' '||titulo))>0);
 if p_tipo='clientes' then
 select coalesce(jsonb_agg(to_jsonb(x) order by margem desc,id),'[]') into lista from (select coalesce(d->>'cliente_id','avulso:'||lower(d->>'cliente')) id,min(d->>'cliente') nome,count(*) servicos,count(*) filter(where(d->>'conferido')::boolean) conferidos,sum((d->>'receita')::numeric) receita,sum((d->>'custo')::numeric) custo,sum((d->>'margem')::numeric) margem,sum((d->>'indiretos')::numeric) indiretos,round(100.0*count(*) filter(where(d->>'conferido')::boolean)/nullif(count(*),0),1) cobertura,string_agg(distinct coalesce(d->'parametros'->>'rateio','Sem parâmetros'),', ') criterio from jsonb_array_elements(docs)d group by 1)x;
 else
 select coalesce(jsonb_agg(jsonb_build_object('id',d->>'id','nome',(d->>'titulo')||' · '||(d->>'cliente'),'receita',(d->>'receita')::numeric,'custo',(d->>'custo')::numeric,'margem',(d->>'margem')::numeric,'pendencias',(d->>'fontes_pendentes')::int,'situacao',case when(d->>'conferido')::boolean then 'Conferido' when d->'parametros'='null'::jsonb then 'Sem parâmetros de custo' when (d->>'fontes_pendentes')::int>0 then 'Custos/horas pendentes' when d->'conferencia'='null'::jsonb then 'Aguardando conferência' else 'Conferência desatualizada' end,'criterio',coalesce(d->'parametros'->>'rateio','Não informado')) order by(d->>'conferido')::boolean,d->>'id'),'[]') into lista from jsonb_array_elements(docs)d;
 end if;
 select jsonb_build_object('servicos',count(*),'conferidos',count(*) filter(where(d->>'conferido')::boolean),'receita',coalesce(sum((d->>'receita')::numeric),0),'margem',coalesce(sum((d->>'margem')::numeric),0),'receita_pendente',coalesce(sum((d->>'receita')::numeric) filter(where not(d->>'conferido')::boolean),0),'fontes_pendentes',coalesce(sum((d->>'fontes_pendentes')::int),0)) into resumo from jsonb_array_elements(docs)d;
 criterios:='Data do serviço. Margem = valor da OS − custos conhecidos − mão de obra apropriada − indiretos. Inclui serviços em andamento, exclui orçamentos/cancelamentos. Conferido exige fontes, parâmetros e assinatura atuais. Não é lucro líquido contábil. Indiretos seguem horas, receita mensal ou ausência de rateio configurada. Clientes avulsos sem cadastro são agrupados pelo nome informado.';
 elsif p_tipo='tempos' then
 for c in select * from private.documentos_analiticos x where x.oficina_id=p_oficina and x.inicio<least(limite,now()) and coalesce(x.fim,now())>analise.inicio and (analise.cliente is null or x.cliente_id::text=analise.cliente) and (busca='' or position(lower(busca) in lower(x.cliente||' '||x.titulo))>0) order by x.inicio desc,x.id limit 5001 loop
 tempo:=private.tempo_analitico(p_oficina,c.id,inicio,limite);lista:=lista||jsonb_build_array(jsonb_build_object('id',c.id,'nome',c.titulo||' · '||c.cliente)||tempo);
 end loop;
 if jsonb_array_length(lista)>5000 then raise exception 'Reduza o período: mais de 5.000 serviços em acompanhamento.' using errcode='22023';end if;
 criterios:='Minutos corridos dentro do período, desde a entrada até a conclusão técnica (ou entrega quando não há conclusão registrada), limitados ao momento da consulta. Trabalho usa a união dos apontamentos encerrados; espera usa pausas registradas, descontando sobreposição com trabalho. O restante é sem registro, nunca trabalho ou espera presumidos. Horas-pessoa somam profissionais; sobreposição e apontamentos abertos exigem conferência.';
 elsif p_tipo='recursos' then
 lista:=private.recursos_analiticos(p_oficina,p_inicio,p_fim);
 criterios:='Horas de agenda, não produção efetiva. Capacidade = jornada atual informada, limitada à contratação, menos bloqueios, férias, ausências e treinamentos registrados. Não reconstrói jornadas anteriores. Reservas simultâneas contam uma vez; técnico e equipamento móvel incluem ida, margem e volta. Reservas sem fim não ganham duração presumida. Fora da jornada/bloqueios aparece separado. Cada técnico, box e equipamento tem sua própria capacidade; não some recursos diferentes como vagas de veículos.';
 elsif p_tipo='contratos' then
 if (select count(*) from (select 1 from private.vinculos_analiticos_ativos l join private.documentos_analiticos a on a.oficina_id=l.oficina_id and a.id=l.id join public.contratos_preventivos cp on cp.oficina_id=l.oficina_id and cp.id=(l.dados->>'contrato_id')::uuid where l.oficina_id=p_oficina and l.tipo='contrato_documento' and a.data between p_inicio and p_fim and (contrato is null or cp.id::text=contrato) and (analise.cliente is null or cp.cliente_id::text=analise.cliente) and (busca='' or position(lower(busca) in lower(cp.nome))>0) limit 5001)q)>5000 then raise exception 'Selecione um contrato ou reduza as datas: mais de 5.000 serviços cobertos.' using errcode='22023';end if;
 for c in select * from public.contratos_preventivos where oficina_id=p_oficina and (contrato is null or id::text=contrato) and (analise.cliente is null or cliente_id::text=analise.cliente) and (busca='' or position(lower(busca) in lower(nome))>0) and inicio<=p_fim and coalesce(fim,'infinity'::date)>=p_inicio order by nome,id limit 501 loop
 rec:=0;cus:=0;pendentes:=0;n:=0;material:=0;
 select coalesce(sum(t.valor_centavos),0) into rec from public.faturas_contrato f join public.titulos_financeiros t on t.oficina_id=p_oficina and t.id=f.titulo_id where f.contrato_id=c.id and t.cancelado_em is null and not t.provisorio and t.competencia between p_inicio and p_fim;
 for v in select a.* from private.vinculos_analiticos_ativos l join private.documentos_analiticos a on a.oficina_id=l.oficina_id and a.id=l.id where l.oficina_id=p_oficina and l.tipo='contrato_documento' and l.dados->>'contrato_id'=c.id::text and a.data between p_inicio and p_fim loop
 d:=private.detalhe_custeio(p_oficina,v.id);cus:=cus+(d->>'custo')::numeric;n:=n+1;pendentes:=pendentes+case when(d->>'conferido')::boolean then 0 else 1 end;
 select material+coalesce(sum((f->>'valor')::numeric),0) into material from jsonb_array_elements(d->'fontes')f where f->>'categoria'='materiais' and not coalesce(d->'conferencia'->'dados'->'desconsideradas','{}') ? (f->>'chave');
 end loop;
 select coalesce(sum(t.valor_centavos),0) into despesa from private.vinculos_analiticos_ativos l join public.titulos_financeiros t on t.oficina_id=l.oficina_id and t.id=l.id where l.oficina_id=p_oficina and l.tipo='contrato_despesa' and l.dados->>'contrato_id'=c.id::text and t.cancelado_em is null and not t.provisorio and t.natureza='pagar' and t.categoria not in ('compra_estoque','transferencia','retirada','saldo_inicial','aporte') and t.ordem_servico_id is null and not exists(select 1 from public.apropriacoes_custo a where a.oficina_id=p_oficina and a.titulo_id=t.id and a.cancelado_em is null) and t.competencia between p_inicio and p_fim;
 select count(*) into revisados from private.vinculos_analiticos_ativos l join public.titulos_financeiros t on t.oficina_id=l.oficina_id and t.id=l.id where l.oficina_id=p_oficina and l.tipo='contrato_despesa' and l.dados->>'contrato_id'=c.id::text and t.competencia between p_inicio and p_fim and (t.cancelado_em is not null or t.provisorio or t.natureza<>'pagar' or t.categoria in ('compra_estoque','transferencia','retirada','saldo_inicial','aporte') or t.ordem_servico_id is not null or exists(select 1 from public.apropriacoes_custo a where a.oficina_id=p_oficina and a.titulo_id=t.id and a.cancelado_em is null));
 lista:=lista||jsonb_build_array(jsonb_build_object('id',c.id,'nome',c.nome,'vinculos_revisar',revisados,'receita',rec,'custo',cus+despesa,'margem',rec-cus-despesa,'materiais',material,'despesas',despesa,'servicos',n,'pendentes',pendentes,'visitas',(select coalesce(sum(visitas),0) from public.consumos_contrato where contrato_id=c.id and data between p_inicio and p_fim and not cancelado),'materiais_declarados',(select coalesce(sum(materiais_centavos),0) from public.consumos_contrato where contrato_id=c.id and data between p_inicio and p_fim and not cancelado),'situacao',case when revisados>0 then 'Vínculos de despesas a revisar' when n=0 then 'Sem OS vinculadas' when pendentes>0 then 'Custos a conferir' else 'OS conferidas' end));
 end loop;
 if jsonb_array_length(lista)>500 then raise exception 'Filtre um contrato ou cliente para detalhar.' using errcode='22023';end if;
 criterios:='Receita por competência das faturas ativas; não soma o valor das OS cobertas novamente. Custos vêm das OS explicitamente vinculadas e das despesas diretas sem apropriação em OS. Uma OS pertence a um contrato. Visitas e materiais declarados no consumo medem a franquia e não são somados novamente ao custo. Despesas posteriormente canceladas ou apropriadas em OS saem dos custos diretos e geram aviso de revisão. Sem vínculos ou conferência, o resultado é provisório.';
 elsif p_tipo='primeira_visita' then
 for c in select l.*,a.cliente,a.cliente_id,a.objeto_id from private.vinculos_analiticos_ativos l join private.documentos_analiticos a on a.oficina_id=l.oficina_id and a.id=(l.dados->>'documento_id')::uuid where l.oficina_id=p_oficina and l.tipo='problema' and exists(select 1 from private.vinculos_analiticos_ativos vl join private.agenda_equipe ag on ag.oficina_id=vl.oficina_id and ag.id=vl.id where vl.oficina_id=l.oficina_id and vl.tipo='visita' and vl.dados->>'problema_id'=l.id::text and ag.inicio>=analise.inicio and ag.inicio<limite) and (analise.cliente is null or a.cliente_id::text=analise.cliente) and (busca='' or position(lower(busca) in lower(a.cliente||' '||(l.dados->>'descricao')))>0) loop
 select g.id,g.inicio,g.fim,v.dados->>'resultado' resultado into primeira from private.vinculos_analiticos_ativos v join private.agenda_equipe g on g.oficina_id=v.oficina_id and g.id=v.id where v.oficina_id=p_oficina and v.tipo='visita' and v.dados->>'problema_id'=c.id::text and g.situacao in ('concluido','convertido') order by g.inicio,g.id limit 1;
 if not found or primeira.inicio<inicio or primeira.inicio>=limite then continue;end if;
 avaliavel:=primeira.fim+interval '30 days'<=least(limite,now());
 select count(*) into retornos from private.vinculos_analiticos_ativos v join private.agenda_equipe g on g.oficina_id=v.oficina_id and g.id=v.id where v.oficina_id=p_oficina and v.tipo='visita' and v.dados->>'problema_id'=c.id::text and g.situacao in ('concluido','convertido') and (g.inicio,g.id)>(primeira.inicio,primeira.id) and g.inicio<=least(primeira.fim+interval '30 days',limite,now());
 lista:=lista||jsonb_build_array(jsonb_build_object('id',c.id,'nome',(c.dados->>'descricao')||' · '||c.cliente,'primeira',primeira.inicio,'retornos',retornos,'avaliavel',avaliavel,'resolvido',avaliavel and primeira.resultado='resolvido' and retornos=0,'situacao',case when not avaliavel then 'Em observação (30 dias)' when primeira.resultado='resolvido' and retornos=0 then 'Resolvido na primeira visita' else 'Exigiu continuidade/retorno' end));
 if jsonb_array_length(lista)>5000 then raise exception 'Reduza o período: mais de 5.000 problemas no acompanhamento.' using errcode='22023';end if;
 end loop;
 select jsonb_build_object('problemas',count(*),'avaliaveis',count(*) filter(where(x->>'avaliavel')::boolean),'resolvidos',count(*) filter(where(x->>'resolvido')::boolean),'observacao',count(*) filter(where not(x->>'avaliavel')::boolean),'visitas_sem_vinculo',(select count(*) from private.agenda_equipe g where g.oficina_id=p_oficina and (g.dados->>'visita')::boolean and g.situacao in ('concluido','convertido') and g.inicio>=analise.inicio and g.inicio<least(limite,now()) and not exists(select 1 from private.vinculos_analiticos_ativos v where v.oficina_id=p_oficina and v.tipo='visita' and v.id=g.id))) into resumo from jsonb_array_elements(lista)x;
 criterios:='Coorte pela data da primeira visita. Resolvido = solução registrada na primeira visita e nenhum retorno do mesmo problema nos 30 dias seguintes. Só entram no denominador problemas com 30 dias completos até o fim do período/hoje. Problemas são vinculados explicitamente ao mesmo cliente e ativo. Visitas sem vínculo não entram no índice e aparecem na cobertura; ausência de retorno cadastrado não comprova satisfação.';
 elsif p_tipo in ('equipamentos','comparacao') then
 if (select count(*) from (select 1 from private.documentos_analiticos d join private.objetos_analiticos a on a.oficina_id=d.oficina_id and a.id=d.objeto_id where d.oficina_id=p_oficina and d.data<=p_fim and (objeto is null or a.id::text=objeto) and (busca='' or position(lower(busca) in lower(a.nome))>0) limit 5001)x)>5000 then raise exception 'Selecione um ativo: o histórico escolhido excedeu 5.000 serviços.' using errcode='22023';end if;
 for c in select * from private.objetos_analiticos where oficina_id=p_oficina and (objeto is null or id::text=objeto) and (busca='' or position(lower(busca) in lower(nome))>0) order by nome,id limit 501 loop
 cus:=0;rec:=0;pendentes:=0;n:=0;
 if (select count(*) from private.documentos_analiticos where oficina_id=p_oficina and objeto_id=c.id and data<=p_fim)>5000 then raise exception 'Ativo com mais de 5.000 serviços: consulte um recorte especializado.' using errcode='22023';end if;
 for v in select * from private.documentos_analiticos where oficina_id=p_oficina and objeto_id=c.id and data<=p_fim loop d:=private.detalhe_custeio(p_oficina,v.id);cus:=cus+(d->>'custo')::numeric;rec:=rec+(d->>'receita')::numeric;n:=n+1;pendentes:=pendentes+case when(d->>'conferido')::boolean then 0 else 1 end;end loop;
 select count(*) into retornos from private.vinculos_analiticos_ativos p join private.documentos_analiticos a on a.oficina_id=p.oficina_id and a.id=(p.dados->>'documento_id')::uuid where p.oficina_id=p_oficina and p.tipo='problema' and a.objeto_id=c.id and a.data<=p_fim;
 linha:=jsonb_build_object('id',c.id,'nome',c.nome,'servicos',n,'custo',cus,'receita',rec,'pendentes',pendentes,'problemas',retornos);
 if p_tipo='comparacao' then
 select * into v from private.vinculos_analiticos_ativos where oficina_id=p_oficina and tipo='comparacao' and id=c.id;
 if found then d:=v.dados;rec:=(d->>'reparo')::numeric+(d->>'manutencao_atual')::numeric*(d->>'meses')::int+(d->>'horas_reparo')::numeric*(d->>'hora_parada')::numeric;cus:=(d->>'troca')::numeric+(d->>'instalacao')::numeric-(d->>'revenda')::numeric+(d->>'manutencao_novo')::numeric*(d->>'meses')::int+(d->>'horas_troca')::numeric*(d->>'hora_parada')::numeric;
 linha:=linha||jsonb_build_object('reparo',round(rec),'substituicao',round(cus),'diferenca',round(cus-rec),'meses',(d->>'meses')::int,'situacao',case when rec<cus then 'Menor custo projetado: reparar' when cus<rec then 'Menor custo projetado: substituir' else 'Custos projetados iguais' end,'premissas',d,'revisao',v.revisao,'calculado_em',v.atualizado_em);
 else linha:=linha||jsonb_build_object('situacao','Informe as premissas');end if;
 end if;lista:=lista||jsonb_build_array(linha);
 end loop;
 if jsonb_array_length(lista)>500 then raise exception 'Busque pelo nome ou selecione um ativo para detalhar.' using errcode='22023';end if;
 criterios:=case when p_tipo='equipamentos' then 'Histórico acumulado até o fim do período, por identidade do veículo/equipamento, desde o primeiro serviço registrado. Custos de materiais, horas, terceiros, taxas, garantias e indiretos usam a mesma apropriação das OS. Não inclui vida anterior ao cadastro nem serviços sem ativo identificado. Valores de receita são cobrados ao cliente, não custo de operação do ativo.' else 'Simulação pelo horizonte informado: reparo ou compra/instalação menos revenda, manutenção mensal futura e horas de indisponibilidade × custo/hora. O histórico é mostrado separadamente: gasto passado não é contado novamente na decisão futura. Valores são estimativas informadas pelo gestor; a recomendação é econômica, não um laudo técnico ou uma decisão de segurança.' end;
 elsif p_tipo='filiais' then
 if jsonb_typeof(p_filtros->'unidades') is distinct from 'array' or jsonb_array_length(p_filtros->'unidades') not between 1 and 20 then raise exception 'Selecione de 1 a 20 unidades.' using errcode='22023';end if;
 select array_agg(distinct x::uuid) into unidades from jsonb_array_elements_text(p_filtros->'unidades')x;
 foreach w in array unidades loop
 perform private.exigir_analises(w);
 if (select count(*) from private.documentos_analiticos where oficina_id=w and data between p_inicio and p_fim)>5000 then raise exception 'Reduza o período de consolidação: uma unidade excedeu 5.000 serviços.' using errcode='22023';end if;
 ap:=public.consultar_apuracao_completa(w,p_inicio,p_fim);
 lista:=lista||jsonb_build_array(jsonb_build_object('id',w,'nome',(select nome from public.oficinas where id=w),'receita',coalesce((ap->'grupos'->>'receita')::numeric,0),'resultado',(ap->>'resultado_liquido')::numeric,'pendentes',(ap->>'servicos_revisar')::int,'sem_mapeamento',(ap->>'sem_mapeamento')::int,'situacao',case when(ap->>'conferido')::boolean then 'Apuração conferida' else 'Apuração provisória' end));
 end loop;
 rec:=0;n:=0;
 for c in select l.*,t.valor_centavos,t.competencia,t.cancelado_em,t.provisorio,t.natureza,t.id tid,o.id oid,o.cancelado_em ocancel,o.provisorio oprovisorio,o.valor_centavos ovalor,o.competencia odata,o.natureza onatureza from private.vinculos_analiticos_ativos l join public.titulos_financeiros t on t.oficina_id=l.oficina_id and t.id=l.id left join public.titulos_financeiros o on o.oficina_id=(l.dados->>'destino')::uuid and o.id=(l.dados->>'despesa_id')::uuid where l.tipo='interna' and l.oficina_id=any(unidades) and (l.dados->>'destino')::uuid=any(unidades) and (t.competencia between p_inicio and p_fim or o.competencia between p_inicio and p_fim) loop
 if c.cancelado_em is null and c.ocancel is null and not c.provisorio and not c.oprovisorio and c.natureza='receber' and c.onatureza='pagar' and c.valor_centavos=c.ovalor and c.competencia=c.odata and exists(select 1 from private.linhas_apuracao(c.oficina_id,p_inicio,p_fim) where chave='titulo:'||c.tid and grupo='receita') and exists(select 1 from private.linhas_apuracao((c.dados->>'destino')::uuid,p_inicio,p_fim) where chave='titulo:'||c.oid and grupo in ('deducoes','custos','operacionais','despesa_financeira','tributo_lucro')) then rec:=rec+c.valor_centavos;else n:=n+1;end if;
 end loop;
 select jsonb_build_object('unidades',count(*),'receita',coalesce(sum((x->>'receita')::numeric),0)-rec,'resultado',coalesce(sum((x->>'resultado')::numeric),0),'eliminado',rec,'vinculos_invalidos',n,'pendentes',coalesce(sum((x->>'pendentes')::int),0)) into resumo from jsonb_array_elements(lista)x;
 criterios:='Apuração por competência de cada unidade autorizada. Consolidado elimina receita e despesa internas pareadas com mesmo valor/data; o resultado líquido combinado não muda pela eliminação simétrica. Vínculos alterados/cancelados não são eliminados e exigem conferência. Contas a receber/pagar não são caixa. Operações internas sem vínculo permanecem nos totais. Não substitui demonstrações contábeis consolidadas.';
 end if;
 if p_tipo not in ('clientes','dados','tempos','contratos','primeira_visita','equipamentos','comparacao') and busca<>'' then select coalesce(jsonb_agg(x),'[]') into lista from jsonb_array_elements(lista)x where position(lower(busca) in lower(x->>'nome'))>0;end if;
 if p_tipo in ('recursos','primeira_visita','filiais') then select coalesce(jsonb_agg(x order by x->>'nome',x->>'id'),'[]') into lista from jsonb_array_elements(lista)x;end if;
 total:=jsonb_array_length(lista);
 if resumo='{}'::jsonb then select coalesce(jsonb_object_agg(chave,soma),'{}') into resumo from(select k chave,sum(v::numeric) soma from jsonb_array_elements(lista)x cross join jsonb_each_text(x)e(k,v) where k in ('receita','custo','margem','servicos','pendentes','trabalho','espera','sem_registro','sobreposicao','abertos','capacidade','reservadas','livres','bloqueadas','fora_jornada','sem_fim','visitas','materiais','despesas','problemas','vinculos_revisar') and v is not null group by k)s;end if;
 select coalesce(jsonb_agg(x),'[]') into lista from(select x from jsonb_array_elements(lista) with ordinality a(x,n) order by n limit 25 offset p_pagina*25)t;
 return jsonb_build_object('tipo',p_tipo,'inicio',p_inicio,'fim',p_fim,'gerado_em',now(),'total',total,'pagina',p_pagina,'linhas',lista,'resumo',resumo,'criterios',criterios);
end $$;

create function public.buscar_opcoes_analiticas(p_oficina uuid,p_tipo text,p_busca text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare lista jsonb;b text:=lower(left(trim(coalesce(p_busca,'')),120));begin
 perform private.exigir_analises(p_oficina,p_tipo not in ('problema','visita','recurso','documento'));
 if p_tipo='documento' then select coalesce(jsonb_agg(to_jsonb(x)),'[]') into lista from(select id,titulo||' · '||cliente nome from private.documentos_analiticos where oficina_id=p_oficina and (b='' or id::text=b or position(b in lower(titulo||' '||cliente))>0) order by data desc,id limit 30)x;
 elsif p_tipo='contrato' then select coalesce(jsonb_agg(to_jsonb(x)),'[]') into lista from(select id,nome from public.contratos_preventivos where oficina_id=p_oficina and (b='' or id::text=b or position(b in lower(nome))>0) order by nome,id limit 30)x;
 elsif p_tipo='objeto' then select coalesce(jsonb_agg(to_jsonb(x)),'[]') into lista from(select id,nome from private.objetos_analiticos where oficina_id=p_oficina and (b='' or id::text=b or position(b in lower(nome))>0) order by nome,id limit 30)x;
 elsif p_tipo='problema' then select coalesce(jsonb_agg(to_jsonb(x)),'[]') into lista from(select id,dados->>'descricao' nome from private.vinculos_analiticos_ativos where oficina_id=p_oficina and tipo='problema' and (b='' or id::text=b or position(b in lower(dados->>'descricao'))>0) order by atualizado_em desc,id limit 30)x;
 elsif p_tipo='recurso' then select coalesce(jsonb_agg(to_jsonb(x)),'[]') into lista from(select id,nome from public.ativos_agenda where oficina_id=p_oficina and ativo and (b='' or id::text=b or position(b in lower(nome))>0) order by nome,id limit 30)x;
 elsif p_tipo='visita' then select coalesce(jsonb_agg(to_jsonb(x)),'[]') into lista from(select id,to_char(inicio at time zone 'America/Sao_Paulo','DD/MM/YYYY HH24:MI')||' · '||coalesce(dados->>'servico',dados->>'observacoes','Visita') nome from private.agenda_equipe where oficina_id=p_oficina and (dados->>'visita')::boolean and situacao in ('concluido','convertido') and fim<=now() and (b='' or id::text=b or position(b in lower(to_char(inicio at time zone 'America/Sao_Paulo','DD/MM/YYYY HH24:MI')||' '||dados::text))>0) order by inicio desc,id limit 30)x;
 elsif p_tipo in ('despesa','receita') then select coalesce(jsonb_agg(to_jsonb(x)),'[]') into lista from(select id,descricao||' · '||to_char(competencia,'DD/MM/YYYY') nome from public.titulos_financeiros where oficina_id=p_oficina and natureza=case when p_tipo='despesa' then 'pagar' else 'receber' end and cancelado_em is null and not provisorio and (b='' or id::text=b or position(b in lower(descricao))>0) order by competencia desc,id limit 30)x;
 else raise exception 'Tipo de busca inválido.' using errcode='22023';end if;return lista;
end $$;
create function public.consultar_vinculo_analitico(p_oficina uuid,p_tipo text,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform private.exigir_analises(p_oficina,p_tipo not in ('problema','visita','jornada'));
 return (select to_jsonb(x) from public.vinculos_analiticos x where oficina_id=p_oficina and tipo=p_tipo and id=p_id);
end $$;

revoke all on private.objetos_analiticos,private.documentos_analiticos from public,anon,authenticated;
revoke all on function private.exigir_analises(uuid,boolean),private.validar_jornada_analitica(jsonb),private.minutos_analiticos(tstzmultirange),private.tempo_analitico(uuid,uuid,timestamptz,timestamptz),private.recursos_analiticos(uuid,date,date) from public,anon,authenticated;
revoke all on function public.salvar_vinculo_analitico(uuid,text,uuid,jsonb,integer),public.consultar_analise_gerencial(uuid,text,date,date,jsonb,integer),public.buscar_opcoes_analiticas(uuid,text,text),public.consultar_vinculo_analitico(uuid,text,uuid) from public,anon;
grant execute on function public.salvar_vinculo_analitico(uuid,text,uuid,jsonb,integer),public.consultar_analise_gerencial(uuid,text,date,date,jsonb,integer),public.buscar_opcoes_analiticas(uuid,text,text),public.consultar_vinculo_analitico(uuid,text,uuid) to authenticated;
create function public.retirar_vinculo_analitico(p_oficina uuid,p_tipo text,p_id uuid,p_revisao integer,p_motivo text) returns void language plpgsql security definer set search_path='' as $$
declare a public.vinculos_analiticos;begin
 perform private.exigir_analises(p_oficina,p_tipo not in ('problema','visita','jornada'));
 if length(trim(coalesce(p_motivo,''))) not between 3 and 500 then raise exception 'Informe o motivo da correção.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('analise:'||p_tipo||':'||p_id,0));
 select * into a from public.vinculos_analiticos where oficina_id=p_oficina and tipo=p_tipo and id=p_id for update;
 if not found then raise exception 'Vínculo indisponível.' using errcode='42501';end if;
 if not a.ativo then return;end if;
 if a.revisao is distinct from p_revisao then raise exception 'Registro alterado. Atualize antes de corrigir.' using errcode='PT409';end if;
 if p_tipo='interna' then perform private.exigir_analises((a.dados->>'destino')::uuid);end if;
 if p_tipo='problema' and exists(select 1 from private.vinculos_analiticos_ativos where oficina_id=p_oficina and tipo='visita' and dados->>'problema_id'=p_id::text) then raise exception 'Retire primeiro os vínculos das visitas deste problema.' using errcode='22023';end if;
 update public.vinculos_analiticos set ativo=false,revisao=revisao+1,atualizado_em=now(),autor=auth.uid() where oficina_id=p_oficina and tipo=p_tipo and id=p_id;
 insert into public.historico_vinculos_analiticos(oficina_id,tipo,registro_id,antes,depois,autor) values(p_oficina,p_tipo,p_id,to_jsonb(a),jsonb_build_object('ativo',false,'motivo',trim(p_motivo)),auth.uid());
end $$;
revoke all on function public.retirar_vinculo_analitico(uuid,text,uuid,integer,text) from public,anon;
grant execute on function public.retirar_vinculo_analitico(uuid,text,uuid,integer,text) to authenticated;
notify pgrst,'reload schema';
commit;

