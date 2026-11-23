begin;
create table public.habilidades_equipe (
 oficina_id uuid not null references public.oficinas(id),habilidade text not null,nome text not null check(length(trim(nome)) between 2 and 100),
 exige_comprovacao boolean not null default false,nivel_minimo integer not null default 1 check(nivel_minimo between 1 and 3),ativo boolean not null default true,revisao integer not null default 1,
 primary key(oficina_id,habilidade)
);
create table public.qualificacoes_equipe (
 id uuid primary key,oficina_id uuid not null,funcionario_id uuid not null,habilidade text not null,nivel integer not null check(nivel between 1 and 3),
 realizada_em date not null,valida_ate date,comprovante text not null default '' check(length(comprovante)<=2000),
 situacao text not null check(situacao in ('planejada','concluida','revogada')),observacoes text not null default '' check(length(observacoes)<=2000),
 revisao integer not null default 1,autor uuid not null references auth.users(id),atualizado_em timestamptz not null default now(),
 check(valida_ate is null or valida_ate>=realizada_em),foreign key(oficina_id,funcionario_id) references public.funcionarios(oficina_id,id),foreign key(oficina_id,habilidade) references public.habilidades_equipe(oficina_id,habilidade)
);
create index qualificacao_aptidao on public.qualificacoes_equipe(oficina_id,funcionario_id,habilidade,realizada_em,valida_ate) where situacao='concluida';
create index qualificacao_vencimento on public.qualificacoes_equipe(oficina_id,valida_ate) where situacao='concluida';
create index qualificacao_matriz on public.qualificacoes_equipe(oficina_id,funcionario_id,habilidade,realizada_em desc);
create table public.historico_qualificacao_equipe(id bigint generated always as identity primary key,oficina_id uuid not null,qualificacao_id uuid not null references public.qualificacoes_equipe(id),registro jsonb not null,autor uuid not null references auth.users(id),criado_em timestamptz not null default now());
create trigger historico_qualificacao_imutavel before update or delete on public.historico_qualificacao_equipe for each row execute function private.reject_mutation();
create index qualificacao_historico on public.historico_qualificacao_equipe(oficina_id,qualificacao_id,criado_em desc);
create table public.planos_escala_equipe(id uuid primary key,oficina_id uuid not null references public.oficinas(id),propostas jsonb not null,resultado jsonb not null,autor uuid not null references auth.users(id),criado_em timestamptz not null default now());
create index planos_escala_periodo on public.planos_escala_equipe(oficina_id,criado_em desc);
create function public.salvar_habilidade_equipe(p_oficina uuid,p_dados jsonb,p_revisao integer default null) returns text language plpgsql security definer set search_path='' as $$
declare k text;h public.habilidades_equipe;begin
 perform private.exigir_cadastro_funcionarios(p_oficina);k:=(private.textos_distribuicao(jsonb_build_array(p_dados->>'nome')))[1];
 if k is null or length(k)<2 or coalesce((p_dados->>'nivel_minimo')::integer,0) not between 1 and 3 then raise exception 'Confira nome e nível mínimo.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('distribuicao:'||p_oficina,0));perform pg_advisory_xact_lock(hashtextextended('qualificacoes:'||p_oficina,0));select * into h from public.habilidades_equipe where oficina_id=p_oficina and habilidade=k for update;
 if h.habilidade is null and (select count(*) from public.habilidades_equipe where oficina_id=p_oficina)>=100 then raise exception 'Limite de 100 habilidades. Reutilize o catálogo existente.' using errcode='22023';end if;
 if h.revisao is distinct from p_revisao then raise exception 'Habilidade alterada. Atualize a tela.' using errcode='PT409';end if;
 insert into public.habilidades_equipe values(p_oficina,k,trim(p_dados->>'nome'),coalesce((p_dados->>'exige_comprovacao')::boolean,false),(p_dados->>'nivel_minimo')::integer,coalesce((p_dados->>'ativo')::boolean,true),1) on conflict(oficina_id,habilidade) do update set nome=excluded.nome,exige_comprovacao=excluded.exige_comprovacao,nivel_minimo=excluded.nivel_minimo,ativo=excluded.ativo,revisao=habilidades_equipe.revisao+1;return k;
