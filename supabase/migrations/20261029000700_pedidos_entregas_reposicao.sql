begin;
create table public.pedidos_compra (
 id uuid primary key,oficina_id uuid not null references public.oficinas(id),fornecedor_id uuid not null references public.fornecedores(id),
 referencia text not null check(length(trim(referencia)) between 1 and 160),previsao date,condicoes text not null default '' check(length(condicoes)<=1000),
 observacoes text not null default '' check(length(observacoes)<=2000),cancelado boolean not null default false,motivo_cancelamento text not null default '',
 revisao integer not null default 1,criado_em timestamptz not null default now(),autor uuid not null,assinatura text not null,
 unique(oficina_id,id)
);
create index pedidos_compra_empresa on public.pedidos_compra(oficina_id,criado_em desc,id);
create table public.itens_pedido_compra (
 id uuid primary key default gen_random_uuid(),oficina_id uuid not null,pedido_id uuid not null,produto_id uuid not null,
 quantidade numeric(15,3) not null check(quantidade between 0.001 and 1000000),custo_centavos bigint not null check(custo_centavos between 0 and 100000000),
 recebido numeric(15,3) not null default 0,devolvido numeric(15,3) not null default 0,reposto numeric(15,3) not null default 0,
 custo_devolvido_centavos bigint not null default 0,
 foreign key(oficina_id,pedido_id) references public.pedidos_compra(oficina_id,id),foreign key(oficina_id,produto_id) references public.estoque_produtos(oficina_id,item_catalogo_id),
 unique(pedido_id,produto_id),check(recebido between 0 and quantidade),check(reposto between 0 and devolvido),check(devolvido<=recebido+reposto)
);
create index itens_pedido_reposicao on public.itens_pedido_compra(oficina_id,produto_id,pedido_id);
create table public.recebimentos_pedido (
 id uuid primary key,oficina_id uuid not null,pedido_id uuid not null,compra_id uuid references public.compras_estoque(id) deferrable initially deferred,
 tipo text not null check(tipo in ('compra','reposicao','devolucao')),data date not null,itens jsonb not null,assinatura text not null,
 documento text not null default '',motivo text not null default '',cancelado boolean not null default false,
 criado_em timestamptz not null default now(),autor uuid not null,
 foreign key(oficina_id,pedido_id) references public.pedidos_compra(oficina_id,id)
);
create index recebimentos_pedido_pai on public.recebimentos_pedido(oficina_id,pedido_id,criado_em desc,id);
create unique index recebimentos_compra on public.recebimentos_pedido(compra_id) where compra_id is not null;
alter table public.movimentacoes_estoque add column pedido_id uuid references public.pedidos_compra(id),add column recebimento_id uuid references public.recebimentos_pedido(id);
alter table public.pedidos_compra enable row level security;
alter table public.itens_pedido_compra enable row level security;
alter table public.recebimentos_pedido enable row level security;
revoke all on public.pedidos_compra,public.itens_pedido_compra,public.recebimentos_pedido from public,anon,authenticated;

create function private.gerencia_compras(w uuid) returns void language plpgsql security definer set search_path='' as $$begin
 perform private.exigir_estoque(w);perform private.exigir_financeiro(w);
