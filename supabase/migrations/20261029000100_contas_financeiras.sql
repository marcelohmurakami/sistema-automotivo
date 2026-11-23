begin;
create table public.contas_financeiras (
 oficina_id uuid not null references public.oficinas(id), codigo text not null,
 nome text not null check(length(trim(nome)) between 2 and 100),
 tipo text not null check(tipo in ('caixa','banco')), banco text not null default '' check(length(banco)<=100),
 agencia text not null default '' check(length(agencia)<=30), numero text not null default '' check(length(numero)<=40),
 ativo boolean not null default true, revisao integer not null default 1,
 primary key(oficina_id,codigo), check(codigo in ('caixa','banco') or codigo ~ '^[a-f0-9-]{36}$')
);
alter table public.contas_financeiras enable row level security;
revoke all on public.contas_financeiras from public,anon,authenticated;
create function private.contas_financeiras_padrao(w uuid) returns void language sql set search_path='' as $$
 insert into public.contas_financeiras(oficina_id,codigo,nome,tipo)
 values(w,'caixa','Dinheiro em caixa','caixa'),(w,'banco','Banco / conta digital','banco') on conflict do nothing;
$$;
insert into public.contas_financeiras(oficina_id,codigo,nome,tipo)
 select id,'caixa','Dinheiro em caixa','caixa' from public.oficinas
 union all select id,'banco','Banco / conta digital','banco' from public.oficinas;
alter table public.baixas_financeiras drop constraint baixas_financeiras_conta_check;
alter table public.baixas_financeiras add foreign key(oficina_id,conta) references public.contas_financeiras(oficina_id,codigo);
create index baixas_financeiras_conta_data on public.baixas_financeiras(oficina_id,conta,data,id);
create function private.validar_conta_baixa() returns trigger language plpgsql set search_path='' as $$begin
 perform private.contas_financeiras_padrao(new.oficina_id);
 perform 1 from public.contas_financeiras where oficina_id=new.oficina_id and codigo=new.conta and (ativo or new.estorno_de is not null) for share;
 if not found then raise exception 'Escolha uma conta ativa desta empresa.' using errcode='22023';end if;
 return new;
end $$;
create trigger validar_conta_baixa before insert on public.baixas_financeiras for each row execute function private.validar_conta_baixa();
create function public.consultar_contas_financeiras(p_oficina uuid,p_data date default current_date) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;begin
 perform private.exigir_financeiro(p_oficina);perform private.contas_financeiras_padrao(p_oficina);
 if p_data is null or not isfinite(p_data) then raise exception 'Informe a data do saldo.' using errcode='22023';end if;
 select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('saldo',coalesce(b.saldo,0)) order by c.tipo,c.nome,c.codigo),'[]') into r
 from public.contas_financeiras c left join lateral(
 select sum((case when x.estorno_de is null then 1 else -1 end)*(case when t.natureza='receber' then x.valor_centavos-x.taxa_centavos else -x.valor_centavos end))::bigint saldo
 from public.baixas_financeiras x join public.titulos_financeiros t on t.id=x.titulo_id and t.oficina_id=x.oficina_id
 where x.oficina_id=c.oficina_id and x.conta=c.codigo and x.data<=p_data)b on true where c.oficina_id=p_oficina;
 return r;
end $$;
create function public.salvar_conta_financeira(p_oficina uuid,p_codigo text,p_dados jsonb,p_revisao integer default null) returns void language plpgsql security definer set search_path='' as $$
declare c public.contas_financeiras;begin
 perform private.exigir_financeiro(p_oficina);perform private.contas_financeiras_padrao(p_oficina);
 perform pg_advisory_xact_lock(hashtextextended('conta:'||p_oficina::text||p_codigo,0));
 select * into c from public.contas_financeiras where oficina_id=p_oficina and codigo=p_codigo for update;
 if c.codigo is not null and c.revisao is distinct from p_revisao then raise exception 'A conta foi alterada. Atualize a tela.' using errcode='PT409';end if;
 if c.codigo is null and p_revisao is not null then raise exception 'Conta indisponível.' using errcode='42501';end if;
 if p_codigo in ('caixa','banco') and (p_dados->>'tipo'<>p_codigo or not coalesce((p_dados->>'ativo')::boolean,true)) then raise exception 'As contas anteriores precisam permanecer disponíveis para os lançamentos existentes.' using errcode='22023';end if;
 insert into public.contas_financeiras(oficina_id,codigo,nome,tipo,banco,agencia,numero,ativo)
 values(p_oficina,p_codigo,trim(p_dados->>'nome'),p_dados->>'tipo',coalesce(p_dados->>'banco',''),coalesce(p_dados->>'agencia',''),coalesce(p_dados->>'numero',''),coalesce((p_dados->>'ativo')::boolean,true))
 on conflict(oficina_id,codigo) do update set nome=excluded.nome,tipo=excluded.tipo,banco=excluded.banco,agencia=excluded.agencia,numero=excluded.numero,ativo=excluded.ativo,revisao=contas_financeiras.revisao+1;
 perform private.evento_financeiro(p_oficina,gen_random_uuid(),'account_saved');
