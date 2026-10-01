begin;
insert into public.recursos(codigo,descricao) values('inventory','Estoque e movimentações');
insert into public.recursos_plano(codigo_plano,codigo_recurso,habilitado) values('intermediate','inventory',true),('complete','inventory',true);
create table public.estoque_produtos(
 oficina_id uuid not null, item_catalogo_id uuid not null, codigo text, localizacao text not null default '', fornecedor text not null default '',
 saldo numeric(15,3) not null default 0 check(saldo>=0), minimo numeric(15,3) not null default 0 check(minimo>=0), custo_centavos bigint not null default 0 check(custo_centavos between 0 and 100000000), revisao integer not null default 1,
 primary key(oficina_id,item_catalogo_id),foreign key(oficina_id,item_catalogo_id) references public.itens_catalogo(oficina_id,id), unique(oficina_id,codigo));
create table public.movimentacoes_estoque(
 id uuid primary key default gen_random_uuid(),oficina_id uuid not null,item_catalogo_id uuid not null,
 tipo text not null check(tipo in ('entrada','saida','ajuste','consumo_os','estorno')),
 quantidade numeric(15,3) not null check(quantidade<>0),saldo_apos numeric(15,3) not null check(saldo_apos>=0),custo_centavos bigint not null check(custo_centavos>=0),
 motivo text not null check(length(trim(motivo)) between 3 and 1000),documento text,ordem_servico_id uuid,item_os_id uuid,estorno_de uuid references public.movimentacoes_estoque(id),chave uuid not null,
 criado_por uuid not null references auth.users(id),criado_em timestamptz not null default now(),
 foreign key(oficina_id,item_catalogo_id) references public.estoque_produtos(oficina_id,item_catalogo_id),foreign key(oficina_id,ordem_servico_id) references public.ordens_servico(oficina_id,id), foreign key(oficina_id,item_os_id) references public.itens_ordem_servico(oficina_id,id),unique(oficina_id,chave),unique(estorno_de));
