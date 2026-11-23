begin;
create table public.contas_recorrentes (
 id uuid primary key, oficina_id uuid not null references public.oficinas(id),
 descricao text not null check(length(trim(descricao)) between 3 and 200),
 natureza text not null check(natureza in ('pagar','receber')),
 categoria text not null, valor_centavos bigint not null check(valor_centavos between 1 and 10000000000),
 dia integer not null check(dia between 1 and 31), inicio date not null, fim date,
 ativa boolean not null default true, proximo_mes date not null, revisao integer not null default 1,
 unique(oficina_id,id), check(fim is null or fim>=inicio)
);
alter table public.titulos_financeiros add column recorrencia_id uuid;
alter table public.titulos_financeiros add foreign key(oficina_id,recorrencia_id) references public.contas_recorrentes(oficina_id,id);
create unique index financeiro_recorrencia_mes on public.titulos_financeiros(recorrencia_id,competencia) where recorrencia_id is not null;
create or replace view private.financeiro_saldos as
select t.id,t.oficina_id,t.natureza,t.descricao,t.categoria,t.valor_centavos,t.competencia,t.vencimento,t.pessoa,t.observacoes,t.transferencia_id,t.ordem_servico_id,t.automatico,t.custos_revisados,t.cancelado_em,t.motivo_cancelamento,t.revisao,t.criado_por,t.criado_em,
coalesce(b.baixado,0)::bigint as baixado_centavos,(t.valor_centavos-coalesce(b.baixado,0))::bigint as aberto_centavos,t.compra_id,t.provisorio,t.pagamento_combinado,t.comissao_id,t.recorrencia_id
from public.titulos_financeiros t left join lateral(select sum(case when estorno_de is null then valor_centavos else -valor_centavos end) baixado from public.baixas_financeiras where titulo_id=t.id and oficina_id=t.oficina_id) b on true;
create table public.alertas_lidos (
 oficina_id uuid not null references public.oficinas(id), usuario_id uuid not null references auth.users(id),
 chave text not null check(length(chave)<=250), lido_em timestamptz not null default now(),
 primary key(oficina_id,usuario_id,chave)
);
alter table public.contas_recorrentes enable row level security;
alter table public.alertas_lidos enable row level security;
revoke all on public.contas_recorrentes,public.alertas_lidos from anon,authenticated;

