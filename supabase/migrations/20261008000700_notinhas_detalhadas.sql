begin;
alter table public.notas_atendimento add column detalhes jsonb not null default '{}'::jsonb;
create function public.emitir_notinha_detalhada(p_oficina uuid,p_chave uuid,p_cliente uuid,p_itens jsonb,p_desconto bigint,p_observacoes text,p_detalhes jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare n uuid; campo text; valor text; u uuid; num bigint; c public.clientes; i jsonb; pos int:=0; subtotal bigint; q numeric; preco bigint; begin
 u:=private.require_staff(p_oficina);
 if not private.has_feature(p_oficina,'simple_notes') then raise exception 'Plano indisponível.' using errcode='42501';end if;
 if p_chave is null or p_detalhes is null or jsonb_typeof(p_detalhes)<>'object' then raise exception 'Confira os dados da nota.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_chave::text,0));
 select id into n from public.notas_atendimento where oficina_id=p_oficina and chave_criacao=p_chave;
 if found then return n;end if;
 if exists(select 1 from jsonb_each(p_detalhes) where jsonb_typeof(value)<>'string') then raise exception 'Dados da nota inválidos.' using errcode='22023';end if;
 for campo,valor in select key,value from jsonb_each_text(p_detalhes) loop
  if campo not in ('data_servico','vencimento','veiculo','motor','forma_pagamento','empresa_cliente','documento_cliente','assinatura','pix_copia_cola') or length(valor)>(case when campo='pix_copia_cola' then 1024 else 180 end) then raise exception 'Dados da nota inválidos.' using errcode='22023';end if;
 end loop;
 foreach campo in array array['data_servico','vencimento'] loop
  valor:=nullif(p_detalhes->>campo,'');
  if valor is not null then
   if valor !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Informe uma data válida.' using errcode='22023';end if;
   perform valor::date;
  end if;
 end loop;
 if coalesce(p_detalhes->>'assinatura','recebimento') not in ('recebimento','pendente') then raise exception 'Selecione a confirmação do cliente.' using errcode='22023';end if;
 if coalesce(p_detalhes->>'pix_copia_cola','')<>'' and (p_detalhes->>'pix_copia_cola' not like '000201%' or p_detalhes->>'pix_copia_cola' !~* 'br.gov.bcb.pix') then raise exception 'Cole um código Pix copia e cola válido, gerado pelo banco.' using errcode='22023';end if;
 if p_itens is null or jsonb_typeof(p_itens)<>'array' or jsonb_array_length(p_itens) not between 1 and 100 or length(coalesce(p_observacoes,''))>2000 then raise exception 'Informe cliente e até 100 itens.' using errcode='22023';end if;
 select * into c from public.clientes where oficina_id=p_oficina and id=p_cliente and arquivado_em is null;if not found then raise exception 'Cliente inválido.' using errcode='22023';end if;
 update public.oficinas set proximo_numero_nota=proximo_numero_nota+1 where id=p_oficina returning proximo_numero_nota-1 into num;
 insert into public.notas_atendimento(oficina_id,numero,cliente_id,dados_cliente,dados_oficina,observacoes,criado_por,chave_criacao,detalhes) values(p_oficina,num,c.id,jsonb_build_object('nome',c.nome,'telefone_e164',c.telefone_e164,'endereco',c.endereco),(select identidade_documentos||jsonb_build_object('nome',nome,'telefone',telefone_e164,'endereco',endereco) from public.oficinas where id=p_oficina),coalesce(p_observacoes,''),u,p_chave,p_detalhes) returning id into n;
 for i in select value from jsonb_array_elements(p_itens) loop
 q:=(i->>'quantidade')::numeric;preco:=(i->>'preco_unitario_centavos')::bigint;
 if q is null or q<=0 or q>10000 or q<>round(q,3) or preco is null or preco not between 0 and 100000000 or length(trim(coalesce(i->>'descricao',''))) not between 1 and 300 or coalesce(i->>'tipo','') not in ('part','service') then raise exception 'Confira os itens e valores.' using errcode='22023';end if;
 insert into public.itens_nota_atendimento(oficina_id,nota_id,posicao,tipo,descricao,quantidade,unidade,preco_unitario_centavos) values(p_oficina,n,pos,i->>'tipo',trim(i->>'descricao'),q,'un',preco);pos:=pos+1;end loop;
 select sum(total_item_centavos) into subtotal from public.itens_nota_atendimento where nota_id=n and oficina_id=p_oficina;
 if subtotal>1000000000 or p_desconto is null or p_desconto not between 0 and subtotal then raise exception 'Desconto ou total inválido.' using errcode='22023';end if;
 update public.notas_atendimento set subtotal_centavos=subtotal,desconto_centavos=p_desconto,situacao='issued',emitido_em=now() where id=n;
 return n;
end $$;
revoke all on function public.emitir_notinha_detalhada(uuid,uuid,uuid,jsonb,bigint,text,jsonb) from public,anon;
grant execute on function public.emitir_notinha_detalhada(uuid,uuid,uuid,jsonb,bigint,text,jsonb) to authenticated;
commit;

