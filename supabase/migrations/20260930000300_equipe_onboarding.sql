begin;
alter table public.membros_oficina add column revisao integer not null default 1;
create table public.convites_equipe (
 id uuid primary key default gen_random_uuid(), oficina_id uuid not null references public.oficinas(id),
 email text not null check(length(email)<=254), perfil text not null check(perfil in ('manager','staff')),
 hash_token text not null unique check(hash_token ~ '^[a-f0-9]{64}$'),
 criado_por uuid not null references auth.users(id), criado_em timestamptz not null default now(),
 expira_em timestamptz not null default now()+interval '7 days', revogado_em timestamptz,
 aceito_em timestamptz, aceito_por uuid references auth.users(id)
);
create index convites_equipe_oficina on public.convites_equipe(oficina_id,criado_em desc);
alter table public.convites_equipe enable row level security;
revoke all on public.convites_equipe from anon,authenticated;
create table public.cadastros_oficina (
 usuario_id uuid not null references auth.users(id), chave uuid not null,
 oficina_id uuid not null references public.oficinas(id), primary key(usuario_id,chave)
);
alter table public.cadastros_oficina enable row level security;
revoke all on public.cadastros_oficina from anon,authenticated;

create function private.exigir_proprietario(p_oficina uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); begin
 if not exists(select 1 from public.membros_oficina where oficina_id=p_oficina and usuario_id=u and ativo and perfil='owner') then
 raise exception 'Somente o proprietário pode administrar a equipe.' using errcode='42501'; end if;
 return u;
end $$;
revoke all on function private.exigir_proprietario(uuid) from public,anon,authenticated;

create function public.consultar_equipe(p_oficina uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.exigir_proprietario(p_oficina);
 return jsonb_build_object('membros',(select coalesce(jsonb_agg(jsonb_build_object('usuario_id',m.usuario_id,'email',u.email,'perfil',m.perfil,'ativo',m.ativo,'revisao',m.revisao) order by m.criado_em),'[]') from public.membros_oficina m join auth.users u on u.id=m.usuario_id where m.oficina_id=p_oficina),
 'convites',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'email',email,'perfil',perfil,'expira_em',expira_em,'situacao',case when aceito_em is not null then 'aceito' when revogado_em is not null then 'revogado' when expira_em<=now() then 'expirado' else 'pendente' end) order by criado_em desc),'[]') from (select * from public.convites_equipe where oficina_id=p_oficina order by criado_em desc limit 100) c));
end $$;

create function public.criar_convite_equipe(p_oficina uuid,p_email text,p_perfil text,p_hash_token text) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid; c uuid; e text:=lower(trim(p_email)); begin
 perform 1 from public.oficinas where id=p_oficina for update;
 u:=private.exigir_proprietario(p_oficina);
 if not private.has_feature(p_oficina,'customers') then raise exception 'Assinatura indisponível para novos convites.' using errcode='42501';end if;
 if e is null or length(e)>254 or e !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_perfil is null or p_perfil not in ('manager','staff') or p_hash_token is null or p_hash_token !~ '^[a-f0-9]{64}$' then raise exception 'Confira o e-mail e o perfil do convite.' using errcode='22023';end if;
 if exists(select 1 from public.membros_oficina m join auth.users a on a.id=m.usuario_id where m.oficina_id=p_oficina and lower(a.email)=e) then raise exception 'Essa pessoa já está na equipe. Altere ou reative seu acesso na lista.' using errcode='22023';end if;
 if (select count(*) from public.convites_equipe where oficina_id=p_oficina and criado_em>now()-interval '1 hour')>=30 then raise exception 'Limite de convites atingido. Tente novamente mais tarde.' using errcode='22023';end if;
 update public.convites_equipe set revogado_em=now() where oficina_id=p_oficina and email=e and aceito_em is null and revogado_em is null;
 insert into public.convites_equipe(oficina_id,email,perfil,hash_token,criado_por) values(p_oficina,e,p_perfil,p_hash_token,u) returning id into c;
 insert into public.registros_auditoria(oficina_id,usuario_autor_id,tipo_autor,acao,tipo_entidade,entidade_id,correlacao_id) values(p_oficina,u,'user','equipe.convite_criado','convite',c,gen_random_uuid());
 return c;