create function private.gerar_contas_recorrentes(p_oficina uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r public.contas_recorrentes; mes date; vence date; limite date:=(now() at time zone 'America/Sao_Paulo')::date+5;
begin
 for r in select * from public.contas_recorrentes where oficina_id=p_oficina and ativa order by id for update loop
  mes:=r.proximo_mes;
  while mes<=limite and (r.fim is null or mes<=r.fim) loop
   vence:=mes+least(r.dia,extract(day from (mes+interval '1 month - 1 day'))::integer)-1;
   exit when vence>limite;
   if vence>=r.inicio and (r.fim is null or vence<=r.fim) then
    insert into public.titulos_financeiros(oficina_id,natureza,descricao,categoria,valor_centavos,competencia,vencimento,recorrencia_id,criado_por)
    values(p_oficina,r.natureza,r.descricao,r.categoria,r.valor_centavos,mes,vence,r.id,auth.uid()) on conflict do nothing;
   end if;
   mes:=(mes+interval '1 month')::date;
  end loop;
  update public.contas_recorrentes set proximo_mes=mes where id=r.id;
 end loop;
end $$;
create function public.sincronizar_contas_recorrentes(p_oficina uuid) returns void
language plpgsql security definer set search_path='' as $$begin
 perform private.exigir_financeiro(p_oficina); perform private.gerar_contas_recorrentes(p_oficina);
end $$;
create function public.consultar_contas_recorrentes(p_oficina uuid) returns jsonb
language plpgsql security definer set search_path='' as $$begin
 perform private.exigir_financeiro(p_oficina);
 return coalesce((select jsonb_agg(to_jsonb(r) order by r.ativa desc,r.dia,r.descricao) from public.contas_recorrentes r where oficina_id=p_oficina),'[]');
end $$;
create function public.salvar_conta_recorrente(p_oficina uuid,p_id uuid,p_dados jsonb,p_revisao integer) returns void
language plpgsql security definer set search_path='' as $$
declare r public.contas_recorrentes; inicio date; categoria text; natureza text;
begin
 perform private.exigir_financeiro(p_oficina);
 if p_id is null or p_revisao is null or p_revisao<0 then raise exception 'Identificador e revisão obrigatórios.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_id::text,0));
 select * into r from public.contas_recorrentes where oficina_id=p_oficina and id=p_id for update;
 if r.id is not null and r.revisao<>p_revisao then raise exception 'Recorrência alterada. Atualize a tela.' using errcode='40001';end if;
 if r.id is null and p_revisao<>0 then raise exception 'Recorrência não encontrada.' using errcode='P0002';end if;
 inicio:=(p_dados->>'inicio')::date; categoria:=p_dados->>'categoria'; natureza:=p_dados->>'natureza';
 if inicio is null or inicio<date '2000-01-01' or inicio>((now() at time zone 'America/Sao_Paulo')::date+3660) or
    natureza is null or natureza not in ('pagar','receber') or categoria is null or
    (natureza='receber' and categoria not in ('servicos','outras_receitas','aporte','saldo_inicial')) or
    (natureza='pagar' and categoria not in ('pecas_externas','pessoal','aluguel','agua_luz','impostos','terceiros','outras_despesas','compra_estoque','retirada','saldo_inicial')) then
  raise exception 'Confira início, natureza e categoria da recorrência.' using errcode='22023';end if;
 if r.id is not null and inicio<>r.inicio then raise exception 'O início da recorrência não pode ser alterado.' using errcode='22023';end if;
 insert into public.contas_recorrentes(id,oficina_id,descricao,natureza,categoria,valor_centavos,dia,inicio,fim,ativa,proximo_mes)
 values(p_id,p_oficina,trim(p_dados->>'descricao'),natureza,categoria,(p_dados->>'valor_centavos')::bigint,(p_dados->>'dia')::integer,inicio,nullif(p_dados->>'fim','')::date,(p_dados->>'ativa')::boolean,date_trunc('month',inicio)::date)
 on conflict(id) do update set descricao=excluded.descricao,natureza=excluded.natureza,categoria=excluded.categoria,
 valor_centavos=excluded.valor_centavos,dia=excluded.dia,fim=excluded.fim,ativa=excluded.ativa,revisao=contas_recorrentes.revisao+1,
 proximo_mes=case when not contas_recorrentes.ativa and excluded.ativa then greatest(contas_recorrentes.proximo_mes,date_trunc('month',now() at time zone 'America/Sao_Paulo')::date) else contas_recorrentes.proximo_mes end
 where contas_recorrentes.oficina_id=p_oficina;
 if not found then raise exception 'Recorrência não encontrada nesta oficina.' using errcode='42501';end if;
 perform private.gerar_contas_recorrentes(p_oficina);
end $$;

create function private.marco_alerta(d integer) returns integer language sql immutable set search_path='' as $$
 select case when d>5 then null when d>1 then 5 when d=1 then 1 when d=0 then 0 when d>-5 then -1 when d>-10 then -5 when d>-30 then -10 else -(abs(d)/30)*30 end
$$;
create function public.consultar_alertas(p_oficina uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid; financeiro boolean; lista jsonb; hoje date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 u:=private.require_staff(p_oficina);
 financeiro:=private.has_feature(p_oficina,'finance') and exists(select 1 from public.membros_oficina where oficina_id=p_oficina and usuario_id=u and ativo and perfil in ('owner','manager'));
 if financeiro then perform private.gerar_contas_recorrentes(p_oficina);end if;
 with fontes as (
  select 'financeiro'::text tipo,t.id,t.descricao titulo,t.natureza,t.vencimento data,t.aberto_centavos valor_centavos,
    '/financeiro?aba=contas&titulo='||t.id destino,false pronto
  from private.financeiro_saldos t where financeiro and t.oficina_id=p_oficina and t.cancelado_em is null and t.aberto_centavos>0 and t.vencimento<=hoje+5
    and (not t.provisorio or t.pagamento_combinado)
  union all
  select 'entrega',o.id,'OS #'||o.numero||' · '||coalesce(o.dados_veiculo->>'modelo','Veículo'),null,
    (o.entrega_prevista_em at time zone 'America/Sao_Paulo')::date,null,'/ordens-servico?os='||o.id,o.situacao='ready'
  from public.ordens_servico o where private.has_feature(p_oficina,'work_orders') and o.oficina_id=p_oficina and o.arquivado_em is null and o.situacao not in ('delivered','cancelled')
    and ((o.entrega_prevista_em at time zone 'America/Sao_Paulo')::date<=hoje+5 or o.situacao='ready')
 ), chaves as (
  select *,tipo||':'||id||':'||coalesce(data::text,'sem-data')||':'||coalesce(private.marco_alerta(data-hoje)::text,'pronto')||':'||pronto::text chave,data-hoje dias from fontes
 )
 select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('lido',exists(select 1 from public.alertas_lidos l where l.oficina_id=p_oficina and l.usuario_id=u and l.chave=c.chave)) order by c.dias nulls last,c.id),'[]') into lista from chaves c;
 return lista;
end $$;
create function public.consultar_titulo_alerta(p_oficina uuid,p_titulo uuid) returns jsonb
language plpgsql security definer set search_path='' as $$begin
 perform private.exigir_financeiro(p_oficina);
 return (select to_jsonb(t) from private.financeiro_saldos t where t.oficina_id=p_oficina and t.id=p_titulo);
end $$;
revoke all on function public.consultar_titulo_alerta(uuid,uuid) from public,anon;
grant execute on function public.consultar_titulo_alerta(uuid,uuid) to authenticated;
create function public.marcar_alertas_lidos(p_oficina uuid,p_chaves text[]) returns void
language plpgsql security definer set search_path='' as $$declare u uuid;begin
 u:=private.require_staff(p_oficina);
 if cardinality(p_chaves)>10000 then raise exception 'Muitos alertas.' using errcode='22023';end if;
 insert into public.alertas_lidos(oficina_id,usuario_id,chave) select p_oficina,u,unnest(p_chaves) on conflict do nothing;
end $$;
revoke all on function private.gerar_contas_recorrentes(uuid),private.marco_alerta(integer) from public,anon,authenticated;
revoke all on function public.sincronizar_contas_recorrentes(uuid),public.consultar_contas_recorrentes(uuid),public.salvar_conta_recorrente(uuid,uuid,jsonb,integer),public.consultar_alertas(uuid),public.marcar_alertas_lidos(uuid,text[]) from public,anon;
grant execute on function public.sincronizar_contas_recorrentes(uuid),public.consultar_contas_recorrentes(uuid),public.salvar_conta_recorrente(uuid,uuid,jsonb,integer),public.consultar_alertas(uuid),public.marcar_alertas_lidos(uuid,text[]) to authenticated;
commit;
