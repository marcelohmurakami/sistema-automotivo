-- Read-only history: keep payloads off the paginated list, resolve one event on demand.
create function private.historico_campos_seguros(dados jsonb, profundidade integer default 0)
returns jsonb language plpgsql immutable set search_path='' as $$
declare saida jsonb:='{}'; k text; v jsonb;
begin
 if profundidade>5 or dados is null then return 'null'::jsonb; end if;
 if jsonb_typeof(dados)='array' then
  return (select coalesce(jsonb_agg(private.historico_campos_seguros(x,profundidade+1)),'[]') from jsonb_array_elements(dados) x);
 elsif jsonb_typeof(dados)<>'object' then return dados; end if;
 -- Explicit allowlist: no credentials, access links, device PINs, internal IDs or file paths.
 for k,v in select key,value from jsonb_each(dados) loop
  if k=any(array['antes','depois','acao','motivo','reason','situacao','situacao_anterior','tipo','descricao','nome','titulo','quantidade','unidade',
   'preco_unitario_centavos','preco_padrao_centavos','custo_centavos','valor_centavos','subtotal_centavos','desconto_centavos','total_centavos',
   'desconto_anterior','desconto_atual','saldo_anterior_centavos','total_autorizado_centavos','saldo_apos','forma_pagamento','vencimento','data_servico',
   'old_status','new_status','old_promised_at','new_promised_at','etapa_anterior','etapa_atual','local_anterior','local_atual',
   'iniciado_em','finalizado_em','recebido_em','concluido_em','entregue_em','entrega_prevista_em','responsavel','prioridade','item','itens','produto',
   'decisao','origem','revisao','revisao_anterior','entrada_sem_data','pecas_sem_origem','resultado','tipo_servico','minutos_previstos','percentual',
   'observacoes','observacoes_internas','anotacoes','diagnostico','queixa_cliente','resumo_cliente','ativo','visivel_ao_cliente']) then
   saida:=saida||jsonb_build_object(k,private.historico_campos_seguros(v,profundidade+1));
  end if;
 end loop;
 return saida;
end $$;
revoke all on function private.historico_campos_seguros(jsonb,integer) from public,anon,authenticated;

create function private.historico_modulo_permitido(w uuid,tipo text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.membros_oficina where oficina_id=w and usuario_id=auth.uid() and ativo and perfil='owner')
 or coalesce((select regras->>(case
  when tipo in ('ordem_servico','atendimento','atendimento_servico') then 'atendimentos'
  when tipo in ('cliente','veiculo','objeto') then 'clientes'
  when tipo in ('orcamento','proposta') then 'orcamentos'
  when tipo ~ '(financeir|pagamento|comiss|contrato)' then 'financeiro'
  when tipo ~ '(estoque|produto|compra|fornecedor)' then 'estoque'
  when tipo ~ '(funcionario|equipe)' then 'equipe'
  else 'administracao' end)
 from public.restricoes_acesso where oficina_id=w and usuario_id=auth.uid()),'completo')<>'nenhum'
$$;
revoke all on function private.historico_modulo_permitido(uuid,text) from public,anon,authenticated;

create function private.eventos_historico_gestao(w uuid, inicio timestamptz, fim timestamptz)
returns table(id text,data timestamptz,origem text,tipo text,descricao text,autor uuid,entidade uuid,numero text)
language sql stable set search_path='' as $$
 select a.id::text,a.criado_em,'auditoria',a.tipo_entidade,case a.acao when 'saved' then 'Lançamento financeiro salvo' when 'paid' then 'Pagamento registrado' when 'reversed' then 'Pagamento estornado' when 'cancelled' then 'Lançamento cancelado' when 'costs_reviewed' then 'Custos conferidos' when 'os_generated' then 'Receita de OS gerada' when 'transfer_reversed' then 'Transferência estornada' when 'configuracoes_atualizadas' then 'Configurações da oficina atualizadas' when 'salvar_produto' then 'Produto de estoque atualizado' when 'cliente.cadastrado' then 'Cliente cadastrado' when 'cliente.editado' then 'Cliente atualizado' when 'cliente.arquivado' then 'Cliente arquivado' when 'cliente.restaurado' then 'Cliente restaurado' when 'orcamento.criado' then 'Orçamento criado' when 'orcamento.editado' then 'Orçamento atualizado' when 'orcamento.emitido' then 'Orçamento emitido' when 'orcamento.revisado' then 'Nova versão de orçamento' when 'orcamento.cancelado' then 'Orçamento cancelado' when 'orcamento.approved' then 'Orçamento aprovado' when 'orcamento.declined' then 'Orçamento recusado' else replace(a.acao,'_',' ') end,a.usuario_autor_id,a.entidade_id,null::text
 from public.registros_auditoria a where a.oficina_id=w and a.criado_em>=inicio and a.criado_em<fim
 union all
 select h.id::text,h.ocorrido_em,'os','ordem_servico',h.descricao,h.usuario_autor_id,h.ordem_servico_id,o.numero::text
 from public.historico_ordem_servico h join public.ordens_servico o on o.id=h.ordem_servico_id and o.oficina_id=w
 where h.oficina_id=w and h.ocorrido_em>=inicio and h.ocorrido_em<fim
 union all
 select m.id::text,m.criado_em,'estoque','estoque',m.tipo||': '||c.descricao||' · '||m.motivo,m.criado_por,m.item_catalogo_id,null::text
 from public.movimentacoes_estoque m join public.itens_catalogo c on c.id=m.item_catalogo_id and c.oficina_id=w
 where m.oficina_id=w and m.criado_em>=inicio and m.criado_em<fim
 union all
 select e.id::text,e.criado_em,'atendimento','ordem_servico',
  case e.tipo when 'situacao' then case when e.antes is null then 'Atendimento criado' else 'Situação do atendimento alterada' end
   when 'etapa' then 'Etapa alterada' when 'itens' then 'Itens do atendimento atualizados'
   when 'reabertura' then 'Atendimento reaberto' when 'foto' then 'Fotos do atendimento'
   when 'resposta_orcamento' then 'Resposta do orçamento' when 'link_orcamento' then 'Link de aprovação'
   when 'aceite' then 'Aceite do atendimento' when 'diagnostico' then 'Diagnóstico atualizado'
   when 'execucao_offline' then 'Execução sincronizada' when 'qualidade' then 'Registro de qualidade'
   else replace(e.tipo,'_',' ') end,e.autor,e.atendimento_id,a.numero::text
 from public.eventos_atendimento e join public.atendimentos_servicos a on a.id=e.atendimento_id and a.oficina_id=w
 where e.oficina_id=w and e.criado_em>=inicio and e.criado_em<fim
