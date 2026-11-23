begin;

-- Reutiliza identificadores já confirmados. Nomes iguais, sozinhos, nunca
-- autorizam a baixa; históricos com produtos diferentes continuam manuais.
create index itens_os_vinculo_catalogo_estoque
 on public.itens_ordem_servico(oficina_id,item_catalogo_id,produto_estoque_id)
 where tipo='part' and origem_peca='estoque' and produto_estoque_id is not null;

create function private.produto_estoque_do_catalogo(w uuid,catalogo uuid)
returns uuid language plpgsql stable security invoker set search_path='' as $$
declare c public.itens_catalogo; produtos uuid[]; produto uuid;
begin
 if catalogo is null then return null;end if;
 select * into c from public.itens_catalogo where oficina_id=w and id=catalogo and tipo='part' and arquivado_em is null;
 if not found then return null;end if;
 if exists(select 1 from public.estoque_produtos where oficina_id=w and item_catalogo_id=catalogo) then return catalogo;end if;
 select array_agg(x.produto_estoque_id) into produtos from (
   select distinct i.produto_estoque_id from public.itens_ordem_servico i
   where i.oficina_id=w and i.item_catalogo_id=catalogo and i.tipo='part'
     and i.origem_peca='estoque' and i.produto_estoque_id is not null
   order by i.produto_estoque_id limit 2
 ) x;
 if cardinality(produtos) is distinct from 1 then return null;end if;
 select e.item_catalogo_id into produto from public.estoque_produtos e
 join public.itens_catalogo p on p.oficina_id=e.oficina_id and p.id=e.item_catalogo_id
 where e.oficina_id=w and e.item_catalogo_id=produtos[1] and p.tipo='part'
   and p.arquivado_em is null and p.unidade=c.unidade;
 return produto;
end $$;

create function private.vincular_estoque_catalogo_item_os()
returns trigger language plpgsql security invoker set search_path='' as $$
declare produto uuid;
begin
 if new.tipo<>'part' or new.item_catalogo_id is null or new.produto_estoque_id is not null
   or new.origem_peca in ('cliente','externa') or new.removido_em is not null or new.situacao='cancelled'
   or exists(select 1 from public.ordens_servico where oficina_id=new.oficina_id and id=new.ordem_servico_id and situacao in ('delivered','cancelled')) then return new;end if;
 produto:=private.produto_estoque_do_catalogo(new.oficina_id,new.item_catalogo_id);
 if produto is not null and exists(select 1 from public.itens_catalogo where oficina_id=new.oficina_id and id=produto and unidade=new.unidade) then
   new.produto_estoque_id:=produto;new.origem_peca:='estoque';
 end if;
 return new;
end $$;
create trigger aa_item_os_vinculo_estoque before insert or update of item_catalogo_id,produto_estoque_id,origem_peca
 on public.itens_ordem_servico for each row execute function private.vincular_estoque_catalogo_item_os();

-- Recupera somente vínculos conhecidos de OS ainda abertas ao entregar.
-- Não altera entregas anteriores, saldos ou pagamentos durante a migração.
create function private.preparar_pecas_conhecidas_entrega()
returns trigger language plpgsql security invoker set search_path='' as $$
declare i record;produto uuid;vinculos jsonb:='[]';
begin
 if new.situacao<>'delivered' or old.situacao='delivered' then return new;end if;
 for i in select * from public.itens_ordem_servico where oficina_id=new.oficina_id and ordem_servico_id=new.id
   and tipo='part' and removido_em is null and situacao<>'cancelled' and produto_estoque_id is null
   and origem_peca is null and item_catalogo_id is not null order by id for update loop
   -- Uma autorização de pendência anterior continua sem baixa para esses itens.
   if exists(select 1 from private.autorizacoes_entrega_pendente a where a.oficina_id=new.oficina_id
     and a.ordem_servico_id=new.id and a.revisao=old.revisao and i.id=any(a.itens_sem_origem)) then continue;end if;
   produto:=private.produto_estoque_do_catalogo(new.oficina_id,i.item_catalogo_id);
   if produto is not null and exists(select 1 from public.itens_catalogo where oficina_id=new.oficina_id and id=produto and unidade=i.unidade) then
     update public.itens_ordem_servico set produto_estoque_id=produto,origem_peca='estoque' where id=i.id and oficina_id=new.oficina_id;
     vinculos:=vinculos||jsonb_build_array(jsonb_build_object('item',i.id,'catalogo',i.item_catalogo_id,'produto',produto));
   end if;
 end loop;
 if jsonb_array_length(vinculos)>0 then
   insert into public.historico_ordem_servico(oficina_id,ordem_servico_id,tipo_evento,usuario_autor_id,descricao,metadados)
   values(new.oficina_id,new.id,'stock_linked',auth.uid(),'Peças do catálogo vinculadas ao estoque pelos identificadores já confirmados.',jsonb_build_object('vinculos',vinculos));
 end if;
 return new;
end $$;
create trigger aa_preparar_pecas_conhecidas_entrega before update of situacao on public.ordens_servico
 for each row execute function private.preparar_pecas_conhecidas_entrega();

-- A seleção compartilhada precisa informar o produto real, independentemente
-- de o usuário ter permissão para visualizar custos.
do $$declare s text;novo text;begin
 s:=pg_get_functiondef('public.buscar_cadastros_operacao(uuid,text,text,uuid,uuid,text)'::regprocedure);
 novo:=replace(s,'c.revisao,case when private.gerente_custos',
   'c.revisao,private.produto_estoque_do_catalogo(c.oficina_id,c.id) produto_estoque_id,case when private.gerente_custos');
 if novo=s then raise exception 'Contrato da busca de catálogo alterado.';end if;execute novo;
end $$;
revoke all on function private.produto_estoque_do_catalogo(uuid,uuid),private.vincular_estoque_catalogo_item_os(),private.preparar_pecas_conhecidas_entrega() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