end $$;
create function public.salvar_qualificacao_equipe(p_oficina uuid,p_id uuid,p_dados jsonb,p_revisao integer default null) returns void language plpgsql security definer set search_path='' as $$
declare q public.qualificacoes_equipe;n public.qualificacoes_equipe;fid uuid:=(p_dados->>'funcionario_id')::uuid;k text:=p_dados->>'habilidade';r date:=(p_dados->>'realizada_em')::date;v date:=nullif(p_dados->>'valida_ate','')::date;begin
 perform private.exigir_cadastro_funcionarios(p_oficina);perform pg_advisory_xact_lock(hashtextextended('distribuicao:'||p_oficina,0));perform pg_advisory_xact_lock(hashtextextended('qualificacoes:'||p_oficina,0));
 select * into q from public.qualificacoes_equipe where id=p_id for update;
 if q.id is not null and q.oficina_id<>p_oficina then raise exception 'Registro indisponível.' using errcode='42501';end if;
 if q.revisao is distinct from p_revisao then raise exception 'Qualificação alterada. Atualize a ficha.' using errcode='PT409';end if;
 if p_id is null or jsonb_typeof(p_dados) is distinct from 'object' or octet_length(p_dados::text)>8000 or r is null or not isfinite(r) or (v is not null and (not isfinite(v) or v<r)) or coalesce(p_dados->>'situacao','') not in ('planejada','concluida','revogada') or coalesce((p_dados->>'nivel')::integer,0) not between 1 and 3 then raise exception 'Confira datas, nível e situação da qualificação.' using errcode='22023';end if;
 if p_dados->>'situacao'='concluida' and (r>(now() at time zone 'America/Sao_Paulo')::date or length(trim(coalesce(p_dados->>'comprovante','')))<3) then raise exception 'Para concluir, registre o comprovante e uma data já realizada.' using errcode='22023';end if;
 if not exists(select 1 from public.funcionarios where oficina_id=p_oficina and id=fid) or not exists(select 1 from public.habilidades_equipe where oficina_id=p_oficina and habilidade=k and ativo) then raise exception 'Funcionário ou habilidade indisponível.' using errcode='22023';end if;
 insert into public.qualificacoes_equipe(id,oficina_id,funcionario_id,habilidade,nivel,realizada_em,valida_ate,comprovante,situacao,observacoes,autor) values(p_id,p_oficina,fid,k,(p_dados->>'nivel')::integer,r,v,coalesce(p_dados->>'comprovante',''),p_dados->>'situacao',coalesce(p_dados->>'observacoes',''),auth.uid()) on conflict(id) do update set funcionario_id=excluded.funcionario_id,habilidade=excluded.habilidade,nivel=excluded.nivel,realizada_em=excluded.realizada_em,valida_ate=excluded.valida_ate,comprovante=excluded.comprovante,situacao=excluded.situacao,observacoes=excluded.observacoes,revisao=qualificacoes_equipe.revisao+1,autor=auth.uid(),atualizado_em=now() returning * into n;
 insert into public.historico_qualificacao_equipe(oficina_id,qualificacao_id,registro,autor) values(p_oficina,p_id,jsonb_build_object('antes',to_jsonb(q),'depois',to_jsonb(n)),auth.uid());
end $$;
create function public.consultar_qualificacoes_equipe(p_oficina uuid,p_funcionario uuid default null,p_pagina integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform private.exigir_cadastro_funcionarios(p_oficina);if p_pagina is null or p_pagina not between 0 and 100000 then raise exception 'Página inválida.' using errcode='22023';end if;
 return jsonb_build_object('habilidades',(select coalesce(jsonb_agg(to_jsonb(h) order by nome),'[]') from public.habilidades_equipe h where oficina_id=p_oficina),'qualificacoes',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from(select q.*,f.nome from public.qualificacoes_equipe q join public.funcionarios f on f.oficina_id=q.oficina_id and f.id=q.funcionario_id where q.oficina_id=p_oficina and (p_funcionario is null or q.funcionario_id=p_funcionario) order by q.valida_ate nulls last,f.nome,q.id limit 51 offset p_pagina*50)x),'vencendo',(select count(distinct(q.funcionario_id,q.habilidade)) from public.qualificacoes_equipe q join public.funcionarios f on f.oficina_id=q.oficina_id and f.id=q.funcionario_id and f.ativo where q.oficina_id=p_oficina and q.situacao='concluida' and q.valida_ate<=(now() at time zone 'America/Sao_Paulo')::date+30 and not exists(select 1 from public.qualificacoes_equipe renovada where renovada.oficina_id=q.oficina_id and renovada.funcionario_id=q.funcionario_id and renovada.habilidade=q.habilidade and renovada.situacao='concluida' and renovada.nivel>=q.nivel and renovada.realizada_em<=(now() at time zone 'America/Sao_Paulo')::date and (renovada.valida_ate is null or renovada.valida_ate>(now() at time zone 'America/Sao_Paulo')::date+30))));
