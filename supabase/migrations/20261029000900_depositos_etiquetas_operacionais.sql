begin;

create table public.depositos_estoque (
 id uuid primary key default gen_random_uuid(), oficina_id uuid not null references public.oficinas(id),
 nome text not null check(length(trim(nome)) between 2 and 100), tipo text not null default 'deposito' check(tipo in ('deposito','veiculo')),
 identificacao text not null default '' check(length(identificacao)<=100), ativo boolean not null default true,
 padrao boolean not null default false, revisao integer not null default 1, unique(oficina_id,id), check(not padrao or ativo)
);
create unique index deposito_padrao_empresa on public.depositos_estoque(oficina_id) where padrao;
create unique index deposito_nome_empresa on public.depositos_estoque(oficina_id,lower(trim(nome)));
insert into public.depositos_estoque(oficina_id,nome,padrao) select id,'Estoque principal',true from public.oficinas;
create function private.criar_deposito_padrao() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into public.depositos_estoque(oficina_id,nome,padrao) values(new.id,'Estoque principal',true);return new;
end $$;
create trigger criar_deposito_padrao after insert on public.oficinas for each row execute function private.criar_deposito_padrao();
create function private.deposito_padrao(w uuid) returns uuid language sql stable set search_path='' as $$select id from public.depositos_estoque where oficina_id=w and padrao$$;
create function private.exigir_deposito(w uuid,d uuid) returns uuid language plpgsql set search_path='' as $$declare escolhido uuid:=coalesce(d,private.deposito_padrao(w));begin
 if not exists(select 1 from public.depositos_estoque where oficina_id=w and id=escolhido and ativo) then raise exception 'Escolha um depósito ou veículo ativo desta empresa.' using errcode='22023';end if;return escolhido;
end $$;

create table public.saldos_deposito (
 oficina_id uuid not null,produto_id uuid not null,deposito_id uuid not null,saldo numeric(15,3) not null default 0 check(saldo>=0),reservado numeric(15,3) not null default 0 check(reservado>=0),
 primary key(oficina_id,produto_id,deposito_id), foreign key(oficina_id,produto_id) references public.estoque_produtos(oficina_id,item_catalogo_id),foreign key(oficina_id,deposito_id) references public.depositos_estoque(oficina_id,id)
);
insert into public.saldos_deposito select oficina_id,item_catalogo_id,private.deposito_padrao(oficina_id),saldo,reservado from public.estoque_produtos;
create index saldos_deposito_local on public.saldos_deposito(oficina_id,deposito_id,produto_id);
alter table public.reservas_estoque add column deposito_id uuid references public.depositos_estoque(id);
alter table public.unidades_estoque add column deposito_id uuid references public.depositos_estoque(id);
create index unidades_deposito on public.unidades_estoque(oficina_id,produto_id,deposito_id,estado);
create table public.alocacoes_movimento_estoque (
 movimento_id uuid not null references public.movimentacoes_estoque(id) deferrable initially deferred,
 oficina_id uuid not null,produto_id uuid not null,deposito_id uuid not null,quantidade numeric(15,3) not null check(quantidade<>0),
 primary key(movimento_id,deposito_id),foreign key(oficina_id,produto_id,deposito_id) references public.saldos_deposito(oficina_id,produto_id,deposito_id)
);
create trigger alocacoes_estoque_imutaveis before update or delete on public.alocacoes_movimento_estoque for each row execute function private.reject_mutation();
create table public.transferencias_estoque (
 id uuid primary key,oficina_id uuid not null,produto_id uuid not null,origem uuid not null,destino uuid not null,quantidade numeric(15,3) not null check(quantidade>0),unidades uuid[] not null default '{}',
 motivo text not null check(length(trim(motivo)) between 3 and 1000),criado_em timestamptz not null default now(),autor uuid not null,assinatura text not null,
 check(origem<>destino),foreign key(oficina_id,produto_id) references public.estoque_produtos(oficina_id,item_catalogo_id),foreign key(oficina_id,origem) references public.depositos_estoque(oficina_id,id),foreign key(oficina_id,destino) references public.depositos_estoque(oficina_id,id)
);
create index transferencias_estoque_empresa on public.transferencias_estoque(oficina_id,criado_em desc,id);
create trigger transferencias_estoque_imutaveis before update or delete on public.transferencias_estoque for each row execute function private.reject_mutation();

