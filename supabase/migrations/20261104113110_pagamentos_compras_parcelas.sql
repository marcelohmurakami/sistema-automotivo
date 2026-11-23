begin;
drop index public.compra_titulo_unico;
create index compra_titulos on public.titulos_financeiros(oficina_id,compra_id) where compra_id is not null;
alter table public.compras_estoque add column pagamento_planejado jsonb;
alter table public.titulos_financeiros add column forma_prevista text check(forma_prevista in ('pix','dinheiro','debito','credito','boleto','transferencia','outro'));

create function private.planejar_pagamento_compra(p_oficina uuid,p_compra uuid,p_plano jsonb) returns void language plpgsql security definer set search_path='' as $$
declare c public.compras_estoque; t public.titulos_financeiros; parcelas jsonb; parcela jsonb; n int:=0; qtd int; tid uuid; modo text; valor bigint; soma numeric;
begin
 perform private.exigir_financeiro(p_oficina);
 select * into c from public.compras_estoque where oficina_id=p_oficina and id=p_compra for update;
 if not found then raise exception 'Compra indisponível.' using errcode='42501';end if;
 if c.pagamento_planejado is not null then
  if c.pagamento_planejado is distinct from p_plano then raise exception 'Esta compra já foi confirmada com outro pagamento.' using errcode='PT409';end if;return;
 end if;
 if c.cancelado_em is not null or p_plano is null or jsonb_typeof(p_plano)<>'object' then raise exception 'Confira o pagamento da compra.' using errcode='22023';end if;
 modo:=p_plano->>'modo';parcelas:=p_plano->'parcelas';
 if modo is null or modo not in ('pago','prazo') or coalesce(p_plano->>'forma','') not in ('pix','dinheiro','debito','credito','boleto','transferencia','outro') or jsonb_typeof(parcelas) is distinct from 'array' then raise exception 'Escolha como será o pagamento.' using errcode='22023';end if;
 qtd:=jsonb_array_length(parcelas);
 if qtd not between 1 and 60 or (modo='pago' and qtd<>1) then raise exception 'Informe de 1 a 60 parcelas; para compra já paga use uma parcela.' using errcode='22023';end if;
 select sum((x->>'valor_centavos')::numeric) into soma from jsonb_array_elements(parcelas)x;
 if soma is distinct from c.total_centavos::numeric then raise exception 'A soma das parcelas deve ser igual ao total da compra.' using errcode='22023';end if;
 perform 1 from public.titulos_financeiros where oficina_id=p_oficina and compra_id=p_compra order by id for update;
 if (select count(*) from public.titulos_financeiros where oficina_id=p_oficina and compra_id=p_compra)<>1 or exists(select 1 from private.financeiro_saldos where oficina_id=p_oficina and compra_id=p_compra and (baixado_centavos<>0 or cancelado_em is not null)) then raise exception 'O pagamento desta compra já foi alterado. Confira o financeiro.' using errcode='PT409';end if;
 select * into t from public.titulos_financeiros where oficina_id=p_oficina and compra_id=p_compra;
 for parcela in select value from jsonb_array_elements(parcelas) loop
  n:=n+1;valor:=(parcela->>'valor_centavos')::bigint;
  if valor is null or valor<1 or valor::numeric is distinct from (parcela->>'valor_centavos')::numeric or nullif(parcela->>'vencimento','') is null or not isfinite((parcela->>'vencimento')::date) then raise exception 'Confira valor e data de cada parcela.' using errcode='22023';end if;
  if n=1 then
   tid:=t.id;update public.titulos_financeiros set valor_centavos=valor,vencimento=(parcela->>'vencimento')::date,descricao=left(t.descricao,180)||case when qtd>1 then ' · 1/'||qtd else '' end,forma_prevista=p_plano->>'forma',revisao=revisao+1 where id=t.id;
  else
   insert into public.titulos_financeiros(oficina_id,natureza,descricao,categoria,valor_centavos,competencia,vencimento,pessoa,observacoes,compra_id,forma_prevista,criado_por)
   values(p_oficina,'pagar',left(t.descricao,180)||' · '||n||'/'||qtd,'compra_estoque',valor,t.competencia,(parcela->>'vencimento')::date,t.pessoa,t.observacoes,p_compra,p_plano->>'forma',auth.uid()) returning id into tid;
  end if;
  if modo='pago' then perform public.baixar_titulo_financeiro(p_oficina,tid,p_compra,valor,0,(p_plano->>'data')::date,p_plano->>'conta',p_plano->>'forma','Pagamento confirmado na compra');end if;
 end loop;
 update public.compras_estoque set pagamento_planejado=p_plano where id=p_compra;
end $$;
revoke all on function private.planejar_pagamento_compra(uuid,uuid,jsonb) from public,anon,authenticated;

