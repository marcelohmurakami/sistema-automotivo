begin;

create function private.excluir_alertas(p_oficina uuid, p_chaves text[]) returns integer
language plpgsql security definer set search_path='' as $$
declare u uuid; quantidade integer;
begin
  perform private.conferir_operacao(p_oficina,'excluir_alerta');
  u:=private.require_staff(p_oficina);
  if p_chaves is null or cardinality(p_chaves)>10000
     or exists(select 1 from unnest(p_chaves) c(chave) where chave is null or length(chave) not between 1 and 250) then
    raise exception 'Lista de avisos inválida.' using errcode='22023';
  end if;
  insert into public.alertas_lidos(oficina_id,usuario_id,chave,excluido_em)
    select p_oficina,u,chave,now() from (select distinct unnest(p_chaves) as chave) chaves
    on conflict(oficina_id,usuario_id,chave) do update set excluido_em=excluded.excluido_em;
  get diagnostics quantidade = row_count;
  return quantidade;
end $$;

create function public.excluir_alertas(p_oficina uuid, p_chaves text[]) returns integer
language sql security invoker set search_path='' as $$
  select private.excluir_alertas(p_oficina,p_chaves)
$$;

revoke all on function private.excluir_alertas(uuid,text[]),public.excluir_alertas(uuid,text[]) from public,anon;
grant execute on function private.excluir_alertas(uuid,text[]),public.excluir_alertas(uuid,text[]) to authenticated;

commit;
