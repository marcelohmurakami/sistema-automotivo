begin;
create table public.importacoes_catalogo_fornecedor (
 id uuid primary key,oficina_id uuid not null,fornecedor_id uuid not null,arquivo text not null check(length(arquivo) between 1 and 200),data_catalogo date not null,substituir boolean not null default false,
 quantidade integer not null check(quantidade between 1 and 2000),assinatura text not null,criado_em timestamptz not null default now(),autor uuid not null,
 foreign key(oficina_id,fornecedor_id) references public.fornecedores(oficina_id,id)
);
create table public.catalogo_fornecedor (
 id uuid primary key default gen_random_uuid(),oficina_id uuid not null,fornecedor_id uuid not null,codigo text not null check(length(codigo) between 1 and 80),descricao text not null check(length(trim(descricao)) between 2 and 200),
 aplicacao text not null default '' check(length(aplicacao)<=1000),marca text not null default '' check(length(marca)<=100),unidade text not null default 'un' check(length(unidade) between 1 and 20),
 preco_centavos bigint not null check(preco_centavos between 0 and 100000000),disponibilidade text not null check(disponibilidade in ('disponivel','sob_encomenda','indisponivel','nao_informado')),quantidade_disponivel numeric(15,3) check(quantidade_disponivel between 0 and 1000000),prazo_dias integer check(prazo_dias between 0 and 365),
 produto_id uuid,importacao_id uuid not null references public.importacoes_catalogo_fornecedor(id),data_catalogo date not null,revisao integer not null default 1,atualizado_em timestamptz not null default now(),
 unique(oficina_id,fornecedor_id,codigo),foreign key(oficina_id,fornecedor_id) references public.fornecedores(oficina_id,id),foreign key(oficina_id,produto_id) references public.estoque_produtos(oficina_id,item_catalogo_id)
);
create index catalogo_fornecedor_empresa on public.catalogo_fornecedor(oficina_id,fornecedor_id,descricao,id);
create index catalogo_fornecedor_busca on public.catalogo_fornecedor using gin ((descricao||' '||codigo||' '||marca||' '||aplicacao) extensions.gin_trgm_ops);
create function public.importar_catalogo_fornecedor(p_oficina uuid,p_id uuid,p_fornecedor uuid,p_arquivo text,p_data date,p_itens jsonb,p_substituir boolean default false) returns integer language plpgsql security definer set search_path='' as $$
declare b public.importacoes_catalogo_fornecedor;sig text;j jsonb;begin
 perform private.gerencia_compras(p_oficina);perform pg_advisory_xact_lock(hashtextextended('catalogo:'||p_id,0));
 sig:=md5(jsonb_build_array(p_fornecedor,p_arquivo,p_data,p_itens,p_substituir)::text);select * into b from public.importacoes_catalogo_fornecedor where id=p_id;
 if found then if b.oficina_id<>p_oficina or b.assinatura<>sig then raise exception 'Importação já registrada com outro arquivo.' using errcode='PT409';end if;return b.quantidade;end if;
 perform 1 from public.fornecedores where oficina_id=p_oficina and id=p_fornecedor and arquivado_em is null for update;
 if not found then raise exception 'Escolha um fornecedor ativo desta empresa.' using errcode='22023';end if;
 if p_data is null or not isfinite(p_data) or p_data<date '2000-01-01' or p_data>(now() at time zone 'America/Sao_Paulo')::date or jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) not between 1 and 2000 then raise exception 'Informe a data do catálogo e de 1 a 2.000 linhas por arquivo.' using errcode='22023';end if;
 if exists(select 1 from public.catalogo_fornecedor where oficina_id=p_oficina and fornecedor_id=p_fornecedor and data_catalogo>p_data) then raise exception 'Já existe um catálogo mais recente deste fornecedor. Confira a data do arquivo.' using errcode='22023';end if;
 if (select count(distinct upper(trim(x->>'codigo'))) from jsonb_array_elements(p_itens)x)<>jsonb_array_length(p_itens) then raise exception 'Cada linha precisa de um código único do fornecedor.' using errcode='22023';end if;
 insert into public.importacoes_catalogo_fornecedor values(p_id,p_oficina,p_fornecedor,p_arquivo,p_data,p_substituir,jsonb_array_length(p_itens),sig,now(),auth.uid());
 for j in select value from jsonb_array_elements(p_itens) loop
  if j->>'codigo'~'[[:cntrl:]]' or nullif(trim(j->>'descricao'),'') is null or (j->>'preco_centavos')::numeric<>trunc((j->>'preco_centavos')::numeric) then raise exception 'Confira código, descrição e preço das linhas.' using errcode='22023';end if;
  insert into public.catalogo_fornecedor(oficina_id,fornecedor_id,codigo,descricao,aplicacao,marca,unidade,preco_centavos,disponibilidade,quantidade_disponivel,prazo_dias,importacao_id,data_catalogo)
  values(p_oficina,p_fornecedor,upper(trim(j->>'codigo')),trim(j->>'descricao'),coalesce(j->>'aplicacao',''),coalesce(j->>'marca',''),coalesce(nullif(trim(j->>'unidade'),''),'un'),(j->>'preco_centavos')::bigint,coalesce(j->>'disponibilidade','nao_informado'),(j->>'quantidade_disponivel')::numeric,(j->>'prazo_dias')::integer,p_id,p_data)
  on conflict(oficina_id,fornecedor_id,codigo) do update set descricao=excluded.descricao,aplicacao=excluded.aplicacao,marca=excluded.marca,produto_id=case when lower(catalogo_fornecedor.unidade)=lower(excluded.unidade) then catalogo_fornecedor.produto_id else null end,unidade=excluded.unidade,preco_centavos=excluded.preco_centavos,disponibilidade=excluded.disponibilidade,quantidade_disponivel=excluded.quantidade_disponivel,prazo_dias=excluded.prazo_dias,importacao_id=p_id,data_catalogo=p_data,atualizado_em=now(),revisao=catalogo_fornecedor.revisao+1;
 end loop;
 if p_substituir then update public.catalogo_fornecedor set disponibilidade='indisponivel',quantidade_disponivel=null,importacao_id=p_id,data_catalogo=p_data,atualizado_em=now(),revisao=revisao+1 where oficina_id=p_oficina and fornecedor_id=p_fornecedor and importacao_id<>p_id;end if;
 insert into public.eventos_suprimentos(oficina_id,entidade,tipo,dados,autor) values(p_oficina,p_fornecedor,'catalogo_importado',jsonb_build_object('id',p_id,'arquivo',p_arquivo,'data',p_data,'linhas',jsonb_array_length(p_itens),'substituir',p_substituir),auth.uid());return jsonb_array_length(p_itens);
