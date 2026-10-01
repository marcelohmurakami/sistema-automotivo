begin;

alter table public.itens_catalogo add column revisao integer not null default 1 check(revisao>0);
comment on column public.itens_catalogo.revisao is 'Impede sobrescrever alterações feitas no catálogo ou estoque.';
create function private.revisar_catalogo() returns trigger language plpgsql set search_path='' as $$
begin new.revisao:=old.revisao+1;return new;end $$;
create trigger revisar_catalogo before update on public.itens_catalogo for each row execute function private.revisar_catalogo();

create function private.evento_catalogo() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.eventos_negocio(oficina_id,tipo_evento,tipo_agregado,agregado_id,versao_agregado,chave_deduplicacao,dados)
 values(new.oficina_id,case when tg_op='INSERT' then 'catalogo.cadastrado' else 'catalogo.alterado' end,'catalogo',new.id,new.revisao,'catalogo:'||new.id||':'||new.revisao,jsonb_build_object('item_id',new.id,'revisao',new.revisao));return new;
end $$;
create trigger evento_catalogo after insert or update on public.itens_catalogo for each row execute function private.evento_catalogo();

create function public.salvar_item_catalogo(p_oficina uuid,p_id uuid,p_dados jsonb,p_revisao integer default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare c public.itens_catalogo%rowtype; e public.estoque_produtos%rowtype; v_descricao text;v_unidade text;v_tipo text;preco bigint;fav boolean;arquivar boolean;
begin
 perform private.require_staff(p_oficina);
 if not private.has_feature(p_oficina,'catalog') then raise exception 'Catálogo indisponível no plano atual' using errcode='42501';end if;
 if p_id is null or jsonb_typeof(p_dados) is distinct from 'object' then raise exception 'Cadastro inválido' using errcode='22023';end if;
 v_descricao:=trim(p_dados->>'descricao');v_unidade:=trim(p_dados->>'unidade');v_tipo:=p_dados->>'tipo';preco:=(p_dados->>'preco_padrao_centavos')::bigint;fav:=coalesce((p_dados->>'favorito')::boolean,false);arquivar:=coalesce((p_dados->>'arquivado')::boolean,false);
 if v_descricao is null or length(v_descricao) not between 1 and 300 or v_unidade is null or length(v_unidade) not between 1 and 15 or v_tipo is null or v_tipo not in ('service','part') or preco is null or preco not between 0 and 100000000 then raise exception 'Confira descrição, tipo, unidade e preço' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_id::text,0));
 select * into c from public.itens_catalogo where oficina_id=p_oficina and id=p_id for update;
 if found then
  if c.revisao is distinct from p_revisao then raise exception 'Cadastro alterado. Atualize antes de salvar.' using errcode='40001';end if;
  if v_tipo<>c.tipo then raise exception 'O tipo do cadastro não pode ser alterado.' using errcode='22023';end if;
  select * into e from public.estoque_produtos where oficina_id=p_oficina and item_catalogo_id=p_id for update;
  if v_unidade<>c.unidade and (e.item_catalogo_id is not null or exists(select 1 from public.itens_ordem_servico where oficina_id=p_oficina and item_catalogo_id=p_id) or exists(select 1 from public.itens_orcamento where oficina_id=p_oficina and item_catalogo_id=p_id)) then raise exception 'A unidade de um item em uso não pode ser alterada.' using errcode='22023';end if;
  if arquivar and c.arquivado_em is null and (coalesce(e.saldo,0)<>0 or exists(select 1 from public.itens_ordem_servico i join public.ordens_servico o on o.oficina_id=i.oficina_id and o.id=i.ordem_servico_id where i.oficina_id=p_oficina and coalesce(i.produto_estoque_id,i.item_catalogo_id)=p_id and o.situacao not in ('delivered','cancelled'))) then raise exception 'Zere o saldo e conclua as OS vinculadas antes de arquivar.' using errcode='22023';end if;
  update public.itens_catalogo set descricao=v_descricao,unidade=v_unidade,preco_padrao_centavos=preco,favorito=fav,arquivado_em=case when arquivar then coalesce(c.arquivado_em,now()) else null end where oficina_id=p_oficina and id=p_id;
  if e.item_catalogo_id is not null and (v_descricao is distinct from c.descricao or v_unidade is distinct from c.unidade or preco is distinct from c.preco_padrao_centavos) then update public.estoque_produtos set revisao=revisao+1 where oficina_id=p_oficina and item_catalogo_id=p_id;end if;
 else
  if p_revisao is not null or arquivar then raise exception 'Cadastro não encontrado. Atualize a lista.' using errcode='P0002';end if;
  insert into public.itens_catalogo(id,oficina_id,tipo,descricao,unidade,preco_padrao_centavos,favorito) values(p_id,p_oficina,v_tipo,v_descricao,v_unidade,preco,fav);
 end if;
 return p_id;
end $$;

-- Usa o mesmo cadastro e congela os dados do serviço na OS no momento da inclusão.
create function public.adicionar_servico_catalogo_os(p_oficina uuid,p_os uuid,p_revisao integer,p_servico uuid)
returns void language plpgsql security definer set search_path='' as $$
declare c public.itens_catalogo%rowtype;id_item uuid;
begin
 perform private.exigir_os(p_oficina);
 if not private.has_feature(p_oficina,'catalog') then raise exception 'Catálogo indisponível' using errcode='42501';end if;
 select * into c from public.itens_catalogo where oficina_id=p_oficina and id=p_servico and tipo='service' and arquivado_em is null;
 if not found then raise exception 'Serviço indisponível. Atualize o catálogo.' using errcode='P0002';end if;
 perform public.salvar_item_os(p_oficina,p_os,p_revisao,jsonb_build_object('descricao',c.descricao,'tipo','service','quantidade',1,'preco_unitario_centavos',c.preco_padrao_centavos));
 select id into id_item from public.itens_ordem_servico where oficina_id=p_oficina and ordem_servico_id=p_os order by posicao desc limit 1;
 update public.itens_ordem_servico set item_catalogo_id=c.id,unidade=c.unidade where id=id_item;
end $$;
revoke all on function private.revisar_catalogo(),private.evento_catalogo(),public.salvar_item_catalogo(uuid,uuid,jsonb,integer),public.adicionar_servico_catalogo_os(uuid,uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.salvar_item_catalogo(uuid,uuid,jsonb,integer),public.adicionar_servico_catalogo_os(uuid,uuid,integer,uuid) to authenticated;
commit;
