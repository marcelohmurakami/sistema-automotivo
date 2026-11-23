begin;
-- Arquivo fiel do legado, separado dos registros operacionais e sem importar credenciais.
create table public.registros_importados (
 oficina_id uuid not null references public.oficinas(id), origem text not null,
 tabela text not null, id_legado text not null, dados jsonb not null,
 importado_em timestamptz not null default now(),
 primary key(oficina_id,origem,tabela,id_legado)
);
alter table public.registros_importados enable row level security;
revoke all on public.registros_importados from anon,authenticated;
create function public.consultar_historico_importado(p_oficina uuid,p_tabela text default '',p_busca text default '',p_pagina integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.exigir_gestao(p_oficina,'customers');
 return jsonb_build_object(
 'grupos',(select coalesce(jsonb_agg(to_jsonb(g)),'[]') from (select tabela,count(*) quantidade from public.registros_importados where oficina_id=p_oficina group by tabela order by tabela) g),
 'total',(select count(*) from public.registros_importados where oficina_id=p_oficina and (p_tabela='' or tabela=p_tabela) and dados::text ilike '%'||left(p_busca,120)||'%'),
 'registros',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from (select tabela,id_legado,dados,importado_em from public.registros_importados where oficina_id=p_oficina and (p_tabela='' or tabela=p_tabela) and dados::text ilike '%'||left(p_busca,120)||'%' order by tabela,id_legado limit 50 offset greatest(0,least(p_pagina,100000))*50) r));
end $$;
revoke all on function public.consultar_historico_importado(uuid,text,text,integer) from public,anon;
grant execute on function public.consultar_historico_importado(uuid,text,text,integer) to authenticated;

-- Valores já baixados no legado sem data/meio de pagamento: conservam o saldo,
-- sem inventar movimentos de caixa ou datas de recebimento.
create table private.saldos_importados (
 oficina_id uuid not null, titulo_id uuid primary key,
 valor_centavos bigint not null check(valor_centavos>0),
 foreign key(oficina_id,titulo_id) references public.titulos_financeiros(oficina_id,id)
);
revoke all on private.saldos_importados from public,anon,authenticated;
alter table private.saldos_importados enable row level security;
create or replace view private.financeiro_saldos as
select t.id,t.oficina_id,t.natureza,t.descricao,t.categoria,t.valor_centavos,t.competencia,t.vencimento,t.pessoa,t.observacoes,t.transferencia_id,t.ordem_servico_id,t.automatico,t.custos_revisados,t.cancelado_em,t.motivo_cancelamento,t.revisao,t.criado_por,t.criado_em,
(coalesce(b.baixado,0)+coalesce(s.valor_centavos,0))::bigint as baixado_centavos,(t.valor_centavos-coalesce(b.baixado,0)-coalesce(s.valor_centavos,0))::bigint as aberto_centavos,t.compra_id,t.provisorio,t.pagamento_combinado,t.comissao_id,t.recorrencia_id
from public.titulos_financeiros t
left join private.saldos_importados s on s.titulo_id=t.id and s.oficina_id=t.oficina_id
left join lateral(select sum(case when estorno_de is null then valor_centavos else -valor_centavos end) baixado from public.baixas_financeiras where titulo_id=t.id and oficina_id=t.oficina_id) b on true;
create function private.proteger_saldo_importado() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.saldos_importados where titulo_id=old.id) and
 (new.valor_centavos<>old.valor_centavos or new.natureza<>old.natureza or new.categoria<>old.categoria or new.competencia<>old.competencia or new.ordem_servico_id is distinct from old.ordem_servico_id or new.cancelado_em is distinct from old.cancelado_em) then
 raise exception 'Este título contém saldo histórico importado. Preserve valor, vínculo e competência; registre novos pagamentos normalmente.' using errcode='22023'; end if;
 return new;
end $$;
create trigger proteger_saldo_importado before update on public.titulos_financeiros for each row execute function private.proteger_saldo_importado();
commit;
