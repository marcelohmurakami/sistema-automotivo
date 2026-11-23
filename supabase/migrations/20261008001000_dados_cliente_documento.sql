begin;
create or replace function public.consultar_ordem_servico(p_oficina uuid,p_os uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d jsonb; c public.clientes; pagamento text; documento text; begin
 d:=private.consultar_os_incluindo_removidos(p_oficina,p_os);
 select * into c from public.clientes where oficina_id=p_oficina and id=(d->>'cliente_id')::uuid;
 documento:=substring(c.observacoes from 'CPF/CNPJ: ([^\r\n]+)');
 d:=jsonb_set(d,'{dados_cliente}',coalesce(d->'dados_cliente','{}')||jsonb_build_object('documento',coalesce(nullif(d->'dados_cliente'->>'documento',''),documento,''),'endereco',coalesce(nullif(d->'dados_cliente'->>'endereco',''),c.endereco,'')));
 pagamento:=substring(d->>'observacoes_internas' from 'Forma original: ([^\r\n]+)\. Vencimento original:');
 d:=d||jsonb_build_object('forma_pagamento',coalesce(nullif(d->>'forma_pagamento',''),pagamento,''));
 return jsonb_set(d,'{itens}',coalesce((select jsonb_agg(i) from jsonb_array_elements(d->'itens') i where i->>'removido_em' is null),'[]'));
end $$;
commit;
