begin;

alter table public.estoque_produtos
 add column reservado numeric(15,3) not null default 0 check(reservado>=0),
 add column rastreado boolean not null default false,
 add column prazo_reposicao_dias integer not null default 7 check(prazo_reposicao_dias between 0 and 365),
 add column cobertura_dias integer not null default 30 check(cobertura_dias between 1 and 365),
 add column seguranca numeric(15,3) not null default 0 check(seguranca between 0 and 1000000),
 add column fornecedor_id uuid references public.fornecedores(id);

create table public.reservas_estoque (
 id uuid primary key default gen_random_uuid(), oficina_id uuid not null, produto_id uuid not null,
 documento uuid not null, ramo_documento text not null check(ramo_documento in ('os','atendimento')),
 item_id uuid not null, quantidade numeric(15,3) not null check(quantidade>0),
 revisao integer not null default 1, criado_em timestamptz not null default now(), autor uuid not null,
 unique(oficina_id,ramo_documento,item_id), foreign key(oficina_id,produto_id) references public.estoque_produtos(oficina_id,item_catalogo_id)
);
create index reservas_estoque_documento on public.reservas_estoque(oficina_id,ramo_documento,documento);
create index reservas_estoque_produto on public.reservas_estoque(oficina_id,produto_id);
create table public.unidades_estoque (
 id uuid primary key default gen_random_uuid(), oficina_id uuid not null, produto_id uuid not null,
 serie text not null check(length(trim(serie)) between 1 and 100), imei text check(imei ~ '^[0-9]{15}$'),
 estado text not null default 'estoque' check(estado in ('estoque','utilizado','saida','cancelado')),
 reserva_id uuid references public.reservas_estoque(id) on delete set null,
 entrada_id uuid not null references public.movimentacoes_estoque(id), movimento_id uuid not null references public.movimentacoes_estoque(id),
 criado_em timestamptz not null default now(), revisao integer not null default 1,
 foreign key(oficina_id,produto_id) references public.estoque_produtos(oficina_id,item_catalogo_id)
);
create unique index unidades_serie_empresa on public.unidades_estoque(oficina_id,lower(serie));
create unique index unidades_imei_empresa on public.unidades_estoque(oficina_id,imei) where imei is not null;
create index unidades_produto_estado on public.unidades_estoque(oficina_id,produto_id,estado,id);
create index unidades_movimento on public.unidades_estoque(movimento_id);
create index unidades_reserva on public.unidades_estoque(reserva_id) where reserva_id is not null;
create table public.eventos_suprimentos (
 id bigint generated always as identity primary key, oficina_id uuid not null references public.oficinas(id),
 entidade uuid not null, tipo text not null, dados jsonb not null, autor uuid, criado_em timestamptz not null default now()
);
create index eventos_suprimentos_entidade on public.eventos_suprimentos(oficina_id,entidade,id desc);
create trigger eventos_suprimentos_imutaveis before update or delete on public.eventos_suprimentos for each row execute function private.reject_mutation();
alter table public.reservas_estoque enable row level security;
alter table public.unidades_estoque enable row level security;
alter table public.eventos_suprimentos enable row level security;
revoke all on public.reservas_estoque,public.unidades_estoque,public.eventos_suprimentos from public,anon,authenticated;

create view private.itens_reservaveis as
 select i.oficina_id,'os'::text ramo_documento,w.id documento,i.id item_id,coalesce(i.produto_estoque_id,i.item_catalogo_id) produto_id,i.descricao,i.quantidade,i.unidade,w.revisao,
 (w.situacao not in ('delivered','cancelled') and w.arquivado_em is null and i.situacao<>'cancelled' and i.removido_em is null) ativo
 from public.itens_ordem_servico i join public.ordens_servico w on w.oficina_id=i.oficina_id and w.id=i.ordem_servico_id
 where i.tipo='part' and coalesce(i.origem_peca,'estoque')='estoque'
 union all
 select i.oficina_id,'atendimento',a.id,i.id,i.produto_id,i.descricao,i.quantidade,i.unidade,a.revisao,a.situacao not in ('concluido','cancelado')
 from public.itens_atendimento_servico i join public.atendimentos_servicos a on a.oficina_id=i.oficina_id and a.id=i.atendimento_id where i.origem='estoque';