-- Todas as saídas continuam no extrato único. A alocação conserva a origem até o estorno.
create function private.alocar_saldo_deposito(w uuid,p uuid,d uuid,m uuid,q numeric) returns void language plpgsql set search_path='' as $$begin
 perform private.exigir_deposito(w,d);
 insert into public.saldos_deposito(oficina_id,produto_id,deposito_id) values(w,p,d) on conflict do nothing;
 if exists(select 1 from public.saldos_deposito where oficina_id=w and produto_id=p and deposito_id=d and saldo+q<0) then raise exception 'Saldo insuficiente no depósito selecionado. Transfira ou receba o produto nesse local.' using errcode='22023';end if;
 update public.saldos_deposito set saldo=saldo+q where oficina_id=w and produto_id=p and deposito_id=d;
 insert into public.alocacoes_movimento_estoque values(m,w,p,d,q);
end $$;
create function private.alocar_movimento_depositos() returns trigger language plpgsql security definer set search_path='' as $$
declare d uuid;faltante numeric;r record;alocado numeric:=0;alocacoes jsonb:='{}';k text;begin
 perform 1 from public.estoque_produtos where oficina_id=new.oficina_id and item_catalogo_id=new.item_catalogo_id for update;
 d:=private.exigir_deposito(new.oficina_id,nullif(current_setting('patio.deposito',true),'')::uuid);
 if new.estorno_de is not null then
  for r in select deposito_id,quantidade from public.alocacoes_movimento_estoque where movimento_id=new.estorno_de loop
   perform private.alocar_saldo_deposito(new.oficina_id,new.item_catalogo_id,r.deposito_id,new.id,-r.quantidade);alocado:=alocado-r.quantidade;
  end loop;
  if alocado<>0 then return new;end if;
  -- Movimentos anteriores a esta migração pertencem ao estoque principal.
  d:=private.deposito_padrao(new.oficina_id);
 end if;
 if new.quantidade<0 and new.estorno_de is null and (new.item_os_id is not null or new.atendimento_id is not null) then
  faltante:=-new.quantidade;
  for r in select coalesce(deposito_id,private.deposito_padrao(oficina_id)) deposito,sum(quantidade) q from public.reservas_estoque
   where oficina_id=new.oficina_id and produto_id=new.item_catalogo_id and ((ramo_documento='os' and item_id=new.item_os_id) or (ramo_documento='atendimento' and documento=new.atendimento_id)) group by 1 loop
   if r.q>faltante then raise exception 'A reserva supera o consumo. Confira os materiais antes de concluir.' using errcode='22023';end if;
   alocacoes:=alocacoes||jsonb_build_object(r.deposito::text,-r.q);faltante:=faltante-r.q;
  end loop;
  if faltante>0 then alocacoes:=jsonb_set(alocacoes,array[d::text],to_jsonb(coalesce((alocacoes->>d::text)::numeric,0)-faltante));end if;
  for k in select jsonb_object_keys(alocacoes) loop perform private.alocar_saldo_deposito(new.oficina_id,new.item_catalogo_id,k::uuid,new.id,(alocacoes->>k)::numeric);end loop;
 else perform private.alocar_saldo_deposito(new.oficina_id,new.item_catalogo_id,d,new.id,new.quantidade);end if;
 return new;
end $$;
create trigger zz_alocar_movimento_depositos before insert on public.movimentacoes_estoque for each row execute function private.alocar_movimento_depositos();
create function private.identificar_deposito_reserva() returns trigger language plpgsql set search_path='' as $$begin
 new.deposito_id:=private.exigir_deposito(new.oficina_id,coalesce(nullif(current_setting('patio.deposito',true),'')::uuid,new.deposito_id));return new;
end $$;
create trigger identificar_deposito_reserva before insert or update on public.reservas_estoque for each row execute function private.identificar_deposito_reserva();
create function private.reservar_saldo_deposito() returns trigger language plpgsql security definer set search_path='' as $$declare d uuid;begin
 if tg_op<>'INSERT' then d:=coalesce(old.deposito_id,private.deposito_padrao(old.oficina_id));update public.saldos_deposito set reservado=reservado-old.quantidade where oficina_id=old.oficina_id and produto_id=old.produto_id and deposito_id=d;end if;
 if tg_op<>'DELETE' then
  insert into public.saldos_deposito(oficina_id,produto_id,deposito_id,reservado) values(new.oficina_id,new.produto_id,new.deposito_id,new.quantidade)
  on conflict(oficina_id,produto_id,deposito_id) do update set reservado=saldos_deposito.reservado+excluded.reservado;
 end if;return null;
