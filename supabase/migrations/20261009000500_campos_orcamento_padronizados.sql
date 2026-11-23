begin;
alter table public.versoes_orcamento add column forma_pagamento text not null default 'Carteira' check(length(forma_pagamento)<=180), add column vencimento_pagamento date, add column responsavel text not null default '' check(length(responsavel)<=160), add column prioridade text not null default 'normal' check(prioridade in ('low','normal','high','urgent'));
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
 update public.versoes_orcamento set forma_pagamento=v.forma_pagamento,vencimento_pagamento=v.vencimento_pagamento,responsavel=v.responsavel,prioridade=v.prioridade,pecas_a_trocar=v.pecas_a_trocar,tipo_servico=v.tipo_servico,detalhes_especialidade=v.detalhes_especialidade,queixa_cliente=v.queixa_cliente,diagnostico=v.diagnostico,codigos_falha=v.codigos_falha,outros_custos_centavos=v.outros_custos_centavos where id=nova; perform private.evento_orcamento(p_oficina,q.id,q.revisao,'orcamento.revisado',u); return private.dados_orcamento(p_oficina,q.id);
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
 update public.versoes_orcamento set forma_pagamento=case when p_dados ? 'forma_pagamento' then coalesce(p_dados->>'forma_pagamento','Carteira') else forma_pagamento end,vencimento_pagamento=case when p_dados ? 'vencimento_pagamento' then nullif(p_dados->>'vencimento_pagamento','')::date else vencimento_pagamento end,responsavel=case when p_dados ? 'responsavel' then coalesce(p_dados->>'responsavel','') else responsavel end,prioridade=case when p_dados ? 'prioridade' then coalesce(p_dados->>'prioridade','normal') else prioridade end,pecas_a_trocar=case when p_dados ? 'pecas_a_trocar' then coalesce(p_dados->>'pecas_a_trocar','') else pecas_a_trocar end,tipo_servico=case when p_dados ? 'tipo_servico' then nullif(p_dados->>'tipo_servico','') else tipo_servico end,detalhes_especialidade=case when p_dados ? 'detalhes_especialidade' then coalesce(p_dados->>'detalhes_especialidade','') else detalhes_especialidade end,queixa_cliente=case when p_dados ? 'queixa_cliente' then coalesce(p_dados->>'queixa_cliente','') else queixa_cliente end,diagnostico=case when p_dados ? 'diagnostico' then coalesce(p_dados->>'diagnostico','') else diagnostico end,codigos_falha=case when p_dados ? 'codigos_falha' then coalesce(p_dados->>'codigos_falha','') else codigos_falha end,outros_custos_centavos=coalesce((p_dados->>'outros_custos_centavos')::bigint,0) where oficina_id=p_oficina and id=(r->>'versao_atual_id')::uuid;
 return private.dados_orcamento(p_oficina,(r->>'id')::uuid);
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
 return jsonb_build_object('numero',q.numero,'situacao',q.situacao,'versao',jsonb_build_object('numero_versao',v.numero_versao,'dados_oficina',jsonb_build_object('nome',v.dados_oficina->>'nome','telefone_e164',v.dados_oficina->>'telefone_e164','logo',v.dados_oficina->>'logo','cor',v.dados_oficina->>'cor','rodape',v.dados_oficina->>'rodape'),'dados_cliente',jsonb_build_object('nome',v.dados_cliente->>'nome'),'dados_veiculo',v.dados_veiculo,'subtotal_centavos',v.subtotal_centavos,'desconto_centavos',v.desconto_centavos,'total_centavos',v.total_centavos,'observacoes',v.observacoes,'condicoes',v.condicoes,'forma_pagamento',v.forma_pagamento,'vencimento_pagamento',v.vencimento_pagamento,'pecas_a_trocar',v.pecas_a_trocar,'tipo_servico',v.tipo_servico,'detalhes_especialidade',v.detalhes_especialidade,'queixa_cliente',v.queixa_cliente,'diagnostico',v.diagnostico,'codigos_falha',v.codigos_falha,'publicado_em',v.publicado_em,'expira_em',v.expira_em),
 'itens',(select jsonb_agg(jsonb_build_object('grupo_servico',grupo_servico,'explicacao_cliente',explicacao_cliente,'prioridade_servico',prioridade_servico,'depende_grupo',depende_grupo,'descricao',descricao,'tipo',tipo,'quantidade',quantidade,'unidade',unidade,'preco_unitario_centavos',preco_unitario_centavos,'total_item_centavos',total_item_centavos) order by posicao) from public.itens_orcamento where oficina_id=q.oficina_id and versao_orcamento_id=v.id),
 'aprovacao',(select jsonb_build_object('decisao',decisao,'nome_informado',nome_informado,'confirmado_em',confirmado_em,'grupos_aprovados',grupos_aprovados,'subtotal_aprovado_centavos',subtotal_aprovado_centavos,'desconto_aprovado_centavos',desconto_aprovado_centavos,'total_aprovado_centavos',total_aprovado_centavos) from public.aprovacoes_orcamento where oficina_id=q.oficina_id and versao_orcamento_id=v.id));
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
 new.forma_pagamento:=v.forma_pagamento;
 new.vencimento_pagamento:=coalesce(v.vencimento_pagamento,new.vencimento_pagamento);
 new.responsavel:=coalesce(nullif(v.responsavel,''),new.responsavel);
 new.prioridade:=v.prioridade;
 new.pecas_a_trocar:=coalesce(nullif(v.pecas_a_trocar,''),new.pecas_a_trocar);
 new.tipo_servico:=coalesce(v.tipo_servico,new.tipo_servico);
 new.detalhes_especialidade:=coalesce(nullif(v.detalhes_especialidade,''),new.detalhes_especialidade);
 new.queixa_cliente:=coalesce(nullif(v.queixa_cliente,''),new.queixa_cliente);
 new.diagnostico:=coalesce(nullif(v.diagnostico,''),new.diagnostico);
 new.codigos_falha:=coalesce(nullif(v.codigos_falha,''),new.codigos_falha);
 new.resumo_cliente:=coalesce(nullif(new.resumo_cliente,''),v.observacoes);
 return new;end $function$
;
commit;
