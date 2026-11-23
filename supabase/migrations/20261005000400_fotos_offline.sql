begin;
create table public.reservas_foto_offline(chave uuid primary key,oficina_id uuid not null,ordem_servico_id uuid not null,renovado_em timestamptz not null default now(),hash_conteudo text not null check(hash_conteudo~'^[a-f0-9]{64}$'),reserva jsonb not null,criado_por uuid not null references auth.users(id),foreign key(oficina_id,ordem_servico_id) references public.ordens_servico(oficina_id,id));
alter table public.reservas_foto_offline enable row level security;revoke all on public.reservas_foto_offline from public,anon,authenticated;
create function public.reservar_foto_os_offline(p_oficina uuid,p_os uuid,p_chave uuid,p_hash text,p_fase text,p_tamanho bigint,p_legenda text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid;r public.reservas_foto_offline;resposta jsonb;begin
 u:=private.exigir_os(p_oficina);if p_chave is null then raise exception 'Identificação da foto obrigatória.' using errcode='22023';end if;perform pg_advisory_xact_lock(hashtextextended(p_chave::text,0));
 select * into r from public.reservas_foto_offline where chave=p_chave;
 if found then if r.oficina_id<>p_oficina or r.ordem_servico_id<>p_os or r.criado_por<>u or r.hash_conteudo is distinct from p_hash then raise exception 'Reserva de outra foto ou atendimento.' using errcode='22023';end if;update public.reservas_foto_offline set renovado_em=now() where chave=p_chave;return r.reserva;end if;
 resposta:=public.reservar_foto_os(p_oficina,p_os,p_fase,p_chave::text||'.jpg','image/jpeg',p_tamanho,p_legenda);
 insert into public.reservas_foto_offline(chave,oficina_id,ordem_servico_id,hash_conteudo,reserva,criado_por) values(p_chave,p_oficina,p_os,p_hash,resposta,u);return resposta;
end $$;
revoke all on function public.reservar_foto_os_offline(uuid,uuid,uuid,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.reservar_foto_os_offline(uuid,uuid,uuid,text,text,bigint,text) to authenticated;
do $$declare s text;begin
 s:=pg_get_functiondef('private.pode_enviar_foto_os(text)'::regprocedure);
 s:=replace(s,'f.criado_em>now()-interval ''1 hour''','(f.criado_em>now()-interval ''1 hour'' or exists(select 1 from public.reservas_foto_offline r where r.oficina_id=f.oficina_id and (r.reserva->>''id'')::uuid=f.id and r.criado_por=auth.uid() and r.renovado_em>now()-interval ''1 hour''))');
 execute s;
end $$;
grant select on public.etapas_execucao_os to authenticated;
create policy etapas_execucao_leitura on public.etapas_execucao_os for select to authenticated using(private.is_workshop_member(oficina_id) and private.has_feature(oficina_id,'work_orders'));
notify pgrst,'reload schema';commit;