create function private.travar_documento_estoque(w uuid,d uuid,t text) returns integer language plpgsql security definer set search_path='' as $$
declare r integer;begin
 perform private.exigir_estoque(w);
 if t='os' then perform private.exigir_os(w);select revisao into r from public.ordens_servico where oficina_id=w and id=d for update;
 elsif t='atendimento' then perform private.exigir_servicos(w,'work_orders');select revisao into r from public.atendimentos_servicos where oficina_id=w and id=d for update;
 else raise exception 'Documento inválido.' using errcode='22023';end if;
 if r is null then raise exception 'Atendimento indisponível.' using errcode='42501';end if;return r;
end $$;

create function private.auditar_reserva_estoque() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.reservas_estoque;begin
 r:=case when tg_op='DELETE' then old else new end;
 if tg_op='INSERT' then update public.estoque_produtos set reservado=reservado+new.quantidade where oficina_id=r.oficina_id and item_catalogo_id=r.produto_id;
 elsif tg_op='DELETE' then update public.estoque_produtos set reservado=reservado-old.quantidade where oficina_id=r.oficina_id and item_catalogo_id=r.produto_id;
 else update public.estoque_produtos set reservado=reservado+new.quantidade-old.quantidade where oficina_id=r.oficina_id and item_catalogo_id=r.produto_id;end if;
 insert into public.eventos_suprimentos(oficina_id,entidade,tipo,dados,autor) values(r.oficina_id,r.documento,'reserva_'||lower(tg_op),jsonb_build_object('reserva',r.id,'item',r.item_id,'produto',r.produto_id,'quantidade',r.quantidade),auth.uid());
 return r;
end $$;
create trigger auditar_reserva_estoque after insert or update or delete on public.reservas_estoque for each row execute function private.auditar_reserva_estoque();

-- A conferência ocorre no final da transação: consumo, reserva e unidade precisam fechar juntos.
create function private.conferir_saldo_reservado() returns trigger language plpgsql security definer set search_path='' as $$
declare e public.estoque_produtos;n numeric;begin
 select * into e from public.estoque_produtos where oficina_id=new.oficina_id and item_catalogo_id=new.item_catalogo_id;
 if e.saldo<e.reservado then raise exception 'Saldo comprometido com outros atendimentos. Libere a reserva ou reponha o produto antes de continuar.' using errcode='22023';end if;
 if e.rastreado then
  select count(*) into n from public.unidades_estoque where oficina_id=e.oficina_id and produto_id=e.item_catalogo_id and estado='estoque';
  if e.saldo<>n then raise exception 'Produto rastreado: receba pelo pedido de compra ou identifique as unidades em Estoque → Séries / IMEI.' using errcode='22023';end if;
 end if;return null;
end $$;
create constraint trigger conferir_saldo_reservado after insert or update on public.estoque_produtos deferrable initially deferred for each row execute function private.conferir_saldo_reservado();

-- Salvar uma ficha pode apagar/reinserir seus itens. Só libera depois que a ficha inteira foi salva.
create function private.limpar_reservas_documento() returns trigger language plpgsql security definer set search_path='' as $$
declare w uuid;d uuid;t text;r record;begin
 w:=case when tg_op='DELETE' then old.oficina_id else new.oficina_id end;
 t:=case when tg_table_name in ('ordens_servico','itens_ordem_servico') then 'os' else 'atendimento' end;
 if tg_table_name in ('ordens_servico','atendimentos_servicos') then d:=case when tg_op='DELETE' then old.id else new.id end;
 elsif t='os' then d:=case when tg_op='DELETE' then old.ordem_servico_id else new.ordem_servico_id end;
 else d:=case when tg_op='DELETE' then old.atendimento_id else new.atendimento_id end;end if;
 for r in select x.* from public.reservas_estoque x where x.oficina_id=w and x.documento=d and x.ramo_documento=t
 and not exists(select 1 from private.itens_reservaveis i where i.oficina_id=w and i.ramo_documento=t and i.documento=d and i.item_id=x.item_id and i.produto_id=x.produto_id and i.ativo and i.quantidade>=x.quantidade) order by produto_id,id loop
  perform 1 from public.estoque_produtos where oficina_id=w and item_catalogo_id=r.produto_id for update;
  delete from public.reservas_estoque where id=r.id;
 end loop;return null;
