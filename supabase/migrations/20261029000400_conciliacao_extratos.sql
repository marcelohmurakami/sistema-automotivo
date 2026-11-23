begin;

-- Extratos são evidências; conciliá-los nunca altera o caixa por conta própria.
create table public.extratos_importados (
 id uuid primary key, oficina_id uuid not null references public.oficinas(id), conta text not null,
 nome text not null check(length(nome) between 1 and 180), assinatura text not null,
 resultado jsonb not null, criado_em timestamptz not null default now(), autor uuid not null,
 foreign key(oficina_id,conta) references public.contas_financeiras(oficina_id,codigo)
);
create table public.linhas_extrato (
 id uuid primary key default gen_random_uuid(), oficina_id uuid not null, conta text not null,
 importacao_id uuid not null references public.extratos_importados(id), identificador text not null check(length(identificador) between 1 and 180),
 data date not null check(isfinite(data)), descricao text not null check(length(descricao) between 1 and 500),
 valor bigint not null check(valor between -10000000000 and 10000000000 and valor<>0),
 estado text not null default 'pendente' check(estado in ('pendente','conciliado','ignorado')),
 motivo text not null default '', revisao integer not null default 1,
 unique(oficina_id,conta,identificador), unique(oficina_id,id),
 foreign key(oficina_id,conta) references public.contas_financeiras(oficina_id,codigo)
);
create index linhas_extrato_periodo on public.linhas_extrato(oficina_id,conta,data,id);
create table public.vinculos_conciliacao (
 oficina_id uuid not null, linha_id uuid not null, baixa_id uuid primary key references public.baixas_financeiras(id),
 foreign key(oficina_id,linha_id) references public.linhas_extrato(oficina_id,id)
);
create index vinculos_conciliacao_linha on public.vinculos_conciliacao(oficina_id,linha_id);
create table public.historico_conciliacao (
 id bigint generated always as identity primary key, oficina_id uuid not null, linha_id uuid not null,
 autor uuid not null, criado_em timestamptz not null default now(), estado text not null, motivo text not null, baixas uuid[] not null,
 foreign key(oficina_id,linha_id) references public.linhas_extrato(oficina_id,id)
);
create index historico_conciliacao_linha on public.historico_conciliacao(oficina_id,linha_id,id);
create trigger historico_conciliacao_imutavel before update or delete on public.historico_conciliacao for each row execute function private.reject_mutation();
alter table public.extratos_importados enable row level security;
alter table public.linhas_extrato enable row level security;
alter table public.vinculos_conciliacao enable row level security;
alter table public.historico_conciliacao enable row level security;
revoke all on public.extratos_importados,public.linhas_extrato,public.vinculos_conciliacao,public.historico_conciliacao from public,anon,authenticated;

create view private.movimentos_conciliacao as
 select b.id,b.oficina_id,b.titulo_id,b.conta,b.data,t.descricao,t.pessoa,t.categoria,b.forma,b.estorno_de,b.taxa_centavos,
 (case when b.estorno_de is null then 1 else -1 end)*(case when t.natureza='receber' then b.valor_centavos-b.taxa_centavos else -b.valor_centavos end) valor
 from public.baixas_financeiras b join public.titulos_financeiros t on t.oficina_id=b.oficina_id and t.id=b.titulo_id;

