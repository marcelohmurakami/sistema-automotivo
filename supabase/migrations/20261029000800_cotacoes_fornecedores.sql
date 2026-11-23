begin;
create table public.cotacoes_compra (
 id uuid primary key,oficina_id uuid not null references public.oficinas(id),titulo text not null check(length(trim(titulo)) between 2 and 160),
 itens jsonb not null,revisao integer not null default 1,criado_em timestamptz not null default now(),autor uuid not null,
 pedido_id uuid references public.pedidos_compra(id),escolhida uuid,motivo_escolha text not null default '',assinatura text not null
);
create index cotacoes_empresa on public.cotacoes_compra(oficina_id,criado_em desc,id);
create table public.propostas_compra (
 id uuid primary key,oficina_id uuid not null references public.oficinas(id),cotacao_id uuid not null references public.cotacoes_compra(id),
 fornecedor_id uuid not null references public.fornecedores(id),itens jsonb not null,total_centavos bigint not null check(total_centavos>=0),
 previsao date not null,validade date not null,condicoes text not null default '' check(length(condicoes)<=1000),
 observacoes text not null default '' check(length(observacoes)<=2000),versao integer not null,criado_em timestamptz not null default now(),autor uuid not null,
 unique(cotacao_id,fornecedor_id,versao)
);
create index propostas_cotacao on public.propostas_compra(oficina_id,cotacao_id,fornecedor_id,versao desc);
alter table public.cotacoes_compra add foreign key(escolhida) references public.propostas_compra(id);
alter table public.cotacoes_compra enable row level security;
alter table public.propostas_compra enable row level security;
revoke all on public.cotacoes_compra,public.propostas_compra from public,anon,authenticated;

create function public.criar_cotacao_compra(p_oficina uuid,p_id uuid,p_titulo text,p_itens jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.cotacoes_compra;i record;sig text;begin
 perform private.gerencia_compras(p_oficina);perform pg_advisory_xact_lock(hashtextextended('cotacao:'||p_id,0));
 sig:=md5(p_titulo||p_itens::text);select * into c from public.cotacoes_compra where id=p_id;
 if found then if c.oficina_id<>p_oficina or c.assinatura<>sig then raise exception 'Cotação já criada com outros dados.' using errcode='PT409';end if;return p_id;end if;
 if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) not between 1 and 100 or (select count(distinct x->>'produto_id') from jsonb_array_elements(p_itens)x)<>jsonb_array_length(p_itens) then raise exception 'Informe de 1 a 100 produtos sem repetição.' using errcode='22023';end if;
 for i in select * from jsonb_to_recordset(p_itens) as x(produto_id uuid,quantidade numeric) loop
  if i.quantidade is null or i.quantidade not between 0.001 and 1000000 or i.quantidade<>round(i.quantidade,3) or not exists(select 1 from public.estoque_produtos e join public.itens_catalogo cat on cat.id=e.item_catalogo_id where e.oficina_id=p_oficina and e.item_catalogo_id=i.produto_id and cat.arquivado_em is null and (lower(cat.unidade) not in ('un','unid','peca','peça') or i.quantidade=trunc(i.quantidade))) then raise exception 'Confira os produtos e suas quantidades.' using errcode='22023';end if;
 end loop;
 insert into public.cotacoes_compra(id,oficina_id,titulo,itens,autor,assinatura) values(p_id,p_oficina,trim(p_titulo),p_itens,auth.uid(),sig);return p_id;
end $$;