create function public.registrar_compra_com_pagamento(p_oficina uuid,p_dados jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare id uuid;begin
 id:=public.registrar_compra_deposito(p_oficina,(p_dados->>'id')::uuid,(p_dados->>'fornecedor_id')::uuid,(p_dados->>'data')::date,(p_dados#>>'{pagamento,parcelas,0,vencimento}')::date,p_dados->>'documento',p_dados->>'observacoes',p_dados->'itens',0,'banco','outro',nullif(p_dados->>'deposito_id','')::uuid);
 perform private.planejar_pagamento_compra(p_oficina,id,p_dados->'pagamento');return id;
end $$;
create function public.receber_pedido_com_pagamento(p_oficina uuid,p_pedido uuid,p_chave uuid,p_revisao integer,p_tipo text,p_data date,p_vencimento date,p_documento text,p_itens jsonb,p_deposito uuid,p_motivo text default '',p_pagamento jsonb default null) returns uuid language plpgsql security definer set search_path='' as $$
declare id uuid;c uuid;begin
 id:=public.receber_pedido_deposito(p_oficina,p_pedido,p_chave,p_revisao,p_tipo,p_data,p_vencimento,p_documento,p_itens,p_deposito,p_motivo);
 select rp.compra_id into c from public.recebimentos_pedido rp where rp.oficina_id=p_oficina and rp.id=p_chave;
 if c is not null then perform private.planejar_pagamento_compra(p_oficina,c,p_pagamento);
 elsif p_pagamento is not null then raise exception 'Esta entrega não gerou cobrança. Confira o pagamento.' using errcode='22023';end if;
 return id;
end $$;

create or replace function public.listar_compras_estoque(p_oficina uuid,p_busca text default '',p_pagina integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare itens jsonb;total bigint;begin
 perform private.exigir_financeiro(p_oficina);perform private.exigir_estoque(p_oficina);
 select count(*) into total from public.compras_estoque where oficina_id=p_oficina and concat(nome_fornecedor,' ',documento) ilike '%'||left(p_busca,100)||'%';
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into itens from (
  select c.*,t.* from public.compras_estoque c cross join lateral(select sum(f.baixado_centavos)::bigint baixado_centavos,sum(case when f.cancelado_em is null then f.aberto_centavos else 0 end)::bigint aberto_centavos,min(f.vencimento) filter(where f.aberto_centavos>0 and f.cancelado_em is null) vencimento,count(*) parcelas from private.financeiro_saldos f where f.oficina_id=c.oficina_id and f.compra_id=c.id)t
  where c.oficina_id=p_oficina and concat(c.nome_fornecedor,' ',c.documento) ilike '%'||left(p_busca,100)||'%' order by c.data desc,c.criado_em desc,c.id limit 30 offset greatest(p_pagina,0)*30
 ) x;return jsonb_build_object('itens',itens,'total',total);end $$;
create or replace function public.consultar_compra_estoque(p_oficina uuid,p_compra uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;ts jsonb;begin
 perform private.exigir_financeiro(p_oficina);perform private.exigir_estoque(p_oficina);
 select jsonb_agg(to_jsonb(t)||jsonb_build_object('forma_prevista',v.forma_prevista) order by t.vencimento,t.criado_em,t.id) into ts from private.financeiro_saldos t join public.titulos_financeiros v on v.id=t.id where t.oficina_id=p_oficina and t.compra_id=p_compra;
 select to_jsonb(c)||jsonb_build_object('titulo',ts->0,'titulos',coalesce(ts,'[]'),'itens',(select jsonb_agg(to_jsonb(i)) from public.itens_compra_estoque i where i.oficina_id=p_oficina and i.compra_id=c.id)) into r from public.compras_estoque c where oficina_id=p_oficina and id=p_compra;
 if r is null then raise exception 'Compra não encontrada' using errcode='P0002';end if;return r;end $$;

do $$declare s text;begin
 s:=pg_get_functiondef('public.cancelar_compra_estoque(uuid,uuid,text)'::regprocedure);
 if position('select id into t from public.titulos_financeiros where oficina_id=p_oficina and compra_id=p_compra for update;' in s)=0 then raise exception 'Cancelamento original não encontrado';end if;
 s:=replace(s,'select id into t from public.titulos_financeiros where oficina_id=p_oficina and compra_id=p_compra for update;','perform 1 from public.titulos_financeiros where oficina_id=p_oficina and compra_id=p_compra order by id for update; select id into t from public.titulos_financeiros where oficina_id=p_oficina and compra_id=p_compra order by id limit 1;');
 s:=replace(s,'(select baixado_centavos from private.financeiro_saldos where id=t)<>0','exists(select 1 from private.financeiro_saldos where oficina_id=p_oficina and compra_id=p_compra and baixado_centavos<>0)');
 s:=replace(s,'where id=t;','where oficina_id=p_oficina and compra_id=p_compra;');execute s;
end $$;
revoke all on function public.registrar_compra_com_pagamento(uuid,jsonb),public.receber_pedido_com_pagamento(uuid,uuid,uuid,integer,text,date,date,text,jsonb,uuid,text,jsonb) from public,anon;
grant execute on function public.registrar_compra_com_pagamento(uuid,jsonb),public.receber_pedido_com_pagamento(uuid,uuid,uuid,integer,text,date,date,text,jsonb,uuid,text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