create function public.importar_extrato(p_oficina uuid,p_id uuid,p_conta text,p_nome text,p_linhas jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid; sig text; antigo public.extratos_importados; l jsonb; atual public.linhas_extrato; novos int:=0; repetidos int:=0; r jsonb;
begin
 u:=private.exigir_financeiro(p_oficina);perform private.contas_financeiras_padrao(p_oficina);
 if p_id is null or p_nome is null or length(trim(p_nome)) not between 1 and 180 or jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas) not between 1 and 2000 then raise exception 'Selecione um extrato com até 2.000 movimentações.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('extrato:'||p_oficina::text||p_conta,0));
 sig:=md5(p_linhas::text);
 select * into antigo from public.extratos_importados where id=p_id;
 if found then
  if antigo.oficina_id<>p_oficina or antigo.conta<>p_conta or antigo.assinatura<>sig then raise exception 'Este envio já foi usado. Reabra a importação.' using errcode='PT409';end if;
  return antigo.resultado;
 end if;
 perform 1 from public.contas_financeiras where oficina_id=p_oficina and codigo=p_conta and tipo='banco' and ativo for share;
 if not found then raise exception 'Selecione uma conta bancária ativa desta empresa.' using errcode='22023';end if;
 insert into public.extratos_importados values(p_id,p_oficina,p_conta,trim(p_nome),sig,'{}',now(),u);
 for l in select value from jsonb_array_elements(p_linhas) loop
  if (l->>'data')::date>(now() at time zone 'America/Sao_Paulo')::date or (l->>'data')::date<date '2000-01-01' then raise exception 'O extrato contém data futura ou anterior a 2000.' using errcode='22023';end if;
  select * into atual from public.linhas_extrato where oficina_id=p_oficina and conta=p_conta and identificador=l->>'identificador';
  if found then
   if atual.data is distinct from (l->>'data')::date or atual.valor is distinct from (l->>'valor')::bigint or atual.descricao is distinct from (l->>'descricao') then raise exception 'O banco repetiu um identificador com dados diferentes. Confira o arquivo antes de importar.' using errcode='22023';end if;
   repetidos:=repetidos+1;
  else
   insert into public.linhas_extrato(oficina_id,conta,importacao_id,identificador,data,descricao,valor) values(p_oficina,p_conta,p_id,l->>'identificador',(l->>'data')::date,l->>'descricao',(l->>'valor')::bigint);
   novos:=novos+1;
  end if;
 end loop;
 r:=jsonb_build_object('novos',novos,'repetidos',repetidos);
 update public.extratos_importados set resultado=r where id=p_id;
 perform private.evento_financeiro(p_oficina,p_id,'statement_imported');return r;
end $$;

