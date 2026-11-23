begin;
-- O sininho consulta esta rotina. Não trava nem regrava regras sem vencimento a gerar.
-- Preserva o cálculo das datas, valores, idempotência, permissões e tipos de conta.
CREATE OR REPLACE FUNCTION private.gerar_contas_recorrentes(p_oficina uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.contas_recorrentes; mes date; vence date; limite date:=(now() at time zone 'America/Sao_Paulo')::date+5;
begin
 for r in select * from public.contas_recorrentes where oficina_id=p_oficina and ativa
   and proximo_mes<=limite and (fim is null or proximo_mes<=fim)
   and proximo_mes+least(dia,extract(day from (proximo_mes+interval '1 month - 1 day'))::integer)-1<=limite
   order by id for update loop
  mes:=r.proximo_mes;
  while mes<=limite and (r.fim is null or mes<=r.fim) loop
   vence:=mes+least(r.dia,extract(day from (mes+interval '1 month - 1 day'))::integer)-1;
   exit when vence>limite;
   if vence>=r.inicio and (r.fim is null or vence<=r.fim) then
    if r.valor_variavel and r.valor_centavos=0 then
     insert into public.contas_mensais_pendentes(oficina_id,recorrencia_id,competencia,vencimento,descricao,natureza,categoria)
     values(p_oficina,r.id,mes,vence,r.descricao,r.natureza,r.categoria) on conflict do nothing;
    else
     insert into public.titulos_financeiros(oficina_id,natureza,descricao,categoria,valor_centavos,competencia,vencimento,recorrencia_id,criado_por)
     values(p_oficina,r.natureza,r.descricao,r.categoria,r.valor_centavos,mes,vence,r.id,auth.uid()) on conflict do nothing;
    end if;
   end if;
   mes:=(mes+interval '1 month')::date;
  end loop;
  update public.contas_recorrentes set proximo_mes=mes where id=r.id and proximo_mes is distinct from mes;
 end loop;
end $function$;
commit;