end $$;
create trigger reservar_saldo_deposito after insert or update or delete on public.reservas_estoque for each row execute function private.reservar_saldo_deposito();
create function private.identificar_deposito_unidade() returns trigger language plpgsql set search_path='' as $$declare d uuid;begin
 if tg_op='INSERT' or new.movimento_id is distinct from old.movimento_id then
  select deposito_id into d from public.alocacoes_movimento_estoque where movimento_id=new.movimento_id and deposito_id=coalesce(new.deposito_id,private.deposito_padrao(new.oficina_id));
  if d is null then select deposito_id into d from public.alocacoes_movimento_estoque where movimento_id=new.movimento_id order by deposito_id limit 1;end if;
  new.deposito_id:=coalesce(d,new.deposito_id,private.deposito_padrao(new.oficina_id));
 end if;return new;
end $$;
create trigger identificar_deposito_unidade before insert or update on public.unidades_estoque for each row execute function private.identificar_deposito_unidade();
create function private.conferir_depositos_estoque() returns trigger language plpgsql security definer set search_path='' as $$
declare w uuid;p uuid;e public.estoque_produtos;begin
 w:=new.oficina_id;if tg_table_name='estoque_produtos' then p:=new.item_catalogo_id;else p:=new.produto_id;end if;
 select * into e from public.estoque_produtos where oficina_id=w and item_catalogo_id=p;
 if coalesce((select sum(saldo) from public.saldos_deposito where oficina_id=w and produto_id=p),0)<>e.saldo or coalesce((select sum(reservado) from public.saldos_deposito where oficina_id=w and produto_id=p),0)<>e.reservado then raise exception 'Os saldos dos depósitos não fecham com o estoque. Atualize a operação.' using errcode='22023';end if;
 if exists(select 1 from public.saldos_deposito where oficina_id=w and produto_id=p and reservado>saldo) then raise exception 'O depósito não tem saldo livre para esta operação. Confira as reservas.' using errcode='22023';end if;
 if e.rastreado and exists(select 1 from public.saldos_deposito s where oficina_id=w and produto_id=p and saldo<>(select count(*) from public.unidades_estoque u where u.oficina_id=w and u.produto_id=p and coalesce(u.deposito_id,private.deposito_padrao(w))=s.deposito_id and u.estado='estoque')) then raise exception 'As unidades identificadas não correspondem ao saldo do depósito.' using errcode='22023';end if;
 if exists(select 1 from public.unidades_estoque u join public.reservas_estoque r on r.id=u.reserva_id where u.oficina_id=w and u.produto_id=p and coalesce(u.deposito_id,private.deposito_padrao(w))<>coalesce(r.deposito_id,private.deposito_padrao(w))) then raise exception 'Selecione unidades do mesmo depósito da reserva.' using errcode='22023';end if;return null;
end $$;
create constraint trigger conferir_depositos_produto after insert or update on public.estoque_produtos deferrable initially deferred for each row execute function private.conferir_depositos_estoque();
create constraint trigger conferir_depositos_saldo after insert or update on public.saldos_deposito deferrable initially deferred for each row execute function private.conferir_depositos_estoque();
create constraint trigger conferir_depositos_unidade after insert or update on public.unidades_estoque deferrable initially deferred for each row execute function private.conferir_depositos_estoque();

create function public.salvar_deposito_estoque(p_oficina uuid,p_id uuid,p_dados jsonb,p_revisao integer default null) returns uuid language plpgsql security definer set search_path='' as $$declare d public.depositos_estoque;begin
 perform private.exigir_estoque(p_oficina);perform 1 from public.oficinas where id=p_oficina for update;
 select * into d from public.depositos_estoque where id=p_id;
 if found and (d.oficina_id<>p_oficina or d.revisao is distinct from p_revisao) then raise exception 'Depósito alterado. Atualize a tela.' using errcode='PT409';end if;
 if coalesce((p_dados->>'ativo')::boolean,true)=false and (d.padrao or exists(select 1 from public.saldos_deposito where deposito_id=p_id and (saldo>0 or reservado>0))) then raise exception 'Transfira o saldo antes de desativar. O estoque principal deve permanecer ativo.' using errcode='22023';end if;
 insert into public.depositos_estoque(id,oficina_id,nome,tipo,identificacao,ativo) values(p_id,p_oficina,trim(p_dados->>'nome'),coalesce(p_dados->>'tipo','deposito'),coalesce(p_dados->>'identificacao',''),coalesce((p_dados->>'ativo')::boolean,true))
 on conflict(id) do update set nome=excluded.nome,tipo=excluded.tipo,identificacao=excluded.identificacao,ativo=excluded.ativo,revisao=depositos_estoque.revisao+1;
 insert into public.eventos_suprimentos(oficina_id,entidade,tipo,dados,autor) values(p_oficina,p_id,'deposito_salvo',p_dados,auth.uid());return p_id;
