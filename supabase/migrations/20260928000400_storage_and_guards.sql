begin;

-- Bucket privado. Objetos sao enviados pela Storage API, nunca por INSERT em storage.objects.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('workshop-files','workshop-files',false,15728640,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']);

-- A tabela file_assets nao e legivel pelo cliente: funcao retorna apenas autorizacao.
create function private.can_read_workshop_object(p_bucket text,p_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.file_assets f
    where f.bucket=p_bucket and f.object_path=p_path and f.status='ready'
      and private.is_workshop_member(f.workshop_id));
$$;
revoke all on function private.can_read_workshop_object(text,text) from public;
grant execute on function private.can_read_workshop_object(text,text) to authenticated;
create policy workshop_files_staff_read on storage.objects for select to authenticated
  using (bucket_id='workshop-files' and private.can_read_workshop_object(bucket_id,name));
-- Upload/exclusao e URLs do portal: backend autorizado, paths novos e bucket privado.
-- Nenhuma permissao anonima ou de sobrescrita e adicionada.

create function private.validate_work_order_item_source() returns trigger
language plpgsql set search_path='' as $$
declare source_version uuid;
begin
  if new.source_quote_item_id is not null then
    select source_quote_version_id into source_version from public.work_orders
      where workshop_id=new.workshop_id and id=new.work_order_id;
    if source_version is null or not exists(select 1 from public.quote_items
      where workshop_id=new.workshop_id and id=new.source_quote_item_id and quote_version_id=source_version) then
      raise exception 'Item does not belong to the source quote version' using errcode='23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger work_order_item_source before insert or update on public.work_order_items
for each row execute function private.validate_work_order_item_source();

create function private.validate_site_product() returns trigger
language plpgsql set search_path='' as $$
begin
  if not exists(select 1 from public.catalog_items where workshop_id=new.workshop_id
    and id=new.catalog_item_id and kind='part' and archived_at is null) then
    raise exception 'Site product must reference an active part' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger site_product_kind before insert or update on public.site_products
for each row execute function private.validate_site_product();

commit;
