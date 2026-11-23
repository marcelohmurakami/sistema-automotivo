-- Versão alinhada ao registro da aplicação pelo MCP no projeto conectado.
begin;

-- A mesma sequência antes executada pelo navegador, sem uma segunda viagem de rede.
-- As funções chamadas continuam responsáveis pela autorização e pelas regras financeiras.
create or replace function public.consultar_painel_financeiro(
  p_oficina uuid, p_inicio date, p_fim date,
  p_busca text default '', p_filtro text default 'abertos',
  p_natureza text default '', p_pagina integer default 0,
  p_os uuid default null, p_titulo uuid default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare painel jsonb; titulo jsonb;
begin
  perform public.sincronizar_contas_recorrentes(p_oficina);
  painel := public.consultar_financeiro(p_oficina,p_inicio,p_fim,p_busca,p_filtro,p_natureza,p_pagina,p_os);
  if p_titulo is not null then
    titulo := public.consultar_titulo_alerta(p_oficina,p_titulo);
    painel := painel || jsonb_build_object(
      'itens',case when titulo is null or titulo='null'::jsonb then '[]'::jsonb else jsonb_build_array(titulo) end,
      'total',case when titulo is null or titulo='null'::jsonb then 0 else 1 end
    );
  end if;
  return painel;
end $$;
revoke all on function public.consultar_painel_financeiro(uuid,date,date,text,text,text,integer,uuid,uuid) from public, anon;
grant execute on function public.consultar_painel_financeiro(uuid,date,date,text,text,text,integer,uuid,uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
