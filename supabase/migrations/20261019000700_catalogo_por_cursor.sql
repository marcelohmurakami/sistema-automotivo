create index if not exists catalogo_pagina_cursor on public.itens_catalogo(oficina_id,tipo,(not favorito),descricao,id) where arquivado_em is null;

create function public.listar_catalogo_paginado(p_oficina uuid,p_busca text default '',p_arquivados boolean default false,p_favoritos boolean default false,p_apos jsonb default null)
returns jsonb language plpgsql stable security definer set search_path='' set plan_cache_mode='force_custom_plan' as $$
declare linhas jsonb; proximo jsonb;
begin
 perform private.require_staff(p_oficina);
 if not private.has_feature(p_oficina,'catalog') then raise exception 'Catálogo indisponível.' using errcode='42501'; end if;
 if length(coalesce(p_busca,''))>200 or (p_apos is not null and (jsonb_typeof(p_apos)<>'object' or not p_apos ?& array['id','descricao','favorito'])) then
   raise exception 'Filtro de catálogo inválido.' using errcode='22023';
 end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by not x.favorito,x.descricao,x.id),'[]') into linhas from (
   select id,tipo,descricao,unidade,preco_padrao_centavos,favorito,arquivado_em,revisao
   from public.itens_catalogo c where oficina_id=p_oficina and tipo='service'
   and (arquivado_em is not null)=p_arquivados and (not p_favoritos or favorito)
   and (coalesce(trim(p_busca),'')='' or private.texto_busca(descricao) like private.padrao_busca(trim(p_busca)))
   and (p_apos is null or (not favorito,descricao,id)>(not (p_apos->>'favorito')::boolean,p_apos->>'descricao',(p_apos->>'id')::uuid))
   order by not favorito,descricao,id limit 25
 ) x;
 if jsonb_array_length(linhas)>24 then
   proximo:=jsonb_build_object('id',linhas->23->'id','descricao',linhas->23->'descricao','favorito',linhas->23->'favorito');
   linhas:=linhas-24;
 end if;
 return jsonb_build_object('itens',linhas,'proximo',proximo);
end $$;
create function public.resumo_catalogo(p_oficina uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_staff(p_oficina);
 if not private.has_feature(p_oficina,'catalog') then raise exception 'Catálogo indisponível.' using errcode='42501'; end if;
 return (select jsonb_build_object('ativos',count(*),'favoritos',count(*) filter(where favorito)) from public.itens_catalogo where oficina_id=p_oficina and tipo='service' and arquivado_em is null);
end $$;
revoke all on function public.listar_catalogo_paginado(uuid,text,boolean,boolean,jsonb),public.resumo_catalogo(uuid) from public,anon;
grant execute on function public.listar_catalogo_paginado(uuid,text,boolean,boolean,jsonb),public.resumo_catalogo(uuid) to authenticated;