end $$;
create function public.salvar_pedido_compra(p_oficina uuid,p_id uuid,p_dados jsonb,p_itens jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare sig text;p public.pedidos_compra;i record;begin
 perform private.gerencia_compras(p_oficina);
 if p_id is null or jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) not between 1 and 100 then raise exception 'Adicione de 1 a 100 produtos ao pedido.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('pedido:'||p_id,0));sig:=md5(p_dados::text||p_itens::text);
 select * into p from public.pedidos_compra where id=p_id;
 if found then if p.oficina_id<>p_oficina or p.assinatura<>sig then raise exception 'Pedido já registrado com outros dados.' using errcode='PT409';end if;return p_id;end if;
 if not exists(select 1 from public.fornecedores where oficina_id=p_oficina and id=(p_dados->>'fornecedor_id')::uuid and arquivado_em is null) then raise exception 'Selecione um fornecedor ativo desta empresa.' using errcode='22023';end if;
 if (select count(distinct x->>'produto_id') from jsonb_array_elements(p_itens)x)<>jsonb_array_length(p_itens) then raise exception 'Não repita produtos no mesmo pedido.' using errcode='22023';end if;
 insert into public.pedidos_compra(id,oficina_id,fornecedor_id,referencia,previsao,condicoes,observacoes,assinatura,autor)
 values(p_id,p_oficina,(p_dados->>'fornecedor_id')::uuid,trim(p_dados->>'referencia'),nullif(p_dados->>'previsao','')::date,coalesce(p_dados->>'condicoes',''),coalesce(p_dados->>'observacoes',''),sig,auth.uid());
 for i in select * from jsonb_to_recordset(p_itens) as x(produto_id uuid,quantidade numeric,custo_centavos bigint) loop
  if i.quantidade is null or i.quantidade<>round(i.quantidade,3) or not exists(select 1 from public.estoque_produtos e join public.itens_catalogo c on c.id=e.item_catalogo_id where e.oficina_id=p_oficina and e.item_catalogo_id=i.produto_id and c.arquivado_em is null and (lower(c.unidade) not in ('un','unid','peca','peça') or i.quantidade=trunc(i.quantidade))) then raise exception 'Confira produto, unidade e quantidade do pedido.' using errcode='22023';end if;
  insert into public.itens_pedido_compra(oficina_id,pedido_id,produto_id,quantidade,custo_centavos) values(p_oficina,p_id,i.produto_id,i.quantidade,i.custo_centavos);
 end loop;
 insert into public.eventos_suprimentos(oficina_id,entidade,tipo,dados,autor) values(p_oficina,p_id,'pedido_criado',jsonb_build_object('itens',p_itens,'dados',p_dados),auth.uid());return p_id;
end $$;

create function private.identificar_movimento_pedido() returns trigger language plpgsql set search_path='' as $$begin
 if new.compra_id is not null then select pedido_id,id into new.pedido_id,new.recebimento_id from public.recebimentos_pedido where oficina_id=new.oficina_id and compra_id=new.compra_id;end if;return new;
end $$;
create trigger identificar_movimento_pedido before insert on public.movimentacoes_estoque for each row execute function private.identificar_movimento_pedido();

