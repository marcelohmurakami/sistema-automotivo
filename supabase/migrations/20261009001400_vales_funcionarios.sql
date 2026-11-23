begin;
alter table public.registros_funcionario drop constraint registros_funcionario_tipo_check;
alter table public.registros_funcionario add constraint registros_funcionario_tipo_check check(tipo in ('recado','ausencia','ferias','afastamento','treinamento','ocorrencia','salario','vale','emprestimo'));
alter table public.registros_funcionario add column valor_centavos bigint, add column abatimentos jsonb not null default '[]';
alter table public.registros_funcionario add constraint valor_vale check (tipo not in ('vale','emprestimo') or (valor_centavos is not null and valor_centavos between 1 and 10000000000));
create or replace function public.registrar_evento_funcionario(p_oficina uuid,p_funcionario uuid,p_id uuid,p_dados jsonb) returns uuid language plpgsql security definer set search_path='' as $$
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
 insert into public.registros_funcionario(id,oficina_id,funcionario_id,tipo,inicio,fim,descricao,criado_por,valor_centavos)
 values(p_id,p_oficina,p_funcionario,p_dados->>'tipo',(p_dados->>'inicio')::date,nullif(p_dados->>'fim','')::date,trim(p_dados->>'descricao'),u,case when p_dados->>'tipo' in ('vale','emprestimo') then (p_dados->>'valor_centavos')::bigint else null end);
 return p_id;
end $$;
create function public.abater_vale_funcionario(p_oficina uuid,p_id uuid,p_chave uuid,p_valor bigint,p_data date,p_descricao text) returns void language plpgsql security definer set search_path='' as $$
declare r public.registros_funcionario%rowtype; pago bigint; u uuid;
begin
 u:=private.exigir_cadastro_funcionarios(p_oficina);
 select * into r from public.registros_funcionario where oficina_id=p_oficina and id=p_id and tipo in ('vale','emprestimo') for update;
 if not found then raise exception 'Vale ou empréstimo indisponível.';end if;
 if exists(select 1 from jsonb_array_elements(r.abatimentos) x where x->>'id'=p_chave::text) then return;end if;
 if p_chave is null or p_valor is null or p_valor<=0 or p_data is null or p_data<r.inicio or p_data>(now() at time zone 'America/Sao_Paulo')::date or coalesce(length(trim(p_descricao)),0) not between 1 and 500 then raise exception 'Confira valor, data e descrição do abatimento.';end if;
 select coalesce(sum((x->>'valor_centavos')::bigint),0) into pago from jsonb_array_elements(r.abatimentos) x;
 if r.situacao<>'pendente' or p_valor>r.valor_centavos-pago then raise exception 'Valor maior que o saldo ou registro encerrado.';end if;
 update public.registros_funcionario set abatimentos=abatimentos||jsonb_build_array(jsonb_build_object('id',p_chave,'valor_centavos',p_valor,'data',p_data,'descricao',trim(p_descricao),'usuario',u,'criado_em',now())),situacao=case when pago+p_valor=r.valor_centavos then 'concluido' else 'pendente' end where id=p_id;
end $$;
create function private.validar_situacao_vale() returns trigger language plpgsql set search_path='' as $$
declare pago bigint;
begin
 if new.tipo in ('vale','emprestimo') then
  select coalesce(sum((x->>'valor_centavos')::bigint),0) into pago from jsonb_array_elements(new.abatimentos) x;
  if new.situacao='concluido' and pago<>new.valor_centavos then raise exception 'Registre os abatimentos para quitar o vale ou empréstimo.';end if;
  if new.situacao='cancelado' and pago>0 then raise exception 'Um registro com abatimentos não pode ser cancelado.';end if;
 end if;return new;
end $$;
create trigger validar_situacao_vale before update on public.registros_funcionario for each row execute function private.validar_situacao_vale();
revoke all on function private.validar_situacao_vale(),public.abater_vale_funcionario(uuid,uuid,uuid,bigint,date,text) from public,anon;
grant execute on function public.abater_vale_funcionario(uuid,uuid,uuid,bigint,date,text) to authenticated;
commit;