end $$;
create function public.consultar_depositos_estoque(p_oficina uuid,p_produto uuid default null,p_busca text default '',p_pagina integer default 0,p_deposito uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$declare r jsonb;begin
 perform private.exigir_estoque(p_oficina);if p_pagina is null or p_pagina not between 0 and 10000 then raise exception 'Página inválida.' using errcode='22023';end if;
 with linhas as (select d.*,coalesce(s.saldo,0) saldo,coalesce(s.reservado,0) reservado,coalesce(s.saldo-s.reservado,0) disponivel from public.depositos_estoque d left join public.saldos_deposito s on s.deposito_id=d.id and s.produto_id=p_produto where d.oficina_id=p_oficina and d.nome ilike '%'||left(coalesce(p_busca,''),100)||'%')
 select jsonb_build_object('total',(select count(*) from linhas),'padrao',private.deposito_padrao(p_oficina),'itens',(select coalesce(jsonb_agg(to_jsonb(x) order by padrao desc,nome,id),'[]') from (select * from linhas order by padrao desc,nome,id limit 30 offset p_pagina*30)x)) into r;
 if p_deposito is not null then
  perform private.exigir_deposito(p_oficina,p_deposito);
  r:=r||jsonb_build_object('produtos',(select coalesce(jsonb_agg(to_jsonb(x) order by descricao,id),'[]') from (select c.id,c.descricao,c.unidade,s.saldo,s.reservado,s.saldo-s.reservado disponivel,e.revisao,e.rastreado from public.saldos_deposito s join public.itens_catalogo c on c.id=s.produto_id join public.estoque_produtos e on e.oficina_id=s.oficina_id and e.item_catalogo_id=s.produto_id where s.oficina_id=p_oficina and s.deposito_id=p_deposito and (s.saldo>0 or s.reservado>0) and c.descricao ilike '%'||left(coalesce(p_busca,''),100)||'%' order by c.descricao,c.id limit 30 offset p_pagina*30)x),'total_produtos',(select count(*) from public.saldos_deposito s join public.itens_catalogo c on c.id=s.produto_id where s.oficina_id=p_oficina and s.deposito_id=p_deposito and (s.saldo>0 or s.reservado>0) and c.descricao ilike '%'||left(coalesce(p_busca,''),100)||'%'));
 end if;return r;
end $$;
create function public.transferir_estoque(p_oficina uuid,p_id uuid,p_produto uuid,p_origem uuid,p_destino uuid,p_quantidade numeric,p_revisao integer,p_unidades uuid[] default '{}',p_motivo text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare e public.estoque_produtos;t public.transferencias_estoque;sig text;ids uuid[];begin
 perform private.exigir_estoque(p_oficina);perform pg_advisory_xact_lock(hashtextextended('transferencia:'||p_id,0));
 select coalesce(array_agg(x order by x),'{}') into ids from(select distinct unnest(p_unidades)x)x;
 sig:=md5(jsonb_build_array(p_produto,p_origem,p_destino,p_quantidade,ids,p_motivo)::text);select * into t from public.transferencias_estoque where id=p_id;
 if found then if t.oficina_id<>p_oficina or t.assinatura<>sig then raise exception 'Transferência já registrada com outros dados.' using errcode='PT409';end if;return t.id;end if;
 perform private.exigir_deposito(p_oficina,p_origem);perform private.exigir_deposito(p_oficina,p_destino);
 select * into e from public.estoque_produtos where oficina_id=p_oficina and item_catalogo_id=p_produto for update;
 if not found or e.revisao is distinct from p_revisao then raise exception 'Produto alterado. Atualize a tela.' using errcode='PT409';end if;
 if p_quantidade is null or p_quantidade<=0 or p_quantidade<>round(p_quantidade,3) or p_origem is null or p_destino is null or p_origem=p_destino or coalesce((select saldo-reservado from public.saldos_deposito where oficina_id=p_oficina and produto_id=p_produto and deposito_id=p_origem),0)<p_quantidade then raise exception 'Confira a origem, destino e o saldo livre para transferir.' using errcode='22023';end if;
 if exists(select 1 from public.itens_catalogo where id=p_produto and lower(unidade) in ('un','unid','peca','peça')) and p_quantidade<>trunc(p_quantidade) then raise exception 'Informe uma quantidade inteira.' using errcode='22023';end if;
 if e.rastreado then
  if cardinality(ids)<>p_quantidade or (select count(*) from public.unidades_estoque where oficina_id=p_oficina and produto_id=p_produto and estado='estoque' and reserva_id is null and coalesce(deposito_id,private.deposito_padrao(p_oficina))=p_origem and id=any(ids))<>p_quantidade then raise exception 'Selecione as unidades livres do depósito de origem.' using errcode='22023';end if;
 elsif cardinality(ids)>0 then raise exception 'Este produto não tem unidades rastreadas.' using errcode='22023';end if;
 update public.saldos_deposito set saldo=saldo-p_quantidade where oficina_id=p_oficina and produto_id=p_produto and deposito_id=p_origem;
 insert into public.saldos_deposito(oficina_id,produto_id,deposito_id,saldo) values(p_oficina,p_produto,p_destino,p_quantidade) on conflict(oficina_id,produto_id,deposito_id) do update set saldo=saldos_deposito.saldo+excluded.saldo;
 update public.unidades_estoque set deposito_id=p_destino,revisao=revisao+1 where id=any(ids);
 update public.estoque_produtos set revisao=revisao+1 where oficina_id=p_oficina and item_catalogo_id=p_produto;
 insert into public.transferencias_estoque(id,oficina_id,produto_id,origem,destino,quantidade,unidades,motivo,autor,assinatura) values(p_id,p_oficina,p_produto,p_origem,p_destino,p_quantidade,ids,trim(p_motivo),auth.uid(),sig);
 insert into public.eventos_suprimentos(oficina_id,entidade,tipo,dados,autor) values(p_oficina,p_produto,'transferencia',jsonb_build_object('id',p_id,'origem',p_origem,'destino',p_destino,'quantidade',p_quantidade,'unidades',ids,'motivo',p_motivo),auth.uid());return p_id;
end $$;
create function public.reservar_estoque_deposito(p_oficina uuid,p_documento uuid,p_ramo text,p_item uuid,p_quantidade numeric,p_revisao integer,p_deposito uuid,p_unidades uuid[] default '{}',p_reserva_revisao integer default null) returns void language plpgsql security definer set search_path='' as $$declare anterior text:=current_setting('patio.deposito',true);begin
 perform private.exigir_estoque(p_oficina);perform set_config('patio.deposito',private.exigir_deposito(p_oficina,p_deposito)::text,true);
 perform public.reservar_estoque_atendimento(p_oficina,p_documento,p_ramo,p_item,p_quantidade,p_revisao,p_unidades,p_reserva_revisao);perform set_config('patio.deposito',coalesce(anterior,''),true);
end $$;
create function public.receber_pedido_deposito(p_oficina uuid,p_pedido uuid,p_chave uuid,p_revisao integer,p_tipo text,p_data date,p_vencimento date,p_documento text,p_itens jsonb,p_deposito uuid,p_motivo text default '') returns uuid language plpgsql security definer set search_path='' as $$declare anterior text:=current_setting('patio.deposito',true);r uuid;d uuid;begin
 perform private.gerencia_compras(p_oficina);d:=private.exigir_deposito(p_oficina,p_deposito);
 if exists(select 1 from public.alocacoes_movimento_estoque a join public.movimentacoes_estoque m on m.id=a.movimento_id where m.recebimento_id=p_chave and (a.oficina_id<>p_oficina or a.deposito_id<>d)) then raise exception 'Entrega já registrada em outro depósito.' using errcode='PT409';end if;
 perform set_config('patio.deposito',d::text,true);r:=public.receber_pedido_compra(p_oficina,p_pedido,p_chave,p_revisao,p_tipo,p_data,p_vencimento,p_documento,p_itens,p_motivo);perform set_config('patio.deposito',coalesce(anterior,''),true);return r;
end $$;
create table public.operacoes_deposito (oficina_id uuid not null references public.oficinas(id),chave uuid not null,assinatura text not null,movimento_id uuid not null references public.movimentacoes_estoque(id),primary key(oficina_id,chave));
alter table public.operacoes_deposito enable row level security;
revoke all on public.operacoes_deposito from public,anon,authenticated;
create function public.movimentar_estoque_deposito(p_oficina uuid,p_produto uuid,p_deposito uuid,p_chave uuid,p_revisao integer,p_tipo text,p_quantidade numeric,p_motivo text,p_unidades jsonb default null,p_documento text default '') returns uuid language plpgsql security definer set search_path='' as $$declare anterior text:=current_setting('patio.deposito',true);r uuid;d uuid;q numeric;sig text;o public.operacoes_deposito;begin
 perform private.exigir_estoque(p_oficina);d:=private.exigir_deposito(p_oficina,p_deposito);
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_chave::text,0));sig:=md5(jsonb_build_array(p_produto,d,p_tipo,p_quantidade,p_motivo,p_unidades,p_documento)::text);
 select * into o from public.operacoes_deposito where oficina_id=p_oficina and chave=p_chave;
 if found then if o.assinatura<>sig then raise exception 'Movimento já registrado com outros dados.' using errcode='PT409';end if;return o.movimento_id;end if;
 if exists(select 1 from public.movimentacoes_estoque where oficina_id=p_oficina and chave=p_chave) then raise exception 'Chave de movimento já utilizada.' using errcode='PT409';end if;
 if exists(select 1 from public.itens_catalogo where id=p_produto and lower(unidade) in ('un','unid','peca','peça')) and p_quantidade<>trunc(p_quantidade) then raise exception 'Use quantidade inteira para produtos em unidades.' using errcode='22023';end if;
 if p_unidades is not null and (jsonb_typeof(p_unidades) is distinct from 'array' or jsonb_array_length(p_unidades) is distinct from p_quantidade) then raise exception 'A quantidade deve corresponder às unidades selecionadas.' using errcode='22023';end if;
 if exists(select 1 from public.alocacoes_movimento_estoque a join public.movimentacoes_estoque m on m.id=a.movimento_id where m.oficina_id=p_oficina and m.chave=p_chave and a.deposito_id<>d) then raise exception 'Movimento já registrado em outro depósito.' using errcode='PT409';end if;
 perform set_config('patio.deposito',d::text,true);
 if p_unidades is not null then r:=public.movimentar_unidades_estoque(p_oficina,p_produto,p_revisao,p_chave,p_tipo,p_unidades,p_motivo);
 else
  perform 1 from public.estoque_produtos where oficina_id=p_oficina and item_catalogo_id=p_produto for update;
  q:=p_quantidade;if p_tipo='ajuste' then select e.saldo+p_quantidade-coalesce(s.saldo,0) into q from public.estoque_produtos e left join public.saldos_deposito s on s.oficina_id=e.oficina_id and s.produto_id=e.item_catalogo_id and s.deposito_id=d where e.oficina_id=p_oficina and e.item_catalogo_id=p_produto;end if;
  r:=public.movimentar_estoque(p_oficina,p_produto,p_tipo,q,p_motivo,p_chave,p_revisao,p_documento);
 end if;perform set_config('patio.deposito',coalesce(anterior,''),true);insert into public.operacoes_deposito values(p_oficina,p_chave,sig,r);return r;