create function public.receber_pedido_compra(p_oficina uuid,p_pedido uuid,p_chave uuid,p_revisao integer,p_tipo text,p_data date,p_vencimento date,p_documento text,p_itens jsonb,p_motivo text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare p public.pedidos_compra;r public.recebimentos_pedido;j jsonb;i public.itens_pedido_compra;e public.estoque_produtos;
 sig text;q numeric;recusa numeric;itens_compra jsonb:='[]';m uuid;custo bigint;ids uuid[];n int;doc_compra text;begin
 perform private.gerencia_compras(p_oficina);
 select * into p from public.pedidos_compra where oficina_id=p_oficina and id=p_pedido for update;
 if not found then raise exception 'Pedido indisponível.' using errcode='42501';end if;
 sig:=md5(jsonb_build_array(p_pedido,p_tipo,p_data,p_vencimento,p_documento,p_itens,p_motivo)::text);
 select * into r from public.recebimentos_pedido where id=p_chave;
 if found then if r.oficina_id<>p_oficina or r.assinatura<>sig then raise exception 'Envio já utilizado com outros dados.' using errcode='PT409';end if;return r.id;end if;
 if p.cancelado or p.revisao is distinct from p_revisao then raise exception 'Pedido encerrado ou alterado. Atualize a tela.' using errcode='PT409';end if;
 if p_tipo is null or p_tipo not in ('compra','reposicao','devolucao') or p_data is null or not isfinite(p_data) or p_data>(now() at time zone 'America/Sao_Paulo')::date or p_data<date '2000-01-01' or jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) not between 1 and 100 or length(coalesce(p_documento,''))>160 or length(coalesce(p_motivo,''))>1000 then raise exception 'Confira a data e os itens da entrega.' using errcode='22023';end if;
 if p_tipo='devolucao' and length(trim(coalesce(p_motivo,'')))<3 then raise exception 'Informe o motivo da devolução para reposição.' using errcode='22023';end if;
 if (select count(distinct x->>'item_id') from jsonb_array_elements(p_itens)x)<>jsonb_array_length(p_itens) then raise exception 'Item repetido no recebimento.' using errcode='22023';end if;
 perform 1 from public.estoque_produtos where oficina_id=p_oficina and item_catalogo_id in(select produto_id from public.itens_pedido_compra where pedido_id=p_pedido) order by item_catalogo_id for update;
 for j in select value from jsonb_array_elements(p_itens) loop
  select * into i from public.itens_pedido_compra where oficina_id=p_oficina and pedido_id=p_pedido and id=(j->>'item_id')::uuid;
  if not found then raise exception 'Item não pertence ao pedido.' using errcode='42501';end if;
  q:=coalesce((j->>'quantidade')::numeric,0);recusa:=coalesce((j->>'recusado')::numeric,0);
  if q<0 or recusa<0 or q+recusa<=0 or q<>round(q,3) or recusa<>round(recusa,3) or q+recusa>(case p_tipo when 'compra' then i.quantidade-i.recebido when 'reposicao' then i.devolvido-i.reposto else i.recebido-i.devolvido+i.reposto end) or (p_tipo='devolucao' and recusa>0) then raise exception 'Quantidade maior que o saldo pendente ou inválida.' using errcode='22023';end if;
  if recusa>0 and length(trim(coalesce(p_motivo,'')))<3 then raise exception 'Informe o motivo dos itens recusados.' using errcode='22023';end if;
  if exists(select 1 from public.itens_catalogo where id=i.produto_id and lower(unidade) in ('un','unid','peca','peça')) and (q<>trunc(q) or recusa<>trunc(recusa)) then raise exception 'Use quantidade inteira para produtos em unidades.' using errcode='22023';end if;
  select * into e from public.estoque_produtos where oficina_id=p_oficina and item_catalogo_id=i.produto_id;
  if e.rastreado and q>0 and (jsonb_typeof(j->'unidades') is distinct from 'array' or jsonb_array_length(j->'unidades')<>q) then raise exception 'Informe a série ou IMEI de cada unidade aceita ou devolvida.' using errcode='22023';end if;
  custo:=coalesce((j->>'custo_centavos')::bigint,i.custo_centavos);
  if custo<0 or custo>100000000 then raise exception 'Custo inválido.' using errcode='22023';end if;
  if p_tipo='compra' and q>0 then itens_compra:=itens_compra||jsonb_build_array(jsonb_build_object('produto_id',i.produto_id,'quantidade',q,'custo_centavos',custo));end if;
 end loop;
 insert into public.recebimentos_pedido(id,oficina_id,pedido_id,compra_id,tipo,data,itens,assinatura,documento,motivo,autor)
 values(p_chave,p_oficina,p_pedido,case when jsonb_array_length(itens_compra)>0 then p_chave end,p_tipo,p_data,p_itens,sig,coalesce(p_documento,''),coalesce(p_motivo,''),auth.uid());
 if jsonb_array_length(itens_compra)>0 then
  doc_compra:=trim(coalesce(p_documento,''));
  if length(doc_compra)>100 then raise exception 'Use até 100 caracteres para o documento.' using errcode='22023';end if;
  if doc_compra<>'' then
   perform pg_advisory_xact_lock(hashtextextended('compra-documento:'||p_oficina||p.fornecedor_id||doc_compra,0));
   if exists(select 1 from public.recebimentos_pedido rp join public.pedidos_compra pc on pc.id=rp.pedido_id where rp.oficina_id=p_oficina and pc.fornecedor_id=p.fornecedor_id and trim(rp.documento)=doc_compra and rp.pedido_id<>p_pedido and rp.compra_id is not null and not rp.cancelado) then raise exception 'Este documento já foi recebido em outro pedido do fornecedor.' using errcode='22023';end if;
   if exists(select 1 from public.compras_estoque where oficina_id=p_oficina and fornecedor_id=p.fornecedor_id and documento=doc_compra and cancelado_em is null) then
    if not exists(select 1 from public.compras_estoque c join public.recebimentos_pedido rp on rp.compra_id=c.id where c.oficina_id=p_oficina and c.fornecedor_id=p.fornecedor_id and c.documento=doc_compra and c.cancelado_em is null and rp.pedido_id=p_pedido) then raise exception 'Este documento já está registrado nas compras do fornecedor.' using errcode='22023';end if;
    doc_compra:=left(doc_compra,54)||' / entrega '||replace(p_chave::text,'-','');
   end if;
  end if;
  perform public.registrar_compra_estoque(p_oficina,p_chave,p.fornecedor_id,p_data,p_vencimento,doc_compra,'Recebimento parcial/integral do pedido '||p.referencia,itens_compra,0,'banco','outro');
 end if;
 for j in select value from jsonb_array_elements(p_itens) loop
  q:=coalesce((j->>'quantidade')::numeric,0);if q=0 then continue;end if;
  select * into i from public.itens_pedido_compra where id=(j->>'item_id')::uuid;
  select * into e from public.estoque_produtos where oficina_id=p_oficina and item_catalogo_id=i.produto_id;
  if p_tipo='compra' then
   select id into m from public.movimentacoes_estoque where compra_id=p_chave and item_catalogo_id=i.produto_id and tipo='entrada';
   if e.rastreado then perform private.inserir_unidades_compra(p_oficina,i.produto_id,m,j->'unidades');end if;
   update public.itens_pedido_compra set recebido=recebido+q where id=i.id;
  elsif p_tipo='devolucao' then
   if q>e.saldo-e.reservado then raise exception 'A devolução atingiria unidades reservadas ou indisponíveis.' using errcode='22023';end if;
   if e.rastreado then
    select array_agg(x::uuid) into ids from jsonb_array_elements_text(j->'unidades')x;
    select count(*) into n from public.unidades_estoque u join public.movimentacoes_estoque ent on ent.id=u.entrada_id where u.oficina_id=p_oficina and u.produto_id=i.produto_id and u.estado='estoque' and u.reserva_id is null and u.id=any(ids) and ent.pedido_id=p_pedido;
    if n<>q then raise exception 'Selecione unidades disponíveis recebidas neste pedido.' using errcode='22023';end if;
   end if;
   update public.estoque_produtos set saldo=saldo-q,revisao=revisao+1 where oficina_id=p_oficina and item_catalogo_id=i.produto_id;
   insert into public.movimentacoes_estoque(oficina_id,item_catalogo_id,tipo,quantidade,saldo_apos,custo_centavos,motivo,documento,chave,criado_por,pedido_id,recebimento_id)
   values(p_oficina,i.produto_id,'saida',-q,e.saldo-q,e.custo_centavos,'Devolução para reposição: '||p_motivo,p_documento,gen_random_uuid(),auth.uid(),p_pedido,p_chave) returning id into m;
   if e.rastreado then update public.unidades_estoque set estado='saida',movimento_id=m,revisao=revisao+1 where id=any(ids);end if;
   update public.itens_pedido_compra set devolvido=devolvido+q,custo_devolvido_centavos=custo_devolvido_centavos+round(q*e.custo_centavos) where id=i.id;
  else
   custo:=round(i.custo_devolvido_centavos/i.devolvido);
   update public.estoque_produtos set saldo=saldo+q,custo_centavos=round((saldo*custo_centavos+q*custo)/(saldo+q)),revisao=revisao+1 where oficina_id=p_oficina and item_catalogo_id=i.produto_id;
   insert into public.movimentacoes_estoque(oficina_id,item_catalogo_id,tipo,quantidade,saldo_apos,custo_centavos,motivo,documento,chave,criado_por,pedido_id,recebimento_id)
   values(p_oficina,i.produto_id,'entrada',q,e.saldo+q,custo,'Reposição do fornecedor sem nova cobrança',p_documento,gen_random_uuid(),auth.uid(),p_pedido,p_chave) returning id into m;
   if e.rastreado then perform private.inserir_unidades_compra(p_oficina,i.produto_id,m,j->'unidades');end if;
   update public.itens_pedido_compra set reposto=reposto+q where id=i.id;
  end if;
 end loop;
 update public.pedidos_compra set revisao=revisao+1 where id=p_pedido;
 insert into public.eventos_suprimentos(oficina_id,entidade,tipo,dados,autor) values(p_oficina,p_pedido,p_tipo,jsonb_build_object('recebimento',p_chave,'itens',p_itens,'motivo',p_motivo),auth.uid());
 return p_chave;