end $$;
create function public.consultar_catalogo_fornecedor(p_oficina uuid,p_busca text default '',p_pagina integer default 0,p_fornecedor uuid default null,p_disponibilidade text default 'todas') returns jsonb language plpgsql security definer set search_path='' as $$declare r jsonb;begin
 perform private.gerencia_compras(p_oficina);if p_pagina is null or p_pagina not between 0 and 10000 then raise exception 'Página inválida.' using errcode='22023';end if;
 with itens as(select c.*,f.nome fornecedor,p.descricao produto_descricao,b.arquivo from public.catalogo_fornecedor c join public.fornecedores f on f.id=c.fornecedor_id join public.importacoes_catalogo_fornecedor b on b.id=c.importacao_id left join public.itens_catalogo p on p.id=c.produto_id where c.oficina_id=p_oficina and (p_fornecedor is null or c.fornecedor_id=p_fornecedor) and (p_disponibilidade='todas' or c.disponibilidade=p_disponibilidade) and (c.descricao||' '||c.codigo||' '||c.marca||' '||c.aplicacao) ilike '%'||left(coalesce(p_busca,''),100)||'%')
 select jsonb_build_object('total',(select count(*) from itens),'itens',(select coalesce(jsonb_agg(to_jsonb(x) order by descricao,fornecedor_id,id),'[]') from(select * from itens order by descricao,fornecedor_id,id limit 30 offset p_pagina*30)x)) into r;return r;