create unique index estoque_consumo_unico on public.movimentacoes_estoque(oficina_id,item_os_id) where tipo='consumo_os';
create index estoque_extrato on public.movimentacoes_estoque(oficina_id,item_catalogo_id,criado_em desc,id);
alter table public.estoque_produtos enable row level security;alter table public.movimentacoes_estoque enable row level security;
grant select on public.estoque_produtos,public.movimentacoes_estoque to authenticated;
create policy estoque_oficina on public.estoque_produtos for select to authenticated using(private.is_workshop_member(oficina_id) and private.has_feature(oficina_id,'inventory'));
create policy movimentos_oficina on public.movimentacoes_estoque for select to authenticated using(private.is_workshop_member(oficina_id) and private.has_feature(oficina_id,'inventory'));
create trigger estoque_historico_imutavel before update or delete on public.movimentacoes_estoque for each row execute function private.reject_mutation();
alter table public.itens_ordem_servico add column origem_peca text check(origem_peca in ('estoque','cliente','externa')),add column produto_estoque_id uuid,add foreign key(oficina_id,produto_estoque_id) references public.estoque_produtos(oficina_id,item_catalogo_id);
create function private.exigir_estoque(p_oficina uuid) returns uuid language plpgsql security definer set search_path='' as $$declare u uuid;begin u:=private.require_staff(p_oficina);if not private.has_feature(p_oficina,'inventory') then raise exception 'Estoque indisponível no plano atual' using errcode='42501';end if;return u;end $$;
create function public.listar_estoque(p_oficina uuid,p_busca text default '',p_filtro text default '',p_pagina integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare lista jsonb; total bigint; resumo jsonb;begin
 perform private.exigir_estoque(p_oficina);
 select jsonb_build_object('produtos',count(*),'baixos',count(*) filter(where e.saldo<=e.minimo),'valor_centavos',coalesce(sum(round(e.saldo*e.custo_centavos)),0)) into resumo from public.estoque_produtos e join public.itens_catalogo c on c.id=e.item_catalogo_id and c.oficina_id=e.oficina_id where e.oficina_id=p_oficina and c.arquivado_em is null;
 select count(*) into total from public.itens_catalogo c left join public.estoque_produtos e on e.item_catalogo_id=c.id and e.oficina_id=c.oficina_id where c.oficina_id=p_oficina and c.tipo='part' and ((p_filtro='arquivados' and c.arquivado_em is not null) or (p_filtro<>'arquivados' and c.arquivado_em is null)) and (p_filtro<>'baixo' or e.saldo<=e.minimo) and concat(c.descricao,' ',e.codigo) ilike '%'||left(p_busca,120)||'%';
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into lista from (select c.id,c.descricao,c.unidade,c.preco_padrao_centavos,c.arquivado_em,e.codigo,e.localizacao,e.fornecedor,e.saldo,e.minimo,e.custo_centavos,e.revisao from public.itens_catalogo c left join public.estoque_produtos e on e.item_catalogo_id=c.id and e.oficina_id=c.oficina_id where c.oficina_id=p_oficina and c.tipo='part' and ((p_filtro='arquivados' and c.arquivado_em is not null) or (p_filtro<>'arquivados' and c.arquivado_em is null)) and (p_filtro<>'baixo' or e.saldo<=e.minimo) and concat(c.descricao,' ',e.codigo) ilike '%'||left(p_busca,120)||'%' order by c.descricao,c.id limit 24 offset greatest(p_pagina,0)*24) x;
 return jsonb_build_object('itens',lista,'total',total,'resumo',resumo);end $$;
create function public.salvar_produto_estoque(p_oficina uuid,p_dados jsonb,p_id uuid,p_revisao integer default null) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.itens_catalogo%rowtype;e public.estoque_produtos%rowtype;u uuid;begin
 u:=private.exigir_estoque(p_oficina);if p_id is null or length(trim(p_dados->>'descricao')) not between 1 and 300 or p_dados->>'descricao' is null or length(coalesce(p_dados->>'unidade','un')) not between 1 and 15 or length(p_dados->>'codigo')>80 or length(p_dados->>'localizacao')>200 or length(p_dados->>'fornecedor')>200 then raise exception 'Confira descrição, código e unidade' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_id::text,0));
 select * into c from public.itens_catalogo where oficina_id=p_oficina and id=p_id for update;
 if found then
 if c.tipo<>'part' then raise exception 'Somente peças podem ter estoque' using errcode='22023';end if;
 select * into e from public.estoque_produtos where oficina_id=p_oficina and item_catalogo_id=p_id for update;
 if found and p_revisao is null then return p_id;end if;
 if e.item_catalogo_id is not null and e.revisao is distinct from p_revisao then raise exception 'Produto alterado. Atualize antes de salvar.' using errcode='40001';end if;
 if c.unidade<>coalesce(p_dados->>'unidade','un') and (e.item_catalogo_id is not null or exists(select 1 from public.itens_ordem_servico where oficina_id=p_oficina and item_catalogo_id=p_id)) then raise exception 'A unidade de um produto em uso não pode ser alterada.' using errcode='22023';end if;
 else
 insert into public.itens_catalogo(id,oficina_id,tipo,descricao) values(p_id,p_oficina,'part',trim(p_dados->>'descricao'));
 end if;
 update public.itens_catalogo set descricao=trim(p_dados->>'descricao'),unidade=coalesce(p_dados->>'unidade','un'),preco_padrao_centavos=coalesce((p_dados->>'preco_padrao_centavos')::bigint,0) where oficina_id=p_oficina and id=p_id;
 insert into public.estoque_produtos(oficina_id,item_catalogo_id,codigo,localizacao,fornecedor,minimo,custo_centavos) values(p_oficina,p_id,nullif(upper(trim(p_dados->>'codigo')),''),coalesce(p_dados->>'localizacao',''),coalesce(p_dados->>'fornecedor',''),coalesce((p_dados->>'minimo')::numeric,0),coalesce((p_dados->>'custo_centavos')::bigint,0)) on conflict(oficina_id,item_catalogo_id) do update set codigo=excluded.codigo,localizacao=excluded.localizacao,fornecedor=excluded.fornecedor,minimo=excluded.minimo,custo_centavos=excluded.custo_centavos,revisao=public.estoque_produtos.revisao+1;
 insert into public.registros_auditoria(oficina_id,usuario_autor_id,tipo_autor,acao,tipo_entidade,entidade_id,correlacao_id) values(p_oficina,u,'user','salvar_produto','estoque',p_id,gen_random_uuid());
 return p_id;end $$;