end $$;
create constraint trigger limpar_reservas_os after update on public.ordens_servico deferrable initially deferred for each row execute function private.limpar_reservas_documento();
create constraint trigger limpar_reservas_item_os after insert or update or delete on public.itens_ordem_servico deferrable initially deferred for each row execute function private.limpar_reservas_documento();
create constraint trigger limpar_reservas_atendimento after update on public.atendimentos_servicos deferrable initially deferred for each row execute function private.limpar_reservas_documento();
create constraint trigger limpar_reservas_item_atendimento after insert or update or delete on public.itens_atendimento_servico deferrable initially deferred for each row execute function private.limpar_reservas_documento();

create function public.reservar_estoque_atendimento(p_oficina uuid,p_documento uuid,p_ramo text,p_item uuid,p_quantidade numeric,p_revisao integer,p_unidades uuid[] default '{}',p_reserva_revisao integer default null) returns void language plpgsql security definer set search_path='' as $$
declare i record;e public.estoque_produtos;r public.reservas_estoque;ids uuid[];n int;begin
 if private.travar_documento_estoque(p_oficina,p_documento,p_ramo) is distinct from p_revisao then raise exception 'Atendimento alterado. Atualize antes de reservar.' using errcode='PT409';end if;
 select * into i from private.itens_reservaveis where oficina_id=p_oficina and documento=p_documento and ramo_documento=p_ramo and item_id=p_item and ativo;
 if not found then raise exception 'Item indisponível para reserva.' using errcode='22023';end if;
 select * into e from public.estoque_produtos where oficina_id=p_oficina and item_catalogo_id=i.produto_id for update;
 if not found then raise exception 'Ative o controle de estoque deste produto.' using errcode='22023';end if;
 select * into r from public.reservas_estoque where oficina_id=p_oficina and ramo_documento=p_ramo and item_id=p_item;
 select coalesce(array_agg(x order by x),'{}') into ids from (select distinct unnest(p_unidades) x)x;
 if p_quantidade is null or p_quantidade<0 or p_quantidade>i.quantidade or p_quantidade<>round(p_quantidade,3) then raise exception 'Confira a quantidade a reservar.' using errcode='22023';end if;
 if lower(i.unidade) in ('un','unid','peca','peça') and p_quantidade<>trunc(p_quantidade) then raise exception 'Reserve uma quantidade inteira de unidades.' using errcode='22023';end if;
 if r.revisao is distinct from p_reserva_revisao then raise exception 'A reserva mudou. Atualize a tela.' using errcode='PT409';end if;
 if p_quantidade=0 then delete from public.reservas_estoque where id=r.id;return;end if;
 if p_quantidade>e.saldo-e.reservado+coalesce(r.quantidade,0) then raise exception 'Quantidade indisponível: parte do estoque já está reservada.' using errcode='22023';end if;
 if e.rastreado then
  select count(*) into n from public.unidades_estoque where oficina_id=p_oficina and produto_id=i.produto_id and estado='estoque' and (reserva_id is null or reserva_id=r.id) and id=any(ids);
  if cardinality(ids)<>p_quantidade or n<>p_quantidade then raise exception 'Selecione uma série ou IMEI disponível para cada unidade.' using errcode='22023';end if;
 elsif cardinality(ids)>0 then raise exception 'Este produto não usa rastreamento individual.' using errcode='22023';end if;
 insert into public.reservas_estoque(id,oficina_id,produto_id,documento,ramo_documento,item_id,quantidade,autor)
 values(coalesce(r.id,gen_random_uuid()),p_oficina,i.produto_id,p_documento,p_ramo,p_item,p_quantidade,auth.uid())
 on conflict(oficina_id,ramo_documento,item_id) do update set quantidade=excluded.quantidade,revisao=reservas_estoque.revisao+1 returning * into r;
 update public.unidades_estoque set reserva_id=null where reserva_id=r.id and not(id=any(ids));
 update public.unidades_estoque set reserva_id=r.id where id=any(ids);
