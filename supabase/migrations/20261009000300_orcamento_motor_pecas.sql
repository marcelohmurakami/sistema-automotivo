begin;
alter table public.versoes_orcamento add column pecas_a_trocar text not null default '' check(length(pecas_a_trocar)<=5000);
alter table public.ordens_servico add column pecas_a_trocar text not null default '' check(length(pecas_a_trocar)<=5000);
CREATE OR REPLACE FUNCTION private.salvar_orcamento_base(p_oficina uuid, p_dados jsonb, p_chave uuid, p_orcamento uuid DEFAULT NULL::uuid, p_revisao integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid; q public.orcamentos; v public.versoes_orcamento; c public.clientes; carro public.veiculos; item jsonb; pos integer:=0; subtotal bigint; desconto bigint; quantidade numeric; preco bigint; n bigint; novo boolean:=p_orcamento is null; livre boolean;
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
 livre:=p_dados ? 'motor_livre' or p_dados ? 'carro_livre';
 if livre then
 if not exists(select 1 from public.oficinas where id=p_oficina and especialidade='retifica') or length(trim(coalesce(p_dados->>'carro_livre',''))) not between 1 and 100 or length(trim(coalesce(p_dados->>'motor_livre',''))) not between 1 and 160 then raise exception 'Informe carro e motor válidos para a retífica.' using errcode='22023';end if;
 if novo or q.cliente_id is distinct from c.id then
 p_dados:=p_dados||jsonb_build_object('veiculo_id',public.cadastrar_veiculo_orcamento(p_oficina,c.id,trim(p_dados->>'carro_livre'),null));
 else p_dados:=p_dados||jsonb_build_object('veiculo_id',q.veiculo_id);end if;
 end if;
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
 dados_cliente=jsonb_build_object('nome',c.nome,'telefone_e164',c.telefone_e164,'email',c.email),dados_veiculo=case when livre then jsonb_build_object('modelo',trim(p_dados->>'carro_livre'),'motor',trim(p_dados->>'motor_livre'),'especialidade','retifica') else jsonb_build_object('placa',carro.placa,'marca',carro.marca,'modelo',carro.modelo,'ano_modelo',carro.ano_modelo) end,
 observacoes=coalesce(p_dados->>'observacoes',''),condicoes=coalesce(p_dados->>'condicoes',''),subtotal_centavos=subtotal,desconto_centavos=desconto where id=v.id;
 update public.orcamentos set cliente_id=c.id,veiculo_id=carro.id,revisao=revisao+1,atualizado_em=now() where id=q.id returning * into q;
 perform private.evento_orcamento(p_oficina,q.id,q.revisao,case when novo then 'orcamento.criado' else 'orcamento.editado' end,u);
 return private.dados_orcamento(p_oficina,q.id);
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'Confira os números e identificadores informados.' using errcode='22023';
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
 return jsonb_build_object('numero',q.numero,'situacao',q.situacao,'versao',jsonb_build_object('numero_versao',v.numero_versao,'dados_oficina',jsonb_build_object('nome',v.dados_oficina->>'nome','telefone_e164',v.dados_oficina->>'telefone_e164','logo',v.dados_oficina->>'logo','cor',v.dados_oficina->>'cor','rodape',v.dados_oficina->>'rodape'),'dados_cliente',jsonb_build_object('nome',v.dados_cliente->>'nome'),'dados_veiculo',v.dados_veiculo,'subtotal_centavos',v.subtotal_centavos,'desconto_centavos',v.desconto_centavos,'total_centavos',v.total_centavos,'observacoes',v.observacoes,'condicoes',v.condicoes,'pecas_a_trocar',v.pecas_a_trocar,'tipo_servico',v.tipo_servico,'detalhes_especialidade',v.detalhes_especialidade,'queixa_cliente',v.queixa_cliente,'diagnostico',v.diagnostico,'codigos_falha',v.codigos_falha,'publicado_em',v.publicado_em,'expira_em',v.expira_em),
 'itens',(select jsonb_agg(jsonb_build_object('grupo_servico',grupo_servico,'explicacao_cliente',explicacao_cliente,'prioridade_servico',prioridade_servico,'depende_grupo',depende_grupo,'descricao',descricao,'tipo',tipo,'quantidade',quantidade,'unidade',unidade,'preco_unitario_centavos',preco_unitario_centavos,'total_item_centavos',total_item_centavos) order by posicao) from public.itens_orcamento where oficina_id=q.oficina_id and versao_orcamento_id=v.id),
 'aprovacao',(select jsonb_build_object('decisao',decisao,'nome_informado',nome_informado,'confirmado_em',confirmado_em,'grupos_aprovados',grupos_aprovados,'subtotal_aprovado_centavos',subtotal_aprovado_centavos,'desconto_aprovado_centavos',desconto_aprovado_centavos,'total_aprovado_centavos',total_aprovado_centavos) from public.aprovacoes_orcamento where oficina_id=q.oficina_id and versao_orcamento_id=v.id));
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
 update public.ordens_servico set pecas_a_trocar=case when p_dados ? 'pecas_a_trocar' then coalesce(p_dados->>'pecas_a_trocar','') else pecas_a_trocar end,vencimento_pagamento=case when p_dados ? 'vencimento_pagamento' then nullif(p_dados->>'vencimento_pagamento','')::date else vencimento_pagamento end,dados_veiculo=case when retifica and p_dados ? 'motor_livre' then jsonb_build_object('modelo',trim(p_dados->>'carro_livre'),'motor',trim(p_dados->>'motor_livre'),'especialidade','retifica') else dados_veiculo end,tipo_servico=case when p_dados ? 'tipo_servico' then nullif(p_dados->>'tipo_servico','') else tipo_servico end,detalhes_especialidade=case when p_dados ? 'detalhes_especialidade' then coalesce(p_dados->>'detalhes_especialidade','') else detalhes_especialidade end,queixa_cliente=p_dados->>'queixa_cliente',codigos_falha=case when p_dados ? 'codigos_falha' then coalesce(p_dados->>'codigos_falha','') else codigos_falha end,diagnostico=p_dados->>'diagnostico',observacoes_internas=p_dados->>'observacoes_internas',resumo_cliente=p_dados->>'resumo_cliente',responsavel=p_dados->>'responsavel',prioridade=coalesce(p_dados->>'prioridade','normal'),quilometragem_entrada=nullif(p_dados->>'quilometragem_entrada','')::integer,quilometragem_saida=nullif(p_dados->>'quilometragem_saida','')::integer,combustivel_percentual=nullif(p_dados->>'combustivel_percentual','')::smallint,pertences=p_dados->>'pertences',entrega_prevista_em=nullif(p_dados->>'entrega_prevista_em','')::timestamptz,condicoes_garantia=p_dados->>'condicoes_garantia',garantia_ate=nullif(p_dados->>'garantia_ate','')::date,checklist=coalesce(p_dados->'checklist','{}') where id=w.id;
 perform private.evento_os(p_oficina,w.id,case when p_os is null then 'Ordem de serviço aberta.' else 'Dados do atendimento atualizados.' end,jsonb_build_object('antes',to_jsonb(w),'depois',p_dados));
 return public.consultar_ordem_servico(p_oficina,w.id);
end $function$
;
CREATE OR REPLACE FUNCTION public.revisar_orcamento(p_oficina uuid, p_orcamento uuid, p_revisao integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid; q public.orcamentos; v public.versoes_orcamento; nova uuid;
begin perform private.exigir_orcamento_ativo(p_oficina,p_orcamento);
 u:=private.exigir_orcamentos(p_oficina); select * into q from public.orcamentos where oficina_id=p_oficina and id=p_orcamento for update;
 if not found then raise exception 'Orçamento não encontrado.' using errcode='P0002'; end if;
 if q.revisao is distinct from p_revisao then raise exception 'O orçamento mudou. Atualize a tela.' using errcode='PT409'; end if;
 if q.situacao='draft' then return private.dados_orcamento(p_oficina,q.id); end if;
 if exists(select 1 from public.ordens_servico where oficina_id=p_oficina and orcamento_origem_id=q.id) then raise exception 'Este orçamento já originou uma OS. Crie um novo orçamento para serviços adicionais.' using errcode='22023'; end if;
 select * into v from public.versoes_orcamento where oficina_id=p_oficina and id=q.versao_atual_id;
 insert into public.versoes_orcamento(oficina_id,orcamento_id,numero_versao,dados_oficina,dados_cliente,dados_veiculo,observacoes,condicoes,subtotal_centavos,desconto_centavos,criado_por)
 values(p_oficina,q.id,v.numero_versao+1,v.dados_oficina,v.dados_cliente,v.dados_veiculo,v.observacoes,v.condicoes,v.subtotal_centavos,v.desconto_centavos,u) returning id into nova;
 insert into public.itens_orcamento(oficina_id,versao_orcamento_id,item_catalogo_id,posicao,tipo,descricao,unidade,quantidade,preco_unitario_centavos,grupo_servico,explicacao_cliente,prioridade_servico,depende_grupo,custo_unitario_previsto_centavos,minutos_previstos,custo_hora_centavos)
 select oficina_id,nova,item_catalogo_id,posicao,tipo,descricao,unidade,quantidade,preco_unitario_centavos,grupo_servico,explicacao_cliente,prioridade_servico,depende_grupo,custo_unitario_previsto_centavos,minutos_previstos,custo_hora_centavos from public.itens_orcamento where oficina_id=p_oficina and versao_orcamento_id=v.id;
 update public.tokens_acesso_orcamento set revogado_em=now() where oficina_id=p_oficina and versao_orcamento_id in(select id from public.versoes_orcamento where oficina_id=p_oficina and orcamento_id=q.id) and revogado_em is null;
 update public.orcamentos set situacao='draft',versao_atual_id=nova,revisao=revisao+1,atualizado_em=now() where id=q.id returning * into q;
 update public.versoes_orcamento set pecas_a_trocar=v.pecas_a_trocar,tipo_servico=v.tipo_servico,detalhes_especialidade=v.detalhes_especialidade,queixa_cliente=v.queixa_cliente,diagnostico=v.diagnostico,codigos_falha=v.codigos_falha,outros_custos_centavos=v.outros_custos_centavos where id=nova; perform private.evento_orcamento(p_oficina,q.id,q.revisao,'orcamento.revisado',u); return private.dados_orcamento(p_oficina,q.id);
end $function$
;
CREATE OR REPLACE FUNCTION public.salvar_orcamento(p_oficina uuid, p_dados jsonb, p_chave uuid, p_orcamento uuid DEFAULT NULL::uuid, p_revisao integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r jsonb; i jsonb; n integer:=0; repetido boolean;
begin perform private.exigir_orcamento_ativo(p_oficina,p_orcamento);
 perform private.exigir_orcamentos(p_oficina);
 select exists(select 1 from public.orcamentos where oficina_id=p_oficina and chave_criacao=p_chave) and p_orcamento is null into repetido;
 r:=private.salvar_orcamento_base(p_oficina,p_dados,p_chave,p_orcamento,p_revisao);
 if repetido then return r;end if;
 for i in select value from jsonb_array_elements(p_dados->'itens') loop
  update public.itens_orcamento set grupo_servico=coalesce(nullif(trim(i->>'grupo_servico'),''),'Atendimento'),
    explicacao_cliente=coalesce(trim(i->>'explicacao_cliente'),''),prioridade_servico=coalesce(i->>'prioridade_servico','recomendado'),
    depende_grupo=coalesce(trim(i->>'depende_grupo'),''),custo_unitario_previsto_centavos=nullif(i->>'custo_unitario_previsto_centavos','')::bigint,
    minutos_previstos=coalesce((i->>'minutos_previstos')::integer,0),custo_hora_centavos=coalesce((i->>'custo_hora_centavos')::bigint,0)
  where oficina_id=p_oficina and versao_orcamento_id=(r->>'versao_atual_id')::uuid and posicao=n;
  n:=n+1;
 end loop;
 if exists(select 1 from public.itens_orcamento i where i.oficina_id=p_oficina and i.versao_orcamento_id=(r->>'versao_atual_id')::uuid and i.depende_grupo<>'' and
   (i.depende_grupo=i.grupo_servico or not exists(select 1 from public.itens_orcamento j where j.oficina_id=i.oficina_id and j.versao_orcamento_id=i.versao_orcamento_id and j.grupo_servico=i.depende_grupo))) then
  raise exception 'A dependência precisa ser outro grupo deste orçamento.' using errcode='22023';end if;
 update public.versoes_orcamento set pecas_a_trocar=case when p_dados ? 'pecas_a_trocar' then coalesce(p_dados->>'pecas_a_trocar','') else pecas_a_trocar end,tipo_servico=case when p_dados ? 'tipo_servico' then nullif(p_dados->>'tipo_servico','') else tipo_servico end,detalhes_especialidade=case when p_dados ? 'detalhes_especialidade' then coalesce(p_dados->>'detalhes_especialidade','') else detalhes_especialidade end,queixa_cliente=case when p_dados ? 'queixa_cliente' then coalesce(p_dados->>'queixa_cliente','') else queixa_cliente end,diagnostico=case when p_dados ? 'diagnostico' then coalesce(p_dados->>'diagnostico','') else diagnostico end,codigos_falha=case when p_dados ? 'codigos_falha' then coalesce(p_dados->>'codigos_falha','') else codigos_falha end,outros_custos_centavos=coalesce((p_dados->>'outros_custos_centavos')::bigint,0) where oficina_id=p_oficina and id=(r->>'versao_atual_id')::uuid;
 return private.dados_orcamento(p_oficina,(r->>'id')::uuid);
end $function$
;
CREATE OR REPLACE FUNCTION private.importar_tecnico_orcamento_os()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.versoes_orcamento;begin
 if new.versao_orcamento_origem_id is null then return new;end if;
 if tg_op='UPDATE' and new.versao_orcamento_origem_id is not distinct from old.versao_orcamento_origem_id then return new;end if;
 select * into v from public.versoes_orcamento where oficina_id=new.oficina_id and id=new.versao_orcamento_origem_id;
 if not found then raise exception 'Versão de origem inválida.' using errcode='22023';end if;
 new.pecas_a_trocar:=coalesce(nullif(v.pecas_a_trocar,''),new.pecas_a_trocar);
 new.tipo_servico:=coalesce(v.tipo_servico,new.tipo_servico);
 new.detalhes_especialidade:=coalesce(nullif(v.detalhes_especialidade,''),new.detalhes_especialidade);
 new.queixa_cliente:=coalesce(nullif(v.queixa_cliente,''),new.queixa_cliente);
 new.diagnostico:=coalesce(nullif(v.diagnostico,''),new.diagnostico);
 new.codigos_falha:=coalesce(nullif(v.codigos_falha,''),new.codigos_falha);
 new.resumo_cliente:=coalesce(nullif(new.resumo_cliente,''),v.observacoes);
 return new;end $function$
;
CREATE OR REPLACE FUNCTION public.listar_orcamentos_gestao(p_oficina uuid, p_busca text DEFAULT ''::text, p_situacao text DEFAULT ''::text, p_pagina integer DEFAULT 0, p_excluidos boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare itens jsonb; total bigint;
begin
  perform private.exigir_orcamentos(p_oficina);
  if p_pagina is null or p_pagina<0 or p_excluidos is null or length(coalesce(p_busca,''))>200 or p_situacao not in ('','draft','awaiting_approval','approved','declined','expired','cancelled') then
    raise exception 'Filtro inválido.' using errcode='22023'; end if;
  with base as (
    select q.id,(select os.id from public.ordens_servico os where os.oficina_id=q.oficina_id and (os.orcamento_origem_id=q.id or os.orcamento_aguardando_id=q.id) limit 1) as ordem_servico_id,(select c.ordem_servico_id from public.complementos_ordem_servico c where c.oficina_id=q.oficina_id and c.orcamento_id=q.id limit 1) as adicional_os_id,q.numero,q.criado_em,q.revisao,q.arquivado_em,q.motivo_exclusao,
      private.orcamento_edicao_bloqueada(q.oficina_id,q.id) as edicao_bloqueada,
      v.total_centavos,v.numero_versao,v.expira_em,v.dados_cliente->>'nome' as cliente,v.dados_veiculo->>'modelo' as veiculo,case when v.dados_veiculo->>'especialidade'='retifica' then v.dados_veiculo->>'motor' else v.dados_veiculo->>'placa' end as placa,
      (select a.total_aprovado_centavos from public.aprovacoes_orcamento a where a.oficina_id=q.oficina_id and a.versao_orcamento_id=v.id and a.decisao='approved') as total_aprovado_centavos,
      case when q.situacao='awaiting_approval' and v.expira_em<=now() then 'expired' else q.situacao end as situacao
    from public.orcamentos q join public.versoes_orcamento v on v.oficina_id=q.oficina_id and v.id=q.versao_atual_id
    where q.oficina_id=p_oficina and (q.arquivado_em is not null)=p_excluidos
  ), filtrados as (select * from base where (coalesce(p_situacao,'')='' or situacao=p_situacao) and strpos(lower(concat_ws(' ',numero,cliente,veiculo,placa)),lower(trim(coalesce(p_busca,''))))>0),
  pagina as (select * from filtrados order by numero desc limit 24 offset p_pagina*24)
  select (select count(*) from filtrados),coalesce(jsonb_agg(to_jsonb(pagina) order by numero desc),'[]') into total,itens from pagina;
  return jsonb_build_object('itens',itens,'total',total);
end $function$
;
commit;