end $$;

-- A repetição da compra precisa conservar o conteúdo, inclusive o local escolhido.
alter table public.compras_estoque add column assinatura_deposito text;
create function public.registrar_compra_deposito(p_oficina uuid,p_id uuid,p_fornecedor uuid,p_data date,p_vencimento date,p_documento text,p_observacoes text,p_itens jsonb,p_pago bigint,p_conta text,p_forma text,p_deposito uuid default null) returns uuid language plpgsql security definer set search_path='' as $$declare anterior text:=current_setting('patio.deposito',true);d uuid;r uuid;sig text;c public.compras_estoque;begin
 perform private.gerencia_compras(p_oficina);d:=private.exigir_deposito(p_oficina,p_deposito);
 perform pg_advisory_xact_lock(hashtextextended('compra-deposito:'||p_id,0));
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_id::text,0));
 sig:=md5(jsonb_build_array(p_fornecedor,p_data,p_vencimento,trim(coalesce(p_documento,'')),coalesce(p_observacoes,''),p_itens,p_pago,p_conta,p_forma,d)::text);
 select * into c from public.compras_estoque where id=p_id;
 if found then
  if c.oficina_id<>p_oficina or c.assinatura_deposito is distinct from sig then raise exception 'Compra já registrada com outros dados. Confira o registro antes de repetir.' using errcode='PT409';end if;
  return c.id;
 end if;
 if exists(select 1 from public.movimentacoes_estoque m left join public.alocacoes_movimento_estoque a on a.movimento_id=m.id where m.compra_id=p_id and (m.oficina_id<>p_oficina or coalesce(a.deposito_id,private.deposito_padrao(p_oficina))<>d)) then raise exception 'Compra já recebida em outro depósito.' using errcode='PT409';end if;
 if exists(select 1 from jsonb_array_elements(p_itens) i join public.itens_catalogo catalogo on catalogo.id=(i->>'produto_id')::uuid and catalogo.oficina_id=p_oficina where lower(catalogo.unidade) in ('un','unid','peça','peca') and (i->>'quantidade')::numeric<>trunc((i->>'quantidade')::numeric)) then raise exception 'Informe quantidades inteiras para produtos vendidos por unidade.' using errcode='22023';end if;
 perform set_config('patio.deposito',d::text,true);r:=public.registrar_compra_estoque(p_oficina,p_id,p_fornecedor,p_data,p_vencimento,p_documento,p_observacoes,p_itens,p_pago,p_conta,p_forma);update public.compras_estoque set assinatura_deposito=sig where id=r;perform set_config('patio.deposito',coalesce(anterior,''),true);return r;
