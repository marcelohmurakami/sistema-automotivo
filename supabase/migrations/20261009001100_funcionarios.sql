begin;
create table public.funcionarios (
 id uuid primary key, oficina_id uuid not null references public.oficinas(id),
 nome text not null check(length(trim(nome)) between 1 and 160),
 funcao text not null default '' check(length(funcao)<=120),
 telefone text not null default '' check(length(telefone)<=40),
 email text not null default '' check(length(email)<=200),
 observacoes text not null default '' check(length(observacoes)<=2000),
 ativo boolean not null default true, revisao integer not null default 1,
 criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create index funcionarios_oficina on public.funcionarios(oficina_id,nome);
alter table public.funcionarios enable row level security;
revoke all on public.funcionarios from public,anon,authenticated;
create function private.exigir_cadastro_funcionarios(p_oficina uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_staff(p_oficina);
begin
 if not exists(select 1 from public.membros_oficina where oficina_id=p_oficina and usuario_id=u and ativo and perfil in ('owner','manager')) then raise exception 'Cadastro de funcionários disponível somente à gerência.' using errcode='42501';end if;
 return u;
end $$;
revoke all on function private.exigir_cadastro_funcionarios(uuid) from public,anon,authenticated;
create function public.listar_funcionarios(p_oficina uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.exigir_cadastro_funcionarios(p_oficina);
 return (select coalesce(jsonb_agg(to_jsonb(f) order by f.nome,f.id),'[]') from public.funcionarios f where f.oficina_id=p_oficina);
end $$;
create function public.salvar_funcionario(p_oficina uuid,p_id uuid,p_dados jsonb,p_revisao integer default null) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid; f public.funcionarios%rowtype;
begin
 u:=private.exigir_cadastro_funcionarios(p_oficina);
 if p_id is null then raise exception 'Identificador obrigatório.';end if;
 perform pg_advisory_xact_lock(hashtextextended('funcionario:'||p_id,0));
 select * into f from public.funcionarios where id=p_id for update;
 if found then
  if f.oficina_id<>p_oficina then raise exception 'Funcionário indisponível.' using errcode='42501';end if;
  if p_revisao is null then return p_id;end if;
  if p_revisao<>f.revisao then raise exception 'Cadastro alterado. Atualize a lista antes de editar.';end if;
 elsif p_revisao is not null then raise exception 'Funcionário não encontrado.';
 end if;
 insert into public.funcionarios(id,oficina_id,nome,funcao,telefone,email,observacoes,ativo)
 values(p_id,p_oficina,trim(p_dados->>'nome'),trim(coalesce(p_dados->>'funcao','')),trim(coalesce(p_dados->>'telefone','')),trim(coalesce(p_dados->>'email','')),coalesce(p_dados->>'observacoes',''),coalesce((p_dados->>'ativo')::boolean,true))
 on conflict(id) do update set nome=excluded.nome,funcao=excluded.funcao,telefone=excluded.telefone,email=excluded.email,observacoes=excluded.observacoes,ativo=excluded.ativo,revisao=public.funcionarios.revisao+1,atualizado_em=now();
 insert into public.registros_auditoria(oficina_id,usuario_autor_id,tipo_autor,acao,tipo_entidade,entidade_id,correlacao_id) values(p_oficina,u,'user','salvar_funcionario','funcionario',p_id,gen_random_uuid());
 return p_id;
end $$;
revoke all on function public.listar_funcionarios(uuid),public.salvar_funcionario(uuid,uuid,jsonb,integer) from public,anon;
grant execute on function public.listar_funcionarios(uuid),public.salvar_funcionario(uuid,uuid,jsonb,integer) to authenticated;
commit;