end $$;
create function public.matriz_qualificacoes_equipe(p_oficina uuid,p_funcionario uuid default null,p_pagina integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform private.exigir_cadastro_funcionarios(p_oficina);if p_pagina is null or p_pagina not between 0 and 100000 then raise exception 'Página inválida.' using errcode='22023';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'nome',f.nome,'aptidoes',(select coalesce(jsonb_agg(jsonb_build_object('habilidade',h.habilidade,'nome',h.nome,'nivel',q.nivel,'valida_ate',q.valida_ate,'qualificacao_id',q.id,'estado',case when q.id is null then 'Sem registro' when q.situacao='planejada' then 'Planejada' when q.situacao='revogada' then 'Revogada' when q.valida_ate<(now() at time zone 'America/Sao_Paulo')::date then 'Vencida' when q.nivel<h.nivel_minimo then 'Abaixo do nível' else 'Válida' end) order by h.nome),'[]') from public.habilidades_equipe h left join lateral(select * from public.qualificacoes_equipe z where z.oficina_id=p_oficina and z.funcionario_id=f.id and z.habilidade=h.habilidade order by (z.situacao='concluida' and z.realizada_em<=(now() at time zone 'America/Sao_Paulo')::date and (z.valida_ate is null or z.valida_ate>=(now() at time zone 'America/Sao_Paulo')::date)) desc,z.nivel desc,z.realizada_em desc,z.atualizado_em desc limit 1)q on true where h.oficina_id=p_oficina and h.ativo)) order by f.nome),'[]') from(select id,nome from public.funcionarios where oficina_id=p_oficina and ativo and (p_funcionario is null or id=p_funcionario) order by nome,id limit 51 offset p_pagina*50)f);
end $$;
alter function private.avaliar_distribuicao(uuid,jsonb,uuid) rename to avaliar_distribuicao_antes_qualificacoes;
create function private.avaliar_distribuicao(w uuid,d jsonb,perfil uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;c jsonb;lista jsonb:='[]';h public.habilidades_equipe;p public.perfis_distribuicao;req text[];motivos jsonb;dia date;fimdia date;begin
 r:=private.avaliar_distribuicao_antes_qualificacoes(w,d,perfil);req:=private.textos_distribuicao(d#>'{distribuicao,habilidades}');dia:=((d->>'inicio')::timestamptz at time zone 'America/Sao_Paulo')::date;fimdia:=((d->>'fim')::timestamptz at time zone 'America/Sao_Paulo')::date;
 for c in select * from jsonb_array_elements(r->'candidatos') loop
 motivos:=c->'motivos';select * into p from public.perfis_distribuicao where oficina_id=w and id=(c->>'id')::uuid;
 for h in select * from public.habilidades_equipe where oficina_id=w and habilidade=any(req) and ativo and exige_comprovacao loop
 if p.funcionario_id is null or not exists(select 1 from public.qualificacoes_equipe q where q.oficina_id=w and q.funcionario_id=p.funcionario_id and q.habilidade=h.habilidade and q.situacao='concluida' and q.nivel>=h.nivel_minimo and q.realizada_em<=dia and (q.valida_ate is null or q.valida_ate>=fimdia)) then motivos:=motivos||jsonb_build_array('Qualificação ausente, vencida ou abaixo do nível: '||h.nome);end if;
 end loop;
 lista:=lista||jsonb_build_array(c||jsonb_build_object('motivos',motivos,'apto',jsonb_array_length(motivos)=0));end loop;
 return r||jsonb_build_object('candidatos',(select jsonb_agg(x order by (x->>'apto')::boolean desc,(x->>'distancia_km')::numeric nulls last,(x->>'carga_minutos')::numeric,x->>'nome',x->>'id') from jsonb_array_elements(lista)x));
end $$;
create view private.agenda_equipe as select oficina_id,id,inicio,fim,revisao,situacao,to_jsonb(g) dados,true automotivo from public.agenda_atendimentos g union all select g.oficina_id,g.id,g.inicio,g.fim,g.revisao,g.situacao,to_jsonb(g)||jsonb_build_object('servico',a.titulo),false from public.agenda_servicos g join public.atendimentos_servicos a on a.oficina_id=g.oficina_id and a.id=g.atendimento_id;
create function public.consultar_demanda_equipe(p_oficina uuid,p_inicio date,p_fim date) returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform private.exigir_cadastro_funcionarios(p_oficina);perform private.exigir_distribuicao(p_oficina);
 if p_inicio is null or p_fim is null or not isfinite(p_inicio) or not isfinite(p_fim) or p_fim<p_inicio or p_fim-p_inicio>30 then raise exception 'Escolha até 31 dias para a escala.' using errcode='22023';end if;
 return (select coalesce(jsonb_agg(dados||jsonb_build_object('automotivo',automotivo) order by inicio,id),'[]') from(select * from private.agenda_equipe where oficina_id=p_oficina and inicio>=(p_inicio::timestamp at time zone 'America/Sao_Paulo') and inicio<((p_fim+1)::timestamp at time zone 'America/Sao_Paulo') and situacao in ('agendado','confirmado') order by inicio,id limit 201)x);
end $$;
create function public.prever_escala_equipe(p_oficina uuid,p_ids uuid[],p_habilidades text[] default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare g record;s jsonb;c jsonb;escolha jsonb;plano jsonb:='[]';ini timestamptz;fimv timestamptz;begin
 perform private.exigir_cadastro_funcionarios(p_oficina);perform private.exigir_distribuicao(p_oficina);
 if p_ids is null or cardinality(p_ids) not between 1 and 50 or cardinality(p_ids)<>(select count(distinct x) from unnest(p_ids)x) or (select count(*) from private.agenda_equipe where oficina_id=p_oficina and id=any(p_ids) and situacao in ('agendado','confirmado'))<>cardinality(p_ids) then raise exception 'Selecione até 50 agendamentos ativos da empresa.' using errcode='22023';end if;
 for g in select * from private.agenda_equipe where oficina_id=p_oficina and id=any(p_ids) order by inicio,id loop
 if coalesce(jsonb_array_length(g.dados#>'{distribuicao,habilidades}'),0)=0 and cardinality(p_habilidades)>0 then g.dados:=jsonb_set(g.dados,'{distribuicao}',coalesce(g.dados->'distribuicao','{}')||jsonb_build_object('habilidades',to_jsonb(p_habilidades)));end if;
 escolha:=null;ini:=private.inicio_visita(g.inicio,(g.dados->>'visita')::boolean,(g.dados->>'deslocamento_minutos')::integer,g.dados->'logistica');fimv:=private.fim_visita(g.fim,g.inicio,(g.dados->>'visita')::boolean,g.dados->'logistica');
 if g.fim is null or coalesce(jsonb_array_length(g.dados#>'{distribuicao,habilidades}'),0)=0 then s:=jsonb_build_object('candidatos','[]','motivo','Informe término e habilidades na agenda antes de distribuir.');
 else
 s:=private.avaliar_distribuicao(p_oficina,g.dados);
 for c in select x from jsonb_array_elements(coalesce(s->'candidatos','[]'))x where (x->>'apto')::boolean order by ((x->>'carga_minutos')::numeric+coalesce((select sum((p->>'minutos')::numeric) from jsonb_array_elements(plano)p where p#>>'{escolha,id}'=x->>'id'),0)),(x->>'distancia_km')::numeric nulls last,x->>'id' loop
 if not exists(select 1 from jsonb_array_elements(plano)p where p#>>'{escolha,id}'=c->>'id' and (p->>'inicio_reserva')::timestamptz<fimv and (p->>'fim_reserva')::timestamptz>ini) then escolha:=c;exit;end if;end loop;end if;
 plano:=plano||jsonb_build_array(jsonb_build_object('id',g.id,'revisao',g.revisao,'habilidades',g.dados#>'{distribuicao,habilidades}','inicio',g.inicio,'fim',g.fim,'inicio_reserva',ini,'fim_reserva',fimv,'minutos',extract(epoch from(fimv-ini))/60,'descricao',coalesce(g.dados->>'servico',g.dados->>'titulo','Atendimento'),'escolha',escolha,'candidatos',coalesce(s->'candidatos','[]'),'motivo',case when escolha is null then coalesce(s->>'motivo','Sem equipe apta e livre. Confira jornada, ausências, habilidades e conflitos.') else null end));end loop;
 return plano;
end $$;
create function public.aplicar_escala_equipe(p_oficina uuid,p_id uuid,p_propostas jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare ant public.planos_escala_equipe;g record;item jsonb;p public.perfis_distribuicao;d jsonb;resultado jsonb:='[]';begin
 perform private.exigir_cadastro_funcionarios(p_oficina);perform private.exigir_distribuicao(p_oficina);perform pg_advisory_xact_lock(hashtextextended('distribuicao:'||p_oficina,0));
 select * into ant from public.planos_escala_equipe where id=p_id;
 if found then if ant.oficina_id<>p_oficina or ant.propostas<>p_propostas then raise exception 'Chave de escala utilizada com outro conteúdo.' using errcode='PT409';end if;return ant.resultado;end if;
 if p_id is null or jsonb_typeof(p_propostas) is distinct from 'array' or jsonb_array_length(p_propostas) not between 1 and 50 or octet_length(p_propostas::text)>32000 or (select count(distinct x->>'id') from jsonb_array_elements(p_propostas)x)<>jsonb_array_length(p_propostas) then raise exception 'Confira as escolhas da escala.' using errcode='22023';end if;
 for item in select * from jsonb_array_elements(p_propostas) loop
 select * into g from private.agenda_equipe where oficina_id=p_oficina and id=(item->>'id')::uuid and situacao in ('agendado','confirmado');if not found then raise exception 'Agendamento indisponível.' using errcode='42501';end if;
 if g.revisao is distinct from (item->>'revisao')::integer then raise exception 'Um agendamento mudou. Gere a sugestão novamente.' using errcode='PT409';end if;
 select * into p from public.perfis_distribuicao where oficina_id=p_oficina and id=(item->>'perfil_id')::uuid and ativo;if not found then raise exception 'Equipe indisponível.' using errcode='22023';end if;
 if coalesce(jsonb_array_length(g.dados#>'{distribuicao,habilidades}'),0)=0 then g.dados:=jsonb_set(g.dados,'{distribuicao}',coalesce(g.dados->'distribuicao','{}')||jsonb_build_object('habilidades',item->'habilidades'));end if;
 d:=g.dados||jsonb_build_object('recurso',p.nome,'recurso_id',p.recurso_id,'distribuicao',g.dados->'distribuicao'||jsonb_build_object('perfil_id',p.id));
 if g.automotivo then perform public.operar_produtividade(p_oficina,'salvar_agenda',d);else perform public.salvar_agenda_servico(p_oficina,g.id,d,g.revisao);end if;
 resultado:=resultado||jsonb_build_array(jsonb_build_object('id',g.id,'antes',g.dados,'perfil_id',p.id,'nome',p.nome));end loop;
 insert into public.planos_escala_equipe values(p_id,p_oficina,p_propostas,resultado,auth.uid(),now());return resultado;
end $$;
do $$declare t text;r record;begin
 foreach t in array array['habilidades_equipe','qualificacoes_equipe','historico_qualificacao_equipe','planos_escala_equipe'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);end loop;
 for r in select p.oid::regprocedure sig,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in ('salvar_habilidade_equipe','salvar_qualificacao_equipe','consultar_qualificacoes_equipe','matriz_qualificacoes_equipe','avaliar_distribuicao_antes_qualificacoes','avaliar_distribuicao','consultar_demanda_equipe','prever_escala_equipe','aplicar_escala_equipe') loop execute format('revoke all on function %s from public,anon,authenticated',r.sig);if r.nspname='public' then execute format('grant execute on function %s to authenticated',r.sig);end if;end loop;
end $$;
revoke all on private.agenda_equipe from public,anon,authenticated;
notify pgrst,'reload schema';commit;