end $$;
revoke all on function public.registrar_compra_deposito(uuid,uuid,uuid,date,date,text,text,jsonb,bigint,text,text,uuid) from public,anon;
grant execute on function public.registrar_compra_deposito(uuid,uuid,uuid,date,date,text,text,jsonb,bigint,text,text,uuid) to authenticated;
-- Identificadores de impressão são estáveis; o código lido nunca executa uma movimentação.
create sequence private.etiqueta_estoque_seq;
create table public.codigos_estoque (
 id uuid primary key default gen_random_uuid(),oficina_id uuid not null,produto_id uuid not null,unidade_id uuid references public.unidades_estoque(id),
 codigo text not null,interno boolean not null default true,criado_em timestamptz not null default now(),
 foreign key(oficina_id,produto_id) references public.estoque_produtos(oficina_id,item_catalogo_id),unique(oficina_id,codigo),check(length(codigo) between 1 and 80)
);
create unique index etiqueta_produto_interna on public.codigos_estoque(oficina_id,produto_id) where interno and unidade_id is null;
create unique index etiqueta_unidade_interna on public.codigos_estoque(oficina_id,unidade_id) where interno and unidade_id is not null;
create index estoque_codigo_leitura on public.estoque_produtos(oficina_id,upper(codigo)) where codigo is not null;
create index estoque_serie_leitura on public.unidades_estoque(oficina_id,upper(serie));
create function public.preparar_etiqueta_estoque(p_oficina uuid,p_produto uuid,p_unidade uuid default null,p_codigo text default null) returns jsonb language plpgsql security definer set search_path='' as $$declare c public.codigos_estoque;r jsonb;v_codigo text;begin
 perform private.exigir_estoque(p_oficina);perform 1 from public.estoque_produtos where oficina_id=p_oficina and item_catalogo_id=p_produto for update;
 if not found then raise exception 'Produto indisponível.' using errcode='42501';end if;
 if p_unidade is not null and not exists(select 1 from public.unidades_estoque where oficina_id=p_oficina and produto_id=p_produto and id=p_unidade) then raise exception 'Unidade indisponível.' using errcode='42501';end if;
 v_codigo:=upper(trim(p_codigo));if v_codigo is not null and (v_codigo!~'^[A-Z0-9 ._/-]{1,80}$' or v_codigo like 'PTE-%') then raise exception 'Use o código do fabricante com até 80 caracteres simples.' using errcode='22023';end if;
 select * into c from public.codigos_estoque where oficina_id=p_oficina and produto_id=p_produto and unidade_id is not distinct from p_unidade and ((v_codigo is null and interno) or codigos_estoque.codigo=v_codigo);
 if not found then
  insert into public.codigos_estoque(oficina_id,produto_id,unidade_id,codigo,interno) values(p_oficina,p_produto,p_unidade,coalesce(v_codigo,'PTE-'||lpad(nextval('private.etiqueta_estoque_seq')::text,10,'0')),v_codigo is null) returning * into c;
 end if;
 select to_jsonb(c)||jsonb_build_object('descricao',p.descricao,'serie',u.serie,'imei',u.imei,'deposito',d.nome) into r from public.itens_catalogo p left join public.unidades_estoque u on u.id=p_unidade left join public.depositos_estoque d on d.id=coalesce(u.deposito_id,private.deposito_padrao(p_oficina)) where p.id=p_produto;return r;