end $$;

-- Cancelar uma compra recebida reabre o saldo do pedido na mesma transação.
-- Uma unidade devolvida pode voltar reparada com a mesma série, sem perder seu histórico.
create or replace function private.inserir_unidades_compra(w uuid,p uuid,m uuid,lista jsonb) returns void language plpgsql set search_path='' as $$
declare u jsonb;anterior public.unidades_estoque;v_serie text;v_imei text;begin
 if jsonb_typeof(lista) is distinct from 'array' or jsonb_array_length(lista)>2000 then raise exception 'Informe até 2.000 séries por entrada.' using errcode='22023';end if;
 for u in select value from jsonb_array_elements(lista) loop
  v_serie:=trim(coalesce(nullif(u->>'serie',''),u->>'imei'));v_imei:=nullif(regexp_replace(coalesce(u->>'imei',''),'[^0-9]','','g'),'');
  select * into anterior from public.unidades_estoque x where x.oficina_id=w and lower(x.serie)=lower(v_serie) for update;
  if found then
   if anterior.produto_id<>p or (v_imei is not null and anterior.imei is not null and v_imei<>anterior.imei) or anterior.estado<>'saida' or not exists(select 1 from public.movimentacoes_estoque entrada join public.recebimentos_pedido ent on ent.id=entrada.recebimento_id join public.movimentacoes_estoque saida on saida.id=anterior.movimento_id join public.recebimentos_pedido dev on dev.id=saida.recebimento_id where entrada.id=m and ent.tipo='reposicao' and dev.tipo='devolucao' and ent.pedido_id=dev.pedido_id) then raise exception 'Série já cadastrada. Só é possível receber novamente uma unidade devolvida deste pedido para reposição.' using errcode='22023';end if;
   update public.unidades_estoque set estado='estoque',reserva_id=null,entrada_id=m,movimento_id=m,imei=coalesce(anterior.imei,v_imei),revisao=revisao+1 where id=anterior.id;
  else
   insert into public.unidades_estoque(oficina_id,produto_id,serie,imei,entrada_id,movimento_id) values(w,p,v_serie,v_imei,m,m);
  end if;
 end loop;
