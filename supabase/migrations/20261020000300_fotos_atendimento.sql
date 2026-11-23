begin;
create table public.fotos_atendimento (
 id uuid primary key default gen_random_uuid(), oficina_id uuid not null, atendimento_id uuid not null,
 arquivo_id uuid not null, fase text not null check(fase in ('antes','depois')),
 legenda text not null default '' check(length(legenda)<=500), criado_em timestamptz not null default now(), removido_em timestamptz,
 foreign key(oficina_id,atendimento_id) references public.atendimentos_servicos(oficina_id,id),
 foreign key(oficina_id,arquivo_id) references public.arquivos(oficina_id,id), unique(arquivo_id)
);
create index fotos_atendimento_lista on public.fotos_atendimento(oficina_id,atendimento_id,criado_em) where removido_em is null;
alter table public.fotos_atendimento enable row level security;
revoke all on public.fotos_atendimento from anon,authenticated;

create function private.exigir_fotos_atendimento(p_oficina uuid,p_atendimento uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.exigir_servicos(p_oficina,'service_media');
 if not exists(select 1 from public.atendimentos_servicos where oficina_id=p_oficina and id=p_atendimento) then raise exception 'Atendimento indisponível.' using errcode='42501';end if;
end $$;
create function public.reservar_foto_atendimento(p_oficina uuid,p_atendimento uuid,p_nome text,p_mime text,p_tamanho bigint,p_fase text,p_legenda text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare f uuid:=gen_random_uuid(); caminho text;
begin
 perform private.exigir_fotos_atendimento(p_oficina,p_atendimento);
 perform 1 from public.atendimentos_servicos where oficina_id=p_oficina and id=p_atendimento and situacao<>'cancelado' for update;
 if not found then raise exception 'Atendimento cancelado.' using errcode='22023';end if;
 if p_fase is null or p_fase not in ('antes','depois') or p_mime is null or p_mime not in ('image/jpeg','image/png','image/webp') or p_tamanho is null or p_tamanho not between 1 and 10485760 or length(coalesce(p_legenda,''))>500 then raise exception 'Use JPG, PNG ou WebP de até 10 MB e escolha antes ou depois.' using errcode='22023';end if;
 if (select count(*) from public.fotos_atendimento where oficina_id=p_oficina and atendimento_id=p_atendimento and removido_em is null)>=40 then raise exception 'Limite de 40 fotos por atendimento.' using errcode='22023';end if;
 caminho:=p_oficina||'/atendimentos/'||p_atendimento||'/'||f;
 insert into public.arquivos(id,oficina_id,recipiente,caminho_arquivo,nome_original,tipo_mime,tamanho_bytes,criado_por) values(f,p_oficina,'workshop-files',caminho,left(coalesce(p_nome,'foto'),200),p_mime,p_tamanho,auth.uid());
 insert into public.fotos_atendimento(oficina_id,atendimento_id,arquivo_id,fase,legenda) values(p_oficina,p_atendimento,f,p_fase,coalesce(p_legenda,''));
 return jsonb_build_object('id',f,'caminho',caminho);
end $$;
create function private.pode_enviar_foto_atendimento(p_caminho text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.arquivos f join public.fotos_atendimento a on a.arquivo_id=f.id and a.oficina_id=f.oficina_id
 join public.atendimentos_servicos t on t.oficina_id=a.oficina_id and t.id=a.atendimento_id
 where f.caminho_arquivo=p_caminho and f.recipiente='workshop-files' and f.criado_por=auth.uid() and f.situacao='pending'
 and f.criado_em>now()-interval '1 hour' and a.removido_em is null and t.situacao<>'cancelado'
 and private.is_workshop_member(f.oficina_id) and private.has_feature(f.oficina_id,'service_media'));
$$;
create policy foto_atendimento_upload on storage.objects for insert to authenticated with check(bucket_id='workshop-files' and private.pode_enviar_foto_atendimento(name));
create function public.confirmar_foto_atendimento(p_oficina uuid,p_atendimento uuid,p_arquivo uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.exigir_fotos_atendimento(p_oficina,p_atendimento);
 perform 1 from public.atendimentos_servicos where oficina_id=p_oficina and id=p_atendimento for update;
 update public.arquivos f set situacao='ready' where f.oficina_id=p_oficina and f.id=p_arquivo and f.criado_por=auth.uid()
 and f.situacao='pending' and exists(select 1 from public.fotos_atendimento a where a.oficina_id=p_oficina and a.atendimento_id=p_atendimento and a.arquivo_id=f.id and a.removido_em is null)
 and exists(select 1 from storage.objects where bucket_id=f.recipiente and name=f.caminho_arquivo);
 if not found then
   if exists(select 1 from public.fotos_atendimento a join public.arquivos f on f.id=a.arquivo_id where a.oficina_id=p_oficina and a.atendimento_id=p_atendimento and a.arquivo_id=p_arquivo and a.removido_em is null and f.situacao='ready') then return;end if;
   raise exception 'Envio não confirmado. Tente novamente.' using errcode='22023';
 end if;
 insert into public.eventos_atendimento(oficina_id,atendimento_id,tipo,depois,autor) values(p_oficina,p_atendimento,'foto','Foto adicionada ao atendimento',auth.uid());
end $$;
create function public.listar_fotos_atendimento(p_oficina uuid,p_atendimento uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.exigir_fotos_atendimento(p_oficina,p_atendimento);
 return (select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'arquivo_id',f.id,'fase',a.fase,'legenda',a.legenda,'caminho',f.caminho_arquivo,'situacao',f.situacao) order by a.criado_em,a.id),'[]') from public.fotos_atendimento a join public.arquivos f on f.id=a.arquivo_id and f.oficina_id=a.oficina_id where a.oficina_id=p_oficina and a.atendimento_id=p_atendimento and a.removido_em is null);
end $$;
create function public.remover_foto_atendimento(p_oficina uuid,p_atendimento uuid,p_foto uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.exigir_fotos_atendimento(p_oficina,p_atendimento);
 update public.fotos_atendimento set removido_em=now() where oficina_id=p_oficina and atendimento_id=p_atendimento and id=p_foto and removido_em is null;
 if found then insert into public.eventos_atendimento(oficina_id,atendimento_id,tipo,depois,autor) values(p_oficina,p_atendimento,'foto','Foto retirada da galeria; arquivo preservado',auth.uid());end if;
end $$;
revoke all on function private.exigir_fotos_atendimento(uuid,uuid),private.pode_enviar_foto_atendimento(text) from public,anon,authenticated;
grant execute on function private.pode_enviar_foto_atendimento(text) to authenticated;
revoke all on function public.reservar_foto_atendimento(uuid,uuid,text,text,bigint,text,text),public.confirmar_foto_atendimento(uuid,uuid,uuid),public.listar_fotos_atendimento(uuid,uuid),public.remover_foto_atendimento(uuid,uuid,uuid) from public,anon;
grant execute on function public.reservar_foto_atendimento(uuid,uuid,text,text,bigint,text,text),public.confirmar_foto_atendimento(uuid,uuid,uuid),public.listar_fotos_atendimento(uuid,uuid),public.remover_foto_atendimento(uuid,uuid,uuid) to authenticated;
commit;