end $$;

create function public.revogar_convite_equipe(p_oficina uuid,p_convite uuid) returns void language plpgsql security definer set search_path='' as $$
declare u uuid; begin
 perform 1 from public.oficinas where id=p_oficina for update; u:=private.exigir_proprietario(p_oficina);
 update public.convites_equipe set revogado_em=now() where id=p_convite and oficina_id=p_oficina and aceito_em is null and revogado_em is null;
 if not found then raise exception 'Convite indisponível. Atualize a lista.' using errcode='PT409';end if;
 insert into public.registros_auditoria(oficina_id,usuario_autor_id,tipo_autor,acao,tipo_entidade,entidade_id,correlacao_id) values(p_oficina,u,'user','equipe.convite_revogado','convite',p_convite,gen_random_uuid());
end $$;

create function public.consultar_convite_equipe(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.convites_equipe; begin
 if auth.uid() is null then raise exception 'Entre para consultar o convite.' using errcode='42501';end if;
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Convite inválido.' using errcode='22023';end if;
 select * into c from public.convites_equipe where hash_token=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 if not found then raise exception 'Convite indisponível.' using errcode='22023';end if;
 if not exists(select 1 from auth.users where id=auth.uid() and lower(email)=c.email and email_confirmed_at is not null) then raise exception 'Entre com o e-mail confirmado que recebeu este convite.' using errcode='42501';end if;
 if c.revogado_em is not null or (c.aceito_em is null and c.expira_em<=now()) then raise exception 'Convite expirado ou revogado. Solicite outro ao proprietário.' using errcode='22023';end if;
 return jsonb_build_object('oficina',(select nome from public.oficinas where id=c.oficina_id),'perfil',c.perfil,'email',c.email);
end $$;
revoke all on function public.consultar_convite_equipe(text) from public,anon;
grant execute on function public.consultar_convite_equipe(text) to authenticated;

create function public.aceitar_convite_equipe(p_token text) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.convites_equipe; u uuid:=auth.uid(); e text; confirmado timestamptz; w uuid; begin
 if u is null then raise exception 'Entre na sua conta para aceitar o convite.' using errcode='42501';end if;
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Convite inválido ou indisponível.' using errcode='22023';end if;
 select oficina_id into w from public.convites_equipe where hash_token=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 perform 1 from public.oficinas where id=w for update;
 select * into c from public.convites_equipe where hash_token=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 if not found then raise exception 'Convite inválido ou indisponível.' using errcode='22023';end if;
 select lower(email),email_confirmed_at into e,confirmado from auth.users where id=u;
 if e is distinct from c.email or confirmado is null then raise exception 'Entre com o e-mail confirmado que recebeu este convite.' using errcode='42501';end if;
 if c.aceito_em is not null then
   if c.aceito_por=u and exists(select 1 from public.membros_oficina where oficina_id=w and usuario_id=u and ativo) then return w; end if;
   raise exception 'Convite já utilizado.' using errcode='22023';
 end if;
 if c.revogado_em is not null or c.expira_em<=now() or not exists(select 1 from public.membros_oficina where oficina_id=w and usuario_id=c.criado_por and ativo and perfil='owner') then raise exception 'Convite expirado ou revogado. Solicite um novo.' using errcode='22023';end if;
 if not private.has_feature(w,'customers') then raise exception 'A oficina está com a assinatura indisponível.' using errcode='42501';end if;
 if exists(select 1 from public.membros_oficina where oficina_id=w and usuario_id=u) then raise exception 'Sua conta já pertence à equipe. Peça ao proprietário para revisar seu acesso.' using errcode='22023';end if;
 insert into public.membros_oficina(oficina_id,usuario_id,perfil,ativo) values(w,u,c.perfil,true);
 update public.convites_equipe set aceito_em=now(),aceito_por=u where id=c.id;
 insert into public.registros_auditoria(oficina_id,usuario_autor_id,tipo_autor,acao,tipo_entidade,entidade_id,correlacao_id) values(w,u,'user','equipe.convite_aceito','convite',c.id,gen_random_uuid());
 return w;
end $$;

create function public.alterar_membro_equipe(p_oficina uuid,p_usuario uuid,p_revisao integer,p_perfil text,p_ativo boolean) returns void language plpgsql security definer set search_path='' as $$
declare u uuid; m public.membros_oficina; begin
 perform 1 from public.oficinas where id=p_oficina for update; u:=private.exigir_proprietario(p_oficina);
 select * into m from public.membros_oficina where oficina_id=p_oficina and usuario_id=p_usuario for update;
 if not found then raise exception 'Membro não encontrado.' using errcode='22023';end if;
 if m.perfil='owner' or p_usuario=u then raise exception 'O acesso do proprietário não pode ser alterado aqui.' using errcode='42501';end if;
 if p_perfil is null or p_perfil not in ('manager','staff') or p_ativo is null then raise exception 'Perfil inválido.' using errcode='22023';end if;
 if m.revisao is distinct from p_revisao then raise exception 'A equipe foi alterada. Atualize a lista.' using errcode='PT409';end if;
 update public.membros_oficina set perfil=p_perfil,ativo=p_ativo,revisao=revisao+1,atualizado_em=now() where oficina_id=p_oficina and usuario_id=p_usuario;
 insert into public.registros_auditoria(oficina_id,usuario_autor_id,tipo_autor,acao,tipo_entidade,entidade_id,correlacao_id) values(p_oficina,u,'user',case when not p_ativo then 'equipe.acesso_suspenso' else 'equipe.acesso_atualizado' end,'membro',p_usuario,gen_random_uuid());
end $$;

create function public.configurar_nova_oficina(p_chave uuid,p_nome text,p_telefone text,p_endereco jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); w uuid; begin
 if u is null or not exists(select 1 from auth.users where id=u and email_confirmed_at is not null) then raise exception 'Confirme seu e-mail antes de cadastrar a oficina.' using errcode='42501';end if;
 if p_chave is null or length(trim(coalesce(p_nome,''))) not between 2 and 120 or (coalesce(p_telefone,'')<>'' and p_telefone !~ '^\+[1-9][0-9]{7,14}$') or p_endereco is null or jsonb_typeof(p_endereco)<>'object' or length(p_endereco::text)>2000 then raise exception 'Confira nome, telefone e endereço.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||p_chave::text,0));
 select oficina_id into w from public.cadastros_oficina where usuario_id=u and chave=p_chave;
 if found then return w;end if;
 w:=public.criar_oficina(p_nome,nullif(p_telefone,''));
 update public.oficinas set endereco=p_endereco where id=w;
 insert into public.cadastros_oficina values(u,p_chave,w);
 insert into public.registros_auditoria(oficina_id,usuario_autor_id,tipo_autor,acao,tipo_entidade,entidade_id,correlacao_id) values(w,u,'user','oficina.configurada','oficina',w,gen_random_uuid());
 return w;
end $$;
revoke all on function public.consultar_equipe(uuid),public.criar_convite_equipe(uuid,text,text,text),public.revogar_convite_equipe(uuid,uuid),public.aceitar_convite_equipe(text),public.alterar_membro_equipe(uuid,uuid,integer,text,boolean),public.configurar_nova_oficina(uuid,text,text,jsonb) from public,anon;
grant execute on function public.consultar_equipe(uuid),public.criar_convite_equipe(uuid,text,text,text),public.revogar_convite_equipe(uuid,uuid),public.aceitar_convite_equipe(text),public.alterar_membro_equipe(uuid,uuid,integer,text,boolean),public.configurar_nova_oficina(uuid,text,text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