end $$;
create function public.vincular_catalogo_fornecedor(p_oficina uuid,p_id uuid,p_revisao integer,p_produto uuid default null) returns uuid language plpgsql security definer set search_path='' as $$declare c public.catalogo_fornecedor;p uuid:=p_produto;begin
 perform private.gerencia_compras(p_oficina);select * into c from public.catalogo_fornecedor where oficina_id=p_oficina and id=p_id for update;
 if not found or c.revisao is distinct from p_revisao then raise exception 'Catálogo alterado. Atualize a tela.' using errcode='PT409';end if;
 if p is null then
  if c.produto_id is not null then return c.produto_id;end if;
  p:=gen_random_uuid();perform public.salvar_produto_estoque(p_oficina,jsonb_build_object('descricao',c.descricao,'unidade',c.unidade,'custo_centavos',c.preco_centavos,'preco_padrao_centavos',0),p);
 elsif not exists(select 1 from public.estoque_produtos e join public.itens_catalogo i on i.id=e.item_catalogo_id where e.oficina_id=p_oficina and e.item_catalogo_id=p and i.arquivado_em is null and lower(i.unidade)=lower(c.unidade)) then raise exception 'Escolha um produto ativo com a mesma unidade do catálogo.' using errcode='22023';end if;
 update public.catalogo_fornecedor set produto_id=p,revisao=revisao+1 where id=p_id;
 insert into public.eventos_suprimentos(oficina_id,entidade,tipo,dados,autor) values(p_oficina,p_id,'catalogo_vinculado',jsonb_build_object('produto_id',p),auth.uid());return p;
end $$;
create function public.pedir_itens_catalogo(p_oficina uuid,p_id uuid,p_itens jsonb,p_referencia text) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.catalogo_fornecedor;j jsonb;f uuid;linhas jsonb:='[]';sig text;ev public.eventos_suprimentos;begin
 perform private.gerencia_compras(p_oficina);perform pg_advisory_xact_lock(hashtextextended('pedido-catalogo:'||p_id,0));sig:=md5(jsonb_build_array(p_itens,p_referencia)::text);
 select * into ev from public.eventos_suprimentos where oficina_id=p_oficina and entidade=p_id and tipo='pedido_catalogo';
 if found then if ev.dados->>'assinatura'<>sig then raise exception 'Pedido já criado com outros dados.' using errcode='PT409';end if;return p_id;end if;
 if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) not between 1 and 100 then raise exception 'Selecione de 1 a 100 produtos.' using errcode='22023';end if;
 perform 1 from public.catalogo_fornecedor where oficina_id=p_oficina and id in(select (x->>'id')::uuid from jsonb_array_elements(p_itens)x) order by id for update;
 for j in select value from jsonb_array_elements(p_itens) loop
  select * into c from public.catalogo_fornecedor where oficina_id=p_oficina and id=(j->>'id')::uuid;
  if not found or c.revisao is distinct from (j->>'revisao')::integer then raise exception 'O catálogo foi atualizado. Confira preço e disponibilidade antes de pedir.' using errcode='PT409';end if;
  if c.produto_id is null or c.disponibilidade='indisponivel' or (f is not null and f<>c.fornecedor_id) then raise exception 'Vincule os produtos e selecione apenas um fornecedor por pedido, com itens disponíveis ou sob consulta.' using errcode='22023';end if;
  if not exists(select 1 from public.estoque_produtos e join public.itens_catalogo i on i.id=e.item_catalogo_id where e.oficina_id=p_oficina and e.item_catalogo_id=c.produto_id and i.arquivado_em is null and lower(i.unidade)=lower(c.unidade)) then raise exception 'O produto vinculado mudou de unidade ou foi arquivado. Confira o vínculo antes de pedir.' using errcode='22023';end if;
  f:=c.fornecedor_id;linhas:=linhas||jsonb_build_array(jsonb_build_object('produto_id',c.produto_id,'quantidade',(j->>'quantidade')::numeric,'custo_centavos',c.preco_centavos));
 end loop;
 perform public.salvar_pedido_compra(p_oficina,p_id,jsonb_build_object('fornecedor_id',f,'referencia',p_referencia,'observacoes','Criado a partir de catálogo importado. Confirme preço e disponibilidade com o fornecedor.'),linhas);
 insert into public.eventos_suprimentos(oficina_id,entidade,tipo,dados,autor) values(p_oficina,p_id,'pedido_catalogo',jsonb_build_object('assinatura',sig,'itens',p_itens),auth.uid());return p_id;
end $$;
do $$declare t text;f record;begin
 foreach t in array array['importacoes_catalogo_fornecedor','catalogo_fornecedor'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);end loop;
 for f in select oid::regprocedure assinatura from pg_proc where pronamespace='public'::regnamespace and proname in ('importar_catalogo_fornecedor','consultar_catalogo_fornecedor','vincular_catalogo_fornecedor','pedir_itens_catalogo') loop execute format('revoke all on function %s from public,anon,authenticated',f.assinatura);execute format('grant execute on function %s to authenticated',f.assinatura);end loop;
end $$;
notify pgrst,'reload schema';
commit;