create function public.registrar_proposta_compra(p_oficina uuid,p_cotacao uuid,p_id uuid,p_revisao integer,p_dados jsonb,p_itens jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.cotacoes_compra;p public.propostas_compra;v int;t bigint;begin
 perform private.gerencia_compras(p_oficina);select * into c from public.cotacoes_compra where oficina_id=p_oficina and id=p_cotacao for update;
 if not found then raise exception 'Cotação indisponível.' using errcode='42501';end if;
 select * into p from public.propostas_compra where id=p_id;
 if found then
  if p.oficina_id<>p_oficina or p.cotacao_id<>p_cotacao or p.itens<>p_itens or p.fornecedor_id is distinct from (p_dados->>'fornecedor_id')::uuid or p.previsao is distinct from (p_dados->>'previsao')::date or p.validade is distinct from (p_dados->>'validade')::date or p.condicoes<>coalesce(p_dados->>'condicoes','') or p.observacoes<>coalesce(p_dados->>'observacoes','') then raise exception 'Envio já utilizado com outros dados.' using errcode='PT409';end if;return p_id;
 end if;
 if c.revisao is distinct from p_revisao or c.pedido_id is not null then raise exception 'Cotação alterada ou já escolhida. Atualize a tela.' using errcode='PT409';end if;
 if not exists(select 1 from public.fornecedores where oficina_id=p_oficina and id=(p_dados->>'fornecedor_id')::uuid and arquivado_em is null) then raise exception 'Selecione um fornecedor ativo.' using errcode='22023';end if;
 if nullif(p_dados->>'previsao','') is null or nullif(p_dados->>'validade','') is null or not isfinite((p_dados->>'previsao')::date) or not isfinite((p_dados->>'validade')::date) then raise exception 'Informe entrega e validade da proposta.' using errcode='22023';end if;
 if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens)<>jsonb_array_length(c.itens) or (select count(distinct x->>'produto_id') from jsonb_array_elements(p_itens)x)<>jsonb_array_length(p_itens) then raise exception 'Compare a mesma lista de produtos e quantidades.' using errcode='22023';end if;
 if exists(select 1 from jsonb_to_recordset(p_itens)x(produto_id uuid,quantidade numeric,custo_centavos bigint) where x.custo_centavos is null or x.custo_centavos not between 0 and 100000000 or not exists(select 1 from jsonb_to_recordset(c.itens)y(produto_id uuid,quantidade numeric) where y.produto_id=x.produto_id and y.quantidade=x.quantidade)) then raise exception 'Confira as quantidades e os custos finais de todos os produtos.' using errcode='22023';end if;
 select sum(round(quantidade*custo_centavos)) into t from jsonb_to_recordset(p_itens)x(quantidade numeric,custo_centavos bigint);
 select coalesce(max(versao),0)+1 into v from public.propostas_compra where cotacao_id=p_cotacao and fornecedor_id=(p_dados->>'fornecedor_id')::uuid;
 insert into public.propostas_compra(id,oficina_id,cotacao_id,fornecedor_id,itens,total_centavos,previsao,validade,condicoes,observacoes,versao,autor)
 values(p_id,p_oficina,p_cotacao,(p_dados->>'fornecedor_id')::uuid,p_itens,t,(p_dados->>'previsao')::date,(p_dados->>'validade')::date,coalesce(p_dados->>'condicoes',''),coalesce(p_dados->>'observacoes',''),v,auth.uid());
 update public.cotacoes_compra set revisao=revisao+1 where id=p_cotacao;return p_id;
end $$;