create function public.consultar_conciliacao(p_oficina uuid,p_conta text,p_inicio date,p_fim date,p_estado text default 'pendente',p_pagina integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare itens jsonb; resumo jsonb; n bigint;
begin
 perform private.exigir_financeiro(p_oficina);perform private.validar_periodo_apuracao(p_inicio,p_fim);
 if p_estado is null or p_estado not in ('todos','pendente','conciliado','ignorado') or p_pagina is null or p_pagina not between 0 and 10000 then raise exception 'Filtro inválido.' using errcode='22023';end if;
 select jsonb_build_object('total',count(*),'pendentes',count(*) filter(where estado='pendente'),'conciliados',count(*) filter(where estado='conciliado'),'ignorados',count(*) filter(where estado='ignorado'),'movimento_extrato',coalesce(sum(valor),0)) into resumo from public.linhas_extrato where oficina_id=p_oficina and conta=p_conta and data between p_inicio and p_fim;
 select count(*) into n from public.linhas_extrato where oficina_id=p_oficina and conta=p_conta and data between p_inicio and p_fim and (p_estado='todos' or estado=p_estado);
 select coalesce(jsonb_agg(to_jsonb(x) order by data,id),'[]') into itens from (select * from public.linhas_extrato where oficina_id=p_oficina and conta=p_conta and data between p_inicio and p_fim and (p_estado='todos' or estado=p_estado) order by data,id limit 50 offset p_pagina*50)x;
 return jsonb_build_object('itens',itens,'total',n,'resumo',resumo||jsonb_build_object('sem_extrato',(select count(*) from private.movimentos_conciliacao b where b.oficina_id=p_oficina and b.conta=p_conta and b.data between p_inicio and p_fim and not exists(select 1 from public.vinculos_conciliacao v where v.baixa_id=b.id)),'movimento_sistema',(select coalesce(sum(valor),0) from private.movimentos_conciliacao where oficina_id=p_oficina and conta=p_conta and data between p_inicio and p_fim)));
end $$;

create function public.detalhar_conciliacao(p_oficina uuid,p_linha uuid,p_inicio date,p_fim date,p_busca text default '',p_pagina integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.linhas_extrato; candidatos jsonb; n bigint;
begin
 perform private.exigir_financeiro(p_oficina);perform private.validar_periodo_apuracao(p_inicio,p_fim);
 if p_pagina is null or p_pagina not between 0 and 10000 then raise exception 'Página inválida.' using errcode='22023';end if;
 select * into l from public.linhas_extrato where oficina_id=p_oficina and id=p_linha;
 if not found then raise exception 'Movimentação indisponível.' using errcode='42501';end if;
 select count(*) into n from private.movimentos_conciliacao b where b.oficina_id=p_oficina and b.conta=l.conta and b.data between p_inicio and p_fim and concat(b.descricao,' ',b.pessoa) ilike '%'||left(coalesce(p_busca,''),100)||'%' and not exists(select 1 from public.vinculos_conciliacao v where v.baixa_id=b.id);
 select coalesce(jsonb_agg(to_jsonb(x) order by sugestao desc,distancia,id),'[]') into candidatos from (
 select b.*,(b.valor=l.valor and abs(b.data-l.data)<=3) sugestao,abs(b.data-l.data) distancia from private.movimentos_conciliacao b where b.oficina_id=p_oficina and b.conta=l.conta and b.data between p_inicio and p_fim and concat(b.descricao,' ',b.pessoa) ilike '%'||left(coalesce(p_busca,''),100)||'%' and not exists(select 1 from public.vinculos_conciliacao v where v.baixa_id=b.id)
 order by sugestao desc,distancia,b.id limit 50 offset p_pagina*50)x;
 return jsonb_build_object('linha',to_jsonb(l),'candidatos',candidatos,'total',n,'vinculados',(select coalesce(jsonb_agg(to_jsonb(b) order by b.data,b.id),'[]') from public.vinculos_conciliacao v join private.movimentos_conciliacao b on b.id=v.baixa_id where v.oficina_id=p_oficina and v.linha_id=l.id),'historico',(select coalesce(jsonb_agg(to_jsonb(h) order by h.id desc),'[]') from (select * from public.historico_conciliacao where oficina_id=p_oficina and linha_id=l.id order by id desc limit 100)h));
end $$;

create function public.resolver_conciliacao(p_oficina uuid,p_linha uuid,p_revisao integer,p_estado text,p_baixas uuid[],p_motivo text default '') returns void language plpgsql security definer set search_path='' as $$
declare l public.linhas_extrato; u uuid; ids uuid[]; antigos uuid[]; soma bigint; n bigint;
begin
 u:=private.exigir_financeiro(p_oficina);
 select * into l from public.linhas_extrato where oficina_id=p_oficina and id=p_linha;
 if not found then raise exception 'Movimentação indisponível.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('extrato:'||p_oficina::text||l.conta,0));
 select * into l from public.linhas_extrato where oficina_id=p_oficina and id=p_linha for update;
 select coalesce(array_agg(x order by x),'{}') into ids from (select distinct unnest(p_baixas) x)x;
 select coalesce(array_agg(baixa_id order by baixa_id),'{}') into antigos from public.vinculos_conciliacao where oficina_id=p_oficina and linha_id=p_linha;
 if p_estado is null or p_estado not in ('pendente','conciliado','ignorado') or length(coalesce(p_motivo,''))>1000 or (p_estado<>'conciliado' and cardinality(ids)>0) or (p_estado='conciliado' and cardinality(ids) not between 1 and 100) or (p_estado in ('ignorado','pendente') and length(trim(coalesce(p_motivo,'')))<3) then raise exception 'Confira a seleção e informe o motivo ao ignorar ou desfazer.' using errcode='22023';end if;
 if l.estado=p_estado and ids=antigos and l.motivo=trim(coalesce(p_motivo,'')) then return;end if;
 if l.revisao is distinct from p_revisao then raise exception 'A conciliação foi alterada. Atualize a tela.' using errcode='PT409';end if;
 if p_estado='conciliado' then
  select count(*),sum(b.valor) into n,soma from private.movimentos_conciliacao b where b.oficina_id=p_oficina and b.conta=l.conta and b.id=any(ids) and not exists(select 1 from public.vinculos_conciliacao v where v.baixa_id=b.id and v.linha_id<>l.id);
  if n<>cardinality(ids) then raise exception 'Um pagamento não pertence a esta conta ou já foi conciliado.' using errcode='22023';end if;
  if soma<>l.valor then raise exception 'Os valores não fecham. Registre ou corrija a diferença no financeiro antes de conciliar.' using errcode='22023';end if;
 end if;
 delete from public.vinculos_conciliacao where oficina_id=p_oficina and linha_id=l.id;
 insert into public.vinculos_conciliacao select p_oficina,l.id,unnest(ids);
 update public.linhas_extrato set estado=p_estado,motivo=trim(coalesce(p_motivo,'')),revisao=revisao+1 where id=l.id;
 insert into public.historico_conciliacao(oficina_id,linha_id,autor,estado,motivo,baixas) values(p_oficina,l.id,u,p_estado,trim(coalesce(p_motivo,'')),ids);
 perform private.evento_financeiro(p_oficina,l.id,'statement_reconciled');
end $$;

-- Extrato gerencial para o contador, incluindo transferências, taxas e estornos.
create function public.consultar_movimentos_sem_extrato(p_oficina uuid,p_conta text,p_inicio date,p_fim date,p_pagina integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;begin
 perform private.exigir_financeiro(p_oficina);perform private.validar_periodo_apuracao(p_inicio,p_fim);
 if p_pagina is null or p_pagina not between 0 and 10000 then raise exception 'Página inválida.' using errcode='22023';end if;
 with m as materialized (select b.* from private.movimentos_conciliacao b where b.oficina_id=p_oficina and b.conta=p_conta and b.data between p_inicio and p_fim and not exists(select 1 from public.vinculos_conciliacao v where v.baixa_id=b.id))
 select jsonb_build_object('total',(select count(*) from m),'itens',(select coalesce(jsonb_agg(to_jsonb(x) order by data,id),'[]') from (select * from m order by data,id limit 50 offset p_pagina*50)x)) into r;
 return r;
end $$;

create function public.exportar_movimentos_contador(p_oficina uuid,p_inicio date,p_fim date,p_pagina integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;
begin
 perform private.exigir_financeiro(p_oficina);perform private.validar_periodo_apuracao(p_inicio,p_fim);
 if p_pagina is null or p_pagina not between 0 and 10000 then raise exception 'Página inválida.' using errcode='22023';end if;
 with linhas as materialized (select b.*,c.nome conta_nome,v.linha_id,e.data data_extrato,e.identificador identificador_banco,
 (case when b.estorno_de is null then 1 else -1 end)*b.taxa_centavos taxa_assinada
 from private.movimentos_conciliacao b join public.contas_financeiras c on c.oficina_id=b.oficina_id and c.codigo=b.conta left join public.vinculos_conciliacao v on v.baixa_id=b.id left join public.linhas_extrato e on e.id=v.linha_id where b.oficina_id=p_oficina and b.data between p_inicio and p_fim)
 select jsonb_build_object('total',(select count(*) from linhas),'assinatura',(select md5(coalesce(string_agg(to_jsonb(l)::text,'|' order by id),'')) from linhas l),'linhas',(select coalesce(jsonb_agg(to_jsonb(x) order by data,id),'[]') from (select * from linhas order by data,id limit 300 offset p_pagina*300)x)) into r;
 return r;
end $$;

do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('importar_extrato','consultar_conciliacao','detalhar_conciliacao','resolver_conciliacao','exportar_movimentos_contador','consultar_movimentos_sem_extrato') loop
 execute format('revoke all on function %s from public,anon,authenticated',f);execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
