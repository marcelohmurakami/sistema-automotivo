begin;
alter table public.orcamentos alter column cliente_id drop not null;
alter table public.ordens_servico alter column cliente_id drop not null;
create function private.cliente_atendimento(p_oficina uuid,p_dados jsonb) returns public.clientes language plpgsql security definer set search_path='' as $$
declare c public.clientes; begin
 if nullif(p_dados->>'cliente_id','') is null then
 c.nome:=trim(p_dados->>'cliente_nome_livre'); c.telefone_e164:=nullif(trim(p_dados->>'cliente_telefone_livre'),'');
 if c.nome is null or length(c.nome) not between 2 and 160 or (c.telefone_e164 is not null and c.telefone_e164 !~ '^\+[1-9][0-9]{7,14}$') then raise exception 'Informe o nome do cliente e um telefone válido, se desejar.' using errcode='22023'; end if;
 else
 select * into c from public.clientes where oficina_id=p_oficina and id=(p_dados->>'cliente_id')::uuid and arquivado_em is null;
 if not found then raise exception 'Cliente não encontrado nesta empresa.' using errcode='22023';end if;
 end if; return c; end $$;
revoke all on function private.cliente_atendimento(uuid,jsonb) from public,anon,authenticated;
CREATE OR REPLACE FUNCTION private.salvar_orcamento_base(p_oficina uuid, p_dados jsonb, p_chave uuid, p_orcamento uuid DEFAULT NULL::uuid, p_revisao integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if q.revisao is distinct from p_revisao then raise exception 'O orçamento mudou. Atualize e abra novamente.' using errcode='PT409'; end if;
  if q.situacao<>'draft' then raise exception 'Crie uma nova versão para alterar uma proposta emitida.' using errcode='22023'; end if;
 end if;
 c:=private.cliente_atendimento(p_oficina,p_dados);
 select * into carro from public.veiculos where oficina_id=p_oficina and id=(p_dados->>'veiculo_id')::uuid and arquivado_em is null;
 if not found or (c.id is not null and not exists(select 1 from public.clientes_veiculos where oficina_id=p_oficina and cliente_id=c.id and veiculo_id=carro.id and encerrado_em is null)) then raise exception 'Selecione um veículo vinculado ao cliente.' using errcode='22023'; end if;
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
end $function$
;
CREATE OR REPLACE FUNCTION public.salvar_ordem_servico(p_oficina uuid, p_dados jsonb, p_chave uuid, p_os uuid DEFAULT NULL::uuid, p_revisao integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid; w public.ordens_servico%rowtype; c public.clientes%rowtype; v public.veiculos%rowtype; n bigint; id_os uuid; campo text; retifica boolean; begin
 u:=private.exigir_os(p_oficina);
 select especialidade='retifica' into retifica from public.oficinas where id=p_oficina;
 if p_dados ? 'motor_livre' or p_dados ? 'carro_livre' then
 if not retifica or length(trim(coalesce(p_dados->>'motor_livre',''))) not between 1 and 160 or length(trim(coalesce(p_dados->>'carro_livre',''))) not between 1 and 160 then raise exception 'Informe carro e motor válidos para a retífica.' using errcode='22023';end if;
 end if;
 foreach campo in array array['queixa_cliente','diagnostico','observacoes_internas','resumo_cliente','pertences','condicoes_garantia'] loop if length(p_dados->>campo)>5000 then raise exception 'Texto muito longo' using errcode='22023'; end if; end loop;
 if length(p_dados->>'responsavel')>160 or length((p_dados->'checklist')::text)>2000 then raise exception 'Dados inválidos' using errcode='22023'; end if;
 if p_os is null then
  if p_chave is null then raise exception 'Chave obrigatória' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_chave::text,0));
  select id into id_os from public.ordens_servico where oficina_id=p_oficina and chave_criacao=p_chave; if found then return public.consultar_ordem_servico(p_oficina,id_os); end if;
  c:=private.cliente_atendimento(p_oficina,p_dados);
  if retifica and p_dados ? 'motor_livre' then
    p_dados:=p_dados||jsonb_build_object('veiculo_id',public.cadastrar_veiculo_orcamento(p_oficina,c.id,trim(p_dados->>'carro_livre'),null));
  end if;
  select * into v from public.veiculos where oficina_id=p_oficina and id=(p_dados->>'veiculo_id')::uuid and arquivado_em is null;
  if v.id is null or (c.id is not null and not exists(select 1 from public.clientes_veiculos where oficina_id=p_oficina and cliente_id=c.id and veiculo_id=v.id and encerrado_em is null)) then raise exception 'Selecione cliente e veículo vinculados' using errcode='22023'; end if;
  update public.oficinas set proximo_numero_os=proximo_numero_os+1 where id=p_oficina returning proximo_numero_os-1 into n;
  insert into public.ordens_servico(oficina_id,numero,cliente_id,veiculo_id,dados_cliente,dados_veiculo,criado_por,chave_criacao,recebido_em) values(p_oficina,n,c.id,v.id,jsonb_build_object('nome',c.nome,'telefone_e164',c.telefone_e164),jsonb_build_object('modelo',v.modelo,'marca',v.marca,'placa',v.placa),u,p_chave,now()) returning * into w;
 else
  select * into w from public.ordens_servico where oficina_id=p_oficina and id=p_os for update;
  if not found then raise exception 'OS não encontrada' using errcode='P0002'; end if;
  if p_revisao is distinct from w.revisao then raise exception 'OS alterada. Reabra antes de salvar.' using errcode='40001'; end if;
 end if;
 if w.situacao in ('delivered','cancelled') then raise exception 'OS encerrada: histórico preservado' using errcode='22023'; end if;
 if w.cliente_id is null and p_dados ? 'cliente_nome_livre' then
 c:=private.cliente_atendimento(p_oficina,p_dados||jsonb_build_object('cliente_id',null));
 update public.ordens_servico set dados_cliente=jsonb_build_object('nome',c.nome,'telefone_e164',c.telefone_e164) where id=w.id;
 end if;
 update public.ordens_servico set vencimento_pagamento=case when p_dados ? 'vencimento_pagamento' then nullif(p_dados->>'vencimento_pagamento','')::date else vencimento_pagamento end,dados_veiculo=case when retifica and p_dados ? 'motor_livre' then jsonb_build_object('modelo',trim(p_dados->>'carro_livre'),'motor',trim(p_dados->>'motor_livre'),'especialidade','retifica') else dados_veiculo end,tipo_servico=case when p_dados ? 'tipo_servico' then nullif(p_dados->>'tipo_servico','') else tipo_servico end,detalhes_especialidade=case when p_dados ? 'detalhes_especialidade' then coalesce(p_dados->>'detalhes_especialidade','') else detalhes_especialidade end,queixa_cliente=p_dados->>'queixa_cliente',diagnostico=p_dados->>'diagnostico',observacoes_internas=p_dados->>'observacoes_internas',resumo_cliente=p_dados->>'resumo_cliente',responsavel=p_dados->>'responsavel',prioridade=coalesce(p_dados->>'prioridade','normal'),quilometragem_entrada=nullif(p_dados->>'quilometragem_entrada','')::integer,quilometragem_saida=nullif(p_dados->>'quilometragem_saida','')::integer,combustivel_percentual=nullif(p_dados->>'combustivel_percentual','')::smallint,pertences=p_dados->>'pertences',entrega_prevista_em=nullif(p_dados->>'entrega_prevista_em','')::timestamptz,condicoes_garantia=p_dados->>'condicoes_garantia',garantia_ate=nullif(p_dados->>'garantia_ate','')::date,checklist=coalesce(p_dados->'checklist','{}') where id=w.id;
 perform private.evento_os(p_oficina,w.id,case when p_os is null then 'Ordem de serviço aberta.' else 'Dados do atendimento atualizados.' end,jsonb_build_object('antes',to_jsonb(w),'depois',p_dados));
 return public.consultar_ordem_servico(p_oficina,w.id);
