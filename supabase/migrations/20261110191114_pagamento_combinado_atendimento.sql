begin;
create function public.combinar_pagamento_titulo(p_oficina uuid,p_titulo uuid,p_revisao integer,p_vencimento date) returns uuid
language plpgsql security definer set search_path='' as $$
declare t public.titulos_financeiros; saldo bigint;
begin
 perform private.conferir_operacao(p_oficina,'salvar_titulo_financeiro');
 perform private.exigir_financeiro(p_oficina);
 select * into t from public.titulos_financeiros where oficina_id=p_oficina and id=p_titulo for update;
 if not found then raise exception 'Conta não encontrada.' using errcode='P0002'; end if;
 if p_revisao is distinct from t.revisao then raise exception 'Conta alterada. Atualize a tela.' using errcode='P0001'; end if;
 select aberto_centavos into saldo from private.financeiro_saldos where oficina_id=p_oficina and id=p_titulo;
 if p_vencimento is null or t.cancelado_em is not null or coalesce(saldo,0)<=0 then raise exception 'Informe uma data para uma conta com saldo em aberto.' using errcode='22023'; end if;
 update public.titulos_financeiros set vencimento=p_vencimento,pagamento_combinado=true,revisao=revisao+1 where oficina_id=p_oficina and id=p_titulo;
 perform private.evento_financeiro(p_oficina,p_titulo,'Data de pagamento combinada');
 return p_titulo;
end $$;
revoke all on function public.combinar_pagamento_titulo(uuid,uuid,integer,date) from public,anon;
grant execute on function public.combinar_pagamento_titulo(uuid,uuid,integer,date) to authenticated;
commit;