create function public.escolher_proposta_compra(p_oficina uuid,p_cotacao uuid,p_proposta uuid,p_revisao integer,p_motivo text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare c public.cotacoes_compra;p public.propostas_compra;pedido uuid;begin
 perform private.gerencia_compras(p_oficina);select * into c from public.cotacoes_compra where oficina_id=p_oficina and id=p_cotacao for update;
 if not found then raise exception 'Cotação indisponível.' using errcode='42501';end if;
 if c.pedido_id is not null then if c.escolhida=p_proposta then return c.pedido_id;end if;raise exception 'Outra proposta já foi escolhida.' using errcode='PT409';end if;
 if c.revisao is distinct from p_revisao then raise exception 'Cotação alterada. Atualize a tela.' using errcode='PT409';end if;
 select * into p from public.propostas_compra where oficina_id=p_oficina and cotacao_id=p_cotacao and id=p_proposta;
 if not found then raise exception 'Proposta indisponível.' using errcode='42501';end if;
 if p.validade<(now() at time zone 'America/Sao_Paulo')::date or exists(select 1 from public.propostas_compra where cotacao_id=p_cotacao and fornecedor_id=p.fornecedor_id and versao>p.versao) then raise exception 'Proposta vencida ou substituída. Registre uma atualização do fornecedor.' using errcode='22023';end if;
 if exists(select 1 from public.propostas_compra x where x.cotacao_id=p_cotacao and x.total_centavos<p.total_centavos and x.validade>=(now() at time zone 'America/Sao_Paulo')::date and not exists(select 1 from public.propostas_compra y where y.cotacao_id=x.cotacao_id and y.fornecedor_id=x.fornecedor_id and y.versao>x.versao)) and length(trim(coalesce(p_motivo,'')))<3 then raise exception 'Informe por que escolheu esta proposta: prazo, qualidade ou condição de pagamento.' using errcode='22023';end if;
 pedido:=public.salvar_pedido_compra(p_oficina,gen_random_uuid(),jsonb_build_object('referencia',c.titulo,'fornecedor_id',p.fornecedor_id,'previsao',p.previsao,'condicoes',p.condicoes,'observacoes',left('Cotação aprovada. '||p.observacoes,2000)),p.itens);
 update public.cotacoes_compra set pedido_id=pedido,escolhida=p.id,motivo_escolha=left(coalesce(p_motivo,''),1000),revisao=revisao+1 where id=p_cotacao;
 insert into public.eventos_suprimentos(oficina_id,entidade,tipo,dados,autor) values(p_oficina,pedido,'cotacao_escolhida',jsonb_build_object('cotacao',c.id,'proposta',to_jsonb(p),'motivo',p_motivo),auth.uid());return pedido;
end $$;

create function public.consultar_cotacoes_compra(p_oficina uuid,p_busca text default '',p_pagina integer default 0,p_cotacao uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;begin
 perform private.gerencia_compras(p_oficina);
 if p_pagina is null or p_pagina not between 0 and 10000 then raise exception 'Página inválida.' using errcode='22023';end if;
 if p_cotacao is not null then
  select to_jsonb(c)||jsonb_build_object('itens',(select jsonb_agg(x||jsonb_build_object('descricao',p.descricao,'unidade',p.unidade)) from jsonb_array_elements(c.itens)x join public.itens_catalogo p on p.id=(x->>'produto_id')::uuid),'propostas',(select coalesce(jsonb_agg(to_jsonb(x) order by total_centavos,previsao),'[]') from (select p.*,f.nome fornecedor from public.propostas_compra p join public.fornecedores f on f.id=p.fornecedor_id where p.cotacao_id=c.id and not exists(select 1 from public.propostas_compra n where n.cotacao_id=p.cotacao_id and n.fornecedor_id=p.fornecedor_id and n.versao>p.versao))x),'historico',(select coalesce(jsonb_agg(to_jsonb(x) order by criado_em desc),'[]') from (select p.*,f.nome fornecedor from public.propostas_compra p join public.fornecedores f on f.id=p.fornecedor_id where p.cotacao_id=c.id order by p.criado_em desc,id limit 30 offset p_pagina*30)x),'total_historico',(select count(*) from public.propostas_compra where cotacao_id=c.id)) into r from public.cotacoes_compra c where c.oficina_id=p_oficina and c.id=p_cotacao;
  if r is null then raise exception 'Cotação indisponível.' using errcode='42501';end if;return r;
 end if;
 with c as (select c.*,(select count(distinct fornecedor_id) from public.propostas_compra where cotacao_id=c.id) fornecedores from public.cotacoes_compra c where oficina_id=p_oficina and titulo ilike '%'||left(coalesce(p_busca,''),100)||'%')
 select jsonb_build_object('total',(select count(*) from c),'itens',(select coalesce(jsonb_agg(to_jsonb(x) order by criado_em desc,id desc),'[]') from (select * from c order by criado_em desc,id desc limit 30 offset p_pagina*30)x)) into r;return r;
end $$;

-- Mantém a ordem de bloqueios pedido → compra → produtos também no cancelamento.
do $$declare f text;begin
 select pg_get_functiondef('public.cancelar_compra_estoque(uuid,uuid,text)'::regprocedure) into f;
 f:=replace(f,'begin','begin'||E'\n perform private.gerencia_compras(p_oficina); perform 1 from public.pedidos_compra p join public.recebimentos_pedido r on r.pedido_id=p.id where r.compra_id=p_compra and r.oficina_id=p_oficina for update of p;');
 execute f;
end $$;
do $$declare f record;begin
 for f in select p.oid::regprocedure assinatura from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('criar_cotacao_compra','registrar_proposta_compra','escolher_proposta_compra','consultar_cotacoes_compra') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.assinatura);execute format('grant execute on function %s to authenticated',f.assinatura);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;