end $$;
create function private.reabrir_pedido_compra_cancelada() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.recebimentos_pedido;j jsonb;begin
 if new.cancelado_em is not null and old.cancelado_em is null then
  select * into r from public.recebimentos_pedido where oficina_id=new.oficina_id and compra_id=new.id;
  if found then
   perform 1 from public.pedidos_compra where id=r.pedido_id for update;
   for j in select value from jsonb_array_elements(r.itens) loop
    update public.itens_pedido_compra set recebido=recebido-coalesce((j->>'quantidade')::numeric,0) where id=(j->>'item_id')::uuid;
   end loop;
   update public.recebimentos_pedido set cancelado=true where id=r.id;
   update public.pedidos_compra set revisao=revisao+1 where id=r.pedido_id;
  end if;
 end if;return new;
end $$;
create trigger reabrir_pedido_compra_cancelada after update on public.compras_estoque for each row execute function private.reabrir_pedido_compra_cancelada();

create function public.encerrar_pedido_compra(p_oficina uuid,p_pedido uuid,p_revisao integer,p_motivo text) returns void language plpgsql security definer set search_path='' as $$begin
 perform private.gerencia_compras(p_oficina);
 if length(trim(coalesce(p_motivo,''))) not between 3 and 1000 then raise exception 'Informe o motivo para encerrar o saldo pendente.' using errcode='22023';end if;
 update public.pedidos_compra set cancelado=true,motivo_cancelamento=trim(p_motivo),revisao=revisao+1 where oficina_id=p_oficina and id=p_pedido and revisao=p_revisao and not cancelado;
 if not found then raise exception 'Pedido alterado. Atualize a tela.' using errcode='PT409';end if;
 insert into public.eventos_suprimentos(oficina_id,entidade,tipo,dados,autor) values(p_oficina,p_pedido,'saldo_encerrado',jsonb_build_object('motivo',p_motivo),auth.uid());