$$;
revoke all on function private.eventos_historico_gestao(uuid,timestamptz,timestamptz) from public,anon,authenticated;

create or replace function public.consultar_historico_gestao(p_oficina uuid,p_inicio date,p_fim date,p_tipo text default '',p_busca text default '',p_pagina integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare itens jsonb; total bigint;
begin
 perform private.conferir_operacao(p_oficina,'consultar_historico_gestao');
 perform private.conferir_operacao(p_oficina,'consultar_relatorio_historico');
 perform private.exigir_gestao(p_oficina,'reports');
 if p_inicio is null or p_fim is null or p_inicio>p_fim or p_fim-p_inicio>366 then raise exception 'Escolha um período de até 367 dias.' using errcode='22023';end if;
 with filtrados as materialized (
  select * from private.eventos_historico_gestao(p_oficina,p_inicio::timestamp at time zone 'America/Sao_Paulo',(p_fim+1)::timestamp at time zone 'America/Sao_Paulo') e
  where (coalesce(p_tipo,'')='' or e.tipo=p_tipo) and private.historico_modulo_permitido(p_oficina,e.tipo)
   and translate(lower(concat(e.descricao,' ',e.numero)),'áàâãéêíóôõúüç','aaaaeeiooouuc') like '%'||translate(lower(left(coalesce(p_busca,''),120)),'áàâãéêíóôõúüç','aaaaeeiooouuc')||'%'
 ), pagina as (select * from filtrados order by data desc,origem,id limit 30 offset greatest(coalesce(p_pagina,0),0)::bigint*30)
 select (select count(*) from filtrados),(select coalesce(jsonb_agg(to_jsonb(x) order by x.data desc,x.origem,x.id),'[]') from (
  select p.*,coalesce(nullif(to_jsonb(u)->'raw_user_meta_data'->>'nome',''),nullif(to_jsonb(u)->'raw_user_meta_data'->>'full_name',''),nullif(to_jsonb(u)->>'email',''),case when p.autor is null then 'Sistema ou cliente' else 'Membro da equipe' end) autor_nome
  from pagina p left join auth.users u on u.id=p.autor
 )x) into total,itens;
 return jsonb_build_object('itens',itens,'total',total);
end $$;

create function public.consultar_evento_historico(p_oficina uuid,p_origem text,p_id text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare evento jsonb; dados jsonb:='{}'; contexto jsonb:='{}'; entidade uuid; autor uuid; tipo text;
begin
 perform private.conferir_operacao(p_oficina,'consultar_historico_gestao');
 perform private.conferir_operacao(p_oficina,'consultar_relatorio_historico');
 perform private.exigir_gestao(p_oficina,'reports');
 if p_origem='os' then
  select jsonb_build_object('id',h.id,'data',h.ocorrido_em,'origem','os','tipo','ordem_servico','descricao',h.descricao,'entidade',h.ordem_servico_id,'numero',o.numero,'tipo_autor',h.tipo_autor),
   h.metadados||jsonb_build_object('visivel_ao_cliente',h.visivel_ao_cliente),h.usuario_autor_id,h.ordem_servico_id,'ordem_servico'
  into evento,dados,autor,entidade,tipo from public.historico_ordem_servico h join public.ordens_servico o on o.id=h.ordem_servico_id and o.oficina_id=p_oficina where h.oficina_id=p_oficina and h.id=p_id::uuid;
 elsif p_origem='auditoria' then
  select jsonb_build_object('id',a.id,'data',a.criado_em,'origem','auditoria','tipo',a.tipo_entidade,'descricao',a.acao,'entidade',a.entidade_id,'tipo_autor',a.tipo_autor),a.metadados,a.usuario_autor_id,a.entidade_id,a.tipo_entidade
  into evento,dados,autor,entidade,tipo from public.registros_auditoria a where a.oficina_id=p_oficina and a.id=p_id::uuid;
 elsif p_origem='estoque' then
  select jsonb_build_object('id',m.id,'data',m.criado_em,'origem','estoque','tipo','estoque','descricao',m.tipo||': '||c.descricao,'entidade',m.item_catalogo_id),
   jsonb_build_object('tipo',m.tipo,'quantidade',m.quantidade,'saldo_apos',m.saldo_apos,'custo_centavos',m.custo_centavos,'motivo',m.motivo),m.criado_por,m.item_catalogo_id,'estoque'
  into evento,dados,autor,entidade,tipo from public.movimentacoes_estoque m join public.itens_catalogo c on c.id=m.item_catalogo_id and c.oficina_id=p_oficina where m.oficina_id=p_oficina and m.id=p_id::uuid;
 elsif p_origem='atendimento' then
  select jsonb_build_object('id',e.id::text,'data',e.criado_em,'origem','atendimento','tipo','ordem_servico','descricao',replace(e.tipo,'_',' '),'entidade',e.atendimento_id,'numero',a.numero),
   jsonb_build_object('antes',case when e.tipo='situacao' then jsonb_build_object('situacao',e.antes) when e.tipo='etapa' then jsonb_build_object('etapa_atual',e.antes) else jsonb_build_object('descricao',e.antes) end,
    'depois',case when e.tipo='situacao' then jsonb_build_object('situacao',e.depois) when e.tipo='etapa' then jsonb_build_object('etapa_atual',e.depois) else jsonb_build_object('descricao',e.depois) end),e.autor,e.atendimento_id,'ordem_servico'
  into evento,dados,autor,entidade,tipo from public.eventos_atendimento e join public.atendimentos_servicos a on a.id=e.atendimento_id and a.oficina_id=p_oficina where e.oficina_id=p_oficina and e.id=p_id::bigint;
 end if;
 if evento is null or not private.historico_modulo_permitido(p_oficina,tipo) then raise exception 'Ocorrência não encontrada ou acesso indisponível.' using errcode='42501';end if;
 if p_origem='os' or tipo='ordem_servico' and p_origem='auditoria' then
  select jsonb_build_object('cliente',coalesce(c.nome,o.dados_cliente->>'nome'),'identificacao',concat_ws(' · ',o.dados_veiculo->>'marca',o.dados_veiculo->>'modelo'),'numero',o.numero)
  into contexto from public.ordens_servico o left join public.clientes c on c.id=o.cliente_id and c.oficina_id=p_oficina where o.id=entidade and o.oficina_id=p_oficina;
 elsif p_origem='atendimento' then
  select jsonb_build_object('cliente',c.nome,'identificacao',a.titulo,'numero',a.numero) into contexto from public.atendimentos_servicos a left join public.clientes c on c.id=a.cliente_id and c.oficina_id=p_oficina where a.id=entidade and a.oficina_id=p_oficina;
 elsif tipo='cliente' then
  select jsonb_build_object('cliente',nome) into contexto from public.clientes where id=entidade and oficina_id=p_oficina;
 elsif p_origem='estoque' then
  select jsonb_build_object('identificacao',descricao) into contexto from public.itens_catalogo where id=entidade and oficina_id=p_oficina;
 end if;
 -- Resolve recorded stage IDs into labels; no raw identifier is shown to the user.
 if dados ? 'old_stage_id' then dados:=dados||jsonb_build_object('etapa_anterior',(select nome from public.etapas_producao where id=nullif(dados->>'old_stage_id','')::uuid and oficina_id=p_oficina));end if;
 if dados ? 'new_stage_id' then dados:=dados||jsonb_build_object('etapa_atual',(select nome from public.etapas_producao where id=nullif(dados->>'new_stage_id','')::uuid and oficina_id=p_oficina));end if;
 return evento||jsonb_build_object('autor_nome',coalesce((select coalesce(nullif(to_jsonb(u)->'raw_user_meta_data'->>'nome',''),nullif(to_jsonb(u)->'raw_user_meta_data'->>'full_name',''),nullif(to_jsonb(u)->>'email','')) from auth.users u where u.id=autor),case when autor is not null then 'Membro da equipe' when evento->>'tipo_autor'='customer' then 'Cliente' else 'Sistema ou cliente' end),
  'detalhes',private.historico_campos_seguros(coalesce(dados,'{}')),'contexto_atual',coalesce(contexto,'{}'));
end $$;
revoke all on function public.consultar_evento_historico(uuid,text,text) from public,anon;
grant execute on function public.consultar_evento_historico(uuid,text,text) to authenticated;
revoke all on function public.consultar_historico_gestao(uuid,date,date,text,text,integer) from public,anon;
grant execute on function public.consultar_historico_gestao(uuid,date,date,text,text,integer) to authenticated;
notify pgrst,'reload schema';