end $$;

create function private.auditar_unidade_estoque() returns trigger language plpgsql security definer set search_path='' as $$
declare m public.movimentacoes_estoque;r public.reservas_estoque;d uuid;t text;nome text;begin
 select * into m from public.movimentacoes_estoque where id=new.movimento_id;
 select * into r from public.reservas_estoque where id=new.reserva_id;
 d:=coalesce(r.documento,m.ordem_servico_id,m.atendimento_id);
 t:=coalesce(r.ramo_documento,case when m.ordem_servico_id is not null then 'os' when m.atendimento_id is not null then 'atendimento' end);
 if t='os' then select 'OS #'||numero into nome from public.ordens_servico where id=d;
 elsif t='atendimento' then select titulo into nome from public.atendimentos_servicos where id=d;end if;
 insert into public.eventos_suprimentos(oficina_id,entidade,tipo,dados,autor) values(new.oficina_id,new.id,'unidade_'||lower(tg_op),to_jsonb(new)||jsonb_build_object('documento_id',d,'ramo',t,'referencia',nome,'motivo',m.motivo),auth.uid());return new;
end $$;
create trigger auditar_unidade_estoque after insert or update on public.unidades_estoque for each row execute function private.auditar_unidade_estoque();

-- O mesmo extrato atende entrega automotiva, conclusão, reabertura e estorno dos outros ramos.
create function private.integrar_reservas_movimento() returns trigger language plpgsql security definer set search_path='' as $$
declare e public.estoque_produtos;ids uuid[];m public.movimentacoes_estoque;n int;begin
 select * into e from public.estoque_produtos where oficina_id=new.oficina_id and item_catalogo_id=new.item_catalogo_id for update;
 if new.estorno_de is not null then
  select * into m from public.movimentacoes_estoque where id=new.estorno_de;
  if e.rastreado then
   if m.quantidade>0 then
    select count(*) into n from public.unidades_estoque where entrada_id=m.id and estado='estoque' and reserva_id is null;
    if n<>m.quantidade then raise exception 'Há unidade reservada ou utilizada; não é possível estornar esta entrada.' using errcode='22023';end if;
    update public.unidades_estoque set estado='cancelado',movimento_id=new.id,revisao=revisao+1 where entrada_id=m.id;
   else
    select count(*) into n from public.unidades_estoque where movimento_id=m.id and estado in ('utilizado','saida');
    if n<>-m.quantidade then raise exception 'Unidades já devolvidas ou alteradas; confira o histórico.' using errcode='22023';end if;
    update public.unidades_estoque set estado='estoque',reserva_id=null,movimento_id=new.id,revisao=revisao+1 where movimento_id=m.id;
   end if;
  end if;return new;
 end if;
 if new.quantidade<0 and (new.item_os_id is not null or new.atendimento_id is not null) then
  select coalesce(array_agg(u.id),'{}') into ids from public.unidades_estoque u join public.reservas_estoque r on r.id=u.reserva_id
  where r.oficina_id=new.oficina_id and r.produto_id=new.item_catalogo_id and ((r.ramo_documento='os' and r.item_id=new.item_os_id) or (r.ramo_documento='atendimento' and r.documento=new.atendimento_id));
  if e.rastreado and cardinality(ids)<>-new.quantidade then raise exception 'Selecione as séries ou IMEIs na reserva antes de concluir este atendimento.' using errcode='22023';end if;
  update public.unidades_estoque set estado='utilizado',reserva_id=null,movimento_id=new.id,revisao=revisao+1 where id=any(ids);
  delete from public.reservas_estoque r where r.oficina_id=new.oficina_id and r.produto_id=new.item_catalogo_id and ((r.ramo_documento='os' and r.item_id=new.item_os_id) or (r.ramo_documento='atendimento' and r.documento=new.atendimento_id));
 end if;return new;