create function public.movimentar_estoque(p_oficina uuid,p_produto uuid,p_tipo text,p_quantidade numeric,p_motivo text,p_chave uuid,p_revisao integer,p_documento text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare e public.estoque_produtos%rowtype;delta numeric(15,3);id_mov uuid;u uuid;begin
 u:=private.exigir_estoque(p_oficina);
 if p_chave is null then raise exception 'Chave obrigatória' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_chave::text,0));select id into id_mov from public.movimentacoes_estoque where oficina_id=p_oficina and chave=p_chave;if found then return id_mov;end if;
 select * into e from public.estoque_produtos where oficina_id=p_oficina and item_catalogo_id=p_produto for update;
 if not found then raise exception 'Ative o controle de estoque deste produto' using errcode='22023';end if;
 if e.revisao is distinct from p_revisao then raise exception 'Saldo alterado. Atualize antes de movimentar.' using errcode='40001';end if;
 if exists(select 1 from public.itens_catalogo where oficina_id=p_oficina and id=p_produto and arquivado_em is not null) then raise exception 'Restaure o produto antes de movimentar' using errcode='22023';end if;
 if p_tipo is null or p_tipo not in ('entrada','saida','ajuste') or p_quantidade is null or p_quantidade<0 or p_quantidade>1000000 or p_quantidade<>round(p_quantidade,3) or p_motivo is null or length(trim(p_motivo)) not between 3 and 1000 or length(p_documento)>200 then raise exception 'Informe quantidade e motivo válidos (até 3 casas decimais).' using errcode='22023';end if;
 delta:=case p_tipo when 'entrada' then p_quantidade when 'saida' then -p_quantidade else p_quantidade-e.saldo end;
 if delta=0 then raise exception 'A movimentação não altera o saldo.' using errcode='22023';end if;
 if e.saldo+delta<0 then raise exception 'Saldo insuficiente. Estoque negativo não é permitido.' using errcode='22023';end if;
 update public.estoque_produtos set saldo=saldo+delta,revisao=revisao+1 where oficina_id=p_oficina and item_catalogo_id=p_produto;
 insert into public.movimentacoes_estoque(oficina_id,item_catalogo_id,tipo,quantidade,saldo_apos,custo_centavos,motivo,documento,chave,criado_por) values(p_oficina,p_produto,p_tipo,delta,e.saldo+delta,e.custo_centavos,trim(p_motivo),p_documento,p_chave,u) returning id into id_mov;
 insert into public.eventos_negocio(oficina_id,tipo_evento,tipo_agregado,agregado_id,versao_agregado,chave_deduplicacao,dados) values(p_oficina,'inventory.moved','inventory',p_produto,e.revisao+1,'estoque:'||id_mov,jsonb_build_object('movimento',id_mov,'quantidade',delta));
 return id_mov;end $$;