end $$;

create function public.consultar_pedidos_compra(p_oficina uuid,p_busca text default '',p_pagina integer default 0,p_pedido uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;begin
 perform private.gerencia_compras(p_oficina);
 if p_pagina is null or p_pagina not between 0 and 10000 then raise exception 'Página inválida.' using errcode='22023';end if;
 if p_pedido is not null then
  select to_jsonb(p)||jsonb_build_object('fornecedor',f.nome,'itens',(select coalesce(jsonb_agg(to_jsonb(i)||jsonb_build_object('descricao',c.descricao,'unidade',c.unidade,'rastreado',e.rastreado,'pendente',i.quantidade-i.recebido+i.devolvido-i.reposto) order by c.descricao),'[]') from public.itens_pedido_compra i join public.itens_catalogo c on c.id=i.produto_id join public.estoque_produtos e on e.oficina_id=i.oficina_id and e.item_catalogo_id=i.produto_id where i.pedido_id=p.id),'entregas',(select coalesce(jsonb_agg(to_jsonb(x) order by criado_em desc,id desc),'[]') from (select * from public.recebimentos_pedido where pedido_id=p.id order by criado_em desc,id desc limit 30 offset p_pagina*30)x),'total_entregas',(select count(*) from public.recebimentos_pedido where pedido_id=p.id)) into r
  from public.pedidos_compra p join public.fornecedores f on f.id=p.fornecedor_id where p.oficina_id=p_oficina and p.id=p_pedido;
  if r is null then raise exception 'Pedido indisponível.' using errcode='42501';end if;return r;
 end if;
 with p as (select p.*,f.nome fornecedor,(select count(*) from public.itens_pedido_compra where pedido_id=p.id and quantidade-recebido+devolvido-reposto>0) pendente,(select sum(round(quantidade*custo_centavos)) from public.itens_pedido_compra where pedido_id=p.id) total_centavos from public.pedidos_compra p join public.fornecedores f on f.id=p.fornecedor_id where p.oficina_id=p_oficina and concat(p.referencia,' ',f.nome) ilike '%'||left(coalesce(p_busca,''),100)||'%')
 select jsonb_build_object('total',(select count(*) from p),'itens',(select coalesce(jsonb_agg(to_jsonb(x) order by criado_em desc,id desc),'[]') from (select * from p order by criado_em desc,id desc limit 30 offset p_pagina*30)x)) into r;return r;
end $$;

-- Devoluções para reposição pertencem ao pedido; não podem ser estornadas fora desse histórico.
create function private.proteger_movimento_pedido() returns trigger language plpgsql set search_path='' as $$begin
 if new.estorno_de is not null and exists(select 1 from public.movimentacoes_estoque where id=new.estorno_de and recebimento_id is not null and compra_id is null) then raise exception 'Este movimento é uma devolução ou reposição de pedido. Confira o saldo no pedido de compra.' using errcode='22023';end if;return new;
end $$;
create trigger proteger_movimento_pedido before insert on public.movimentacoes_estoque for each row execute function private.proteger_movimento_pedido();

create function public.sugerir_compras_estoque(p_oficina uuid,p_busca text default '',p_pagina int default 0,p_dias int default 90) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;begin
 perform private.gerencia_compras(p_oficina);
 if p_dias is null or p_dias not between 7 and 365 or p_pagina is null or p_pagina not between 0 and 10000 then raise exception 'Confira o período de consumo.' using errcode='22023';end if;
 with produtos as materialized (
 select e.*,c.descricao,c.unidade,f.nome fornecedor_nome,
 coalesce((select greatest(0,sum(case when m.quantidade<0 then -m.quantidade else -m.quantidade end)) from public.movimentacoes_estoque m left join public.movimentacoes_estoque original on original.id=m.estorno_de where m.oficina_id=e.oficina_id and m.item_catalogo_id=e.item_catalogo_id and m.criado_em>=now()-make_interval(days=>p_dias) and ((m.tipo in ('consumo_os','saida') and m.recebimento_id is null) or (original.tipo in ('consumo_os','saida') and original.recebimento_id is null))),0) consumo,
 coalesce((select sum(i.quantidade-i.recebido+i.devolvido-i.reposto) from public.itens_pedido_compra i join public.pedidos_compra p on p.id=i.pedido_id where i.oficina_id=e.oficina_id and i.produto_id=e.item_catalogo_id and not p.cancelado),0) em_pedidos
 from public.estoque_produtos e join public.itens_catalogo c on c.id=e.item_catalogo_id left join public.fornecedores f on f.id=e.fornecedor_id where e.oficina_id=p_oficina and c.arquivado_em is null and concat(c.descricao,' ',e.codigo) ilike '%'||left(coalesce(p_busca,''),100)||'%'
 ), calculo as (
 select *,saldo-reservado disponivel,consumo/p_dias media_diaria,greatest(minimo,consumo/p_dias*prazo_reposicao_dias+seguranca) ponto_pedido,
 greatest(0,greatest(minimo,consumo/p_dias*(prazo_reposicao_dias+cobertura_dias)+seguranca)-(saldo-reservado+em_pedidos)) necessidade from produtos
 ), final as (
 select *,case when saldo-reservado+em_pedidos<=ponto_pedido then case when lower(unidade) in ('un','unid','peca','peça') then ceil(necessidade) else ceil(necessidade*1000)/1000 end else 0 end sugerido from calculo
 ) select jsonb_build_object('dias',p_dias,'total',(select count(*) from final),'itens',(select coalesce(jsonb_agg(to_jsonb(x) order by sugerido desc,descricao,item_catalogo_id),'[]') from (select * from final order by sugerido desc,descricao,item_catalogo_id limit 30 offset p_pagina*30)x)) into r;return r;
end $$;
create index estoque_movimento_reposicao on public.movimentacoes_estoque(oficina_id,item_catalogo_id,criado_em) include(tipo,quantidade,estorno_de,recebimento_id);

do $$declare f record;begin
 for f in select p.oid::regprocedure assinatura,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='public' and p.proname in ('salvar_pedido_compra','receber_pedido_compra','encerrar_pedido_compra','consultar_pedidos_compra','sugerir_compras_estoque')) or (n.nspname='private' and p.proname in ('gerencia_compras','identificar_movimento_pedido','reabrir_pedido_compra_cancelada','proteger_movimento_pedido')) loop
 execute format('revoke all on function %s from public,anon,authenticated',f.assinatura);if f.nspname='public' then execute format('grant execute on function %s to authenticated',f.assinatura);end if;
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