end $$;
create trigger integrar_reservas_movimento after insert on public.movimentacoes_estoque for each row execute function private.integrar_reservas_movimento();

create function public.configurar_planejamento_estoque(p_oficina uuid,p_produto uuid,p_revisao integer,p_dados jsonb) returns void language plpgsql security definer set search_path='' as $$
declare e public.estoque_produtos;novo boolean;begin
 perform private.exigir_estoque(p_oficina);
 select * into e from public.estoque_produtos where oficina_id=p_oficina and item_catalogo_id=p_produto for update;
 if not found then raise exception 'Produto indisponível.' using errcode='42501';end if;
 if e.revisao is distinct from p_revisao then raise exception 'Produto alterado. Atualize a tela.' using errcode='PT409';end if;
 if nullif(p_dados->>'fornecedor_id','') is not null and not exists(select 1 from public.fornecedores where oficina_id=p_oficina and id=(p_dados->>'fornecedor_id')::uuid and arquivado_em is null) then raise exception 'Fornecedor indisponível.' using errcode='22023';end if;
 novo:=coalesce((p_dados->>'rastreado')::boolean,e.rastreado);
 if novo<>e.rastreado and (e.saldo<>0 or e.reservado<>0 or exists(select 1 from public.unidades_estoque where oficina_id=p_oficina and produto_id=p_produto)) then raise exception 'O rastreamento só pode ser ativado com saldo zero; o histórico de unidades não pode ser desativado.' using errcode='22023';end if;
 if novo and not exists(select 1 from public.itens_catalogo where id=p_produto and lower(unidade) in ('un','unid','peca','peça')) then raise exception 'Rastreamento individual exige unidade un ou peça.' using errcode='22023';end if;
 update public.estoque_produtos set rastreado=novo,prazo_reposicao_dias=coalesce((p_dados->>'prazo_reposicao_dias')::int,e.prazo_reposicao_dias),cobertura_dias=coalesce((p_dados->>'cobertura_dias')::int,e.cobertura_dias),seguranca=coalesce((p_dados->>'seguranca')::numeric,e.seguranca),fornecedor_id=nullif(p_dados->>'fornecedor_id','')::uuid,revisao=revisao+1 where oficina_id=p_oficina and item_catalogo_id=p_produto;
end $$;

create function private.inserir_unidades_compra(w uuid,p uuid,m uuid,lista jsonb) returns void language plpgsql set search_path='' as $$
declare u jsonb;begin
 if jsonb_typeof(lista) is distinct from 'array' or jsonb_array_length(lista)>2000 then raise exception 'Informe até 2.000 séries por entrada.' using errcode='22023';end if;
 for u in select value from jsonb_array_elements(lista) loop
  insert into public.unidades_estoque(oficina_id,produto_id,serie,imei,entrada_id,movimento_id)
  values(w,p,trim(coalesce(nullif(u->>'serie',''),u->>'imei')),nullif(regexp_replace(coalesce(u->>'imei',''),'[^0-9]','','g'),''),m,m);
 end loop;
