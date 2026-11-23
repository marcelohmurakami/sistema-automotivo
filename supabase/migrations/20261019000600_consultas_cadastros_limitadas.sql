-- Seletores consultam somente as opções visíveis, sem transferir o cadastro inteiro.
create or replace function private.texto_busca(p_texto text) returns text
language sql immutable strict parallel safe set search_path='' as $$
  select translate(lower(p_texto), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc');
$$;
create or replace function private.padrao_busca(p_texto text) returns text
language sql immutable strict parallel safe set search_path='' as $$
 select '%'||replace(replace(replace(private.texto_busca(p_texto),chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_')||'%';
$$;

create index if not exists clientes_selecao_ativos on public.clientes(oficina_id, nome, id) where arquivado_em is null;
create index if not exists veiculos_selecao_ativos on public.veiculos(oficina_id, modelo, id) where arquivado_em is null;
create index if not exists clientes_veiculos_selecao on public.clientes_veiculos(oficina_id, cliente_id, veiculo_id) where encerrado_em is null;
create index if not exists catalogo_selecao_ativos on public.itens_catalogo(oficina_id, favorito desc, descricao, id) where arquivado_em is null;

create function public.buscar_cadastros_operacao(
  p_oficina uuid, p_tipo text, p_busca text default '', p_cliente uuid default null,
  p_id uuid default null, p_tipo_item text default ''
) returns jsonb language plpgsql stable security definer set search_path='' set plan_cache_mode='force_custom_plan' as $$
declare resultado jsonb; busca text := private.texto_busca(trim(coalesce(p_busca,'')));
begin
  perform private.require_staff(p_oficina);
  if p_tipo not in ('clientes','veiculos','catalogo') or length(busca)>200 or coalesce(p_tipo_item,'') not in ('','service','part') then
    raise exception 'Busca inválida.' using errcode='22023';
  end if;
  if not private.has_feature(p_oficina,case when p_tipo='catalogo' then 'catalog' else 'customers' end) then
    raise exception 'Cadastro indisponível neste plano.' using errcode='42501';
  end if;
  if p_tipo='clientes' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.nome,x.id),'[]') into resultado from (
      select c.id,c.nome,c.telefone_e164,c.email from public.clientes c
      where c.oficina_id=p_oficina and (c.arquivado_em is null or c.id=p_id)
      and (p_id is null or c.id=p_id)
      and (busca='' or c.id in (
        select id from public.clientes where oficina_id=p_oficina and private.texto_busca(nome||' '||coalesce(telefone_e164,'')||' '||coalesce(email,'')) like private.padrao_busca(busca)
        union select cv.cliente_id from public.clientes_veiculos cv join public.veiculos v on v.oficina_id=cv.oficina_id and v.id=cv.veiculo_id
          where cv.oficina_id=p_oficina and cv.encerrado_em is null and v.arquivado_em is null
          and lower(replace(coalesce(v.placa,''),'-','')) like private.padrao_busca(replace(busca,'-',''))))
      order by c.nome,c.id limit 30
    ) x;
  elsif p_tipo='veiculos' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.modelo,x.id),'[]') into resultado from (
      select v.id,v.modelo,v.marca,v.placa,v.ano_modelo,p_cliente as cliente_id from public.veiculos v
      where v.oficina_id=p_oficina and (v.arquivado_em is null or v.id=p_id)
      and (p_id is null or v.id=p_id)
      and (p_cliente is not null and exists(select 1 from public.clientes_veiculos cv where cv.oficina_id=p_oficina and cv.cliente_id=p_cliente and cv.veiculo_id=v.id and cv.encerrado_em is null))
      and (busca='' or position(busca in private.texto_busca(v.modelo||' '||coalesce(v.marca,'')||' '||coalesce(v.placa,'')))>0)
      order by v.modelo,v.id limit 30
    ) x;
  else
    select coalesce(jsonb_agg(to_jsonb(x) order by x.favorito desc,x.descricao,x.id),'[]') into resultado from (
      select c.id,c.tipo,c.descricao,c.unidade,c.preco_padrao_centavos,c.favorito,c.arquivado_em,c.revisao,e.custo_centavos
      from public.itens_catalogo c left join public.estoque_produtos e on e.oficina_id=c.oficina_id and e.item_catalogo_id=c.id
      where c.oficina_id=p_oficina and (c.arquivado_em is null or c.id=p_id)
      and (p_id is null or c.id=p_id) and (p_tipo_item='' or c.tipo=p_tipo_item)
      and (busca='' or c.id in (
        select id from public.itens_catalogo where oficina_id=p_oficina and private.texto_busca(descricao) like private.padrao_busca(busca)
        union select item_catalogo_id from public.estoque_produtos where oficina_id=p_oficina and private.texto_busca(coalesce(codigo,'')) like private.padrao_busca(busca)))
      order by c.favorito desc,c.descricao,c.id limit 30
    ) x;
  end if;
  return resultado;
end $$;
revoke all on function public.buscar_cadastros_operacao(uuid,text,text,uuid,uuid,text) from public,anon;
grant execute on function public.buscar_cadastros_operacao(uuid,text,text,uuid,uuid,text) to authenticated;
