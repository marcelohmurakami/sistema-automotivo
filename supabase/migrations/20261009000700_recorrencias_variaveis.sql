begin;
alter table public.contas_recorrentes add column valor_variavel boolean not null default false;
alter table public.titulos_financeiros add column valor_variavel boolean not null default false;
alter table public.titulos_financeiros add column valor_confirmado_em timestamptz;

create function private.definir_valor_recorrente() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.recorrencia_id is not null then
  select r.valor_variavel into new.valor_variavel from public.contas_recorrentes r where r.id=new.recorrencia_id and r.oficina_id=new.oficina_id;
 end if;
 return new;
end $$;
create trigger definir_valor_recorrente before insert on public.titulos_financeiros for each row execute function private.definir_valor_recorrente();

do $$ declare s text; novo text; begin
 s:=pg_get_functiondef('public.salvar_conta_recorrente(uuid,uuid,jsonb,integer)'::regprocedure);
 novo:=replace(s,'perform private.gerar_contas_recorrentes(p_oficina);',
 'update public.contas_recorrentes set valor_variavel=coalesce((p_dados->>''valor_variavel'')::boolean,false) where oficina_id=p_oficina and id=p_id;
 perform private.gerar_contas_recorrentes(p_oficina);');
 if novo=s then raise exception 'Função de recorrências incompatível';end if;
 execute novo;
 s:=pg_get_viewdef('private.financeiro_saldos'::regclass,true);
 novo:=replace(s,'t.recorrencia_id','t.recorrencia_id, t.valor_variavel, t.valor_confirmado_em');
 if novo=s then raise exception 'Visão financeira incompatível';end if;
 execute 'create or replace view private.financeiro_saldos as '||novo;
end $$;

create function public.confirmar_valor_recorrente(p_oficina uuid,p_titulo uuid,p_revisao integer,p_valor bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.titulos_financeiros;
begin
 perform private.exigir_financeiro(p_oficina);
 select * into t from public.titulos_financeiros where oficina_id=p_oficina and id=p_titulo for update;
 if t.id is null or not t.valor_variavel or t.recorrencia_id is null or t.cancelado_em is not null then raise exception 'Conta variável indisponível.';end if;
 if p_revisao is null or t.revisao<>p_revisao then raise exception 'Conta alterada. Atualize a tela.' using errcode='40001';end if;
 if p_valor is null or p_valor not between 1 and 10000000000 then raise exception 'Informe o valor deste mês.';end if;
 if exists(select 1 from public.baixas_financeiras where oficina_id=p_oficina and titulo_id=p_titulo) then raise exception 'Esta conta já tem pagamentos. Confira o histórico antes de alterar.';end if;
 update public.titulos_financeiros set valor_centavos=p_valor,valor_confirmado_em=now(),revisao=revisao+1 where id=p_titulo and oficina_id=p_oficina;
 return public.consultar_titulo_alerta(p_oficina,p_titulo);
end $$;

create function private.exigir_valor_recorrente_confirmado() returns trigger language plpgsql security definer set search_path='' as $$
declare t public.titulos_financeiros;
begin
 select * into t from public.titulos_financeiros where oficina_id=new.oficina_id and id=new.titulo_id for update;
 if new.estorno_de is null and t.valor_variavel and t.valor_confirmado_em is null then raise exception 'Confirme o valor desta conta variável para este mês antes de registrar o pagamento.';end if;
 return new;
end $$;
create trigger exigir_valor_recorrente_confirmado before insert on public.baixas_financeiras for each row execute function private.exigir_valor_recorrente_confirmado();

create or replace function public.consultar_alertas(p_oficina uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare lista jsonb; u uuid;
begin
 u:=private.require_staff(p_oficina);
 lista:=public.consultar_alertas_incluindo_excluidos(p_oficina);
 return coalesce((select jsonb_agg(a.item || jsonb_build_object('valor_pendente',coalesce(t.valor_variavel and t.valor_confirmado_em is null,false)) order by a.posicao)
 from jsonb_array_elements(lista) with ordinality a(item,posicao)
 left join public.titulos_financeiros t on a.item->>'tipo'='financeiro' and t.id::text=a.item->>'id' and t.oficina_id=p_oficina
 where not exists(select 1 from public.alertas_lidos l where l.oficina_id=p_oficina and l.usuario_id=u and l.chave=a.item->>'chave' and l.excluido_em is not null)), '[]'::jsonb);
end $$;
revoke all on function private.definir_valor_recorrente(),private.exigir_valor_recorrente_confirmado() from public,anon,authenticated;
revoke all on function public.confirmar_valor_recorrente(uuid,uuid,integer,bigint) from public,anon;
grant execute on function public.confirmar_valor_recorrente(uuid,uuid,integer,bigint) to authenticated;
commit;