create function public.consultar_movimentacoes_estoque(p_oficina uuid,p_produto uuid,p_pagina integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$declare r jsonb;begin
 perform private.exigir_estoque(p_oficina);select coalesce(jsonb_agg(to_jsonb(x)),'[]') into r from (select m.*,w.numero as numero_os,exists(select 1 from public.movimentacoes_estoque s where s.estorno_de=m.id) as estornado from public.movimentacoes_estoque m left join public.ordens_servico w on w.id=m.ordem_servico_id and w.oficina_id=m.oficina_id where m.oficina_id=p_oficina and m.item_catalogo_id=p_produto order by m.criado_em desc,m.id limit 30 offset greatest(p_pagina,0)*30) x;return r;end $$;
create function public.estornar_movimentacao_estoque(p_oficina uuid,p_movimento uuid,p_motivo text) returns uuid language plpgsql security definer set search_path='' as $$
declare m public.movimentacoes_estoque%rowtype;e public.estoque_produtos%rowtype;u uuid;novo uuid;begin
 u:=private.exigir_estoque(p_oficina);if not exists(select 1 from public.membros_oficina where oficina_id=p_oficina and usuario_id=u and ativo and perfil in ('owner','manager')) then raise exception 'Somente a gerência pode estornar.' using errcode='42501';end if;
 select * into m from public.movimentacoes_estoque where oficina_id=p_oficina and id=p_movimento;if not found then raise exception 'Movimentação não encontrada' using errcode='P0002';end if;
 select * into e from public.estoque_produtos where oficina_id=p_oficina and item_catalogo_id=m.item_catalogo_id for update;
 select id into novo from public.movimentacoes_estoque where estorno_de=m.id;if found then return novo;end if;
 if m.tipo='estorno' or p_motivo is null or length(trim(p_motivo)) not between 3 and 1000 then raise exception 'Informe o motivo. Estornos não podem ser estornados.' using errcode='22023';end if;
 if e.saldo-m.quantidade<0 then raise exception 'O estorno deixaria o estoque negativo.' using errcode='22023';end if;
 update public.estoque_produtos set saldo=saldo-m.quantidade,revisao=revisao+1 where oficina_id=p_oficina and item_catalogo_id=m.item_catalogo_id;
 insert into public.movimentacoes_estoque(oficina_id,item_catalogo_id,tipo,quantidade,saldo_apos,custo_centavos,motivo,ordem_servico_id,item_os_id,estorno_de,chave,criado_por) values(p_oficina,m.item_catalogo_id,'estorno',-m.quantidade,e.saldo-m.quantidade,m.custo_centavos,trim(p_motivo),m.ordem_servico_id,m.item_os_id,m.id,gen_random_uuid(),u) returning id into novo;
 if m.ordem_servico_id is not null then insert into public.historico_ordem_servico(oficina_id,ordem_servico_id,tipo_evento,usuario_autor_id,descricao,metadados) values(p_oficina,m.ordem_servico_id,'stock_returned',u,'Baixa de estoque estornada: '||trim(p_motivo),jsonb_build_object('movimento',novo));end if;
 insert into public.eventos_negocio(oficina_id,tipo_evento,tipo_agregado,agregado_id,versao_agregado,chave_deduplicacao,dados) values(p_oficina,'inventory.reversed','inventory',m.item_catalogo_id,e.revisao+1,'estoque:'||novo,jsonb_build_object('movimento',novo));return novo;end $$;
create function public.arquivar_produto_estoque(p_oficina uuid,p_produto uuid,p_arquivar boolean) returns void language plpgsql security definer set search_path='' as $$declare e public.estoque_produtos%rowtype;begin
 perform private.exigir_estoque(p_oficina);select * into e from public.estoque_produtos where oficina_id=p_oficina and item_catalogo_id=p_produto for update;
 if not found then raise exception 'Produto não encontrado' using errcode='P0002';end if;
 if p_arquivar and (e.saldo<>0 or exists(select 1 from public.itens_ordem_servico i join public.ordens_servico w on w.id=i.ordem_servico_id where i.oficina_id=p_oficina and (coalesce(i.produto_estoque_id,i.item_catalogo_id)=p_produto) and w.situacao not in ('delivered','cancelled'))) then raise exception 'Zere o saldo e conclua as OS vinculadas antes de arquivar.' using errcode='22023';end if;
 update public.itens_catalogo set arquivado_em=case when p_arquivar then now() else null end where oficina_id=p_oficina and id=p_produto;end $$;
create function public.vincular_estoque_item_os(p_oficina uuid,p_os uuid,p_item uuid,p_produto uuid,p_origem text,p_revisao integer) returns void language plpgsql security definer set search_path='' as $$
declare w public.ordens_servico%rowtype;i public.itens_ordem_servico%rowtype;begin
 perform private.exigir_estoque(p_oficina);perform private.exigir_os(p_oficina);select * into w from public.ordens_servico where oficina_id=p_oficina and id=p_os for update;
 if not found then raise exception 'OS não encontrada' using errcode='P0002';end if;
 if w.revisao is distinct from p_revisao then raise exception 'Atualize a OS antes de vincular a peça.' using errcode='40001';end if;
 if w.situacao in ('delivered','cancelled') then raise exception 'OS encerrada' using errcode='22023';end if;
 select * into i from public.itens_ordem_servico where oficina_id=p_oficina and ordem_servico_id=p_os and id=p_item and tipo='part';if not found then raise exception 'Peça não encontrada' using errcode='P0002';end if;
 if p_origem is null or p_origem not in ('estoque','cliente','externa') then raise exception 'Selecione a origem da peça' using errcode='22023';end if;
 if p_origem='estoque' and not exists(select 1 from public.estoque_produtos e join public.itens_catalogo c on c.id=e.item_catalogo_id and c.oficina_id=e.oficina_id where e.oficina_id=p_oficina and e.item_catalogo_id=p_produto and c.arquivado_em is null and c.unidade=i.unidade) then raise exception 'Selecione produto ativo com a mesma unidade da OS' using errcode='22023';end if;
 update public.itens_ordem_servico set origem_peca=p_origem,produto_estoque_id=case when p_origem='estoque' then p_produto else null end where id=p_item;
 perform private.evento_os(p_oficina,p_os,'Origem da peça definida: '||p_origem,jsonb_build_object('item',p_item,'produto',p_produto,'origem',p_origem));end $$;
create function public.adicionar_peca_estoque_os(p_oficina uuid,p_os uuid,p_produto uuid,p_quantidade numeric,p_revisao integer) returns void language plpgsql security definer set search_path='' as $$
declare c public.itens_catalogo%rowtype;id_item uuid;begin
 perform private.exigir_estoque(p_oficina);
 perform 1 from public.ordens_servico where oficina_id=p_oficina and id=p_os for update;
 select * into c from public.itens_catalogo where oficina_id=p_oficina and id=p_produto and tipo='part' and arquivado_em is null;
 if not found or not exists(select 1 from public.estoque_produtos where oficina_id=p_oficina and item_catalogo_id=c.id) then raise exception 'Produto indisponível' using errcode='22023';end if;
 perform public.salvar_item_os(p_oficina,p_os,p_revisao,jsonb_build_object('descricao',c.descricao,'tipo','part','quantidade',p_quantidade,'preco_unitario_centavos',c.preco_padrao_centavos));
 select id into id_item from public.itens_ordem_servico where oficina_id=p_oficina and ordem_servico_id=p_os order by posicao desc limit 1;
 update public.itens_ordem_servico set item_catalogo_id=c.id,produto_estoque_id=c.id,origem_peca='estoque',unidade=c.unidade where id=id_item;
end $$;
create function private.baixar_estoque_entrega_os() returns trigger language plpgsql security definer set search_path='' as $$
declare i record;e public.estoque_produtos%rowtype;produto uuid;mov uuid;begin
 if new.situacao<>'delivered' or old.situacao='delivered' then return new;end if;
 -- Todas as linhas da mesma oficina são bloqueadas na mesma ordem para evitar deadlock entre OS.
 perform 1 from public.estoque_produtos where oficina_id=new.oficina_id and item_catalogo_id in(select coalesce(produto_estoque_id,item_catalogo_id) from public.itens_ordem_servico where oficina_id=new.oficina_id and ordem_servico_id=new.id and tipo='part' and situacao<>'cancelled' and coalesce(origem_peca,'estoque')='estoque') order by item_catalogo_id for update;
 for i in select * from public.itens_ordem_servico where oficina_id=new.oficina_id and ordem_servico_id=new.id and tipo='part' and situacao<>'cancelled' order by id loop
 if i.origem_peca in ('cliente','externa') then continue;end if;
 perform private.exigir_estoque(new.oficina_id);
 produto:=coalesce(i.produto_estoque_id,i.item_catalogo_id);
 select * into e from public.estoque_produtos where oficina_id=new.oficina_id and item_catalogo_id=produto;
 if not found then raise exception 'Defina a origem da peça "%" na aba Execução antes de entregar.',i.descricao using errcode='22023';end if;
 if not exists(select 1 from public.itens_catalogo where oficina_id=new.oficina_id and id=produto and unidade=i.unidade) then raise exception 'Unidade de estoque incompatível para a peça %.',i.descricao using errcode='22023';end if;
 if exists(select 1 from public.movimentacoes_estoque where oficina_id=new.oficina_id and item_os_id=i.id and tipo='consumo_os') then continue;end if;
 if e.saldo<i.quantidade then raise exception 'Estoque insuficiente para "%": disponível %, necessário %.',i.descricao,e.saldo,i.quantidade using errcode='22023';end if;
 update public.estoque_produtos set saldo=saldo-i.quantidade,revisao=revisao+1 where oficina_id=new.oficina_id and item_catalogo_id=produto;
 insert into public.movimentacoes_estoque(oficina_id,item_catalogo_id,tipo,quantidade,saldo_apos,custo_centavos,motivo,ordem_servico_id,item_os_id,chave,criado_por) values(new.oficina_id,produto,'consumo_os',-i.quantidade,e.saldo-i.quantidade,e.custo_centavos,'Consumo na entrega da OS #'||new.numero,new.id,i.id,gen_random_uuid(),auth.uid()) returning id into mov;
 insert into public.eventos_negocio(oficina_id,tipo_evento,tipo_agregado,agregado_id,versao_agregado,chave_deduplicacao,dados) values(new.oficina_id,'inventory.consumed','inventory',produto,e.revisao+1,'estoque:'||mov,jsonb_build_object('movimento',mov,'os',new.id));
 end loop;
 insert into public.historico_ordem_servico(oficina_id,ordem_servico_id,tipo_evento,usuario_autor_id,descricao) values(new.oficina_id,new.id,'stock_checked',auth.uid(),'Estoque conferido e peças vinculadas baixadas na entrega.');return new;end $$;
create trigger os_baixar_estoque after update of situacao on public.ordens_servico for each row execute function private.baixar_estoque_entrega_os();
do $$declare r record;begin for r in select p.oid::regprocedure assinatura,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='public' and p.proname in ('listar_estoque','salvar_produto_estoque','movimentar_estoque','consultar_movimentacoes_estoque','estornar_movimentacao_estoque','arquivar_produto_estoque','vincular_estoque_item_os','adicionar_peca_estoque_os')) or (n.nspname='private' and p.proname in ('exigir_estoque','baixar_estoque_entrega_os')) loop execute format('revoke all on function %s from public,anon,authenticated',r.assinatura);if r.nspname='public' then execute format('grant execute on function %s to authenticated',r.assinatura);end if;end loop;end $$;
notify pgrst,'reload schema';
commit;
