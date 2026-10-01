begin;
alter table public.orcamentos add column chave_criacao uuid;
create unique index orcamento_chave_criacao on public.orcamentos(oficina_id,chave_criacao) where chave_criacao is not null;
create function private.exigir_orcamentos(p_oficina uuid) returns uuid language plpgsql stable security definer set search_path='' as $$
declare u uuid;
begin u:=private.require_staff(p_oficina); if not private.has_feature(p_oficina,'quotes') then raise exception 'Orçamentos indisponíveis no plano atual.' using errcode='42501'; end if; return u; end $$;
create function private.evento_orcamento(p_oficina uuid,p_id uuid,p_revisao integer,p_acao text,p_usuario uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare corr uuid:=gen_random_uuid();
begin
 insert into public.eventos_negocio(oficina_id,tipo_evento,tipo_agregado,agregado_id,versao_agregado,correlacao_id,chave_deduplicacao,dados)
 values(p_oficina,p_acao,'orcamento',p_id,p_revisao,corr,'orcamento:'||p_id||':'||p_revisao||':'||p_acao,jsonb_build_object('orcamento_id',p_id));
 insert into public.registros_auditoria(oficina_id,usuario_autor_id,tipo_autor,acao,tipo_entidade,entidade_id,correlacao_id)
 values(p_oficina,p_usuario,case when p_usuario is null then 'customer_link' else 'user' end,p_acao,'orcamento',p_id,corr);
end $$;
create function private.dados_orcamento(p_oficina uuid,p_id uuid,p_versao uuid default null) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(q)||jsonb_build_object('situacao',case when q.situacao='awaiting_approval' and atual.expira_em<=now() then 'expired' else q.situacao end,
 'versao',to_jsonb(v),'itens',(select coalesce(jsonb_agg(to_jsonb(i) order by i.posicao),'[]') from public.itens_orcamento i where i.oficina_id=q.oficina_id and i.versao_orcamento_id=v.id),
 'historico',(select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'numero_versao',h.numero_versao,'total_centavos',h.total_centavos,'publicado_em',h.publicado_em) order by h.numero_versao desc),'[]') from public.versoes_orcamento h where h.oficina_id=q.oficina_id and h.orcamento_id=q.id),
 'aprovacao',(select jsonb_build_object('decisao',a.decisao,'nome_informado',a.nome_informado,'confirmado_em',a.confirmado_em) from public.aprovacoes_orcamento a where a.oficina_id=q.oficina_id and a.versao_orcamento_id=v.id),
 'ordem_servico_id',(select os.id from public.ordens_servico os where os.oficina_id=q.oficina_id and os.orcamento_origem_id=q.id))
 from public.orcamentos q join public.versoes_orcamento atual on atual.oficina_id=q.oficina_id and atual.id=q.versao_atual_id
 join public.versoes_orcamento v on v.oficina_id=q.oficina_id and v.orcamento_id=q.id and v.id=coalesce(p_versao,q.versao_atual_id)
 where q.oficina_id=p_oficina and q.id=p_id;
