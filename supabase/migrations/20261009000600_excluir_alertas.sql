begin;
alter table public.alertas_lidos add column excluido_em timestamptz;

alter function public.consultar_alertas(uuid) rename to consultar_alertas_incluindo_excluidos;
revoke all on function public.consultar_alertas_incluindo_excluidos(uuid) from public,anon,authenticated;

create function public.consultar_alertas(p_oficina uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare lista jsonb; u uuid;
begin
 u:=private.require_staff(p_oficina);
 lista:=public.consultar_alertas_incluindo_excluidos(p_oficina);
 return coalesce((select jsonb_agg(a.item order by a.posicao)
 from jsonb_array_elements(lista) with ordinality a(item,posicao)
 where not exists(select 1 from public.alertas_lidos l
 where l.oficina_id=p_oficina and l.usuario_id=u and l.chave=a.item->>'chave' and l.excluido_em is not null)), '[]'::jsonb);
end $$;

create function public.excluir_alerta(p_oficina uuid,p_chave text) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid;
begin
 u:=private.require_staff(p_oficina);
 if p_chave is null or length(p_chave) not between 1 and 250 then
   raise exception 'Alerta inválido.' using errcode='22023';
 end if;
 insert into public.alertas_lidos(oficina_id,usuario_id,chave,excluido_em)
 values(p_oficina,u,p_chave,now())
 on conflict(oficina_id,usuario_id,chave) do update set excluido_em=excluded.excluido_em;
end $$;
revoke all on function public.consultar_alertas(uuid),public.excluir_alerta(uuid,text) from public,anon;
grant execute on function public.consultar_alertas(uuid),public.excluir_alerta(uuid,text) to authenticated;
commit;
