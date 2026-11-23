-- A confirmação e a criação são atômicas. Repetir uma chave devolve o mesmo recibo.
create table private.documentos_offline_recebidos (
 oficina_id uuid not null references public.oficinas(id),
 chave uuid not null, usuario_id uuid not null references auth.users(id),
 pedido jsonb not null, resposta jsonb not null, criado_em timestamptz not null default now(),
 primary key (oficina_id,chave)
);
alter table private.documentos_offline_recebidos enable row level security;
create index documentos_offline_usuario on private.documentos_offline_recebidos(usuario_id);
revoke all on private.documentos_offline_recebidos from public,anon,authenticated;

create function private.sincronizar_documento_offline(p_oficina uuid,p_chave uuid,p_documento jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 u uuid; w public.oficinas; antigo private.documentos_offline_recebidos;
 cliente uuid; bem uuid; documento uuid; resultado jsonb; dados jsonb; itens jsonb; i jsonb;
 subtotal bigint:=0; desconto bigint; quantidade numeric; preco bigint; tipo text; telefone text;
begin
 u:=private.require_staff(p_oficina);
 if p_chave is null or jsonb_typeof(p_documento) is distinct from 'object' or octet_length(p_documento::text)>500000 then
   raise exception 'Documento inválido.' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('documento-offline:'||p_oficina::text||p_chave::text,0));
 select * into antigo from private.documentos_offline_recebidos where oficina_id=p_oficina and chave=p_chave;
 if found then
   if antigo.usuario_id<>u then raise exception 'Documento pertence a outra sessão de trabalho.' using errcode='42501';end if;
   if antigo.pedido<>p_documento then raise exception 'Esta referência já foi enviada com outros dados. Recupere o envio original antes de editar.' using errcode='PT409';end if;
   return antigo.resposta;
 end if;
 select * into w from public.oficinas where id=p_oficina;
 tipo:=p_documento->>'tipo';
 if tipo not in ('os','orcamento') or tipo is null or p_chave is null or jsonb_typeof(p_documento) is distinct from 'object'
   or octet_length(p_documento::text)>500000 or p_documento->>'versao' is distinct from '1'
   or p_documento->>'especialidade' is distinct from w.especialidade then
   raise exception 'Documento incompatível com esta empresa.' using errcode='22023';
 end if;
 if w.ramo='automotivo' then
   perform private.conferir_operacao(p_oficina,case when tipo='os' then 'salvar_os_com_itens' else 'salvar_orcamento' end);
   if tipo='os' then perform private.exigir_os(p_oficina);else perform private.exigir_orcamentos(p_oficina);end if;
 else
   perform private.conferir_operacao(p_oficina,'criar_atendimento_com_itens');
   perform private.exigir_servicos(p_oficina,'work_orders');
 end if;
 if jsonb_typeof(p_documento->'itens') is distinct from 'array' or jsonb_array_length(p_documento->'itens') not between 1 and 100 then
   raise exception 'Inclua de 1 a 100 serviços ou produtos.' using errcode='22023';
 end if;
 for i in select value from jsonb_array_elements(p_documento->'itens') loop
   if coalesce(i->>'tipo','') not in ('service','part') or length(trim(coalesce(i->>'descricao',''))) not between 1 and 300 then
     raise exception 'Confira a descrição e o tipo dos itens.' using errcode='22023';
   end if;
   quantidade:=(i->>'quantidade')::numeric;preco:=(i->>'preco_unitario_centavos')::bigint;
   if quantidade is null or quantidade not between 1 and 100000 or quantidade<>trunc(quantidade) or preco is null or preco not between 0 and 100000000
     or (i->>'preco_unitario_centavos')::numeric<>preco then raise exception 'Confira quantidade inteira e preço dos itens.' using errcode='22023';end if;
   subtotal:=subtotal+(quantidade*preco)::bigint;
 end loop;
 if p_documento->'desconto'->>'tipo'='percentual' then
   if coalesce(nullif(p_documento->'desconto'->>'valor',''),'0')::numeric not between 0 and 100 then raise exception 'Percentual inválido.' using errcode='22023';end if;
   desconto:=round(subtotal*round(coalesce(nullif(p_documento->'desconto'->>'valor',''),'0')::numeric*100)/10000);
   -- Alternar R$ / % conserva os centavos já exibidos ao usuário.
   if (p_documento->'desconto'->'convertido'->>'subtotal')::bigint=subtotal then desconto:=(p_documento->'desconto'->'convertido'->>'centavos')::bigint;end if;
 elsif p_documento->'desconto'->>'tipo'='valor' then desconto:=round(coalesce(nullif(p_documento->'desconto'->>'valor',''),'0')::numeric*100);
 else raise exception 'Tipo de desconto inválido.' using errcode='22023';end if;
 if desconto is null or desconto<0 or desconto>subtotal or subtotal>10000000000 then raise exception 'Confira o desconto e o total.' using errcode='22023';end if;
 cliente:=nullif(p_documento->'cliente'->>'id','')::uuid;
 if cliente is null then
   telefone:=regexp_replace(coalesce(p_documento->'cliente'->>'telefone',''),'[^0-9]','','g');
   if length(telefone) in (10,11) then telefone:='55'||telefone;end if;
   resultado:=public.salvar_cliente(p_oficina,jsonb_build_object('nome',p_documento->'cliente'->>'nome','telefone_e164',case when telefone='' then null else '+'||telefone end),null,null);
   cliente:=(resultado->>'id')::uuid;
 elsif not exists(select 1 from public.clientes where oficina_id=p_oficina and id=cliente and arquivado_em is null) then
   raise exception 'O cliente foi arquivado ou está indisponível. Confira o cadastro antes de enviar.' using errcode='22023';
 end if;
 bem:=nullif(p_documento->'bem'->>'id','')::uuid;
 if w.ramo='automotivo' then
   if bem is null then
     bem:=public.cadastrar_veiculo_orcamento(p_oficina,cliente,p_documento->'bem'->>'nome',nullif(p_documento->'bem'->>'placa',''),nullif(p_documento->'bem'->>'marca',''),null);
   end if;
   dados:=jsonb_build_object('cliente_id',cliente,'veiculo_id',bem,'data_servico',p_documento->>'data','motor',p_documento->'bem'->>'motor','itens',p_documento->'itens','desconto_centavos',desconto,'mostrar_desconto_nota',coalesce((p_documento->>'mostrar_desconto_nota')::boolean,false),'ficha_especialidade',p_documento->'ficha','observacoes',p_documento->>'observacoes','queixa_cliente',case when tipo='os' then concat_ws(E'\n\n',nullif(p_documento->>'observacoes',''),case when coalesce(p_documento->>'condicoes','')<>'' then 'Condições: '||(p_documento->>'condicoes') end) else null end,'condicoes',p_documento->>'condicoes','forma_pagamento',p_documento->>'forma_pagamento','vencimento_pagamento',nullif(p_documento->>'vencimento',''),'situacao','open');
   if tipo='os' then resultado:=public.salvar_os_com_itens(p_oficina,dados,p_chave,null,null);
   else resultado:=public.salvar_orcamento(p_oficina,dados,p_chave,null,null);end if;
   documento:=(resultado->>'id')::uuid;
 else
   if bem is null then
     bem:=gen_random_uuid();
     perform public.salvar_objeto_atendimento(p_oficina,bem,jsonb_build_object('cliente_id',cliente,'nome',p_documento->'bem'->>'nome','dados',jsonb_build_object('marca',p_documento->'bem'->>'marca')),null);
   end if;
   select jsonb_agg(jsonb_build_object('id',x.i->>'id','tipo',case when x.i->>'tipo'='part' then 'material' else 'servico' end,'descricao',x.i->>'descricao','unidade',x.i->>'unidade','grupo_servico',x.i->>'grupo_servico','depende_grupo',x.i->>'depende_grupo','quantidade',x.i->'quantidade','preco_centavos',x.i->'preco_unitario_centavos','custo_centavos',coalesce(x.i->'custo_unitario_previsto_centavos','0'::jsonb),'custo_informado',x.i->>'custo_unitario_previsto_centavos' is not null,'custo_ajustado',coalesce((x.i->>'custo_ajustado')::boolean,false),'produto_id',nullif(x.i->>'produto_estoque_id',''),'origem',case when nullif(x.i->>'produto_estoque_id','') is not null then 'estoque' when x.i->>'origem_peca'='cliente' then 'cliente' else 'externa' end) order by pos) into itens from jsonb_array_elements(p_documento->'itens') with ordinality as x(i,pos);
   dados:=jsonb_build_object('cliente_id',cliente,'objeto_id',bem,'titulo',coalesce(nullif(trim(p_documento->>'titulo'),''),p_documento->'itens'->0->>'descricao'),'situacao','orcamento','data_servico',p_documento->>'data','vencimento',nullif(p_documento->>'vencimento',''),'mostrar_desconto_nota',coalesce((p_documento->>'mostrar_desconto_nota')::boolean,false),'ficha_especialidade',p_documento->'ficha','dados',jsonb_build_object('documento',case when tipo='orcamento' then 'orcamento' else 'ordem' end,'solicitacao',p_documento->>'observacoes','observacoes_cliente',p_documento->>'observacoes','condicoes',p_documento->>'condicoes','forma_pagamento',p_documento->>'forma_pagamento','orcamento_enviado',case when tipo='orcamento' then 'sim' else 'nao' end));
   documento:=public.criar_atendimento_com_itens(p_oficina,p_chave,dados,itens,desconto,null);
   select to_jsonb(a) into resultado from public.atendimentos_servicos a where oficina_id=p_oficina and id=documento;
 end if;
 resultado:=jsonb_build_object('id',documento,'numero',(resultado->>'numero')::bigint,'tipo',tipo,'ramo',w.ramo,'cliente_id',cliente,'objeto_id',bem,'total_centavos',subtotal-desconto);
 insert into private.documentos_offline_recebidos(oficina_id,chave,usuario_id,pedido,resposta) values(p_oficina,p_chave,u,p_documento,resultado);
 return resultado;
end $$;
create function public.sincronizar_documento_offline(p_oficina uuid,p_chave uuid,p_documento jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.sincronizar_documento_offline(p_oficina,p_chave,p_documento); $$;
revoke all on function private.sincronizar_documento_offline(uuid,uuid,jsonb),public.sincronizar_documento_offline(uuid,uuid,jsonb) from public,anon;
grant execute on function private.sincronizar_documento_offline(uuid,uuid,jsonb),public.sincronizar_documento_offline(uuid,uuid,jsonb) to authenticated;




