begin;
create table public.horas_producao_equipe (
 id uuid primary key, oficina_id uuid not null, documento_id uuid not null, funcionario_id uuid not null,
 inicio timestamptz not null, fim timestamptz not null, custo_hora_centavos bigint not null check(custo_hora_centavos between 0 and 100000000),
 descricao text not null check(length(trim(descricao)) between 3 and 1000), cancelado_em timestamptz, motivo_cancelamento text,
 autor uuid not null references auth.users(id), criado_em timestamptz not null default now(),
 check(fim>inicio and fim<=inicio+interval '24 hours'), foreign key(oficina_id,funcionario_id) references public.funcionarios(oficina_id,id)
);
create index horas_producao_documento on public.horas_producao_equipe(oficina_id,documento_id);
create index horas_producao_funcionario on public.horas_producao_equipe(oficina_id,funcionario_id,inicio) where cancelado_em is null;
create table public.atribuicoes_equipe (
 oficina_id uuid not null references public.oficinas(id), documento_id uuid not null, dados jsonb not null,
 assinatura_custo text not null, revisao integer not null default 1, atualizado_em timestamptz not null default now(), autor uuid not null references auth.users(id),
 primary key(oficina_id,documento_id)
);
create table public.historico_atribuicao_equipe (
 id bigint generated always as identity primary key, oficina_id uuid not null, documento_id uuid not null,revisao integer not null,
 antes jsonb,depois jsonb not null, autor uuid not null references auth.users(id),criado_em timestamptz not null default now(),
 foreign key(oficina_id,documento_id) references public.atribuicoes_equipe(oficina_id,documento_id),unique(oficina_id,documento_id,revisao)
);
create trigger historico_atribuicao_imutavel before update or delete on public.historico_atribuicao_equipe for each row execute function private.reject_mutation();
create function private.exigir_produtividade_equipe(w uuid) returns void language plpgsql security definer set search_path='' as $$begin
 perform private.exigir_cadastro_funcionarios(w);if not private.has_feature(w,'employee_reports') then raise exception 'Seu plano não inclui relatórios individuais da equipe.' using errcode='42501';end if;
end $$;
create function public.registrar_horas_equipe(p_oficina uuid,p_id uuid,p_documento uuid,p_funcionario uuid,p_inicio timestamptz,p_fim timestamptz,p_custo_hora bigint,p_descricao text) returns uuid language plpgsql security definer set search_path='' as $$
declare h public.horas_producao_equipe;begin
 perform private.exigir_produtividade_equipe(p_oficina);perform private.exigir_documento_custeio(p_oficina,p_documento);
 if p_id is null or p_inicio is null or p_fim is null or not isfinite(p_inicio) or not isfinite(p_fim) or p_fim<=p_inicio or p_fim>p_inicio+interval '24 hours' or p_fim>now()+interval '5 minutes' or p_custo_hora is null or p_custo_hora not between 0 and 100000000 or length(trim(coalesce(p_descricao,''))) not between 3 and 1000 then raise exception 'Confira período realizado, custo da hora e descrição.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('horas-documento:'||p_oficina||':'||p_documento,0));
 perform pg_advisory_xact_lock(hashtextextended('horas-equipe:'||p_oficina||':'||p_funcionario,0));
 select * into h from public.horas_producao_equipe where id=p_id;
 if found then if h.oficina_id<>p_oficina or h.documento_id<>p_documento or h.funcionario_id<>p_funcionario or h.inicio<>p_inicio or h.fim<>p_fim or h.custo_hora_centavos<>p_custo_hora or h.descricao<>trim(p_descricao) then raise exception 'Chave já utilizada em outro registro.' using errcode='PT409';end if;return p_id;end if;
 if not exists(select 1 from public.funcionarios where oficina_id=p_oficina and id=p_funcionario and ativo and (admissao is null or admissao<=(p_inicio at time zone 'America/Sao_Paulo')::date) and (desligamento is null or desligamento>(p_inicio at time zone 'America/Sao_Paulo')::date)) then raise exception 'Funcionário indisponível para este período.' using errcode='22023';end if;
 if exists(select 1 from public.horas_producao_equipe where oficina_id=p_oficina and funcionario_id=p_funcionario and cancelado_em is null and inicio<p_fim and fim>p_inicio) or exists(select 1 from public.horas_atendimento where oficina_id=p_oficina and funcionario_id=p_funcionario and inicio<p_fim and coalesce(fim,'infinity')>p_inicio) then raise exception 'Já existe tempo registrado para o funcionário neste intervalo.' using errcode='23P01';end if;
 if exists(select 1 from public.apontamentos_tempo ap left join public.atribuicoes_equipe a on a.oficina_id=ap.oficina_id and a.documento_id=ap.ordem_servico_id where ap.oficina_id=p_oficina and ap.ordem_servico_id=p_documento and ap.iniciado_em<p_fim and coalesce(ap.encerrado_em,'infinity')>p_inicio and coalesce(nullif(a.dados->'fontes'->>('hora:'||ap.id),'rateio'),p_funcionario::text)=p_funcionario::text) then raise exception 'Já apá tempo da OS neste intervalo. Atribua o apontamento existente ao funcionário antes de registrar horas adicionais.' using errcode='23P01';end if;
 insert into public.horas_producao_equipe(id,oficina_id,documento_id,funcionario_id,inicio,fim,custo_hora_centavos,descricao,autor) values(p_id,p_oficina,p_documento,p_funcionario,p_inicio,p_fim,p_custo_hora,trim(p_descricao),auth.uid());return p_id;