end $$;
create function public.localizar_codigo_estoque(p_oficina uuid,p_codigo text) returns jsonb language plpgsql security definer set search_path='' as $$declare r jsonb;v text:=upper(trim(p_codigo));begin
 perform private.exigir_estoque(p_oficina);if v is null or length(v) not between 1 and 100 or v~'[[:cntrl:]]' then raise exception 'Código inválido.' using errcode='22023';end if;
 with encontrados as (
  select produto_id,unidade_id from public.codigos_estoque where oficina_id=p_oficina and codigo=v
  union select produto_id,id from public.unidades_estoque where oficina_id=p_oficina and (upper(serie)=v or imei=v)
  union select item_catalogo_id,null::uuid from public.estoque_produtos where oficina_id=p_oficina and upper(codigo)=v
  union select produto_id,null::uuid from public.itens_fisicos where oficina_id=p_oficina and codigo=v and produto_id is not null
 ) select coalesce(jsonb_agg(to_jsonb(x)),'[]') into r from(select c.id produto_id,c.descricao,c.unidade,e.codigo,e.saldo,e.reservado,e.saldo-e.reservado disponivel,e.revisao,e.rastreado,u.id unidade_id,u.serie,u.imei,u.estado,u.reserva_id,coalesce(u.deposito_id,private.deposito_padrao(p_oficina)) deposito_id from encontrados f join public.itens_catalogo c on c.id=f.produto_id join public.estoque_produtos e on e.oficina_id=c.oficina_id and e.item_catalogo_id=c.id left join public.unidades_estoque u on u.id=f.unidade_id where c.arquivado_em is null limit 30)x;return r;
