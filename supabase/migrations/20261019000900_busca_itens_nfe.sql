create index if not exists catalogo_nfe_descricao on public.itens_catalogo(oficina_id,lower(descricao),unidade,id) where tipo='part' and arquivado_em is null;
create function public.buscar_itens_nfe(p_oficina uuid,p_itens jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_staff(p_oficina);
 if not private.has_feature(p_oficina,'inventory') then raise exception 'Estoque indisponível.' using errcode='42501'; end if;
 if jsonb_typeof(p_itens)<>'array' or jsonb_array_length(p_itens)>2000 then raise exception 'Limite de 2.000 itens por arquivo.' using errcode='22023'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('indice',v.n-1,'id',c.id) order by v.n),'[]')
   from jsonb_array_elements(p_itens) with ordinality v(item,n)
   join lateral (select id from public.itens_catalogo where oficina_id=p_oficina and tipo='part' and arquivado_em is null
     and lower(descricao)=lower(v.item->>'descricao') and unidade=v.item->>'unidade' order by id limit 1) c on true);
end $$;
revoke all on function public.buscar_itens_nfe(uuid,jsonb) from public,anon;
grant execute on function public.buscar_itens_nfe(uuid,jsonb) to authenticated;
