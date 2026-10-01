begin;
create function public.corrigir_item_os(p_oficina uuid,p_os uuid,p_item uuid,p_revisao integer,p_dados jsonb) returns void language plpgsql security definer set search_path='' as $$
declare w public.ordens_servico%rowtype; i public.itens_ordem_servico%rowtype; begin
 perform private.exigir_os(p_oficina);
 select * into w from public.ordens_servico where oficina_id=p_oficina and id=p_os for update;
 if not found then raise exception 'OS não encontrada' using errcode='P0002'; end if;
 if w.revisao is distinct from p_revisao then raise exception 'Atualize a OS antes de corrigir o item' using errcode='40001'; end if;
 if w.situacao in ('ready','delivered','cancelled') or w.orcamento_origem_id is not null then raise exception 'Não é possível corrigir itens aprovados ou de uma OS encerrada/pronta.' using errcode='22023'; end if;
 select * into i from public.itens_ordem_servico where oficina_id=p_oficina and ordem_servico_id=p_os and id=p_item;
 if not found then raise exception 'Item não encontrado' using errcode='P0002'; end if;
 if p_dados->>'descricao' is null or length(trim(p_dados->>'descricao')) not between 1 and 300 or p_dados->>'quantidade' is null or (p_dados->>'quantidade')::numeric not between 0.001 and 100000 or p_dados->>'preco_unitario_centavos' is null or (p_dados->>'preco_unitario_centavos')::bigint not between 0 and 100000000 then raise exception 'Informe descrição, quantidade e preço válidos' using errcode='22023'; end if;
 update public.itens_ordem_servico set descricao=trim(p_dados->>'descricao'),quantidade=(p_dados->>'quantidade')::numeric,preco_unitario_centavos=(p_dados->>'preco_unitario_centavos')::bigint where id=p_item;
 update public.ordens_servico set subtotal_centavos=(select sum(total_item_centavos) from public.itens_ordem_servico where oficina_id=p_oficina and ordem_servico_id=p_os) where id=p_os;
 perform private.evento_os(p_oficina,p_os,'Item corrigido. Valores anteriores preservados no histórico.',jsonb_build_object('antes',to_jsonb(i),'depois',p_dados));
end $$;
revoke all on function public.corrigir_item_os(uuid,uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.corrigir_item_os(uuid,uuid,uuid,integer,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