$$;
create function public.consultar_orcamento(p_oficina uuid,p_orcamento uuid,p_versao uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare resultado jsonb;
begin perform private.exigir_orcamentos(p_oficina); resultado:=private.dados_orcamento(p_oficina,p_orcamento,p_versao); if resultado is null then raise exception 'Orçamento não encontrado.' using errcode='P0002'; end if; return resultado; end $$;
create function public.listar_orcamentos(p_oficina uuid,p_busca text default '',p_situacao text default '',p_pagina integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare itens jsonb; total bigint;
begin
 perform private.exigir_orcamentos(p_oficina);
 if p_pagina is null or p_pagina<0 or length(coalesce(p_busca,''))>200 or p_situacao not in ('','draft','awaiting_approval','approved','declined','expired','cancelled') then raise exception 'Filtro inválido.' using errcode='22023'; end if;
 with base as (select q.id,q.numero,q.criado_em,q.revisao,v.total_centavos,v.numero_versao,v.expira_em,v.dados_cliente->>'nome' as cliente,v.dados_veiculo->>'modelo' as veiculo,v.dados_veiculo->>'placa' as placa,
 case when q.situacao='awaiting_approval' and v.expira_em<=now() then 'expired' else q.situacao end as situacao
 from public.orcamentos q join public.versoes_orcamento v on v.oficina_id=q.oficina_id and v.id=q.versao_atual_id where q.oficina_id=p_oficina and q.arquivado_em is null),
 filtrados as (select * from base where (coalesce(p_situacao,'')='' or situacao=p_situacao) and strpos(lower(concat_ws(' ',numero,cliente,veiculo,placa)),lower(trim(coalesce(p_busca,''))))>0),
 pagina as (select * from filtrados order by numero desc limit 24 offset p_pagina*24)
 select (select count(*) from filtrados),coalesce(jsonb_agg(to_jsonb(pagina) order by numero desc),'[]') into total,itens from pagina;
 return jsonb_build_object('itens',itens,'total',total);
end $$;
create function public.salvar_orcamento(p_oficina uuid,p_dados jsonb,p_chave uuid,p_orcamento uuid default null,p_revisao integer default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid; q public.orcamentos; v public.versoes_orcamento; c public.clientes; carro public.veiculos; item jsonb; pos integer:=0; subtotal bigint; desconto bigint; quantidade numeric; preco bigint; n bigint; novo boolean:=p_orcamento is null;
begin
 u:=private.exigir_orcamentos(p_oficina);
 if jsonb_typeof(p_dados) is distinct from 'object' or jsonb_typeof(p_dados->'itens') is distinct from 'array' then raise exception 'Informe os dados e itens.' using errcode='22023'; end if;
 if jsonb_array_length(p_dados->'itens')>100 or length(coalesce(p_dados->>'observacoes',''))>4000 or length(coalesce(p_dados->>'condicoes',''))>4000 then raise exception 'Limite de itens ou texto excedido.' using errcode='22023'; end if;
 if novo then
  if p_chave is null then raise exception 'Identificador do cadastro ausente.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtext(p_oficina::text||p_chave::text));
  select * into q from public.orcamentos where oficina_id=p_oficina and chave_criacao=p_chave;
  if found then return private.dados_orcamento(p_oficina,q.id); end if;
 else
  select * into q from public.orcamentos where oficina_id=p_oficina and id=p_orcamento for update;
  if not found then raise exception 'Orçamento não encontrado.' using errcode='P0002'; end if;
  if q.revisao is distinct from p_revisao then raise exception 'O orçamento mudou. Atualize e abra novamente.' using errcode='40001'; end if;
  if q.situacao<>'draft' then raise exception 'Crie uma nova versão para alterar uma proposta emitida.' using errcode='22023'; end if;
 end if;
 select * into c from public.clientes where oficina_id=p_oficina and id=(p_dados->>'cliente_id')::uuid and arquivado_em is null;
 if not found then raise exception 'Selecione um cliente ativo da oficina.' using errcode='22023'; end if;
 select * into carro from public.veiculos where oficina_id=p_oficina and id=(p_dados->>'veiculo_id')::uuid and arquivado_em is null;
 if not found or not exists(select 1 from public.clientes_veiculos where oficina_id=p_oficina and cliente_id=c.id and veiculo_id=carro.id and encerrado_em is null) then raise exception 'Selecione um veículo vinculado ao cliente.' using errcode='22023'; end if;
 if novo then
  update public.oficinas set proximo_numero_orcamento=proximo_numero_orcamento+1 where id=p_oficina returning proximo_numero_orcamento-1 into n;
  insert into public.orcamentos(oficina_id,numero,cliente_id,veiculo_id,criado_por,chave_criacao) values(p_oficina,n,c.id,carro.id,u,p_chave) returning * into q;
  insert into public.versoes_orcamento(oficina_id,orcamento_id,numero_versao,criado_por) values(p_oficina,q.id,1,u) returning * into v;
  update public.orcamentos set versao_atual_id=v.id where id=q.id;
 else select * into v from public.versoes_orcamento where oficina_id=p_oficina and id=q.versao_atual_id for update; end if;
 delete from public.itens_orcamento where oficina_id=p_oficina and versao_orcamento_id=v.id;
 for item in select value from jsonb_array_elements(p_dados->'itens') loop
  quantidade:=(item->>'quantidade')::numeric; preco:=(item->>'preco_unitario_centavos')::bigint;
  if length(trim(coalesce(item->>'descricao',''))) not between 1 and 300 or coalesce(item->>'tipo','') not in ('service','part') or quantidade is null or quantidade<=0 or quantidade>100000 or quantidade<>round(quantidade,3) or preco is null or preco<0 or preco>100000000 or length(coalesce(item->>'unidade','un')) not between 1 and 15 then raise exception 'Confira descrição, quantidade e preço dos itens.' using errcode='22023'; end if;
  if nullif(item->>'item_catalogo_id','') is not null and not exists(select 1 from public.itens_catalogo where oficina_id=p_oficina and id=(item->>'item_catalogo_id')::uuid and arquivado_em is null) then raise exception 'Item de catálogo inválido.' using errcode='22023'; end if;
  insert into public.itens_orcamento(oficina_id,versao_orcamento_id,item_catalogo_id,posicao,tipo,descricao,unidade,quantidade,preco_unitario_centavos)
  values(p_oficina,v.id,nullif(item->>'item_catalogo_id','')::uuid,pos,item->>'tipo',trim(item->>'descricao'),coalesce(item->>'unidade','un'),quantidade,preco); pos:=pos+1;
 end loop;
 select coalesce(sum(total_item_centavos),0) into subtotal from public.itens_orcamento where oficina_id=p_oficina and versao_orcamento_id=v.id;
 desconto:=coalesce((p_dados->>'desconto_centavos')::bigint,0);
 if subtotal>1000000000 or desconto<0 or desconto>subtotal then raise exception 'Desconto ou total inválido.' using errcode='22023'; end if;
 update public.versoes_orcamento set dados_oficina=(select jsonb_build_object('nome',nome,'telefone_e164',telefone_e164,'endereco',endereco) from public.oficinas where id=p_oficina),
 dados_cliente=jsonb_build_object('nome',c.nome,'telefone_e164',c.telefone_e164,'email',c.email),dados_veiculo=jsonb_build_object('placa',carro.placa,'marca',carro.marca,'modelo',carro.modelo,'ano_modelo',carro.ano_modelo),
 observacoes=coalesce(p_dados->>'observacoes',''),condicoes=coalesce(p_dados->>'condicoes',''),subtotal_centavos=subtotal,desconto_centavos=desconto where id=v.id;
 update public.orcamentos set cliente_id=c.id,veiculo_id=carro.id,revisao=revisao+1,atualizado_em=now() where id=q.id returning * into q;
 perform private.evento_orcamento(p_oficina,q.id,q.revisao,case when novo then 'orcamento.criado' else 'orcamento.editado' end,u);
 return private.dados_orcamento(p_oficina,q.id);
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'Confira os números e identificadores informados.' using errcode='22023';
end $$;
create function public.cadastrar_veiculo_orcamento(p_oficina uuid,p_cliente uuid,p_modelo text,p_placa text default null,p_marca text default null,p_ano integer default null) returns uuid language plpgsql security definer set search_path='' as $$
declare v uuid; placa text:=nullif(upper(regexp_replace(coalesce(p_placa,''),'[^a-zA-Z0-9]','','g')),'');
begin
 perform private.exigir_orcamentos(p_oficina);
 if not exists(select 1 from public.clientes where oficina_id=p_oficina and id=p_cliente and arquivado_em is null) or length(trim(p_modelo)) not between 1 and 100 or p_modelo is null or (placa is not null and placa !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$') or (p_ano is not null and p_ano not between 1886 and 2200) then raise exception 'Confira cliente, modelo, placa e ano.' using errcode='22023'; end if;
 insert into public.veiculos(oficina_id,placa,modelo,marca,ano_modelo) values(p_oficina,placa,trim(p_modelo),left(p_marca,80),p_ano) returning id into v;
 insert into public.clientes_veiculos(oficina_id,cliente_id,veiculo_id,vinculo) values(p_oficina,p_cliente,v,'owner'); return v;
exception when unique_violation then raise exception 'Esta placa já está cadastrada na oficina. Use o veículo existente.' using errcode='22023';
end $$;
create function public.emitir_orcamento(p_oficina uuid,p_orcamento uuid,p_revisao integer,p_validade_dias integer,p_hash_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid; q public.orcamentos; v public.versoes_orcamento;
begin
 u:=private.exigir_orcamentos(p_oficina); select * into q from public.orcamentos where oficina_id=p_oficina and id=p_orcamento for update;
 if not found then raise exception 'Orçamento não encontrado.' using errcode='P0002'; end if;
 if q.revisao is distinct from p_revisao then raise exception 'O orçamento mudou. Atualize a tela.' using errcode='40001'; end if;
 if p_validade_dias is null or p_validade_dias not between 1 and 90 or p_hash_token is null or p_hash_token !~ '^[0-9a-f]{64}$' then raise exception 'Validade ou link inválido.' using errcode='22023'; end if;
 select * into v from public.versoes_orcamento where oficina_id=p_oficina and id=q.versao_atual_id for update;
 if q.situacao<>'draft' or v.publicado_em is not null or not exists(select 1 from public.itens_orcamento where oficina_id=p_oficina and versao_orcamento_id=v.id) then raise exception 'A emissão exige um rascunho com pelo menos um item.' using errcode='22023'; end if;
 if not exists(select 1 from public.clientes where oficina_id=p_oficina and id=q.cliente_id and arquivado_em is null) then raise exception 'O cliente foi arquivado.' using errcode='22023'; end if;
 if not exists(select 1 from public.veiculos where oficina_id=p_oficina and id=q.veiculo_id and arquivado_em is null)
 or not exists(select 1 from public.clientes_veiculos where oficina_id=p_oficina and cliente_id=q.cliente_id and veiculo_id=q.veiculo_id and encerrado_em is null)
 then raise exception 'O veículo ou seu vínculo com o cliente não está ativo.' using errcode='22023'; end if;
 update public.versoes_orcamento set publicado_em=now(),expira_em=now()+make_interval(days=>p_validade_dias) where id=v.id returning * into v;
 insert into public.tokens_acesso_orcamento(oficina_id,versao_orcamento_id,hash_token,expira_em) values(p_oficina,v.id,p_hash_token,v.expira_em);
 update public.orcamentos set situacao='awaiting_approval',revisao=revisao+1,atualizado_em=now() where id=q.id returning * into q;
 perform private.evento_orcamento(p_oficina,q.id,q.revisao,'orcamento.emitido',u); return private.dados_orcamento(p_oficina,q.id);
end $$;
create function public.gerar_link_orcamento(p_oficina uuid,p_orcamento uuid,p_hash_token text) returns void language plpgsql security definer set search_path='' as $$
declare q public.orcamentos; v public.versoes_orcamento;
begin
 perform private.exigir_orcamentos(p_oficina); select * into q from public.orcamentos where oficina_id=p_oficina and id=p_orcamento for update;
 select * into v from public.versoes_orcamento where oficina_id=p_oficina and id=q.versao_atual_id;
 if q.id is null or q.situacao not in ('awaiting_approval','approved','declined') or v.expira_em<=now() or v.publicado_em is null or p_hash_token is null or p_hash_token !~ '^[0-9a-f]{64}$' then raise exception 'Não é possível compartilhar esta proposta. Confira situação e validade.' using errcode='22023'; end if;
 -- Reenvio não invalida links anteriores da mesma versão; revisão/cancelamento revogam todos.
 insert into public.tokens_acesso_orcamento(oficina_id,versao_orcamento_id,hash_token,expira_em) values(p_oficina,v.id,p_hash_token,v.expira_em);
end $$;
create function public.revisar_orcamento(p_oficina uuid,p_orcamento uuid,p_revisao integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid; q public.orcamentos; v public.versoes_orcamento; nova uuid;
begin
 u:=private.exigir_orcamentos(p_oficina); select * into q from public.orcamentos where oficina_id=p_oficina and id=p_orcamento for update;
 if not found then raise exception 'Orçamento não encontrado.' using errcode='P0002'; end if;
 if q.revisao is distinct from p_revisao then raise exception 'O orçamento mudou. Atualize a tela.' using errcode='40001'; end if;
 if q.situacao='draft' then return private.dados_orcamento(p_oficina,q.id); end if;
 if exists(select 1 from public.ordens_servico where oficina_id=p_oficina and orcamento_origem_id=q.id) then raise exception 'Este orçamento já originou uma OS. Crie um novo orçamento para serviços adicionais.' using errcode='22023'; end if;
 select * into v from public.versoes_orcamento where oficina_id=p_oficina and id=q.versao_atual_id;
 insert into public.versoes_orcamento(oficina_id,orcamento_id,numero_versao,dados_oficina,dados_cliente,dados_veiculo,observacoes,condicoes,subtotal_centavos,desconto_centavos,criado_por)
 values(p_oficina,q.id,v.numero_versao+1,v.dados_oficina,v.dados_cliente,v.dados_veiculo,v.observacoes,v.condicoes,v.subtotal_centavos,v.desconto_centavos,u) returning id into nova;
 insert into public.itens_orcamento(oficina_id,versao_orcamento_id,item_catalogo_id,posicao,tipo,descricao,unidade,quantidade,preco_unitario_centavos)
 select oficina_id,nova,item_catalogo_id,posicao,tipo,descricao,unidade,quantidade,preco_unitario_centavos from public.itens_orcamento where oficina_id=p_oficina and versao_orcamento_id=v.id;
 update public.tokens_acesso_orcamento set revogado_em=now() where oficina_id=p_oficina and versao_orcamento_id in(select id from public.versoes_orcamento where oficina_id=p_oficina and orcamento_id=q.id) and revogado_em is null;
 update public.orcamentos set situacao='draft',versao_atual_id=nova,revisao=revisao+1,atualizado_em=now() where id=q.id returning * into q;
 perform private.evento_orcamento(p_oficina,q.id,q.revisao,'orcamento.revisado',u); return private.dados_orcamento(p_oficina,q.id);
end $$;
create function public.cancelar_orcamento(p_oficina uuid,p_orcamento uuid,p_revisao integer) returns void language plpgsql security definer set search_path='' as $$
declare u uuid; q public.orcamentos;
begin
 u:=private.exigir_orcamentos(p_oficina); select * into q from public.orcamentos where oficina_id=p_oficina and id=p_orcamento for update;
 if not found then raise exception 'Orçamento não encontrado.' using errcode='P0002'; end if;
 if q.revisao is distinct from p_revisao then raise exception 'O orçamento mudou. Atualize a tela.' using errcode='40001'; end if;
 if q.situacao='approved' or exists(select 1 from public.ordens_servico where oficina_id=p_oficina and orcamento_origem_id=q.id) then raise exception 'Um orçamento aprovado não pode ser cancelado por este fluxo.' using errcode='22023'; end if;
 update public.tokens_acesso_orcamento set revogado_em=now() where oficina_id=p_oficina and versao_orcamento_id in(select id from public.versoes_orcamento where oficina_id=p_oficina and orcamento_id=q.id) and revogado_em is null;
 update public.orcamentos set situacao='cancelled',revisao=revisao+1,atualizado_em=now() where id=q.id returning * into q;
 perform private.evento_orcamento(p_oficina,q.id,q.revisao,'orcamento.cancelado',u);
end $$;
create function public.consultar_orcamento_publico(p_token text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t public.tokens_acesso_orcamento; q public.orcamentos; v public.versoes_orcamento;
begin
 if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'Link inválido ou indisponível.' using errcode='P0002'; end if;
 select * into t from public.tokens_acesso_orcamento where hash_token=encode(sha256(convert_to(p_token,'UTF8')),'hex') and revogado_em is null and expira_em>now();
 select * into v from public.versoes_orcamento where oficina_id=t.oficina_id and id=t.versao_orcamento_id and publicado_em is not null;
 select * into q from public.orcamentos where oficina_id=t.oficina_id and id=v.orcamento_id and versao_atual_id=v.id and situacao in ('awaiting_approval','approved','declined');
 if q.id is null or not private.has_feature(q.oficina_id,'quotes') or not exists(select 1 from public.clientes where oficina_id=q.oficina_id and id=q.cliente_id and arquivado_em is null) then raise exception 'Link inválido, vencido ou indisponível.' using errcode='P0002'; end if;
 return jsonb_build_object('numero',q.numero,'situacao',q.situacao,'versao',jsonb_build_object('numero_versao',v.numero_versao,'dados_oficina',jsonb_build_object('nome',v.dados_oficina->>'nome','telefone_e164',v.dados_oficina->>'telefone_e164'),'dados_cliente',jsonb_build_object('nome',v.dados_cliente->>'nome'),'dados_veiculo',v.dados_veiculo,'subtotal_centavos',v.subtotal_centavos,'desconto_centavos',v.desconto_centavos,'total_centavos',v.total_centavos,'observacoes',v.observacoes,'condicoes',v.condicoes,'publicado_em',v.publicado_em,'expira_em',v.expira_em),
 'itens',(select jsonb_agg(jsonb_build_object('descricao',descricao,'tipo',tipo,'quantidade',quantidade,'unidade',unidade,'preco_unitario_centavos',preco_unitario_centavos,'total_item_centavos',total_item_centavos) order by posicao) from public.itens_orcamento where oficina_id=q.oficina_id and versao_orcamento_id=v.id),
 'aprovacao',(select jsonb_build_object('decisao',decisao,'nome_informado',nome_informado,'confirmado_em',confirmado_em) from public.aprovacoes_orcamento where oficina_id=q.oficina_id and versao_orcamento_id=v.id));
end $$;
create function public.responder_orcamento(p_token text,p_nome text,p_decisao text,p_confirmo boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.tokens_acesso_orcamento; q public.orcamentos; v public.versoes_orcamento; anterior public.aprovacoes_orcamento;
begin
 if p_confirmo is distinct from true or p_decisao is null or p_decisao not in ('approved','declined') or p_nome is null or length(trim(p_nome)) not between 2 and 160 then raise exception 'Informe seu nome, decisão e confirmação.' using errcode='22023'; end if;
 perform public.consultar_orcamento_publico(p_token);
 select * into t from public.tokens_acesso_orcamento where hash_token=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 select * into v from public.versoes_orcamento where oficina_id=t.oficina_id and id=t.versao_orcamento_id;
 select * into q from public.orcamentos where oficina_id=t.oficina_id and id=v.orcamento_id for update;
 -- Revalidar depois do lock: revisão, cancelamento ou outra resposta podem ter ocorrido.
 select * into t from public.tokens_acesso_orcamento where id=t.id and revogado_em is null and expira_em>clock_timestamp() for share;
 if not found or q.versao_atual_id<>v.id or q.situacao not in ('awaiting_approval','approved','declined') then raise exception 'Link inválido, vencido ou indisponível.' using errcode='P0002'; end if;
 perform public.consultar_orcamento_publico(p_token);
 select * into anterior from public.aprovacoes_orcamento where oficina_id=q.oficina_id and versao_orcamento_id=v.id;
 if found then
   if anterior.decisao=p_decisao and anterior.nome_informado=trim(p_nome) then return public.consultar_orcamento_publico(p_token); end if;
   raise exception 'Esta proposta já recebeu uma resposta.' using errcode='22023';
 end if;
 if q.situacao<>'awaiting_approval' then raise exception 'Esta proposta não aguarda resposta.' using errcode='22023'; end if;
 insert into public.aprovacoes_orcamento(oficina_id,versao_orcamento_id,token_acesso_id,decisao,nome_informado,texto_confirmacao)
 values(q.oficina_id,v.id,t.id,p_decisao,trim(p_nome),'Confirmo minha decisão sobre a versão '||v.numero_versao||' do orçamento '||q.numero||', no total de '||v.total_centavos||' centavos.');
 update public.orcamentos set situacao=p_decisao,revisao=revisao+1,atualizado_em=now() where id=q.id returning * into q;
 perform private.evento_orcamento(q.oficina_id,q.id,q.revisao,'orcamento.'||p_decisao,null);
 return public.consultar_orcamento_publico(p_token);
end $$;
do $$ declare f record; begin
 for f in select p.oid::regprocedure as assinatura,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='private' and p.proname in ('exigir_orcamentos','evento_orcamento','dados_orcamento')) or (n.nspname='public' and p.proname in ('consultar_orcamento','listar_orcamentos','salvar_orcamento','cadastrar_veiculo_orcamento','emitir_orcamento','gerar_link_orcamento','revisar_orcamento','cancelar_orcamento','consultar_orcamento_publico','responder_orcamento')) loop
 execute format('revoke all on function %s from public,anon,authenticated',f.assinatura);
 if f.nspname='public' then execute format('grant execute on function %s to authenticated',f.assinatura); end if;
 if f.proname in ('consultar_orcamento_publico','responder_orcamento') then execute format('grant execute on function %s to anon',f.assinatura); end if;
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