end $$;
create function public.movimentar_unidades_estoque(p_oficina uuid,p_produto uuid,p_revisao integer,p_chave uuid,p_tipo text,p_unidades jsonb,p_motivo text) returns uuid language plpgsql security definer set search_path='' as $$
declare e public.estoque_produtos;m uuid;n int;ids uuid[];antigo public.movimentacoes_estoque;begin
 perform private.exigir_estoque(p_oficina);
 select * into e from public.estoque_produtos where oficina_id=p_oficina and item_catalogo_id=p_produto for update;
 if not e.rastreado then raise exception 'Ative o rastreamento individual deste produto.' using errcode='22023';end if;
 select * into antigo from public.movimentacoes_estoque where oficina_id=p_oficina and chave=p_chave;
 if found then
  if antigo.item_catalogo_id<>p_produto or antigo.documento<>md5(p_unidades::text) or antigo.tipo<>p_tipo then raise exception 'Este envio já foi usado. Atualize a tela.' using errcode='PT409';end if;return antigo.id;
 end if;
 if jsonb_typeof(p_unidades) is distinct from 'array' or jsonb_array_length(p_unidades) not between 1 and 2000 or p_tipo not in ('entrada','saida') then raise exception 'Confira as unidades e a movimentação.' using errcode='22023';end if;
 n:=jsonb_array_length(p_unidades);
 if p_tipo='saida' then
  select array_agg(x::uuid) into ids from jsonb_array_elements_text(p_unidades) x;
  if (select count(*) from public.unidades_estoque where oficina_id=p_oficina and produto_id=p_produto and estado='estoque' and reserva_id is null and id=any(ids))<>n then raise exception 'Selecione somente unidades disponíveis, sem repetição.' using errcode='22023';end if;
 end if;
 m:=public.movimentar_estoque(p_oficina,p_produto,p_tipo,n,p_motivo,p_chave,p_revisao,md5(p_unidades::text));
 if p_tipo='entrada' then perform private.inserir_unidades_compra(p_oficina,p_produto,m,p_unidades);
 else update public.unidades_estoque set estado='saida',movimento_id=m,revisao=revisao+1 where id=any(ids);end if;return m;
end $$;

