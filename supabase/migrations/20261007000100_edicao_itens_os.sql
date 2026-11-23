begin;

-- Remover da OS preserva o registro para auditoria, comissões e vínculos antigos.
alter table public.itens_ordem_servico
  add column removido_em timestamptz,
  add column removido_por uuid references auth.users(id),
  add constraint item_os_removido check ((removido_em is null and removido_por is null) or
    (removido_em is not null and removido_por is not null and situacao='cancelled'));

create function private.proteger_item_os_removido() returns trigger
language plpgsql set search_path='' as $$
begin
  if old.removido_em is not null then raise exception 'Este item foi removido da OS. Atualize o atendimento.' using errcode='22023'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger item_os_removido_protegido before update or delete on public.itens_ordem_servico
for each row execute function private.proteger_item_os_removido();

-- Mantém todos os dados de consulta existentes (aprovação, fotos, histórico).
do $$ declare definicao text; begin
  definicao:=pg_get_functiondef('public.consultar_ordem_servico(uuid,uuid)'::regprocedure);
  execute replace(definicao,'FUNCTION public.consultar_ordem_servico(', 'FUNCTION private.consultar_os_incluindo_removidos(');
end $$;
create or replace function public.consultar_ordem_servico(p_oficina uuid,p_os uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d jsonb; begin
  d:=private.consultar_os_incluindo_removidos(p_oficina,p_os);
  return jsonb_set(d,'{itens}',coalesce((select jsonb_agg(i) from jsonb_array_elements(d->'itens') i where i->>'removido_em' is null),'[]'));
end $$;

create function public.salvar_os_com_itens(p_oficina uuid,p_dados jsonb,p_chave uuid,p_os uuid default null,p_revisao integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  u uuid; w public.ordens_servico; antigo public.itens_ordem_servico; c public.itens_catalogo;
  d jsonb; itens jsonb; antes jsonb; depois jsonb; resultado jsonb; id_os uuid; ids uuid[]:='{}';
  id_item uuid; catalogo uuid; v_quantidade numeric; preco bigint; v_descricao text; unidade text; tipo text; estado text;
  subtotal bigint; desconto bigint; pos integer; alterou boolean:=false; controlado boolean; removidos integer:=0;
begin
  u:=private.exigir_os(p_oficina);
  if jsonb_typeof(p_dados) is distinct from 'object' or jsonb_typeof(p_dados->'itens') is distinct from 'array'
    or jsonb_array_length(p_dados->'itens')>100 then raise exception 'Inclua até 100 itens na OS.' using errcode='22023'; end if;
  itens:=p_dados->'itens';
  if p_os is null then
    if p_chave is null then raise exception 'Chave obrigatória.' using errcode='22023'; end if;
    perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_chave::text,0));
    select id into id_os from public.ordens_servico where oficina_id=p_oficina and chave_criacao=p_chave;
    if found then return public.consultar_ordem_servico(p_oficina,id_os); end if;
  else
    perform pg_advisory_xact_lock(hashtextextended('financeiro-os:'||p_oficina||':'||p_os,0));
    select * into w from public.ordens_servico where oficina_id=p_oficina and id=p_os for update;
    if not found then raise exception 'OS não encontrada.' using errcode='P0002'; end if;
    if w.revisao is distinct from p_revisao then raise exception 'A OS foi alterada por outra pessoa. Reabra antes de salvar.' using errcode='PT409'; end if;
    if w.arquivado_em is not null or w.situacao in ('delivered','cancelled') then raise exception 'OS encerrada: histórico preservado.' using errcode='22023'; end if;
    if w.orcamento_aguardando_id is not null then raise exception 'Autorize o orçamento vinculado antes de editar os serviços desta OS.' using errcode='22023'; end if;
  end if;

  resultado:=public.salvar_ordem_servico(p_oficina,p_dados-'itens'-'desconto_centavos',p_chave,p_os,p_revisao);
  id_os:=(resultado->>'id')::uuid;
  select * into w from public.ordens_servico where id=id_os and oficina_id=p_oficina for update;
  antes:=coalesce((select jsonb_agg(to_jsonb(i) order by posicao) from public.itens_ordem_servico i where oficina_id=p_oficina and ordem_servico_id=id_os and removido_em is null),'[]');
  select coalesce(max(posicao),-1) into pos from public.itens_ordem_servico where oficina_id=p_oficina and ordem_servico_id=id_os;

  for d in select value from jsonb_array_elements(itens) loop
    if jsonb_typeof(d) is distinct from 'object' then raise exception 'Item inválido.' using errcode='22023'; end if;
    id_item:=nullif(d->>'id','')::uuid;
    if id_item is null or id_item=any(ids) then raise exception 'Cada item deve ter uma identificação única.' using errcode='22023'; end if;
    ids:=array_append(ids,id_item);
    v_descricao:=btrim(d->>'descricao'); tipo:=d->>'tipo'; unidade:=btrim(d->>'unidade'); estado:=d->>'situacao';
    v_quantidade:=(d->>'quantidade')::numeric; preco:=(d->>'preco_unitario_centavos')::bigint; catalogo:=nullif(d->>'item_catalogo_id','')::uuid;
    if v_descricao is null or length(v_descricao) not between 1 and 300 or tipo is null or tipo not in ('service','part')
      or unidade is null or length(unidade) not between 1 and 15 or v_quantidade is null or v_quantidade not between 0.001 and 100000
      or v_quantidade<>round(v_quantidade,3) or preco is null or preco not between 0 and 100000000
      or estado is null or estado not in ('pending','in_progress','done','cancelled') then
      raise exception 'Confira descrição, quantidade, preço e situação dos serviços.' using errcode='22023';
    end if;
    select * into antigo from public.itens_ordem_servico where id=id_item;
    if found then
      if antigo.oficina_id<>p_oficina or antigo.ordem_servico_id<>id_os or antigo.removido_em is not null then raise exception 'Item indisponível nesta OS.' using errcode='22023'; end if;
      if catalogo is distinct from antigo.item_catalogo_id or tipo<>antigo.tipo or unidade<>antigo.unidade then
        raise exception 'O vínculo, tipo e unidade de um item existente devem ser preservados. Remova e inclua outro item.' using errcode='22023';
      end if;
      if (v_descricao,v_quantidade,preco,estado) is distinct from (antigo.descricao,antigo.quantidade,antigo.preco_unitario_centavos,antigo.situacao) then
        alterou:=true;
        if w.situacao='ready' then update public.ordens_servico set situacao='in_progress' where id=id_os; w.situacao:='in_progress'; end if;
        update public.itens_ordem_servico set descricao=v_descricao,quantidade=v_quantidade,preco_unitario_centavos=preco,situacao=estado,
          concluido_em=case when estado='done' then coalesce(antigo.concluido_em,now()) else null end where id=id_item;
      end if;
    else
      if estado='cancelled' then raise exception 'Remova o novo item em vez de adicioná-lo cancelado.' using errcode='22023'; end if;
      controlado:=false;
      if catalogo is not null then
        if not private.has_feature(p_oficina,'catalog') then raise exception 'Catálogo indisponível no plano.' using errcode='42501'; end if;
        select * into c from public.itens_catalogo where oficina_id=p_oficina and id=catalogo and arquivado_em is null;
        if not found or c.tipo<>tipo or c.unidade<>unidade then raise exception 'Cadastro do catálogo indisponível ou incompatível. Atualize os serviços.' using errcode='22023'; end if;
        controlado:=tipo='part' and exists(select 1 from public.estoque_produtos where oficina_id=p_oficina and item_catalogo_id=catalogo);
        if controlado and not private.has_feature(p_oficina,'inventory') then raise exception 'Estoque indisponível no plano.' using errcode='42501'; end if;
      end if;
      if w.situacao='ready' then update public.ordens_servico set situacao='in_progress' where id=id_os; w.situacao:='in_progress'; end if;
      pos:=pos+1; alterou:=true;
      insert into public.itens_ordem_servico(id,oficina_id,ordem_servico_id,item_catalogo_id,posicao,tipo,descricao,unidade,quantidade,preco_unitario_centavos,situacao,concluido_em,origem_peca,produto_estoque_id)
      values(id_item,p_oficina,id_os,catalogo,pos,tipo,v_descricao,unidade,v_quantidade,preco,estado,case when estado='done' then now() end,
        case when controlado then 'estoque' end,case when controlado then catalogo end);
    end if;
  end loop;
  select count(*) into removidos from public.itens_ordem_servico where oficina_id=p_oficina and ordem_servico_id=id_os and removido_em is null and not(id=any(ids));
  if removidos>0 then
    alterou:=true;
    if w.situacao='ready' then update public.ordens_servico set situacao='in_progress' where id=id_os; end if;
    update public.itens_ordem_servico set removido_em=now(),removido_por=u,situacao='cancelled'
      where oficina_id=p_oficina and ordem_servico_id=id_os and removido_em is null and not(id=any(ids));
  end if;
  select coalesce(sum(total_item_centavos),0) into subtotal from public.itens_ordem_servico where oficina_id=p_oficina and ordem_servico_id=id_os and removido_em is null;
  desconto:=coalesce((p_dados->>'desconto_centavos')::bigint,w.desconto_centavos);
  if desconto not between 0 and subtotal then raise exception 'O desconto não pode ultrapassar o subtotal dos itens.' using errcode='22023'; end if;
  alterou:=alterou or desconto<>w.desconto_centavos;
  -- Uma única alteração de total: os gatilhos mantêm recebimentos e comissões consistentes.
  update public.ordens_servico set subtotal_centavos=subtotal,desconto_centavos=desconto where id=id_os;
  if alterou then
    depois:=coalesce((select jsonb_agg(to_jsonb(i) order by posicao) from public.itens_ordem_servico i where oficina_id=p_oficina and ordem_servico_id=id_os and removido_em is null),'[]');
    perform private.evento_os(p_oficina,id_os,'Serviços da OS atualizados. Inclusões, alterações e remoções registradas.',jsonb_build_object('acao','editar_itens','antes',antes,'depois',depois,'removidos',removidos,'desconto_anterior',w.desconto_centavos,'desconto_atual',desconto));
  end if;
  return public.consultar_ordem_servico(p_oficina,id_os);
end $$;

-- Compatibilidade com ações individuais antigas: itens removidos nunca voltam ao total.
do $$ declare assinatura text; definicao text; begin
  foreach assinatura in array array['public.salvar_item_os(uuid,uuid,integer,jsonb,uuid)','public.corrigir_item_os(uuid,uuid,uuid,integer,jsonb)'] loop
    definicao:=pg_get_functiondef(assinatura::regprocedure);
    execute replace(definicao,'sum(total_item_centavos) from public.itens_ordem_servico where oficina_id=p_oficina and ordem_servico_id=p_os',
      'sum(total_item_centavos) from public.itens_ordem_servico where oficina_id=p_oficina and ordem_servico_id=p_os and removido_em is null');
  end loop;
end $$;

revoke all on function private.proteger_item_os_removido(),private.consultar_os_incluindo_removidos(uuid,uuid),public.salvar_os_com_itens(uuid,jsonb,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.salvar_os_com_itens(uuid,jsonb,uuid,uuid,integer) to authenticated;
notify pgrst,'reload schema';
commit;