end $$;
-- O mesmo protocolo de baixas/estornos serve para contas novas e antigas.
do $$declare s text;begin
 s:=pg_get_functiondef('public.transferir_financeiro(uuid,uuid,bigint,date,text,text)'::regprocedure);
 if position($q$p_origem not in ('caixa','banco')$q$ in s)=0 then raise exception 'Contrato de transferência alterado';end if;
 s:=replace(s,$q$p_origem not in ('caixa','banco') or p_destino not in ('caixa','banco')$q$,'not exists(select 1 from public.contas_financeiras where oficina_id=p_oficina and codigo=p_origem and ativo) or not exists(select 1 from public.contas_financeiras where oficina_id=p_oficina and codigo=p_destino and ativo)');
 s:=replace(s,'u:=private.exigir_financeiro(p_oficina);','u:=private.exigir_financeiro(p_oficina);perform private.contas_financeiras_padrao(p_oficina);');
 s:=replace(s,'Transferência entre caixa e banco','Transferência entre contas');execute s;
end $$;
revoke all on function private.contas_financeiras_padrao(uuid),private.validar_conta_baixa(),public.consultar_contas_financeiras(uuid,date),public.salvar_conta_financeira(uuid,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.consultar_contas_financeiras(uuid,date),public.salvar_conta_financeira(uuid,text,jsonb,integer) to authenticated;
-- Saldo anterior é gravado por inteiro, inclusive se a conexão cair após o envio.
create function public.registrar_saldo_inicial_conta(p_oficina uuid,p_chave uuid,p_conta text,p_valor bigint,p_data date) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.contas_financeiras;t public.titulos_financeiros;b public.baixas_financeiras;begin
 perform private.exigir_financeiro(p_oficina);
 if p_chave is null or p_valor is null or p_valor=0 or p_valor not between -10000000000 and 10000000000 or p_data is null or not isfinite(p_data) or p_data>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Informe saldo diferente de zero e uma data válida.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_chave::text,0));
 select * into b from public.baixas_financeiras where oficina_id=p_oficina and chave=p_chave;
 if found then
  select * into t from public.titulos_financeiros where oficina_id=p_oficina and id=b.titulo_id;
  if t.id is distinct from p_chave or t.categoria<>'saldo_inicial' or t.natureza<>(case when p_valor<0 then 'pagar' else 'receber' end) or b.conta is distinct from p_conta or b.valor_centavos<>abs(p_valor) or b.data<>p_data then raise exception 'Este envio já foi usado para outro saldo. Atualize a tela.' using errcode='PT409';end if;
  return b.id;
 end if;
 if exists(select 1 from public.titulos_financeiros where id=p_chave) then raise exception 'Identificador já utilizado. Atualize a tela.' using errcode='PT409';end if;
 perform private.contas_financeiras_padrao(p_oficina);
 select * into c from public.contas_financeiras where oficina_id=p_oficina and codigo=p_conta and ativo for share;
 if not found then raise exception 'Escolha uma conta ativa desta empresa.' using errcode='22023';end if;
 perform public.salvar_titulo_financeiro(p_oficina,p_chave,jsonb_build_object('natureza',case when p_valor<0 then 'pagar' else 'receber' end,'categoria','saldo_inicial','descricao','Saldo inicial · '||c.nome,'valor_centavos',abs(p_valor),'competencia',p_data,'vencimento',p_data),null);
 return public.baixar_titulo_financeiro(p_oficina,p_chave,p_chave,abs(p_valor),0,p_data,p_conta,'outro','Saldo anterior informado pelo usuário');
end $$;
revoke all on function public.registrar_saldo_inicial_conta(uuid,uuid,text,bigint,date) from public,anon,authenticated;
grant execute on function public.registrar_saldo_inicial_conta(uuid,uuid,text,bigint,date) to authenticated;
notify pgrst,'reload schema';
commit;
