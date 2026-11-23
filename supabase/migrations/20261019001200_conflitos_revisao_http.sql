-- Conflitos de revisão são permanentes até o usuário atualizar a tela.
-- 40001 é reservado a falhas de serialização e pode causar repetição infinita
-- no PostgREST. PT409 preserva a mensagem e retorna HTTP 409 imediatamente.
-- Não muda dados, assinaturas, permissões nem os testes de revisão.
begin;
CREATE OR REPLACE FUNCTION public.aprovar_meu_atendimento(p_oficina uuid, p_atendimento uuid, p_revisao integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.atendimentos_servicos;
begin
 select * into a from public.atendimentos_servicos where oficina_id=p_oficina and id=p_atendimento for update;
 if not found or not a.compartilhado_cliente or not private.has_portal_access(p_oficina,a.cliente_id) then raise exception 'Orçamento indisponível.' using errcode='42501';end if;
 if a.situacao='aprovado' and exists(select 1 from public.eventos_atendimento where atendimento_id=a.id and tipo='aprovacao_cliente' and autor=auth.uid() and depois=p_revisao::text) then return;end if;
 if a.revisao is distinct from p_revisao then raise exception 'O orçamento mudou. Confira os valores atualizados antes de aprovar.' using errcode='PT409';end if;
 if a.situacao<>'orcamento' then raise exception 'Este atendimento não aguarda aprovação.' using errcode='22023';end if;
 update public.atendimentos_servicos set situacao='aprovado',revisao=revisao+1 where id=a.id;
 insert into public.comercial_atendimento(oficina_id,atendimento_id,orcado_centavos) values(p_oficina,a.id,a.valor_centavos) on conflict(atendimento_id) do update set orcado_centavos=coalesce(comercial_atendimento.orcado_centavos,excluded.orcado_centavos);
 insert into public.eventos_atendimento(oficina_id,atendimento_id,tipo,depois,autor) values(p_oficina,a.id,'aprovacao_cliente',p_revisao::text,auth.uid());
end $function$;
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
 if q.revisao is distinct from p_revisao or q.versao_atual_id is distinct from p_versao then raise exception 'Orçamento alterado. Atualize a lista antes de aprovar.' using errcode='PT409'; end if;
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
end $function$;
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
    raise exception 'A OS ou o orçamento mudou. Atualize a tela e confira os valores antes de autorizar.' using errcode='PT409'; end if;
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
end $function$;
CREATE OR REPLACE FUNCTION public.compartilhar_atendimento_cliente(p_oficina uuid, p_atendimento uuid, p_revisao integer, p_compartilhar boolean, p_resumo text DEFAULT ''::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.atendimentos_servicos;slug text;
begin
 perform private.gerencia_servicos(p_oficina);
 if not private.has_feature(p_oficina,'customer_portal') then raise exception 'Área do cliente indisponível no plano.' using errcode='42501';end if;
 if p_compartilhar is null or length(coalesce(p_resumo,''))>3000 then raise exception 'Confira o resumo compartilhado.' using errcode='22023';end if;
 select identificador_url into slug from public.sites_oficina where oficina_id=p_oficina and publicado and portal_habilitado;
 if p_compartilhar and slug is null then raise exception 'Publique o site e habilite a área do cliente antes de compartilhar.' using errcode='22023';end if;
 select * into a from public.atendimentos_servicos where oficina_id=p_oficina and id=p_atendimento for update;
 if not found then raise exception 'Atendimento indisponível.' using errcode='42501';end if;
 if a.revisao<>p_revisao then raise exception 'Atendimento alterado. Atualize antes de compartilhar.' using errcode='PT409';end if;
 update public.atendimentos_servicos set compartilhado_cliente=p_compartilhar,resumo_cliente=trim(coalesce(p_resumo,'')),revisao=revisao+1 where id=a.id;
 insert into public.eventos_atendimento(oficina_id,atendimento_id,tipo,depois,autor) values(p_oficina,a.id,'compartilhamento',case when p_compartilhar then 'Disponível na área do cliente' else 'Compartilhamento removido' end,auth.uid());
 return '/oficina/'||slug||'#area-cliente';
end $function$;
CREATE OR REPLACE FUNCTION public.confirmar_valor_recorrente(p_oficina uuid, p_titulo uuid, p_revisao integer, p_valor bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare t public.titulos_financeiros;
begin
 perform private.exigir_financeiro(p_oficina);
 select * into t from public.titulos_financeiros where oficina_id=p_oficina and id=p_titulo for update;
 if t.id is null or not t.valor_variavel or t.recorrencia_id is null or t.cancelado_em is not null then raise exception 'Conta variável indisponível.';end if;
 if p_revisao is null or t.revisao<>p_revisao then raise exception 'Conta alterada. Atualize a tela.' using errcode='PT409';end if;
 if p_valor is null or p_valor not between 1 and 10000000000 then raise exception 'Informe o valor deste mês.';end if;
 if exists(select 1 from public.baixas_financeiras where oficina_id=p_oficina and titulo_id=p_titulo) then raise exception 'Esta conta já tem pagamentos. Confira o histórico antes de alterar.';end if;
 update public.titulos_financeiros set valor_centavos=p_valor,valor_confirmado_em=now(),revisao=revisao+1 where id=p_titulo and oficina_id=p_oficina;
 return public.consultar_titulo_alerta(p_oficina,p_titulo);
end $function$;
CREATE OR REPLACE FUNCTION public.editar_orcamento(p_oficina uuid, p_dados jsonb, p_chave uuid, p_orcamento uuid, p_revisao integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare q public.orcamentos; r jsonb; os public.ordens_servico;
begin
  perform private.exigir_orcamentos(p_oficina);
  select * into q from public.orcamentos where oficina_id=p_oficina and id=p_orcamento for update;
  if not found then raise exception 'Orçamento não encontrado.' using errcode='P0002'; end if;
  if q.arquivado_em is not null then raise exception 'Restaure o orçamento antes de editar.' using errcode='22023'; end if;
  if q.revisao is distinct from p_revisao then raise exception 'O orçamento mudou. Feche e abra a edição novamente.' using errcode='PT409'; end if;
  if private.orcamento_edicao_bloqueada(p_oficina,q.id) then raise exception 'Este orçamento já autorizou uma OS. Crie um orçamento adicional na OS.' using errcode='22023'; end if;
  if q.situacao<>'draft' then
    r:=public.revisar_orcamento(p_oficina,q.id,q.revisao);
    q.revisao:=(r->>'revisao')::integer;
  end if;
  r:=public.salvar_orcamento(p_oficina,p_dados,p_chave,q.id,q.revisao);
  -- A OS de entrada continua parada, mas acompanha correções do cliente/veículo.
  select * into os from public.ordens_servico where oficina_id=p_oficina and orcamento_aguardando_id=q.id and situacao<>'cancelled' for update;
  if found then
    update public.ordens_servico set cliente_id=(r->>'cliente_id')::uuid,veiculo_id=(r->>'veiculo_id')::uuid,
      dados_cliente=r->'versao'->'dados_cliente',dados_veiculo=r->'versao'->'dados_veiculo',revisao=revisao+1,atualizado_em=now()
      where oficina_id=p_oficina and id=os.id;
    perform private.evento_os(p_oficina,os.id,'Orçamento atualizado. OS continua aguardando aprovação.',jsonb_build_object('orcamento_id',q.id));
  end if;
  return r;
end $function$;
CREATE OR REPLACE FUNCTION public.excluir_orcamento(p_oficina uuid, p_orcamento uuid, p_revisao integer, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid; q public.orcamentos; numero_os bigint; motivo text:=btrim(coalesce(p_motivo,'')); corr uuid:=gen_random_uuid();
begin
  u:=private.exigir_orcamentos(p_oficina);
  if length(motivo) not between 3 and 1000 then raise exception 'Informe o motivo da exclusão, entre 3 e 1.000 caracteres.' using errcode='22023'; end if;
  select * into q from public.orcamentos where oficina_id=p_oficina and id=p_orcamento for update;
  if not found then raise exception 'Orçamento não encontrado.' using errcode='P0002'; end if;
  if q.arquivado_em is not null then return; end if;
  if q.revisao is distinct from p_revisao then raise exception 'O orçamento mudou. Atualize a lista antes de excluir.' using errcode='PT409'; end if;
  select numero into numero_os from public.ordens_servico where oficina_id=p_oficina and orcamento_aguardando_id=q.id and situacao<>'cancelled' for update;
  if found then raise exception 'A OS #% aguarda este orçamento. Cancele essa OS antes de excluir o orçamento.',numero_os using errcode='22023'; end if;
  update public.tokens_acesso_orcamento set revogado_em=now() where oficina_id=p_oficina and revogado_em is null and versao_orcamento_id in(select id from public.versoes_orcamento where oficina_id=p_oficina and orcamento_id=q.id);
  update public.avisos_automaticos set situacao='cancelado' where oficina_id=p_oficina and situacao in ('revisao','aprovado') and versao_orcamento_id in(select id from public.versoes_orcamento where oficina_id=p_oficina and orcamento_id=q.id);
  update public.orcamentos set arquivado_em=now(),motivo_exclusao=motivo,excluido_por=u,revisao=revisao+1,atualizado_em=now() where id=q.id returning * into q;
  insert into public.eventos_negocio(oficina_id,tipo_evento,tipo_agregado,agregado_id,versao_agregado,correlacao_id,chave_deduplicacao,dados)
    values(p_oficina,'orcamento.excluido','orcamento',q.id,q.revisao,corr,'orcamento:'||q.id||':'||q.revisao||':orcamento.excluido',jsonb_build_object('orcamento_id',q.id,'motivo',motivo));
  insert into public.registros_auditoria(oficina_id,usuario_autor_id,tipo_autor,acao,tipo_entidade,entidade_id,correlacao_id,metadados)
    values(p_oficina,u,'user','orcamento.excluido','orcamento',q.id,corr,jsonb_build_object('motivo',motivo));
end $function$;
CREATE OR REPLACE FUNCTION public.excluir_ordem_servico(p_oficina uuid, p_os uuid, p_revisao integer, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid; w public.ordens_servico; motivo text:=btrim(coalesce(p_motivo,''));
begin
  u:=private.exigir_os(p_oficina);
  if length(motivo) not between 3 and 1000 then
    raise exception 'Informe o motivo da exclusão, entre 3 e 1.000 caracteres.' using errcode='22023';
  end if;
  -- Mesma ordem de bloqueio usada nos pagamentos e nas mudanças do mapa.
  perform pg_advisory_xact_lock(hashtextextended('financeiro-os:'||p_oficina||':'||p_os,0));
  select * into w from public.ordens_servico where oficina_id=p_oficina and id=p_os for update;
  if not found then raise exception 'OS não encontrada.' using errcode='P0002'; end if;
  if w.arquivado_em is not null then return; end if;
  if w.revisao is distinct from p_revisao then
    raise exception 'A OS foi alterada. Atualize a lista antes de excluir.' using errcode='PT409';
  end if;
  -- O cancelamento existente encerra os cronômetros, atualiza comissões e títulos
  -- provisórios, e impede excluir um atendimento ativo com valores recebidos.
  if w.situacao not in ('delivered','cancelled') then
    perform public.atualizar_mapa_ordem_servico(p_oficina,w.id,w.revisao,'cancelled',w.etapa_id,w.local_id,w.entrega_prevista_em,w.recebido_em,motivo);
  end if;
  update public.ordens_servico set arquivado_em=now(),motivo_exclusao=motivo,excluido_por=u,atualizado_em=now() where id=w.id;
  update public.avisos_automaticos set situacao='cancelado' where oficina_id=p_oficina and ordem_servico_id=w.id and situacao in ('revisao','aprovado');
  perform private.evento_os(p_oficina,w.id,'OS excluída da listagem. Motivo: '||motivo,jsonb_build_object('acao','exclusao','motivo',motivo,'situacao_anterior',w.situacao));
  insert into public.registros_auditoria(oficina_id,usuario_autor_id,tipo_autor,acao,tipo_entidade,entidade_id,correlacao_id,metadados)
    values(p_oficina,u,'user','os.excluida','ordem_servico',w.id,gen_random_uuid(),jsonb_build_object('motivo',motivo,'situacao_anterior',w.situacao));
end $function$;
CREATE OR REPLACE FUNCTION public.gerar_comissao_atendimento(p_oficina uuid, p_equipe uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare e public.equipe_atendimento; a public.atendimentos_servicos; t uuid;
begin
 perform private.gerencia_servicos(p_oficina);perform private.exigir_financeiro(p_oficina);
 if not private.has_feature(p_oficina,'employee_reports') then raise exception 'Recurso indisponível no plano.' using errcode='42501';end if;
 select * into e from public.equipe_atendimento where oficina_id=p_oficina and id=p_equipe;
 if not found then raise exception 'Comissão indisponível.' using errcode='42501';end if;
 select * into a from public.atendimentos_servicos where id=e.atendimento_id for update;
 select * into e from public.equipe_atendimento where oficina_id=p_oficina and id=p_equipe for update;
 if not found then raise exception 'Equipe alterada. Atualize o atendimento.' using errcode='PT409';end if;
 if a.situacao<>'concluido' or e.comissao_centavos<=0 then raise exception 'Conclua o atendimento com comissão positiva.' using errcode='22023';end if;
 if e.titulo_id is not null and exists(select 1 from public.titulos_financeiros where id=e.titulo_id and cancelado_em is null) then return e.titulo_id;end if;
 t:=gen_random_uuid();
 insert into public.titulos_financeiros(id,oficina_id,natureza,descricao,categoria,valor_centavos,competencia,vencimento,pessoa,criado_por)
 values(t,p_oficina,'pagar','Comissão atendimento #'||a.numero,'pessoal',e.comissao_centavos,(a.concluido_em at time zone 'America/Sao_Paulo')::date,(now() at time zone 'America/Sao_Paulo')::date,(select nome from public.funcionarios where id=e.funcionario_id),auth.uid());
 update public.equipe_atendimento set titulo_id=t where id=e.id;return t;
end $function$;
CREATE OR REPLACE FUNCTION public.mover_ordem_no_mapa(p_oficina uuid, p_os uuid, p_revisao integer, p_direcao text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o public.ordens_servico%rowtype; destino text; revisao_nova integer;
begin
  perform private.require_staff(p_oficina);
  if not private.has_feature(p_oficina,'production_board') then
    raise exception 'Recurso indisponível' using errcode='42501';
  end if;
  if p_direcao is null or p_direcao not in ('voltar','avancar') then
    raise exception 'Direção inválida.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('financeiro-os:'||p_oficina||':'||p_os,0));
  select * into o from public.ordens_servico where oficina_id=p_oficina and id=p_os for update;
  if not found then raise exception 'OS não encontrada.' using errcode='P0002'; end if;
  if p_revisao is null or o.revisao<>p_revisao then
    raise exception 'Esta OS foi alterada. Confira o mapa atualizado e tente novamente.' using errcode='PT409';
  end if;
  if o.situacao in ('delivered','cancelled') then
    raise exception 'OS encerrada: histórico preservado.' using errcode='23514';
  end if;
  if exists(select 1 from public.paradas_ordem_servico where oficina_id=p_oficina and ordem_servico_id=p_os and encerrado_em is null) then
    raise exception 'Resolva a parada na OS antes de mudar a etapa.' using errcode='23514';
  end if;
  destino := case when p_direcao='avancar' then
    case o.situacao when 'open' then 'in_progress' when 'in_progress' then 'quality_check' when 'quality_check' then 'ready' when 'ready' then 'delivered' end
  else
    case o.situacao when 'in_progress' then 'open' when 'quality_check' then 'in_progress' when 'ready' then 'quality_check' end
  end;
  if destino is null then raise exception 'Não há outra etapa nesta direção.' using errcode='23514'; end if;
  revisao_nova := public.atualizar_mapa_ordem_servico(p_oficina,p_os,p_revisao,destino,o.etapa_id,o.local_id,o.entrega_prevista_em,o.recebido_em,null);
  return jsonb_build_object('situacao',destino,'revisao',revisao_nova,'recebido_em',o.recebido_em);
end $function$;
CREATE OR REPLACE FUNCTION public.operar_mapa_rapido(p_oficina uuid, p_os uuid, p_revisao integer, p_acao text, p_motivo text DEFAULT NULL::text, p_detalhes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  o public.ordens_servico%rowtype;
  parada record;
  alterados jsonb;
  detalhe text;
begin
  perform private.require_staff(p_oficina);
  if not private.has_feature(p_oficina,'production_board') then
    raise exception 'Recurso indisponível' using errcode='42501';
  end if;
  if p_acao is null or p_acao not in ('concluir','parar','retomar') then
    raise exception 'Ação inválida.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('financeiro-os:'||p_oficina||':'||p_os,0));
  select * into o from public.ordens_servico where oficina_id=p_oficina and id=p_os for update;
  if not found then raise exception 'OS não encontrada.' using errcode='P0002'; end if;
  if p_revisao is null or o.revisao<>p_revisao then
    raise exception 'Esta OS foi alterada. Confira o mapa atualizado e tente novamente.' using errcode='PT409';
  end if;
  if o.situacao in ('delivered','cancelled') then
    raise exception 'OS encerrada: histórico preservado.' using errcode='23514';
  end if;

  if p_acao='concluir' then
    if o.situacao<>'quality_check' then
      raise exception 'Leve o serviço à conferência antes de concluir.' using errcode='23514';
    end if;
    if exists(select 1 from public.paradas_ordem_servico where oficina_id=p_oficina and ordem_servico_id=p_os and encerrado_em is null) then
      raise exception 'Retome o serviço e resolva as paradas antes de concluir.' using errcode='23514';
    end if;
    with itens as (
      update public.itens_ordem_servico set situacao='done',concluido_em=now()
      where oficina_id=p_oficina and ordem_servico_id=p_os and situacao not in ('done','cancelled')
      returning id
    ) select coalesce(jsonb_agg(id),'[]'::jsonb) into alterados from itens;
    if jsonb_array_length(alterados)>0 then
      perform private.evento_os(p_oficina,p_os,'Itens concluídos pelo mapa da oficina.',jsonb_build_object('acao','concluir_no_mapa','itens',alterados));
      select revisao into o.revisao from public.ordens_servico where oficina_id=p_oficina and id=p_os;
    end if;
    perform public.atualizar_mapa_ordem_servico(p_oficina,p_os,o.revisao,'ready',o.etapa_id,o.local_id,o.entrega_prevista_em,o.recebido_em,null);
  elsif p_acao='parar' then
    if o.situacao not in ('open','in_progress','quality_check') then
      raise exception 'Volte à conferência antes de parar um serviço concluído.' using errcode='23514';
    end if;
    if exists(select 1 from public.paradas_ordem_servico where oficina_id=p_oficina and ordem_servico_id=p_os and encerrado_em is null) then
      raise exception 'Este serviço já está parado. Confira a pendência no mapa.' using errcode='23514';
    end if;
    if p_motivo is null or p_motivo not in ('parts','approval','third_party','capacity','diagnosis','other') or length(p_detalhes)>2000 then
      raise exception 'Selecione um motivo e use detalhes com até 2.000 caracteres.' using errcode='22023';
    end if;
    detalhe:=coalesce(nullif(trim(p_detalhes),''),case p_motivo
      when 'parts' then 'Aguardando peças' when 'approval' then 'Aguardando aprovação'
      when 'third_party' then 'Aguardando terceiros' when 'capacity' then 'Sem capacidade disponível'
      when 'diagnosis' then 'Aguardando diagnóstico' else 'Outra pendência' end);
    perform public.registrar_parada_os(p_oficina,p_os,p_motivo,detalhe);
  else
    if not exists(select 1 from public.paradas_ordem_servico where oficina_id=p_oficina and ordem_servico_id=p_os and encerrado_em is null) then
      raise exception 'Este serviço não está parado.' using errcode='23514';
    end if;
    -- Retomar resolve as pendências exibidas no cartão, preservando a etapa anterior.
    for parada in select id from public.paradas_ordem_servico where oficina_id=p_oficina and ordem_servico_id=p_os and encerrado_em is null order by id loop
      perform public.resolver_parada_os(p_oficina,p_os,parada.id);
    end loop;
  end if;
  select * into o from public.ordens_servico where oficina_id=p_oficina and id=p_os;
  return jsonb_build_object('situacao',o.situacao,'revisao',o.revisao,'recebido_em',o.recebido_em,
    'paradas',coalesce((select jsonb_agg(jsonb_build_object('id',id,'motivo',motivo,'detalhes',detalhes,'encerrado_em',encerrado_em) order by iniciado_em desc,id)
      from public.paradas_ordem_servico where oficina_id=p_oficina and ordem_servico_id=p_os),'[]'::jsonb));
end $function$;
CREATE OR REPLACE FUNCTION public.programar_visitas_limpeza(p_oficina uuid, p_chave uuid, p_dados jsonb, p_quantidade integer, p_intervalo integer, p_revisao integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.atendimentos_servicos; c public.comercial_atendimento; serie public.series_visitas_limpeza;
 pedido jsonb; campos jsonb; ficha jsonb; itens jsonb; equipe jsonb; lista jsonb := '[]';
 i integer; idv uuid; revisao integer; ini timestamptz; fimv timestamptz; dia date;
begin
 perform private.gerencia_servicos(p_oficina);
 if not exists(select 1 from public.oficinas where id=p_oficina and ramo='limpeza') then raise exception 'Esta programação é exclusiva de limpeza.' using errcode='22023'; end if;
 if p_chave is null or p_quantidade is null or p_quantidade not between 1 and 52 or p_intervalo is null or p_intervalo not in (1,7,14,30)
 or coalesce(p_dados->>'situacao','') not in ('agendado','confirmado') or coalesce(p_dados->>'nova_situacao','') not in ('orcamento','aprovado') then
  raise exception 'Confira a repetição, o agendamento e a situação das novas visitas.' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('serie-limpeza:'||p_oficina||p_chave,0));
 pedido := jsonb_build_object('dados',p_dados,'quantidade',p_quantidade,'intervalo',p_intervalo,'revisao',p_revisao);
 select * into serie from public.series_visitas_limpeza where id=p_chave;
 if found then
  if serie.oficina_id<>p_oficina then raise exception 'Programação indisponível.' using errcode='42501';end if;
  if serie.solicitacao<>pedido then raise exception 'Esta programação já foi criada com outros dados. Atualize a tela.' using errcode='22023';end if;
  return serie.atendimentos;
 end if;
 select * into a from public.atendimentos_servicos where oficina_id=p_oficina and id=(p_dados->>'atendimento_id')::uuid for update;
 if not found then raise exception 'Atendimento indisponível.' using errcode='42501';end if;
 if a.revisao is distinct from p_revisao then raise exception 'Atendimento alterado. Atualize a tela.' using errcode='PT409';end if;
 if a.situacao='cancelado' or coalesce(a.ficha_especialidade->>'especialidade','') not like 'limpeza_%' then raise exception 'Selecione um atendimento de limpeza não cancelado.' using errcode='22023';end if;
 select coalesce(jsonb_object_agg(key,value),'{}') into campos from jsonb_each(a.ficha_especialidade->'campos') where private.campos_planejamento_limpeza() ? key;
 ficha := jsonb_build_object('versao',1,'especialidade',a.ficha_especialidade->>'especialidade','campos',campos,'checklist','{}'::jsonb,'etapa','');
 select * into c from public.comercial_atendimento where oficina_id=p_oficina and atendimento_id=a.id;
 select coalesce(jsonb_agg(jsonb_build_object('funcionario_id',funcionario_id,'percentual',percentual,'custo_hora_centavos',custo_hora_centavos)),'[]') into equipe from public.equipe_atendimento where oficina_id=p_oficina and atendimento_id=a.id;
 for i in 0..p_quantidade-1 loop
  idv := md5('visita:'||p_oficina||':'||p_chave||':'||i)::uuid;
  ini := (p_dados->>'inicio')::timestamptz + make_interval(days=>i*p_intervalo);
  fimv := (p_dados->>'fim')::timestamptz + make_interval(days=>i*p_intervalo);
  if ini is null or fimv is null or fimv<=ini then raise exception 'O término deve ser posterior ao início.' using errcode='22023';end if;
  dia := (ini at time zone 'America/Sao_Paulo')::date;
  ficha := jsonb_set(ficha,'{campos,prazo_servico}',to_jsonb(((fimv at time zone 'America/Sao_Paulo')::date)::text));
  perform public.salvar_atendimento_servico(p_oficina,idv,jsonb_build_object(
   'cliente_id',a.cliente_id,'objeto_id',a.objeto_id,'titulo',a.titulo,'situacao','orcamento',
   'valor_centavos',a.valor_centavos,'vencimento',dia,'data_servico',dia,'ficha_especialidade',ficha,
   'dados',jsonb_build_object('solicitacao',coalesce(a.dados->>'solicitacao',''),'tipo_servico',coalesce(a.dados->>'tipo_servico',''))),null);
  select coalesce(jsonb_agg((to_jsonb(t)-array['oficina_id','atendimento_id','id'])||jsonb_build_object('id',gen_random_uuid())),'[]') into itens
   from public.itens_atendimento_servico t where oficina_id=p_oficina and atendimento_id=a.id;
  if jsonb_array_length(itens)>0 then
   select x.revisao into revisao from public.atendimentos_servicos x where id=idv;
   perform public.salvar_itens_atendimento(p_oficina,idv,revisao,itens,coalesce(c.desconto_centavos,0),0,'');
  end if;
  if jsonb_array_length(equipe)>0 then
   select x.revisao into revisao from public.atendimentos_servicos x where id=idv;
   perform public.salvar_equipe_atendimento(p_oficina,idv,revisao,equipe);
  end if;
  if p_dados->>'nova_situacao'='aprovado' then
   perform public.salvar_atendimento_servico(p_oficina,idv,(select to_jsonb(x)||'{"situacao":"aprovado"}'::jsonb from public.atendimentos_servicos x where id=idv),(select x.revisao from public.atendimentos_servicos x where id=idv));
  end if;
  perform public.salvar_agenda_servico(p_oficina,idv,p_dados||jsonb_build_object('atendimento_id',idv,'inicio',ini,'fim',fimv),null);
  insert into public.eventos_atendimento(oficina_id,atendimento_id,tipo,depois,autor) values(p_oficina,idv,'programacao','Visita '||(i+1)||' de '||p_quantidade||' · baseada no atendimento #'||a.numero,auth.uid());
  lista := lista || jsonb_build_array(idv);
 end loop;
 insert into public.series_visitas_limpeza(id,oficina_id,solicitacao,atendimentos) values(p_chave,p_oficina,pedido,lista);
 return lista;
end $function$;
CREATE OR REPLACE FUNCTION public.reabrir_atendimento_servico(p_oficina uuid, p_atendimento uuid, p_revisao integer, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.atendimentos_servicos; m record; e public.estoque_produtos; novo uuid;
begin
 perform private.gerencia_servicos(p_oficina);
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_atendimento::text,0));
 select * into a from public.atendimentos_servicos where oficina_id=p_oficina and id=p_atendimento for update;
 if not found then raise exception 'Atendimento indisponível.' using errcode='42501';end if;
 if a.revisao is distinct from p_revisao then raise exception 'Atendimento alterado.' using errcode='PT409';end if;
 if a.situacao<>'concluido' or length(trim(coalesce(p_motivo,'')))<3 then raise exception 'Informe o motivo para reabrir um atendimento concluído.' using errcode='22023';end if;
 if exists(select 1 from public.equipe_atendimento eq join public.titulos_financeiros t on t.id=eq.titulo_id where eq.atendimento_id=p_atendimento and t.cancelado_em is null) then raise exception 'Cancele a conta da comissão antes de reabrir.' using errcode='22023';end if;
 for m in select c.id consumo_id,x.* from public.consumos_atendimento c join public.movimentacoes_estoque x on x.id=c.movimento_id where c.oficina_id=p_oficina and c.atendimento_id=p_atendimento and c.estorno_id is null order by x.item_catalogo_id loop
 select id into novo from public.movimentacoes_estoque where estorno_de=m.id;
 if not found then
 select * into e from public.estoque_produtos where oficina_id=p_oficina and item_catalogo_id=m.item_catalogo_id for update;
 update public.estoque_produtos set saldo=saldo-m.quantidade,revisao=revisao+1 where oficina_id=p_oficina and item_catalogo_id=m.item_catalogo_id;
 insert into public.movimentacoes_estoque(oficina_id,item_catalogo_id,tipo,quantidade,saldo_apos,custo_centavos,motivo,documento,chave,criado_por,atendimento_id,estorno_de)
 values(p_oficina,m.item_catalogo_id,'estorno',-m.quantidade,e.saldo-m.quantidade,m.custo_centavos,'Reabertura: '||left(p_motivo,900),p_atendimento::text,gen_random_uuid(),auth.uid(),p_atendimento,m.id) returning id into novo;end if;
 update public.consumos_atendimento set estorno_id=novo where id=m.consumo_id;
 end loop;
 update public.atendimentos_servicos set situacao='em_execucao',concluido_em=null,revisao=revisao+1 where id=p_atendimento;
 update public.equipe_atendimento set comissao_centavos=0,titulo_id=null where atendimento_id=p_atendimento;
 insert into public.eventos_atendimento(oficina_id,atendimento_id,tipo,depois,autor) values(p_oficina,p_atendimento,'reabertura',p_motivo,auth.uid());
end $function$;
CREATE OR REPLACE FUNCTION public.restaurar_orcamento(p_oficina uuid, p_orcamento uuid, p_revisao integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid; q public.orcamentos;
begin
  u:=private.exigir_orcamentos(p_oficina);
  select * into q from public.orcamentos where oficina_id=p_oficina and id=p_orcamento for update;
  if not found then raise exception 'Orçamento não encontrado.' using errcode='P0002'; end if;
  if q.arquivado_em is null then return; end if;
  if q.revisao is distinct from p_revisao then raise exception 'O orçamento mudou. Atualize a lista.' using errcode='PT409'; end if;
  update public.orcamentos set arquivado_em=null,revisao=revisao+1,atualizado_em=now() where id=q.id returning * into q;
  perform private.evento_orcamento(p_oficina,q.id,q.revisao,'orcamento.restaurado',u);
end $function$;
CREATE OR REPLACE FUNCTION public.restaurar_ordem_servico(p_oficina uuid, p_os uuid, p_revisao integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid; w public.ordens_servico;
begin
  u:=private.exigir_os(p_oficina);
  select * into w from public.ordens_servico where oficina_id=p_oficina and id=p_os for update;
  if not found then raise exception 'OS não encontrada.' using errcode='P0002'; end if;
  if w.arquivado_em is null then return; end if;
  if w.revisao is distinct from p_revisao then raise exception 'A OS foi alterada. Atualize a lista.' using errcode='PT409'; end if;
  -- Restaurar recupera o registro, sem reabrir execução nem gerar novas baixas.
  update public.ordens_servico set arquivado_em=null,atualizado_em=now() where id=w.id;
  perform private.evento_os(p_oficina,w.id,'OS restaurada na listagem. Situação preservada.',jsonb_build_object('acao','restauracao'));
  insert into public.registros_auditoria(oficina_id,usuario_autor_id,tipo_autor,acao,tipo_entidade,entidade_id,correlacao_id)
    values(p_oficina,u,'user','os.restaurada','ordem_servico',w.id,gen_random_uuid());
end $function$;
CREATE OR REPLACE FUNCTION public.salvar_agenda_servico(p_oficina uuid, p_id uuid, p_dados jsonb, p_revisao integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.agenda_servicos%rowtype; ri uuid:=(p_dados->>'recurso_id')::uuid; ini timestamptz:=(p_dados->>'inicio')::timestamptz; fimv timestamptz:=(p_dados->>'fim')::timestamptz; begin
 perform private.exigir_servicos(p_oficina);
 -- Serializa as reservas da empresa, inclusive remarcações entre equipes.
 perform pg_advisory_xact_lock(hashtextextended('agenda:'||p_oficina::text,0));
 select * into a from public.agenda_servicos where oficina_id=p_oficina and id=p_id for update;
 if found and p_revisao is null then return p_id; end if;
 if a.id is not null and a.revisao is distinct from p_revisao then raise exception 'Agendamento alterado. Atualize a tela.' using errcode='PT409'; end if;
 perform 1 from public.atendimentos_servicos where oficina_id=p_oficina and id=(p_dados->>'atendimento_id')::uuid for update;
 if not exists(select 1 from public.recursos_agenda where oficina_id=p_oficina and id=ri and (ativo or (a.recurso_id=ri and p_dados->>'situacao' in ('cancelado','concluido','faltou')))) or not exists(select 1 from public.atendimentos_servicos where oficina_id=p_oficina and id=(p_dados->>'atendimento_id')::uuid and (situacao<>'cancelado' or (a.atendimento_id=id and p_dados->>'situacao'='cancelado'))) then raise exception 'Equipe ou atendimento indisponível.' using errcode='22023'; end if;
 if p_dados->>'situacao' in ('agendado','confirmado') and exists(select 1 from public.agenda_servicos where oficina_id=p_oficina and recurso_id=ri and id<>p_id and situacao in ('agendado','confirmado') and inicio<fimv and fim>ini) then raise exception 'Esta equipe já tem um atendimento nesse horário.' using errcode='23P01'; end if;
 insert into public.agenda_servicos(id,oficina_id,atendimento_id,recurso_id,inicio,fim,situacao,observacoes)
 values(p_id,p_oficina,(p_dados->>'atendimento_id')::uuid,ri,ini,fimv,p_dados->>'situacao',coalesce(p_dados->>'observacoes',''))
 on conflict(id) do update set atendimento_id=excluded.atendimento_id,recurso_id=excluded.recurso_id,inicio=excluded.inicio,fim=excluded.fim,situacao=excluded.situacao,observacoes=excluded.observacoes,revisao=agenda_servicos.revisao+1 where agenda_servicos.oficina_id=p_oficina;
 if not found then raise exception 'Agendamento indisponível.' using errcode='42501'; end if;
 return p_id;
end $function$;
CREATE OR REPLACE FUNCTION public.salvar_atendimento_servico_base(p_oficina uuid, p_id uuid, p_dados jsonb, p_revisao integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.atendimentos_servicos%rowtype; begin
 perform private.exigir_servicos(p_oficina);
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_id::text,0));
 select * into a from public.atendimentos_servicos where oficina_id=p_oficina and id=p_id for update;
 if found and p_revisao is null then return p_id; end if;
 if a.id is not null and a.revisao is distinct from p_revisao then raise exception 'Atendimento alterado. Atualize a tela.' using errcode='PT409'; end if;
 if not exists(select 1 from public.objetos_atendimento where oficina_id=p_oficina and id=(p_dados->>'objeto_id')::uuid and cliente_id=(p_dados->>'cliente_id')::uuid and (not arquivado or id=a.objeto_id)) then raise exception 'Selecione um cadastro ativo deste cliente.' using errcode='22023'; end if;
 if exists(select 1 from public.cobrancas_atendimento c join public.titulos_financeiros t on t.id=c.titulo_id where c.atendimento_id=p_id and t.cancelado_em is null) and
 ((p_dados->>'valor_centavos')::bigint is distinct from a.valor_centavos or p_dados->>'situacao'='cancelado' or (p_dados->>'cliente_id')::uuid is distinct from a.cliente_id) then raise exception 'Atendimento faturado: ajuste a cobrança no financeiro antes de alterar o contrato.' using errcode='22023'; end if;
 insert into public.atendimentos_servicos(id,oficina_id,cliente_id,objeto_id,titulo,situacao,dados,valor_centavos,vencimento,ficha_especialidade)
 values(p_id,p_oficina,(p_dados->>'cliente_id')::uuid,(p_dados->>'objeto_id')::uuid,trim(p_dados->>'titulo'),p_dados->>'situacao',coalesce(p_dados->'dados','{}'),(p_dados->>'valor_centavos')::bigint,(p_dados->>'vencimento')::date,case when p_dados ? 'ficha_especialidade' then nullif(p_dados->'ficha_especialidade','null'::jsonb) else a.ficha_especialidade end)
 on conflict(id) do update set cliente_id=excluded.cliente_id,objeto_id=excluded.objeto_id,titulo=excluded.titulo,situacao=excluded.situacao,dados=excluded.dados,valor_centavos=excluded.valor_centavos,vencimento=excluded.vencimento,ficha_especialidade=excluded.ficha_especialidade,revisao=atendimentos_servicos.revisao+1 where atendimentos_servicos.oficina_id=p_oficina;
 if not found then raise exception 'Atendimento indisponível.' using errcode='42501'; end if;
 if p_dados->>'situacao'='cancelado' then update public.agenda_servicos set situacao='cancelado',revisao=revisao+1 where oficina_id=p_oficina and atendimento_id=p_id and situacao in ('agendado','confirmado'); end if;
 insert into public.registros_auditoria(oficina_id,usuario_autor_id,tipo_autor,acao,tipo_entidade,entidade_id,correlacao_id) values(p_oficina,auth.uid(),'user','servico.salvo','atendimento',p_id,gen_random_uuid());
 return p_id;
end $function$;
CREATE OR REPLACE FUNCTION public.salvar_conta_recorrente(p_oficina uuid, p_id uuid, p_dados jsonb, p_revisao integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.contas_recorrentes; inicio date; categoria text; natureza text;
begin
 perform private.exigir_financeiro(p_oficina);
 if p_id is null or p_revisao is null or p_revisao<0 then raise exception 'Identificador e revisão obrigatórios.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_id::text,0));
 select * into r from public.contas_recorrentes where oficina_id=p_oficina and id=p_id for update;
 if r.id is not null and r.revisao<>p_revisao then raise exception 'Recorrência alterada. Atualize a tela.' using errcode='PT409';end if;
 if r.id is null and p_revisao<>0 then raise exception 'Recorrência não encontrada.' using errcode='P0002';end if;
 inicio:=(p_dados->>'inicio')::date; categoria:=p_dados->>'categoria'; natureza:=p_dados->>'natureza';
 if inicio is null or inicio<date '2000-01-01' or inicio>((now() at time zone 'America/Sao_Paulo')::date+3660) or
    natureza is null or natureza not in ('pagar','receber') or categoria is null or
    (natureza='receber' and categoria not in ('servicos','outras_receitas','aporte','saldo_inicial')) or
    (natureza='pagar' and categoria not in ('pecas_externas','pessoal','aluguel','agua_luz','impostos','terceiros','outras_despesas','compra_estoque','retirada','saldo_inicial')) then
  raise exception 'Confira início, natureza e categoria da recorrência.' using errcode='22023';end if;
 if r.id is not null and inicio<>r.inicio then raise exception 'O início da recorrência não pode ser alterado.' using errcode='22023';end if;
 insert into public.contas_recorrentes(id,oficina_id,descricao,natureza,categoria,valor_centavos,dia,inicio,fim,ativa,proximo_mes)
 values(p_id,p_oficina,trim(p_dados->>'descricao'),natureza,categoria,(p_dados->>'valor_centavos')::bigint,(p_dados->>'dia')::integer,inicio,nullif(p_dados->>'fim','')::date,(p_dados->>'ativa')::boolean,date_trunc('month',inicio)::date)
 on conflict(id) do update set descricao=excluded.descricao,natureza=excluded.natureza,categoria=excluded.categoria,
 valor_centavos=excluded.valor_centavos,dia=excluded.dia,fim=excluded.fim,ativa=excluded.ativa,revisao=contas_recorrentes.revisao+1,
 proximo_mes=case when not contas_recorrentes.ativa and excluded.ativa then greatest(contas_recorrentes.proximo_mes,date_trunc('month',now() at time zone 'America/Sao_Paulo')::date) else contas_recorrentes.proximo_mes end
 where contas_recorrentes.oficina_id=p_oficina;
 if not found then raise exception 'Recorrência não encontrada nesta oficina.' using errcode='42501';end if;
 update public.contas_recorrentes set valor_variavel=coalesce((p_dados->>'valor_variavel')::boolean,false) where oficina_id=p_oficina and id=p_id;
 perform private.gerar_contas_recorrentes(p_oficina);
end $function$;
CREATE OR REPLACE FUNCTION public.salvar_equipe_atendimento(p_oficina uuid, p_atendimento uuid, p_revisao integer, p_equipe jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.atendimentos_servicos; i jsonb;
begin
 perform private.gerencia_servicos(p_oficina);
 select * into a from public.atendimentos_servicos where oficina_id=p_oficina and id=p_atendimento for update;
 if not found then raise exception 'Atendimento indisponível.' using errcode='42501';end if;
 if a.revisao is distinct from p_revisao then raise exception 'Atendimento alterado.' using errcode='PT409';end if;
 if a.situacao in ('concluido','cancelado') then raise exception 'Atendimento encerrado.' using errcode='22023';end if;
 if jsonb_typeof(p_equipe) is distinct from 'array' or jsonb_array_length(p_equipe)>50 or (select sum((v->>'percentual')::numeric) from jsonb_array_elements(p_equipe) v)>100 then raise exception 'Equipe ou comissão inválida (soma máxima de 100%%).' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(p_equipe) v group by v->>'funcionario_id' having count(*)>1) then raise exception 'Selecione cada funcionário apenas uma vez.' using errcode='22023';end if;
 if not private.has_feature(p_oficina,'employee_reports') and exists(select 1 from jsonb_array_elements(p_equipe) v where coalesce((v->>'percentual')::numeric,0)<>0) then raise exception 'Comissões exigem o plano com gestão de funcionários.' using errcode='42501';end if;
 if exists(select 1 from public.horas_atendimento h where h.atendimento_id=p_atendimento and not exists(select 1 from jsonb_array_elements(p_equipe) v where (v->>'funcionario_id')::uuid=h.funcionario_id)) then raise exception 'Preserve os funcionários com horas registradas.' using errcode='22023';end if;
 delete from public.equipe_atendimento e where atendimento_id=p_atendimento and not exists(select 1 from jsonb_array_elements(p_equipe) v where (v->>'funcionario_id')::uuid=e.funcionario_id);
 for i in select * from jsonb_array_elements(p_equipe) loop
 if not exists(select 1 from public.funcionarios f where oficina_id=p_oficina and id=(i->>'funcionario_id')::uuid and (ativo or exists(select 1 from public.equipe_atendimento e where e.atendimento_id=p_atendimento and e.funcionario_id=f.id))) then raise exception 'Funcionário indisponível.' using errcode='22023';end if;
 insert into public.equipe_atendimento(id,oficina_id,atendimento_id,funcionario_id,percentual,custo_hora_centavos)
 values(gen_random_uuid(),p_oficina,p_atendimento,(i->>'funcionario_id')::uuid,coalesce((i->>'percentual')::numeric,0),coalesce((i->>'custo_hora_centavos')::bigint,0)) on conflict(atendimento_id,funcionario_id) do update set percentual=excluded.percentual,custo_hora_centavos=excluded.custo_hora_centavos;end loop;
 update public.atendimentos_servicos set revisao=revisao+1 where id=p_atendimento;
end $function$;
CREATE OR REPLACE FUNCTION public.salvar_itens_atendimento(p_oficina uuid, p_atendimento uuid, p_revisao integer, p_itens jsonb, p_desconto bigint DEFAULT 0, p_custo_extra bigint DEFAULT 0, p_motivo text DEFAULT ''::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a public.atendimentos_servicos; i jsonb; e public.estoque_produtos; total bigint; custo bigint;
begin
 perform private.gerencia_servicos(p_oficina);
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_atendimento::text,0));
 select * into a from public.atendimentos_servicos where oficina_id=p_oficina and id=p_atendimento for update;
 if not found then raise exception 'Atendimento indisponível.' using errcode='42501';end if;
 if a.revisao is distinct from p_revisao then raise exception 'Atendimento alterado. Atualize a tela.' using errcode='PT409';end if;
 if a.situacao in ('concluido','cancelado') or exists(select 1 from public.cobrancas_atendimento c join public.titulos_financeiros t on t.id=c.titulo_id where c.atendimento_id=p_atendimento and t.cancelado_em is null) then raise exception 'Reabra o atendimento ou cancele a cobrança antes de alterar os itens.' using errcode='22023';end if;
 if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens)>200 or p_desconto is null or p_desconto<0 or p_custo_extra is null or p_custo_extra<0 then raise exception 'Itens ou valores inválidos.' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(p_itens) x group by x->>'id' having count(*)>1) then raise exception 'Itens duplicados.' using errcode='22023';end if;
 -- Compartilha o bloqueio com o arquivamento e a conclusão, em ordem estável.
 perform 1 from public.estoque_produtos where oficina_id=p_oficina and item_catalogo_id in (select (v->>'produto_id')::uuid from jsonb_array_elements(p_itens) v where v->>'origem'='estoque') order by item_catalogo_id for update;
 delete from public.itens_atendimento_servico where oficina_id=p_oficina and atendimento_id=p_atendimento;
 for i in select * from jsonb_array_elements(p_itens) loop
 if lower(trim(coalesce(i->>'unidade','un'))) in ('un','unid','serv','servico','peça','peca') and (i->>'quantidade')::numeric<>trunc((i->>'quantidade')::numeric) then raise exception 'Use quantidade inteira para unidades, peças e serviços.' using errcode='22023';end if;
 if (i->>'quantidade')::numeric is distinct from round((i->>'quantidade')::numeric,3) then raise exception 'Quantidade deve ter até três casas decimais.' using errcode='22023';end if;
 custo:=coalesce((i->>'custo_centavos')::bigint,0);
 if i->>'origem'='estoque' then
 perform private.exigir_estoque(p_oficina);
 select e1.* into e from public.estoque_produtos e1 join public.itens_catalogo c on c.id=e1.item_catalogo_id where e1.oficina_id=p_oficina and e1.item_catalogo_id=(i->>'produto_id')::uuid and c.arquivado_em is null;
 if not found then raise exception 'Selecione um produto ativo do estoque desta empresa.' using errcode='22023';end if;
 custo:=e.custo_centavos;
 elsif i->>'origem'='cliente' then custo:=0;end if;
 insert into public.itens_atendimento_servico(id,oficina_id,atendimento_id,tipo,descricao,quantidade,unidade,preco_centavos,custo_centavos,produto_id,origem)
 values((i->>'id')::uuid,p_oficina,p_atendimento,i->>'tipo',trim(i->>'descricao'),(i->>'quantidade')::numeric,coalesce(i->>'unidade','un'),(i->>'preco_centavos')::bigint,custo,nullif(i->>'produto_id','')::uuid,coalesce(i->>'origem','externa'));
 end loop;
 select coalesce(sum(round(quantidade*preco_centavos)),0) into total from public.itens_atendimento_servico where atendimento_id=p_atendimento;
 if p_desconto>total then raise exception 'Desconto superior ao subtotal.' using errcode='22023';end if;
 insert into public.comercial_atendimento(oficina_id,atendimento_id,desconto_centavos,custo_extra_centavos,motivo_custo) values(p_oficina,p_atendimento,p_desconto,p_custo_extra,coalesce(p_motivo,''))
 on conflict(atendimento_id) do update set desconto_centavos=excluded.desconto_centavos,custo_extra_centavos=excluded.custo_extra_centavos,motivo_custo=excluded.motivo_custo;
 update public.atendimentos_servicos set valor_centavos=total-p_desconto,revisao=revisao+1 where id=p_atendimento;
 insert into public.eventos_atendimento(oficina_id,atendimento_id,tipo,depois,autor) values(p_oficina,p_atendimento,'itens','Itens, custos e desconto atualizados',auth.uid());
end $function$;
CREATE OR REPLACE FUNCTION public.salvar_objeto_atendimento(p_oficina uuid, p_id uuid, p_dados jsonb, p_revisao integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o public.objetos_atendimento%rowtype; begin
 perform private.exigir_servicos(p_oficina,'customers');
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_id::text,0));
 select * into o from public.objetos_atendimento where oficina_id=p_oficina and id=p_id for update;
 if found and p_revisao is null then return p_id; end if;
 if o.id is not null and o.revisao is distinct from p_revisao then raise exception 'Cadastro alterado. Atualize a tela.' using errcode='PT409'; end if;
 if not exists(select 1 from public.clientes where oficina_id=p_oficina and id=(p_dados->>'cliente_id')::uuid and arquivado_em is null) then raise exception 'Cliente inválido.' using errcode='22023'; end if;
 if o.id is not null and o.cliente_id<>(p_dados->>'cliente_id')::uuid and exists(select 1 from public.atendimentos_servicos where objeto_id=o.id) then raise exception 'Não é possível trocar o cliente de um cadastro com atendimentos.'; end if;
 insert into public.objetos_atendimento(id,oficina_id,cliente_id,nome,dados,arquivado)
 values(p_id,p_oficina,(p_dados->>'cliente_id')::uuid,trim(p_dados->>'nome'),coalesce(p_dados->'dados','{}'),coalesce((p_dados->>'arquivado')::boolean,false))
 on conflict(id) do update set nome=excluded.nome,cliente_id=excluded.cliente_id,dados=excluded.dados,arquivado=excluded.arquivado,revisao=objetos_atendimento.revisao+1 where objetos_atendimento.oficina_id=p_oficina;
 if not found then raise exception 'Cadastro indisponível.' using errcode='42501'; end if;
 return p_id;
end $function$;
CREATE OR REPLACE FUNCTION public.salvar_ordem_servico(p_oficina uuid, p_dados jsonb, p_chave uuid, p_os uuid DEFAULT NULL::uuid, p_revisao integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid; w public.ordens_servico%rowtype; c public.clientes%rowtype; v public.veiculos%rowtype; n bigint; id_os uuid; campo text; retifica boolean; begin
 u:=private.exigir_os(p_oficina);
 if p_dados ? 'data_servico' then
   if coalesce(p_dados->>'data_servico','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
     raise exception 'Informe uma data válida para o serviço.' using errcode='22023';
   end if;
   begin perform (p_dados->>'data_servico')::date;
   exception when invalid_datetime_format or datetime_field_overflow then
     raise exception 'Informe uma data válida para o serviço.' using errcode='22023';
   end;
 end if;
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
  if p_revisao is distinct from w.revisao then raise exception 'OS alterada. Reabra antes de salvar.' using errcode='PT409'; end if;
 end if;
 if w.situacao in ('delivered','cancelled') then raise exception 'OS encerrada: histórico preservado' using errcode='22023'; end if;
 if w.cliente_id is null and p_dados ? 'cliente_nome_livre' then
 c:=private.cliente_atendimento(p_oficina,p_dados||jsonb_build_object('cliente_id',null));
 update public.ordens_servico set dados_cliente=jsonb_build_object('nome',c.nome,'telefone_e164',c.telefone_e164) where id=w.id;
 end if;
 update public.ordens_servico set data_servico=case when p_dados ? 'data_servico' then (p_dados->>'data_servico')::date else data_servico end,forma_pagamento=case when p_dados ? 'forma_pagamento' then coalesce(nullif(trim(p_dados->>'forma_pagamento'),''),'Carteira') else forma_pagamento end,pecas_a_trocar=case when p_dados ? 'pecas_a_trocar' then coalesce(p_dados->>'pecas_a_trocar','') else pecas_a_trocar end,vencimento_pagamento=case when p_dados ? 'vencimento_pagamento' then nullif(p_dados->>'vencimento_pagamento','')::date else vencimento_pagamento end,dados_veiculo=case when retifica and p_dados ? 'motor_livre' then jsonb_build_object('modelo',trim(p_dados->>'carro_livre'),'motor',trim(p_dados->>'motor_livre'),'especialidade','retifica') else dados_veiculo end,tipo_servico=case when p_dados ? 'tipo_servico' then nullif(p_dados->>'tipo_servico','') else tipo_servico end,ficha_especialidade=case when p_dados ? 'ficha_especialidade' then nullif(p_dados->'ficha_especialidade','null'::jsonb) else ficha_especialidade end,detalhes_especialidade=case when p_dados ? 'detalhes_especialidade' then coalesce(p_dados->>'detalhes_especialidade','') else detalhes_especialidade end,queixa_cliente=p_dados->>'queixa_cliente',codigos_falha=case when p_dados ? 'codigos_falha' then coalesce(p_dados->>'codigos_falha','') else codigos_falha end,diagnostico=p_dados->>'diagnostico',observacoes_internas=p_dados->>'observacoes_internas',resumo_cliente=p_dados->>'resumo_cliente',responsavel=p_dados->>'responsavel',prioridade=coalesce(p_dados->>'prioridade','normal'),quilometragem_entrada=nullif(p_dados->>'quilometragem_entrada','')::integer,quilometragem_saida=nullif(p_dados->>'quilometragem_saida','')::integer,combustivel_percentual=nullif(p_dados->>'combustivel_percentual','')::smallint,pertences=p_dados->>'pertences',entrega_prevista_em=nullif(p_dados->>'entrega_prevista_em','')::timestamptz,condicoes_garantia=p_dados->>'condicoes_garantia',garantia_ate=nullif(p_dados->>'garantia_ate','')::date,checklist=coalesce(p_dados->'checklist','{}') where id=w.id;
 perform private.evento_os(p_oficina,w.id,case when p_os is null then 'Ordem de serviço aberta.' else 'Dados do atendimento atualizados.' end,jsonb_build_object('antes',to_jsonb(w),'depois',p_dados));
 return public.consultar_ordem_servico(p_oficina,w.id);
end $function$;
CREATE OR REPLACE FUNCTION public.salvar_qualidade_atendimento(p_oficina uuid, p_atendimento uuid, p_id uuid, p_dados jsonb, p_revisao integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare q public.qualidade_atendimento;
begin
 perform private.gerencia_servicos(p_oficina);
 if not exists(select 1 from public.atendimentos_servicos where oficina_id=p_oficina and id=p_atendimento) then raise exception 'Atendimento indisponível.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('qualidade-servico:'||p_id,0));
 select * into q from public.qualidade_atendimento where id=p_id for update;
 if found then
 if q.oficina_id<>p_oficina or q.atendimento_id<>p_atendimento then raise exception 'Ocorrência indisponível.' using errcode='42501';end if;
 if p_revisao is null then return;end if;
 if q.revisao<>p_revisao then raise exception 'Ocorrência alterada.' using errcode='PT409';end if;end if;
 insert into public.qualidade_atendimento(id,oficina_id,atendimento_id,funcionario_id,tipo,motivo,solucao,aberto_em,resolvido_em,custo_centavos,minutos,nota)
 values(p_id,p_oficina,p_atendimento,nullif(p_dados->>'funcionario_id','')::uuid,p_dados->>'tipo',trim(p_dados->>'motivo'),coalesce(p_dados->>'solucao',''),(p_dados->>'aberto_em')::date,nullif(p_dados->>'resolvido_em','')::date,coalesce((p_dados->>'custo_centavos')::bigint,0),coalesce((p_dados->>'minutos')::integer,0),nullif(p_dados->>'nota','')::integer)
 on conflict(id) do update set funcionario_id=excluded.funcionario_id,tipo=excluded.tipo,motivo=excluded.motivo,solucao=excluded.solucao,aberto_em=excluded.aberto_em,resolvido_em=excluded.resolvido_em,custo_centavos=excluded.custo_centavos,minutos=excluded.minutos,nota=excluded.nota,revisao=qualidade_atendimento.revisao+1;
 insert into public.eventos_atendimento(oficina_id,atendimento_id,tipo,depois,autor) values(p_oficina,p_atendimento,'qualidade',(p_dados->>'tipo')||': '||(p_dados->>'motivo'),auth.uid());
end $function$;
CREATE OR REPLACE FUNCTION public.salvar_recurso_agenda(p_oficina uuid, p_id uuid, p_nome text, p_ativo boolean, p_revisao integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.recursos_agenda%rowtype; begin
 perform private.exigir_servicos(p_oficina);
 if not exists(select 1 from public.membros_oficina where oficina_id=p_oficina and usuario_id=auth.uid() and perfil in ('owner','manager') and ativo) then raise exception 'Somente a gerência pode configurar a equipe da agenda.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_id::text,0));
 select * into r from public.recursos_agenda where oficina_id=p_oficina and id=p_id for update;
 if found and p_revisao is null then return p_id; end if;
 if r.id is not null and r.revisao is distinct from p_revisao then raise exception 'Equipe alterada. Atualize a tela.' using errcode='PT409'; end if;
 insert into public.recursos_agenda(id,oficina_id,nome,ativo) values(p_id,p_oficina,trim(p_nome),p_ativo)
 on conflict(id) do update set nome=excluded.nome,ativo=excluded.ativo,revisao=recursos_agenda.revisao+1 where recursos_agenda.oficina_id=p_oficina;
 if not found then raise exception 'Recurso indisponível.' using errcode='42501'; end if;
 return p_id;
end $function$;
notify pgrst, 'reload schema';
commit;