end $function$
;
CREATE OR REPLACE FUNCTION public.cadastrar_veiculo_orcamento(p_oficina uuid, p_cliente uuid, p_modelo text, p_placa text DEFAULT NULL::text, p_marca text DEFAULT NULL::text, p_ano integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v uuid; placa text:=nullif(upper(regexp_replace(coalesce(p_placa,''),'[^a-zA-Z0-9]','','g')),'');
begin
 perform private.exigir_orcamentos(p_oficina);
 if (p_cliente is not null and not exists(select 1 from public.clientes where oficina_id=p_oficina and id=p_cliente and arquivado_em is null)) or length(trim(p_modelo)) not between 1 and 100 or p_modelo is null or (placa is not null and placa !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$') or (p_ano is not null and p_ano not between 1886 and 2200) then raise exception 'Confira cliente, modelo, placa e ano.' using errcode='22023'; end if;
 insert into public.veiculos(oficina_id,placa,modelo,marca,ano_modelo) values(p_oficina,placa,trim(p_modelo),left(p_marca,80),p_ano) returning id into v;
 if p_cliente is not null then insert into public.clientes_veiculos(oficina_id,cliente_id,veiculo_id,vinculo) values(p_oficina,p_cliente,v,'owner'); end if; return v;
exception when unique_violation then raise exception 'Esta placa já está cadastrada na oficina. Use o veículo existente.' using errcode='22023';
end $function$
;
CREATE OR REPLACE FUNCTION public.emitir_orcamento(p_oficina uuid, p_orcamento uuid, p_revisao integer, p_validade_dias integer, p_hash_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid; q public.orcamentos; v public.versoes_orcamento;
begin perform private.exigir_orcamento_ativo(p_oficina,p_orcamento);
 u:=private.exigir_orcamentos(p_oficina); select * into q from public.orcamentos where oficina_id=p_oficina and id=p_orcamento for update;
 if not found then raise exception 'Orçamento não encontrado.' using errcode='P0002'; end if;
 if q.revisao is distinct from p_revisao then raise exception 'O orçamento mudou. Atualize a tela.' using errcode='PT409'; end if;
 if p_validade_dias is null or p_validade_dias not between 1 and 90 or p_hash_token is null or p_hash_token !~ '^[0-9a-f]{64}$' then raise exception 'Validade ou link inválido.' using errcode='22023'; end if;
 select * into v from public.versoes_orcamento where oficina_id=p_oficina and id=q.versao_atual_id for update;
 if q.situacao<>'draft' or v.publicado_em is not null or not exists(select 1 from public.itens_orcamento where oficina_id=p_oficina and versao_orcamento_id=v.id) then raise exception 'A emissão exige um rascunho com pelo menos um item.' using errcode='22023'; end if;
 if (q.cliente_id is not null and not exists(select 1 from public.clientes where oficina_id=p_oficina and id=q.cliente_id and arquivado_em is null)) then raise exception 'O cliente foi arquivado.' using errcode='22023'; end if;
 if not exists(select 1 from public.veiculos where oficina_id=p_oficina and id=q.veiculo_id and arquivado_em is null)
 or (q.cliente_id is not null and not exists(select 1 from public.clientes_veiculos where oficina_id=p_oficina and cliente_id=q.cliente_id and veiculo_id=q.veiculo_id and encerrado_em is null))
 then raise exception 'O veículo ou seu vínculo com o cliente não está ativo.' using errcode='22023'; end if;
 update public.versoes_orcamento set publicado_em=now(),expira_em=now()+make_interval(days=>p_validade_dias) where id=v.id returning * into v;
 insert into public.tokens_acesso_orcamento(oficina_id,versao_orcamento_id,hash_token,expira_em) values(p_oficina,v.id,p_hash_token,v.expira_em);
 update public.orcamentos set situacao='awaiting_approval',revisao=revisao+1,atualizado_em=now() where id=q.id returning * into q;
 perform private.evento_orcamento(p_oficina,q.id,q.revisao,'orcamento.emitido',u); return private.dados_orcamento(p_oficina,q.id);
end $function$
;
CREATE OR REPLACE FUNCTION public.aprovar_orcamento_interno(p_oficina uuid, p_orcamento uuid, p_revisao integer, p_versao uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid; q public.orcamentos; v public.versoes_orcamento; grupos text[]; sub bigint;
begin
 u:=private.exigir_orcamentos(p_oficina);
 select * into q from public.orcamentos where oficina_id=p_oficina and id=p_orcamento for update;
 if not found then raise exception 'Orçamento não encontrado.' using errcode='P0002'; end if;
 if q.arquivado_em is not null then raise exception 'Orçamento excluído.' using errcode='22023'; end if;
 if q.situacao='approved' and q.versao_atual_id=p_versao then return; end if;
 if q.revisao is distinct from p_revisao or q.versao_atual_id is distinct from p_versao then raise exception 'Orçamento alterado. Atualize a lista antes de aprovar.' using errcode='40001'; end if;
  if q.arquivado_em is not null or q.situacao <> 'awaiting_approval' then
    raise exception 'O orçamento não está disponível para autorização.' using errcode='22023'; end if;
  select * into v from public.versoes_orcamento where oficina_id=p_oficina and id=p_versao for update;
  if v.publicado_em is not null and v.expira_em<=now() then
    raise exception 'O orçamento venceu. Revise os valores antes de autorizar.' using errcode='22023'; end if;
  if (q.cliente_id is not null and not exists(select 1 from public.clientes where oficina_id=p_oficina and id=q.cliente_id and arquivado_em is null))
    or not exists(select 1 from public.veiculos where oficina_id=p_oficina and id=q.veiculo_id and arquivado_em is null)
    or (q.cliente_id is not null and not exists(select 1 from public.clientes_veiculos where oficina_id=p_oficina and cliente_id=q.cliente_id and veiculo_id=q.veiculo_id and encerrado_em is null)) then
    raise exception 'Confira o cadastro do cliente e o vínculo com o veículo.' using errcode='22023'; end if;
  select array_agg(distinct grupo_servico order by grupo_servico),sum(total_item_centavos) into grupos,sub
    from public.itens_orcamento where oficina_id=p_oficina and versao_orcamento_id=v.id;
  if grupos is null or sub is distinct from v.subtotal_centavos then
    raise exception 'Confira os itens e valores do orçamento antes de autorizar.' using errcode='22023'; end if;
  if exists(select 1 from public.itens_orcamento where oficina_id=p_oficina and versao_orcamento_id=v.id and depende_grupo<>'' and not depende_grupo=any(grupos)) then
    raise exception 'O orçamento possui dependências de serviços não incluídas.' using errcode='22023'; end if;
  -- Congela o rascunho antes de aprovar; não cria um link nem simula resposta do cliente.
  if v.publicado_em is null then
    update public.versoes_orcamento set publicado_em=now(),expira_em=now()+interval '7 days' where id=v.id;
  end if;
  insert into public.aprovacoes_orcamento(oficina_id,versao_orcamento_id,decisao,nome_informado,metodo_verificacao,usuario_autorizador_id,texto_confirmacao,grupos_aprovados,subtotal_aprovado_centavos,desconto_aprovado_centavos,total_aprovado_centavos)
  values(p_oficina,v.id,'approved','Responsável da oficina','oficina',u,
    'Aprovação integral registrada pela oficina na lista. Orçamento #'||q.numero||', versão '||v.numero_versao||'.',
    grupos,sub,v.desconto_centavos,v.total_centavos);
  update public.orcamentos set situacao='approved',revisao=revisao+1,atualizado_em=now() where id=q.id returning * into q;

 perform private.evento_orcamento(p_oficina,q.id,q.revisao,'orcamento.autorizado_oficina',u);
end $function$
;
CREATE OR REPLACE FUNCTION public.autorizar_servico_pela_os(p_oficina uuid, p_os uuid, p_revisao integer, p_orcamento uuid, p_revisao_orcamento integer, p_versao uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid; q public.orcamentos; o public.ordens_servico; v public.versoes_orcamento; grupos text[]; sub bigint;
begin
  u:=private.exigir_os(p_oficina); perform private.exigir_orcamentos(p_oficina);
  -- Mesma ordem de bloqueios usada no aceite por link: orçamento, OS, versão.
  select * into q from public.orcamentos where oficina_id=p_oficina and id=p_orcamento for update;
  if not found then raise exception 'Orçamento não encontrado.' using errcode='P0002'; end if;
  select * into o from public.ordens_servico where oficina_id=p_oficina and id=p_os for update;
  if not found then raise exception 'OS não encontrada.' using errcode='P0002'; end if;
  if o.arquivado_em is not null or o.situacao in ('cancelled','delivered') then
    raise exception 'Esta OS está encerrada.' using errcode='22023'; end if;
  -- Repetir o clique ou receber o aceite público simultaneamente não duplica itens.
  if o.orcamento_origem_id=q.id and o.versao_orcamento_origem_id=p_versao and q.situacao='approved' then
    return public.consultar_ordem_servico(p_oficina,p_os); end if;
  if o.orcamento_aguardando_id is distinct from q.id then
    raise exception 'Este orçamento não está aguardando autorização nesta OS.' using errcode='22023'; end if;
  if o.revisao is distinct from p_revisao or q.revisao is distinct from p_revisao_orcamento or q.versao_atual_id is distinct from p_versao then
    raise exception 'A OS ou o orçamento mudou. Atualize a tela e confira os valores antes de autorizar.' using errcode='40001'; end if;
  if q.arquivado_em is not null or q.situacao not in ('draft','awaiting_approval') then
    raise exception 'O orçamento não está disponível para autorização.' using errcode='22023'; end if;
  select * into v from public.versoes_orcamento where oficina_id=p_oficina and id=p_versao for update;
  if v.publicado_em is not null and v.expira_em<=now() then
    raise exception 'O orçamento venceu. Revise os valores antes de autorizar.' using errcode='22023'; end if;
  if (q.cliente_id is not null and not exists(select 1 from public.clientes where oficina_id=p_oficina and id=q.cliente_id and arquivado_em is null))
    or not exists(select 1 from public.veiculos where oficina_id=p_oficina and id=q.veiculo_id and arquivado_em is null)
    or (q.cliente_id is not null and not exists(select 1 from public.clientes_veiculos where oficina_id=p_oficina and cliente_id=q.cliente_id and veiculo_id=q.veiculo_id and encerrado_em is null)) then
    raise exception 'Confira o cadastro do cliente e o vínculo com o veículo.' using errcode='22023'; end if;
  select array_agg(distinct grupo_servico order by grupo_servico),sum(total_item_centavos) into grupos,sub
    from public.itens_orcamento where oficina_id=p_oficina and versao_orcamento_id=v.id;
  if grupos is null or sub is distinct from v.subtotal_centavos then
    raise exception 'Confira os itens e valores do orçamento antes de autorizar.' using errcode='22023'; end if;
  if exists(select 1 from public.itens_orcamento where oficina_id=p_oficina and versao_orcamento_id=v.id and depende_grupo<>'' and not depende_grupo=any(grupos)) then
    raise exception 'O orçamento possui dependências de serviços não incluídas.' using errcode='22023'; end if;
  -- Congela o rascunho antes de aprovar; não cria um link nem simula resposta do cliente.
  if v.publicado_em is null then
    update public.versoes_orcamento set publicado_em=now(),expira_em=now()+interval '7 days' where id=v.id;
  end if;
  insert into public.aprovacoes_orcamento(oficina_id,versao_orcamento_id,decisao,nome_informado,metodo_verificacao,usuario_autorizador_id,texto_confirmacao,grupos_aprovados,subtotal_aprovado_centavos,desconto_aprovado_centavos,total_aprovado_centavos)
  values(p_oficina,v.id,'approved','Responsável da oficina','oficina',u,
    'Autorização integral registrada pela oficina na OS #'||o.numero||'. Orçamento #'||q.numero||', versão '||v.numero_versao||'.',
    grupos,sub,v.desconto_centavos,v.total_centavos);
  update public.orcamentos set situacao='approved',revisao=revisao+1,atualizado_em=now() where id=q.id returning * into q;
  -- O gatilho existente incorpora os itens e encerra somente a parada de aprovação.
  perform private.evento_os(p_oficina,o.id,'Serviço autorizado pela oficina nesta OS.',
    jsonb_build_object('acao','autorizacao_oficina','orcamento_id',q.id,'versao_id',v.id,'usuario_id',u,'total_autorizado_centavos',v.total_centavos));
  perform private.evento_orcamento(p_oficina,q.id,q.revisao,'orcamento.autorizado_oficina',u);
  return public.consultar_ordem_servico(p_oficina,p_os);
end $function$
;
CREATE OR REPLACE FUNCTION private.converter_orcamento_aprovado_base(p_oficina uuid, p_orcamento uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  u uuid; q public.orcamentos%rowtype; v public.versoes_orcamento%rowtype;
  result_id uuid; next_number bigint; first_stage uuid; copied_total bigint; corr uuid:=gen_random_uuid();
begin
  u:=private.require_staff(p_oficina);
  if not private.has_feature(p_oficina,'work_orders') then
    raise exception 'Ordens de serviço indisponíveis no plano atual' using errcode='42501';
  end if;
  select * into q from public.orcamentos where oficina_id=p_oficina and id=p_orcamento for update;
  if not found then raise exception 'Orçamento não encontrado' using errcode='P0002'; end if;
  select id into result_id from public.ordens_servico where oficina_id=p_oficina and orcamento_origem_id=q.id;
  if found then return result_id; end if;
  select * into v from public.versoes_orcamento where oficina_id=p_oficina and id=q.versao_atual_id for update;
  if not found or v.publicado_em is null or q.situacao<>'approved' or length(trim(coalesce(v.dados_cliente->>'nome','')))<2 or q.veiculo_id is null then
    raise exception 'É necessário um orçamento publicado e aprovado, com cliente e veículo' using errcode='23514';
  end if;
  if not exists(select 1 from public.aprovacoes_orcamento where oficina_id=p_oficina and versao_orcamento_id=v.id and decisao='approved') then
    raise exception 'A versão atual ainda não foi aprovada' using errcode='23514';
  end if;
  select sum(total_item_centavos) into copied_total from public.itens_orcamento where oficina_id=p_oficina and versao_orcamento_id=v.id and private.grupo_autorizado(v.id,grupo_servico);
  if copied_total is null or copied_total<>private.valor_autorizado(v.id) then
    raise exception 'O total do orçamento não corresponde aos itens' using errcode='23514';
  end if;
  update public.oficinas set proximo_numero_os=proximo_numero_os+1 where id=p_oficina
    returning proximo_numero_os-1 into next_number;
  select id into first_stage from public.etapas_producao where oficina_id=p_oficina and ativo order by posicao,id limit 1;
  insert into public.ordens_servico(oficina_id,numero,cliente_id,veiculo_id,orcamento_origem_id,versao_orcamento_origem_id,
    etapa_id,dados_cliente,dados_veiculo,subtotal_centavos,desconto_centavos,criado_por)
  values(p_oficina,next_number,q.cliente_id,q.veiculo_id,q.id,v.id,first_stage,
    v.dados_cliente,v.dados_veiculo,private.valor_autorizado(v.id),private.valor_autorizado(v.id,true),u) returning id into result_id;
  insert into public.itens_ordem_servico(oficina_id,ordem_servico_id,item_catalogo_id,item_orcamento_origem_id,posicao,
    tipo,descricao,unidade,quantidade,preco_unitario_centavos)
  select oficina_id,result_id,item_catalogo_id,id,posicao,tipo,descricao,unidade,quantidade,preco_unitario_centavos
    from public.itens_orcamento where oficina_id=p_oficina and versao_orcamento_id=v.id and private.grupo_autorizado(v.id,grupo_servico);
  insert into public.historico_ordem_servico(oficina_id,ordem_servico_id,tipo_evento,usuario_autor_id,descricao,visivel_ao_cliente)
    values(p_oficina,result_id,'created',u,'Ordem de servico criada a partir do orcamento aprovado.',true);
  insert into public.eventos_negocio(oficina_id,tipo_evento,tipo_agregado,agregado_id,versao_agregado,
    correlacao_id,chave_deduplicacao,dados)
  values(p_oficina,'work_order.created','work_order',result_id,1,corr,'work_order:'||result_id||':created',
    jsonb_build_object('work_order_id',result_id,'quote_version_id',v.id));
  insert into public.registros_auditoria(oficina_id,usuario_autor_id,tipo_autor,acao,tipo_entidade,entidade_id,correlacao_id)
    values(p_oficina,u,'user','convert_quote','work_order',result_id,corr);
  return result_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.criar_os_aguardando_orcamento(p_oficina uuid, p_orcamento uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid; q public.orcamentos; o uuid; resultado jsonb;
begin perform private.exigir_orcamento_ativo(p_oficina,p_orcamento);
  u:=private.exigir_orcamentos(p_oficina); perform private.exigir_os(p_oficina);
  select * into q from public.orcamentos where oficina_id=p_oficina and id=p_orcamento for update;
  if not found then raise exception 'Orçamento não encontrado.' using errcode='P0002'; end if;
  if exists(select 1 from public.complementos_ordem_servico where oficina_id=p_oficina and orcamento_id=q.id) then
    raise exception 'Este orçamento já é um adicional de outra OS.' using errcode='23514';
  end if;
  if q.situacao='approved' then return public.converter_orcamento_em_os(p_oficina,q.id); end if;
  select id into o from public.ordens_servico where oficina_id=p_oficina and (orcamento_origem_id=q.id or orcamento_aguardando_id=q.id);
  if found then return o; end if;
  if q.situacao not in ('draft','awaiting_approval') then
    raise exception 'Use um orçamento em rascunho ou aguardando aprovação.' using errcode='23514';
  end if;
  if exists(select 1 from public.ordens_servico where oficina_id=p_oficina and veiculo_id=q.veiculo_id and situacao not in ('delivered','cancelled')) then
    raise exception 'Este veículo já possui uma OS aberta. Confira o atendimento existente.' using errcode='23514';
  end if;
  resultado:=public.salvar_ordem_servico(p_oficina,jsonb_build_object('cliente_id',q.cliente_id,'veiculo_id',q.veiculo_id,'cliente_nome_livre',(select dados_cliente->>'nome' from public.versoes_orcamento where id=q.versao_atual_id),'cliente_telefone_livre',(select dados_cliente->>'telefone_e164' from public.versoes_orcamento where id=q.versao_atual_id)),gen_random_uuid());
  o:=(resultado->>'id')::uuid;
  update public.ordens_servico set orcamento_aguardando_id=q.id where oficina_id=p_oficina and id=o;
  insert into public.paradas_ordem_servico(oficina_id,ordem_servico_id,motivo,detalhes,criado_por)
    values(p_oficina,o,'approval','Aguardando aprovação do orçamento #'||q.numero,u);
  perform private.evento_os(p_oficina,o,'OS aberta aguardando aprovação do orçamento #'||q.numero||'.',jsonb_build_object('orcamento_id',q.id));
  return o;
end $function$
;
CREATE OR REPLACE FUNCTION public.consultar_orcamento_publico(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.tokens_acesso_orcamento; q public.orcamentos; v public.versoes_orcamento;
begin
 if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'Link inválido ou indisponível.' using errcode='P0002'; end if;
 select * into t from public.tokens_acesso_orcamento where hash_token=encode(sha256(convert_to(p_token,'UTF8')),'hex') and revogado_em is null and expira_em>now();
 select * into v from public.versoes_orcamento where oficina_id=t.oficina_id and id=t.versao_orcamento_id and publicado_em is not null;
 select * into q from public.orcamentos where oficina_id=t.oficina_id and id=v.orcamento_id and versao_atual_id=v.id and situacao in ('awaiting_approval','approved','declined');
 if q.id is null or not private.has_feature(q.oficina_id,'quotes') or (q.cliente_id is not null and not exists(select 1 from public.clientes where oficina_id=q.oficina_id and id=q.cliente_id and arquivado_em is null)) then raise exception 'Link inválido, vencido ou indisponível.' using errcode='P0002'; end if;
 return jsonb_build_object('numero',q.numero,'situacao',q.situacao,'versao',jsonb_build_object('numero_versao',v.numero_versao,'dados_oficina',jsonb_build_object('nome',v.dados_oficina->>'nome','telefone_e164',v.dados_oficina->>'telefone_e164','logo',v.dados_oficina->>'logo','cor',v.dados_oficina->>'cor','rodape',v.dados_oficina->>'rodape'),'dados_cliente',jsonb_build_object('nome',v.dados_cliente->>'nome'),'dados_veiculo',v.dados_veiculo,'subtotal_centavos',v.subtotal_centavos,'desconto_centavos',v.desconto_centavos,'total_centavos',v.total_centavos,'observacoes',v.observacoes,'condicoes',v.condicoes,'publicado_em',v.publicado_em,'expira_em',v.expira_em),
 'itens',(select jsonb_agg(jsonb_build_object('grupo_servico',grupo_servico,'explicacao_cliente',explicacao_cliente,'prioridade_servico',prioridade_servico,'depende_grupo',depende_grupo,'descricao',descricao,'tipo',tipo,'quantidade',quantidade,'unidade',unidade,'preco_unitario_centavos',preco_unitario_centavos,'total_item_centavos',total_item_centavos) order by posicao) from public.itens_orcamento where oficina_id=q.oficina_id and versao_orcamento_id=v.id),
 'aprovacao',(select jsonb_build_object('decisao',decisao,'nome_informado',nome_informado,'confirmado_em',confirmado_em,'grupos_aprovados',grupos_aprovados,'subtotal_aprovado_centavos',subtotal_aprovado_centavos,'desconto_aprovado_centavos',desconto_aprovado_centavos,'total_aprovado_centavos',total_aprovado_centavos) from public.aprovacoes_orcamento where oficina_id=q.oficina_id and versao_orcamento_id=v.id));
end $function$
;
CREATE OR REPLACE FUNCTION public.responder_orcamento(p_token text, p_nome text, p_decisao text, p_confirmo boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;
notify pgrst,'reload schema';
commit;
