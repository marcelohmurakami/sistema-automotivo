-- Recebimento parcial e vencimento do saldo na mesma transação.
create function public.baixar_titulo_com_restante(p_oficina uuid,p_titulo uuid,p_chave uuid,p_valor bigint,p_taxa bigint,p_data date,p_conta text,p_forma text,p_vencimento date,p_observacao text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare t public.titulos_financeiros; b uuid; s bigint;
begin
 perform private.exigir_financeiro(p_oficina);
 select * into t from public.titulos_financeiros where oficina_id=p_oficina and id=p_titulo for update;
 if not found then raise exception 'Lançamento não encontrado' using errcode='P0002'; end if;
 select id into b from public.baixas_financeiras where oficina_id=p_oficina and titulo_id=p_titulo and chave=p_chave;
 if found then return b; end if;
 if exists(select 1 from public.baixas_financeiras where oficina_id=p_oficina and chave=p_chave) then
   raise exception 'Chave de pagamento já utilizada' using errcode='22023';
 end if;
 select aberto_centavos into s from private.financeiro_saldos where id=t.id;
 if p_vencimento is null or p_valor is null or p_valor<=0 or p_valor>=s then
   raise exception 'Informe o valor parcial e a data de vencimento do restante.' using errcode='22023';
 end if;
 b:=public.baixar_titulo_financeiro(p_oficina,p_titulo,p_chave,p_valor,p_taxa,p_data,p_conta,p_forma,p_observacao);
 update public.titulos_financeiros set vencimento=p_vencimento,pagamento_combinado=true where id=t.id;
 perform private.evento_financeiro(p_oficina,t.id,'updated');
 return b;
end $$;
revoke all on function public.baixar_titulo_com_restante(uuid,uuid,uuid,bigint,bigint,date,text,text,date,text) from public,anon;
grant execute on function public.baixar_titulo_com_restante(uuid,uuid,uuid,bigint,bigint,date,text,text,date,text) to authenticated;
notify pgrst, 'reload schema';
