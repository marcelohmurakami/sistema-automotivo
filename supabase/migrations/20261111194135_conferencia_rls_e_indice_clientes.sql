begin;
set local lock_timeout = '3s';

-- A identidade é constante na instrução. O InitPlan evita recalculá-la por
-- registro, sem alterar as condições de plano, empresa, papel ou vínculo ativo.
alter policy financeiro_titulos_leitura on public.titulos_financeiros using (
  private.has_feature(oficina_id, 'finance') and exists (
    select 1 from public.membros_oficina m
    where m.oficina_id = titulos_financeiros.oficina_id
      and m.usuario_id = (select auth.uid()) and m.ativo
      and m.perfil in ('owner', 'manager')
  )
);
alter policy financeiro_baixas_leitura on public.baixas_financeiras using (
  private.has_feature(oficina_id, 'finance') and exists (
    select 1 from public.membros_oficina m
    where m.oficina_id = baixas_financeiras.oficina_id
      and m.usuario_id = (select auth.uid()) and m.ativo
      and m.perfil in ('owner', 'manager')
  )
);
alter policy compras_leitura on public.compras_estoque using (
  private.has_feature(oficina_id, 'inventory')
  and private.has_feature(oficina_id, 'finance') and exists (
    select 1 from public.membros_oficina m
    where m.oficina_id = compras_estoque.oficina_id
      and m.usuario_id = (select auth.uid()) and m.ativo
      and m.perfil in ('owner', 'manager')
  )
);

-- As duas migrações de paginação criaram o mesmo índice de clientes. Remover
-- apenas a cópia comprovadamente equivalente evita trabalho duplo na escrita.
do $$
begin
  if exists (
    select 1 from pg_index a join pg_index b on a.indrelid = b.indrelid
    join pg_class ca on ca.oid = a.indexrelid
    join pg_class cb on cb.oid = b.indexrelid
    where a.indexrelid = to_regclass('public.clientes_lista_ativos')
      and b.indexrelid = to_regclass('public.clientes_selecao_ativos')
      and a.indisvalid and b.indisvalid and a.indisready and b.indisready
      and a.indkey = b.indkey and a.indclass = b.indclass
      and a.indcollation = b.indcollation and a.indoption = b.indoption
      and a.indisunique = b.indisunique and a.indnkeyatts = b.indnkeyatts
      and ca.relam = cb.relam
      and pg_get_expr(a.indpred, a.indrelid) is not distinct from pg_get_expr(b.indpred, b.indrelid)
      and pg_get_expr(a.indexprs, a.indrelid) is not distinct from pg_get_expr(b.indexprs, b.indrelid)
      and not exists (select 1 from pg_constraint where conindid = b.indexrelid)
  ) then
    drop index public.clientes_selecao_ativos;
  end if;
end $$;
commit;