end $$;
create function public.cancelar_horas_equipe(p_oficina uuid,p_id uuid,p_motivo text) returns void language plpgsql security definer set search_path='' as $$begin
 perform private.exigir_produtividade_equipe(p_oficina);if length(trim(coalesce(p_motivo,''))) not between 5 and 1000 then raise exception 'Informe o motivo da correção.' using errcode='22023';end if;
 update public.horas_producao_equipe set cancelado_em=now(),motivo_cancelamento=trim(p_motivo) where oficina_id=p_oficina and id=p_id and cancelado_em is null;
 if not found and not exists(select 1 from public.horas_producao_equipe where oficina_id=p_oficina and id=p_id) then raise exception 'Registro indisponível.' using errcode='42501';end if;
end $$;
-- O tempo produtivo alimenta o custeio existente; nunca registra pagamento ou ponto legal.
alter function private.fontes_brutas_custeio(uuid,uuid) rename to fontes_brutas_antes_equipe;
create function private.fontes_brutas_custeio(w uuid,d uuid) returns table(chave text,categoria text,descricao text,valor bigint,financeiro boolean,pendente boolean) language sql stable set search_path='' as $$
 select * from private.fontes_brutas_antes_equipe(w,d)
 union all select 'producao:'||h.id,'mao_obra',h.descricao,round(extract(epoch from(h.fim-h.inicio))/3600*h.custo_hora_centavos)::bigint,false,h.custo_hora_centavos=0 from public.horas_producao_equipe h where h.oficina_id=w and h.documento_id=d and h.cancelado_em is null;
$$;
do $$declare s text;alvo text:='minutos:=coalesce(nullif(minutos,0),(c.dados->>''minutos'')::numeric,0);';begin
 s:=pg_get_functiondef('private.detalhe_custeio(uuid,uuid)'::regprocedure);if position(alvo in s)=0 then raise exception 'Contrato de custeio mudou.';end if;
 s:=replace(s,alvo,'minutos:=minutos+coalesce((select sum(extract(epoch from(h.fim-h.inicio))/60) from public.horas_producao_equipe h where h.oficina_id=w and h.documento_id=d and h.cancelado_em is null),0);'||alvo);execute s;
end $$;
-- Arredondamento determinístico preserva cada centavo, inclusive em estornos.
create function private.rateio_equipe(v bigint,p jsonb,campo text) returns table(funcionario_id uuid,valor bigint) language sql immutable set search_path='' as $$
 with x as(select (a->>'funcionario_id')::uuid id,(a->>campo)::integer peso from jsonb_array_elements(p)a),b as(select *,floor(v::numeric*peso/10000)::bigint base from x where peso>0),r as(select *,row_number()over(order by (v::numeric*peso/10000-base) desc,id) ordem from b)
 select id,base+case when ordem<=v-(select coalesce(sum(base),0) from b) then 1 else 0 end from r;