create function public.consultar_unidades_estoque(p_oficina uuid,p_produto uuid default null,p_busca text default '',p_pagina int default 0,p_unidade uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;begin
 perform private.exigir_estoque(p_oficina);
 if p_pagina is null or p_pagina not between 0 and 10000 then raise exception 'Página inválida.' using errcode='22023';end if;
 if p_unidade is not null then
  select jsonb_build_object('unidade',to_jsonb(u),'historico',(select coalesce(jsonb_agg(to_jsonb(x) order by id desc),'[]') from (select * from public.eventos_suprimentos where oficina_id=p_oficina and entidade=u.id order by id desc limit 100)x)) into r from public.unidades_estoque u where u.oficina_id=p_oficina and u.id=p_unidade;
  if r is null then raise exception 'Unidade indisponível.' using errcode='42501';end if;return r;
 end if;
 with u as (select u.*,c.descricao,r.documento,r.ramo_documento from public.unidades_estoque u join public.itens_catalogo c on c.id=u.produto_id left join public.reservas_estoque r on r.id=u.reserva_id where u.oficina_id=p_oficina and (p_produto is null or u.produto_id=p_produto) and concat(u.serie,' ',u.imei,' ',c.descricao) ilike '%'||left(coalesce(p_busca,''),100)||'%')
 select jsonb_build_object('total',(select count(*) from u),'itens',(select coalesce(jsonb_agg(to_jsonb(x) order by serie,id),'[]') from (select * from u order by serie,id limit 30 offset p_pagina*30)x)) into r;return r;
end $$;

create function public.consultar_produto_estoque(p_oficina uuid,p_produto uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;begin
 perform private.exigir_estoque(p_oficina);
 select to_jsonb(e)||jsonb_build_object('id',c.id,'descricao',c.descricao,'unidade',c.unidade,'arquivado_em',c.arquivado_em,'preco_padrao_centavos',c.preco_padrao_centavos,'disponivel',e.saldo-e.reservado) into r from public.estoque_produtos e join public.itens_catalogo c on c.id=e.item_catalogo_id where e.oficina_id=p_oficina and e.item_catalogo_id=p_produto;
 if r is null then raise exception 'Produto indisponível.' using errcode='42501';end if;return r;
end $$;
create function public.consultar_reservas_atendimento(p_oficina uuid,p_documento uuid,p_ramo text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;rev integer;begin
 rev:=private.travar_documento_estoque(p_oficina,p_documento,p_ramo);
 select coalesce(jsonb_agg(jsonb_build_object('item_id',i.item_id,'descricao',i.descricao,'produto_id',i.produto_id,'quantidade',i.quantidade,'unidade',i.unidade,'ativo',i.ativo,'saldo',e.saldo,'disponivel',e.saldo-e.reservado,'rastreado',e.rastreado,'reservado',coalesce(r.quantidade,0),'reserva_revisao',r.revisao,'reserva_id',r.id,'unidades',(select coalesce(jsonb_agg(to_jsonb(u) order by serie),'[]') from public.unidades_estoque u where u.reserva_id=r.id)) order by i.descricao,i.item_id),'[]') into r
 from private.itens_reservaveis i join public.estoque_produtos e on e.oficina_id=i.oficina_id and e.item_catalogo_id=i.produto_id left join public.reservas_estoque r on r.oficina_id=i.oficina_id and r.ramo_documento=i.ramo_documento and r.item_id=i.item_id where i.oficina_id=p_oficina and i.documento=p_documento and i.ramo_documento=p_ramo;
 return jsonb_build_object('revisao',rev,'itens',r);
end $$;

-- Mantém o contrato das consultas existentes, acrescentando saldo realmente disponível.
do $$declare s text;antes text;begin
 s:=pg_get_functiondef('public.consultar_relatorios_gestao(uuid,date,date)'::regprocedure);
 antes:=$expr$'reservado',coalesce((select sum(i.quantidade) from public.itens_ordem_servico i join public.ordens_servico w on w.id=i.ordem_servico_id where i.oficina_id=p_oficina and coalesce(i.produto_estoque_id,i.item_catalogo_id)=e.item_catalogo_id and i.tipo='part' and coalesce(i.origem_peca,'estoque')='estoque' and i.situacao<>'cancelled' and i.removido_em is null and w.situacao not in ('delivered','cancelled') and w.arquivado_em is null),0)$expr$;
 if position(antes in s)=0 then raise exception 'Contrato de reserva do relatório automotivo alterado.';end if;
 execute replace(s,antes,$expr$'reservado',e.reservado$expr$);
 s:=pg_get_functiondef('public.consultar_relatorios_servicos(uuid,date,date)'::regprocedure);
 antes:=$expr$'reservado',(select coalesce(sum(i.quantidade),0) from public.itens_atendimento_servico i join public.atendimentos_servicos a on a.id=i.atendimento_id where i.oficina_id=p_oficina and i.produto_id=e.item_catalogo_id and a.situacao in ('aprovado','em_execucao','aguardando'))$expr$;
 if position(antes in s)=0 then raise exception 'Contrato de reserva do relatório de serviços alterado.';end if;
 execute replace(s,antes,$expr$'reservado',e.reservado$expr$);
end $$;
do $$declare s text;begin
 s:=pg_get_functiondef('public.listar_estoque(uuid,text,text,integer)'::regprocedure);
 s:=replace(s,'e.custo_centavos,e.revisao','e.custo_centavos,e.revisao,e.reservado,(e.saldo-e.reservado) disponivel,e.rastreado,e.prazo_reposicao_dias,e.cobertura_dias,e.seguranca,e.fornecedor_id');
 s:=replace(s,'e.saldo<=e.minimo','e.saldo-e.reservado<=e.minimo');
 if position('e.rastreado' in s)=0 then raise exception 'Contrato da consulta de estoque alterado.';end if;execute s;
end $$;

do $$declare f record;begin
 for f in select p.oid::regprocedure assinatura,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='public' and p.proname in ('reservar_estoque_atendimento','configurar_planejamento_estoque','movimentar_unidades_estoque','consultar_unidades_estoque','consultar_reservas_atendimento','consultar_produto_estoque')) or (n.nspname='private' and p.proname in ('travar_documento_estoque','auditar_reserva_estoque','conferir_saldo_reservado','limpar_reservas_documento','auditar_unidade_estoque','integrar_reservas_movimento','inserir_unidades_compra')) loop
  execute format('revoke all on function %s from public,anon,authenticated',f.assinatura);if f.nspname='public' then execute format('grant execute on function %s to authenticated',f.assinatura);end if;
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