end $$;

-- As consultas antigas ganham o depósito sem mudar os contratos existentes.
create function public.consultar_unidades_deposito(p_oficina uuid,p_produto uuid,p_deposito uuid default null,p_busca text default '',p_pagina integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$declare r jsonb;d uuid;begin
 perform private.exigir_estoque(p_oficina);d:=private.exigir_deposito(p_oficina,p_deposito);if p_pagina is null or p_pagina not between 0 and 10000 then raise exception 'Página inválida.' using errcode='22023';end if;
 with u as(select u.*,c.descricao from public.unidades_estoque u join public.itens_catalogo c on c.id=u.produto_id where u.oficina_id=p_oficina and u.produto_id=p_produto and coalesce(u.deposito_id,private.deposito_padrao(p_oficina))=d and concat(u.serie,' ',u.imei) ilike '%'||left(coalesce(p_busca,''),100)||'%') select jsonb_build_object('total',(select count(*) from u),'itens',(select coalesce(jsonb_agg(to_jsonb(x) order by serie,id),'[]') from(select * from u order by serie,id limit 30 offset p_pagina*30)x)) into r;return r;
end $$;
create function public.consultar_transferencias_estoque(p_oficina uuid,p_produto uuid default null,p_pagina integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$declare r jsonb;begin
 perform private.exigir_estoque(p_oficina);if p_pagina is null or p_pagina not between 0 and 10000 then raise exception 'Página inválida.' using errcode='22023';end if;
 with t as(select t.*,c.descricao,c.unidade,o.nome origem_nome,d.nome destino_nome from public.transferencias_estoque t join public.itens_catalogo c on c.id=t.produto_id join public.depositos_estoque o on o.id=t.origem join public.depositos_estoque d on d.id=t.destino where t.oficina_id=p_oficina and (p_produto is null or t.produto_id=p_produto)) select jsonb_build_object('total',(select count(*) from t),'itens',(select coalesce(jsonb_agg(to_jsonb(x) order by criado_em desc,id),'[]') from(select * from t order by criado_em desc,id limit 30 offset p_pagina*30)x)) into r;return r;
end $$;
revoke all on function public.consultar_unidades_deposito(uuid,uuid,uuid,text,integer),public.consultar_transferencias_estoque(uuid,uuid,integer) from public,anon;
grant execute on function public.consultar_unidades_deposito(uuid,uuid,uuid,text,integer),public.consultar_transferencias_estoque(uuid,uuid,integer) to authenticated;
do $$declare f text;begin
 select pg_get_functiondef('public.consultar_reservas_atendimento(uuid,uuid,text)'::regprocedure) into f;
 f:=replace(f,'''reserva_revisao'',r.revisao','''reserva_revisao'',r.revisao,''deposito_id'',coalesce(r.deposito_id,private.deposito_padrao(p_oficina))');execute f;
end $$;
do $$declare t text;f record;begin
 foreach t in array array['depositos_estoque','saldos_deposito','alocacoes_movimento_estoque','transferencias_estoque','codigos_estoque'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);end loop;
 for f in select p.oid::regprocedure assinatura,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='public' and p.proname in ('salvar_deposito_estoque','consultar_depositos_estoque','transferir_estoque','reservar_estoque_deposito','receber_pedido_deposito','movimentar_estoque_deposito','preparar_etiqueta_estoque','localizar_codigo_estoque')) or (n.nspname='private' and p.proname in ('criar_deposito_padrao','deposito_padrao','exigir_deposito','alocar_saldo_deposito','alocar_movimento_depositos','identificar_deposito_reserva','reservar_saldo_deposito','identificar_deposito_unidade','conferir_depositos_estoque')) loop execute format('revoke all on function %s from public,anon,authenticated',f.assinatura);if f.nspname='public' then execute format('grant execute on function %s to authenticated',f.assinatura);end if;end loop;
end $$;
notify pgrst,'reload schema';
commit;