$$;
create function private.fontes_contribuicao(w uuid,d uuid,c jsonb) returns jsonb language sql stable set search_path='' as $$
 with f as(select x,coalesce(a.fonte_origem,x->>'chave') origem from jsonb_array_elements(c->'fontes')x left join public.apropriacoes_custo a on a.oficina_id=w and a.documento_id=d and 'apropriacao:'||a.id=x->>'chave' where not coalesce(c#>'{conferencia,dados,desconsideradas}','{}')?(x->>'chave')),
 enriquecidas as(select x||jsonb_build_object('funcionario_id',coalesce(h.funcionario_id,t.funcionario_id,e.funcionario_id),'minutos',coalesce(extract(epoch from(h.fim-h.inicio))/60,extract(epoch from(t.fim-t.inicio))/60,extract(epoch from(o.encerrado_em-o.iniciado_em))/60,0)) x
 from f left join public.horas_producao_equipe h on h.oficina_id=w and h.documento_id=d and 'producao:'||h.id=f.origem
 left join public.horas_atendimento t on t.oficina_id=w and t.atendimento_id=d and 'hora:'||t.id=f.origem
 left join public.apontamentos_tempo o on o.oficina_id=w and o.ordem_servico_id=d and 'hora:'||o.id=f.origem
 left join public.equipe_atendimento e on e.oficina_id=w and e.atendimento_id=d and 'comissao:'||e.id=f.origem)
 select coalesce(jsonb_agg(x),'[]')||jsonb_build_array(jsonb_build_object('chave','rateio:indiretos','categoria','indiretos','descricao','Despesas indiretas apropriadas','valor',coalesce((c->>'indiretos')::bigint,0),'minutos',0,'pendente',false),jsonb_build_object('chave','rateio:mao_obra','categoria','mao_obra','descricao','Mão de obra estimada no custeio','valor',coalesce((c->>'mao_obra_apropriada')::bigint,0),'minutos',0,'pendente',false)) from enriquecidas;
$$;
create function public.consultar_contribuicao_equipe(p_oficina uuid,p_documento uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb;a public.atribuicoes_equipe;f jsonb;p jsonb;linhas jsonb:='[]';x jsonb;fonte jsonb;valor bigint;tempo numeric;custo bigint;comissao bigint;garantia bigint;fid uuid;venda bigint;receita bigint;atr text;begin
 perform private.exigir_produtividade_equipe(p_oficina);perform private.exigir_documento_custeio(p_oficina,p_documento);c:=private.detalhe_custeio(p_oficina,p_documento);f:=private.fontes_contribuicao(p_oficina,p_documento,c);c:=jsonb_set(c,'{assinatura}',to_jsonb(md5(jsonb_build_object('custeio',c->>'assinatura','fontes',f,'conferencia',c#>'{conferencia,dados}')::text)));
 select * into a from public.atribuicoes_equipe where oficina_id=p_oficina and documento_id=p_documento;p:=coalesce(a.dados->'participantes','[]');
 for x in select * from jsonb_array_elements(p) loop
 fid:=(x->>'funcionario_id')::uuid;custo:=0;comissao:=0;garantia:=0;tempo:=0;
 select coalesce(r.valor,0) into receita from private.rateio_equipe((c->>'receita')::bigint,p,'execucao_bp')r where r.funcionario_id=fid;
 select coalesce(r.valor,0) into venda from private.rateio_equipe((c->>'receita')::bigint,p,'venda_bp')r where r.funcionario_id=fid;
 for fonte in select * from jsonb_array_elements(f) loop
 atr:=coalesce(a.dados->'fontes'->>(fonte->>'chave'),case when exists(select 1 from jsonb_array_elements(p)y where y->>'funcionario_id'=fonte->>'funcionario_id') then fonte->>'funcionario_id' end,'rateio');valor:=0;
 if atr=fid::text then valor:=coalesce((fonte->>'valor')::bigint,0);tempo:=tempo+coalesce((fonte->>'minutos')::numeric,0);
 elsif atr='rateio' then select coalesce(r.valor,0) into valor from private.rateio_equipe(coalesce((fonte->>'valor')::bigint,0),p,'execucao_bp')r where r.funcionario_id=fid;end if;
 custo:=custo+coalesce(valor,0);if fonte->>'categoria'='comissoes' then comissao:=comissao+coalesce(valor,0);end if;if fonte->>'categoria'='garantia' then garantia:=garantia+coalesce(valor,0);end if;
 end loop;
 linhas:=linhas||jsonb_build_array(x||jsonb_build_object('nome',(select nome from public.funcionarios where oficina_id=p_oficina and id=fid),'receita',coalesce(receita,0),'vendas',coalesce(venda,0),'custo',custo,'contribuicao',coalesce(receita,0)-custo,'minutos',tempo,'comissoes',comissao,'garantias',garantia));
 end loop;
 return jsonb_build_object('documento',c-'fontes'-'parametros','fontes',f,'atribuicao',to_jsonb(a),'participantes',linhas,'revisar',a.documento_id is null or a.assinatura_custo is distinct from c->>'assinatura','horas',(select coalesce(jsonb_agg(to_jsonb(h) order by inicio desc),'[]') from public.horas_producao_equipe h where oficina_id=p_oficina and documento_id=p_documento));
end $$;
create function private.pesos_execucao_equipe(p jsonb,f jsonb,destinos jsonb,criterio text) returns table(id uuid,bp integer) language sql immutable set search_path='' as $$
 with pesos as(select (a->>'funcionario_id')::uuid id,case when criterio='igual' then 1::numeric else coalesce((select sum((s->>'minutos')::numeric) from jsonb_array_elements(f)s where coalesce(destinos->>(s->>'chave'),s->>'funcionario_id')=a->>'funcionario_id'),0) end peso from jsonb_array_elements(p)a),
 exatos as(select *,10000*peso/nullif(sum(peso)over(),0) exato from pesos),b as(select *,floor(exato)::integer base from exatos),r as(select *,row_number()over(order by exato-base desc,id) ordem from b)
 select id,base+case when ordem<=10000-sum(base)over() then 1 else 0 end from r;
$$;
create function public.salvar_atribuicao_equipe(p_oficina uuid,p_documento uuid,p_dados jsonb,p_assinatura text,p_revisao integer default null) returns void language plpgsql security definer set search_path='' as $$
declare a public.atribuicoes_equipe;c jsonb;part jsonb;ids uuid[];chave text;dest text;f jsonb;novo public.atribuicoes_equipe;begin
 perform private.exigir_produtividade_equipe(p_oficina);perform private.exigir_documento_custeio(p_oficina,p_documento);
 perform pg_advisory_xact_lock(hashtextextended('atribuicao:'||p_oficina||':'||p_documento,0));select * into a from public.atribuicoes_equipe where oficina_id=p_oficina and documento_id=p_documento for update;
 if a.revisao is distinct from p_revisao then raise exception 'A atribuição mudou. Atualize a ficha.' using errcode='PT409';end if;
 c:=private.detalhe_custeio(p_oficina,p_documento);f:=private.fontes_contribuicao(p_oficina,p_documento,c);c:=jsonb_set(c,'{assinatura}',to_jsonb(md5(jsonb_build_object('custeio',c->>'assinatura','fontes',f,'conferencia',c#>'{conferencia,dados}')::text)));if p_assinatura is distinct from c->>'assinatura' then raise exception 'O serviço ou seus custos mudaram. Confira novamente.' using errcode='PT409';end if;
 if jsonb_typeof(p_dados) is distinct from 'object' or octet_length(p_dados::text)>40000 or jsonb_typeof(p_dados->'participantes') is distinct from 'array' or jsonb_array_length(p_dados->'participantes') not between 1 and 50 or jsonb_typeof(p_dados->'fontes') is distinct from 'object' or coalesce(p_dados->>'criterio','') not in ('manual','igual','horas') then raise exception 'Confira os participantes e o critério de atribuição.' using errcode='22023';end if;
 for part in select * from jsonb_array_elements(p_dados->'participantes') loop
 if coalesce(part->>'execucao_bp','')!~'^\d{1,5}$' or coalesce(part->>'venda_bp','')!~'^\d{1,5}$' or (part->>'execucao_bp')::int>10000 or (part->>'venda_bp')::int>10000 or not exists(select 1 from public.funcionarios where oficina_id=p_oficina and id=(part->>'funcionario_id')::uuid) then raise exception 'Participante ou percentual inválido.' using errcode='22023';end if;end loop;
 select array_agg((x->>'funcionario_id')::uuid) into ids from jsonb_array_elements(p_dados->'participantes')x;
 if cardinality(ids)<>(select count(distinct i) from unnest(ids)i) or (select sum((x->>'execucao_bp')::int) from jsonb_array_elements(p_dados->'participantes')x)<>10000 or (select sum((x->>'venda_bp')::int) from jsonb_array_elements(p_dados->'participantes')x) not in (0,10000) then raise exception 'Execução deve somar 100%%. Venda deve somar 100%% ou ficar sem atribuição. Não repita funcionários.' using errcode='22023';end if;
 f:=private.fontes_contribuicao(p_oficina,p_documento,c);
 if p_dados->>'criterio'<>'manual' and exists(select 1 from private.pesos_execucao_equipe(p_dados->'participantes',f,p_dados->'fontes',p_dados->>'criterio') esperado join jsonb_array_elements(p_dados->'participantes') participante on (participante->>'funcionario_id')::uuid=esperado.id where esperado.bp is distinct from (participante->>'execucao_bp')::integer) then raise exception 'Recalcule a divisão: o critério deve corresponder às horas ou à divisão igual.' using errcode='22023';end if;
 for chave,dest in select * from jsonb_each_text(p_dados->'fontes') loop
 if not exists(select 1 from jsonb_array_elements(f)x where x->>'chave'=chave) or (dest<>'rateio' and not dest=any(ids::text[])) then raise exception 'Confira a atribuição das fontes de custo.' using errcode='22023';end if;end loop;
 if a.dados=p_dados and a.assinatura_custo=p_assinatura then return;end if;
 insert into public.atribuicoes_equipe(oficina_id,documento_id,dados,assinatura_custo,autor) values(p_oficina,p_documento,p_dados,p_assinatura,auth.uid()) on conflict(oficina_id,documento_id) do update set dados=excluded.dados,assinatura_custo=excluded.assinatura_custo,revisao=atribuicoes_equipe.revisao+1,atualizado_em=now(),autor=auth.uid() returning * into novo;
 insert into public.historico_atribuicao_equipe(oficina_id,documento_id,revisao,antes,depois,autor) values(p_oficina,p_documento,novo.revisao,to_jsonb(a),to_jsonb(novo),auth.uid());
end $$;
-- O controle é recíproco: um apontamento antigo também não pode duplicar horas novas.
create function private.validar_sobreposicao_equipe() returns trigger language plpgsql security definer set search_path='' as $$begin
 perform pg_advisory_xact_lock(hashtextextended('horas-equipe:'||new.oficina_id||':'||new.funcionario_id,0));
 if exists(select 1 from public.horas_producao_equipe h where h.oficina_id=new.oficina_id and h.funcionario_id=new.funcionario_id and h.cancelado_em is null and h.inicio<coalesce(new.fim,'infinity') and h.fim>new.inicio) then raise exception 'Já existe tempo produtivo registrado para o funcionário neste intervalo.' using errcode='23P01';end if;return new;
end $$;
create trigger validar_sobreposicao_equipe before insert or update of inicio,fim,funcionario_id on public.horas_atendimento for each row execute function private.validar_sobreposicao_equipe();
create function private.validar_cronometro_equipe() returns trigger language plpgsql security definer set search_path='' as $$begin
 perform pg_advisory_xact_lock(hashtextextended('horas-documento:'||new.oficina_id||':'||new.ordem_servico_id,0));
 if exists(select 1 from public.horas_producao_equipe h where h.oficina_id=new.oficina_id and h.documento_id=new.ordem_servico_id and h.cancelado_em is null and h.inicio<coalesce(new.encerrado_em,'infinity') and h.fim>new.iniciado_em) then raise exception 'Esta OS já tem horas de produção neste intervalo. Confira os registros para não duplicar o custo.' using errcode='23P01';end if;return new;
end $$;
create trigger validar_cronometro_equipe before insert or update of iniciado_em,encerrado_em on public.apontamentos_tempo for each row execute function private.validar_cronometro_equipe();
create function public.historico_contribuicao_equipe(p_oficina uuid,p_documento uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform private.exigir_produtividade_equipe(p_oficina);return (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from(select revisao,antes,depois,criado_em from public.historico_atribuicao_equipe where oficina_id=p_oficina and documento_id=p_documento order by revisao desc limit 100)x);
end $$;
create function public.listar_contribuicoes_equipe(p_oficina uuid,p_inicio date,p_fim date,p_busca text default '',p_pagina integer default 0,p_situacao text default 'concluidos') returns jsonb language plpgsql security definer set search_path='' as $$
declare docs jsonb;begin
 perform private.exigir_produtividade_equipe(p_oficina);if p_inicio is null or p_fim is null or not isfinite(p_inicio) or not isfinite(p_fim) or p_fim<p_inicio or p_fim-p_inicio>366 or p_pagina is null or p_pagina not between 0 and 100000 or p_situacao not in ('concluidos','todos') or length(coalesce(p_busca,''))>200 then raise exception 'Confira período, busca e página.' using errcode='22023';end if;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into docs from(select d.*,a.revisao atribuicao_revisao from private.documentos_custeio d left join public.atribuicoes_equipe a on a.oficina_id=d.oficina_id and a.documento_id=d.id where d.oficina_id=p_oficina and d.data between p_inicio and p_fim and (p_situacao='todos' or d.situacao in ('ready','delivered','concluido')) and (coalesce(p_busca,'')='' or position(lower(trim(p_busca)) in lower(d.titulo||' '||d.cliente))>0) order by d.data desc,d.id limit 51 offset p_pagina*50)x;
 return docs;
end $$;
create function public.resumo_contribuicao_equipe(p_oficina uuid,p_inicio date,p_fim date) returns jsonb language plpgsql security definer set search_path='' as $$
declare r record;j jsonb;itens jsonb:='[]';n integer:=0;pendentes integer:=0;receita bigint:=0;begin
 perform private.exigir_produtividade_equipe(p_oficina);if p_inicio is null or p_fim is null or not isfinite(p_inicio) or not isfinite(p_fim) or p_fim<p_inicio or p_fim-p_inicio>366 then raise exception 'Confira o período de até um ano.' using errcode='22023';end if;
 if (select count(*) from(select id from private.documentos_custeio where oficina_id=p_oficina and data between p_inicio and p_fim and situacao in ('ready','delivered','concluido') limit 2001)x)>2000 then raise exception 'Selecione um período menor para o detalhamento da equipe (até 2.000 serviços).' using errcode='22023';end if;
 for r in select id from private.documentos_custeio where oficina_id=p_oficina and data between p_inicio and p_fim and situacao in ('ready','delivered','concluido') loop
 n:=n+1;j:=public.consultar_contribuicao_equipe(p_oficina,r.id);receita:=receita+(j#>>'{documento,receita}')::bigint;
 if (j->>'revisar')::boolean or not (j#>>'{documento,conferido}')::boolean then pendentes:=pendentes+1;end if;
 itens:=itens||coalesce(j->'participantes','[]');end loop;
 return jsonb_build_object('servicos',n,'receita',receita,'pendentes',pendentes,'funcionarios',(select coalesce(jsonb_agg(to_jsonb(x) order by x.receita desc,x.nome),'[]') from(select a->>'funcionario_id' funcionario_id,a->>'nome' nome,sum((a->>'receita')::bigint) receita,sum((a->>'vendas')::bigint) vendas,sum((a->>'custo')::bigint) custo,sum((a->>'contribuicao')::bigint) contribuicao,sum((a->>'minutos')::numeric) minutos,sum((a->>'comissoes')::bigint) comissoes,sum((a->>'garantias')::bigint) garantias,count(*) servicos from jsonb_array_elements(itens)a group by 1,2)x));
end $$;
do $$declare t text;r record;begin
 foreach t in array array['horas_producao_equipe','atribuicoes_equipe','historico_atribuicao_equipe'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);end loop;
 for r in select p.oid::regprocedure sig,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in ('exigir_produtividade_equipe','registrar_horas_equipe','cancelar_horas_equipe','fontes_brutas_antes_equipe','fontes_brutas_custeio','rateio_equipe','fontes_contribuicao','consultar_contribuicao_equipe','salvar_atribuicao_equipe','listar_contribuicoes_equipe','resumo_contribuicao_equipe','pesos_execucao_equipe','validar_sobreposicao_equipe','historico_contribuicao_equipe','validar_cronometro_equipe') loop execute format('revoke all on function %s from public,anon,authenticated',r.sig);if r.nspname='public' then execute format('grant execute on function %s to authenticated',r.sig);end if;end loop;
end $$;
notify pgrst,'reload schema';commit;
