-- Current linked financial record, explicitly separate from historical evidence. Read-only.
create or replace function public.consultar_evento_historico(p_oficina uuid,p_origem text,p_id text)
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
 elsif tipo='financeiro' then
  perform private.exigir_financeiro(p_oficina);
  select jsonb_build_object('identificacao',t.descricao,'campos',jsonb_build_object(
   'natureza',t.natureza,'pessoa',t.pessoa,'categoria',t.categoria,'valor_centavos',t.valor_centavos,
   'vencimento',t.vencimento,'competencia',t.competencia,'forma_prevista',t.forma_prevista,
   'motivo_cancelamento',nullif(t.motivo_cancelamento,'')))
  into contexto from public.titulos_financeiros t where t.id=entidade and t.oficina_id=p_oficina;
 elsif p_origem='estoque' then
  select jsonb_build_object('identificacao',descricao) into contexto from public.itens_catalogo where id=entidade and oficina_id=p_oficina;
 end if;
 -- Resolve recorded stage IDs into labels; no raw identifier is shown to the user.
 if dados ? 'old_stage_id' then dados:=dados||jsonb_build_object('etapa_anterior',(select nome from public.etapas_producao where id=nullif(dados->>'old_stage_id','')::uuid and oficina_id=p_oficina));end if;
 if dados ? 'new_stage_id' then dados:=dados||jsonb_build_object('etapa_atual',(select nome from public.etapas_producao where id=nullif(dados->>'new_stage_id','')::uuid and oficina_id=p_oficina));end if;
 return evento||jsonb_build_object('autor_nome',coalesce((select coalesce(nullif(to_jsonb(u)->'raw_user_meta_data'->>'nome',''),nullif(to_jsonb(u)->'raw_user_meta_data'->>'full_name',''),nullif(to_jsonb(u)->>'email','')) from auth.users u where u.id=autor),case when autor is not null then 'Membro da equipe' when evento->>'tipo_autor'='customer' then 'Cliente' else 'Sistema ou cliente' end),
  'detalhes',private.historico_campos_seguros(coalesce(dados,'{}')),'contexto_atual',coalesce(contexto,'{}'));
end $$;
notify pgrst,'reload schema';
