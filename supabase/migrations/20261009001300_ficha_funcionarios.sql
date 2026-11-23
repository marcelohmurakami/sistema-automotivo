begin;
alter table public.funcionarios add column admissao date, add column desligamento date,
 add column salario_centavos bigint check(salario_centavos between 0 and 10000000000),
 add column dados jsonb not null default '{}' check(jsonb_typeof(dados)='object' and octet_length(dados::text)<20000),
 add constraint datas_funcionario check(desligamento is null or admissao is null or desligamento>=admissao);
create table public.registros_funcionario (
 id uuid primary key, oficina_id uuid not null references public.oficinas(id), funcionario_id uuid not null references public.funcionarios(id),
 tipo text not null check(tipo in ('recado','ausencia','ferias','afastamento','treinamento','ocorrencia','salario')),
 inicio date not null, fim date, descricao text not null check(length(trim(descricao)) between 1 and 2000),
 situacao text not null default 'pendente' check(situacao in ('pendente','concluido','cancelado')),
 criado_por uuid not null references auth.users(id), criado_em timestamptz not null default now(),
 check(fim is null or fim>=inicio)
);
create index registros_funcionario_ficha on public.registros_funcionario(oficina_id,funcionario_id,inicio desc);
alter table public.registros_funcionario enable row level security;
revoke all on public.registros_funcionario from public,anon,authenticated;
alter function public.salvar_funcionario(uuid,uuid,jsonb,integer) rename to salvar_funcionario_basico;
revoke all on function public.salvar_funcionario_basico(uuid,uuid,jsonb,integer) from public,anon,authenticated;
create function public.salvar_funcionario(p_oficina uuid,p_id uuid,p_dados jsonb,p_revisao integer default null) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid; anterior public.funcionarios%rowtype; salario bigint; adm date; des date; extra jsonb;
begin
 u:=private.exigir_cadastro_funcionarios(p_oficina);
 perform pg_advisory_xact_lock(hashtextextended('funcionario:'||p_id,0));
 select * into anterior from public.funcionarios where id=p_id;
 perform public.salvar_funcionario_basico(p_oficina,p_id,p_dados,p_revisao);
 if anterior.id is not null and p_revisao is null then return p_id;end if;
 salario:=case when p_dados ? 'salario_centavos' then (p_dados->>'salario_centavos')::bigint else anterior.salario_centavos end;
 adm:=case when p_dados ? 'admissao' then nullif(p_dados->>'admissao','')::date else anterior.admissao end;
 des:=case when p_dados ? 'desligamento' then nullif(p_dados->>'desligamento','')::date else anterior.desligamento end;
 extra:=case when p_dados ? 'dados' then p_dados->'dados' else coalesce(anterior.dados,'{}') end;
 update public.funcionarios set salario_centavos=salario,admissao=adm,desligamento=des,dados=extra where oficina_id=p_oficina and id=p_id;
 if salario is distinct from anterior.salario_centavos then
  insert into public.registros_funcionario(id,oficina_id,funcionario_id,tipo,inicio,descricao,situacao,criado_por)
  values(gen_random_uuid(),p_oficina,p_id,'salario',(now() at time zone 'America/Sao_Paulo')::date,
  'Salário-base: '||case when anterior.salario_centavos is null then 'não informado' else 'R$ '||replace((anterior.salario_centavos/100.0)::numeric(14,2)::text,'.',',') end||' → '||case when salario is null then 'não informado' else 'R$ '||replace((salario/100.0)::numeric(14,2)::text,'.',',') end,'concluido',u);
 end if;
 return p_id;
end $$;
create function public.listar_registros_funcionario(p_oficina uuid,p_funcionario uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.exigir_cadastro_funcionarios(p_oficina);
 return (select coalesce(jsonb_agg(to_jsonb(r) order by r.inicio desc,r.criado_em desc),'[]') from public.registros_funcionario r where oficina_id=p_oficina and funcionario_id=p_funcionario);
end $$;
create function public.registrar_evento_funcionario(p_oficina uuid,p_funcionario uuid,p_id uuid,p_dados jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid; r public.registros_funcionario%rowtype;
begin
 u:=private.exigir_cadastro_funcionarios(p_oficina);
 if not exists(select 1 from public.funcionarios where id=p_funcionario and oficina_id=p_oficina) then raise exception 'Funcionário indisponível.';end if;
 perform pg_advisory_xact_lock(hashtextextended('registro_funcionario:'||p_id,0));
 select * into r from public.registros_funcionario where id=p_id;
 if found then
  if r.oficina_id<>p_oficina or r.funcionario_id<>p_funcionario then raise exception 'Registro indisponível.';end if;
  return p_id;
 end if;
 if p_dados->>'tipo'='salario' then raise exception 'Altere o salário na ficha do funcionário.';end if;
 insert into public.registros_funcionario(id,oficina_id,funcionario_id,tipo,inicio,fim,descricao,criado_por)
 values(p_id,p_oficina,p_funcionario,p_dados->>'tipo',(p_dados->>'inicio')::date,nullif(p_dados->>'fim','')::date,trim(p_dados->>'descricao'),u);
 return p_id;
end $$;
create function public.situacao_evento_funcionario(p_oficina uuid,p_id uuid,p_situacao text) returns void language plpgsql security definer set search_path='' as $$
declare u uuid;
begin
 u:=private.exigir_cadastro_funcionarios(p_oficina);
 if p_situacao not in ('concluido','cancelado') then raise exception 'Situação inválida.';end if;
 update public.registros_funcionario set situacao=p_situacao where oficina_id=p_oficina and id=p_id and tipo<>'salario' and situacao='pendente';
 if not found then raise exception 'Registro indisponível ou já encerrado. Atualize a ficha.';end if;
 insert into public.registros_auditoria(oficina_id,usuario_autor_id,tipo_autor,acao,tipo_entidade,entidade_id,correlacao_id) values(p_oficina,u,'user','registro_funcionario_'||p_situacao,'funcionario_registro',p_id,gen_random_uuid());
end $$;
revoke all on function public.salvar_funcionario(uuid,uuid,jsonb,integer),public.listar_registros_funcionario(uuid,uuid),public.registrar_evento_funcionario(uuid,uuid,uuid,jsonb),public.situacao_evento_funcionario(uuid,uuid,text) from public,anon;
grant execute on function public.salvar_funcionario(uuid,uuid,jsonb,integer),public.listar_registros_funcionario(uuid,uuid),public.registrar_evento_funcionario(uuid,uuid,uuid,jsonb),public.situacao_evento_funcionario(uuid,uuid,text) to authenticated;
commit;
