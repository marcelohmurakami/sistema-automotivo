-- Mantém custos e eventos das OS relevantes; movimentos antigos não relacionados
-- deixam de viajar ao navegador. A primeira entrega e a última movimentação são agregadas no banco.
create index if not exists os_primeira_entrega_cliente on public.ordens_servico(oficina_id,cliente_id,entregue_em) where situacao='delivered' and arquivado_em is null;
create index if not exists os_relatorio_entrega on public.ordens_servico(oficina_id,entregue_em) where arquivado_em is null;
create index if not exists atendimentos_relatorio_data on public.atendimentos_servicos(oficina_id,data_servico,id);
create index if not exists movimentos_relatorio_periodo on public.movimentacoes_estoque(oficina_id,criado_em);
create index if not exists movimentos_relatorio_os on public.movimentacoes_estoque(oficina_id,ordem_servico_id);
create index if not exists titulos_relatorio_os on public.titulos_financeiros(oficina_id,ordem_servico_id) where cancelado_em is null;
CREATE OR REPLACE FUNCTION public.consultar_relatorios_gestao(p_oficina uuid, p_inicio date, p_fim date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare equipe boolean; r jsonb;begin
 perform private.exigir_gestao(p_oficina,'reports');perform private.exigir_financeiro(p_oficina);
 if p_inicio is null or p_fim is null or p_inicio>p_fim or p_fim-p_inicio>366 then raise exception 'Escolha um período de até 367 dias.' using errcode='22023';end if;
 equipe:=private.has_feature(p_oficina,'employee_reports');
 with relevantes as materialized (
   select w.id from public.ordens_servico w where w.oficina_id=p_oficina and w.arquivado_em is null and (
     w.situacao not in ('delivered','cancelled')
     or (w.recebido_em < (p_fim+1)::timestamp at time zone 'America/Sao_Paulo' and coalesce(w.entregue_em,w.cancelado_em,now()) >= p_inicio::timestamp at time zone 'America/Sao_Paulo')
     or w.iniciado_em >= p_inicio::timestamp at time zone 'America/Sao_Paulo' and w.iniciado_em < (p_fim+1)::timestamp at time zone 'America/Sao_Paulo'
     or w.concluido_em >= p_inicio::timestamp at time zone 'America/Sao_Paulo' and w.concluido_em < (p_fim+1)::timestamp at time zone 'America/Sao_Paulo'
     or w.entregue_em >= p_inicio::timestamp at time zone 'America/Sao_Paulo' and w.entregue_em < (p_fim+1)::timestamp at time zone 'America/Sao_Paulo'
     or w.id in (select q.ordem_original_id from public.ocorrencias_qualidade q where q.oficina_id=p_oficina and q.aberto_em >= p_inicio::timestamp at time zone 'America/Sao_Paulo' and q.aberto_em < (p_fim+1)::timestamp at time zone 'America/Sao_Paulo')
   )
 ), titulos_selecionados as materialized (
   select * from public.titulos_financeiros where oficina_id=p_oficina and cancelado_em is null and (competencia between p_inicio and p_fim or ordem_servico_id in (select id from relevantes))
 )
 select jsonb_build_object(
 'agora',now(),'equipe_permitida',equipe,
 'primeiras_entregas',coalesce((select jsonb_agg(to_jsonb(x)) from (
   select cliente_id,min(entregue_em) data from public.ordens_servico where oficina_id=p_oficina and arquivado_em is null and situacao='delivered'
   and cliente_id in (select cliente_id from public.ordens_servico where oficina_id=p_oficina and id in (select id from relevantes)) group by cliente_id
 ) x),'[]'),
 'complementos',coalesce((select jsonb_agg(to_jsonb(g)-'oficina_id'-'atualizado_por') from public.complementos_gestao g where oficina_id=p_oficina and (entidade<>'profissional' or equipe)
 and (entidade<>'os' or registro_id in (select id from relevantes))
 and (entidade<>'despesa' or registro_id in (select id from titulos_selecionados))
 and (entidade<>'compra' or registro_id in (select id from public.compras_estoque where oficina_id=p_oficina and data between p_inicio and p_fim))),'[]'),
 'funcionarios',coalesce((select jsonb_agg(jsonb_build_object('id',id,'nome',nome,'ativo',ativo)) from public.funcionarios where oficina_id=p_oficina),'[]'),
 'fornecedores',coalesce((select jsonb_agg(jsonb_build_object('id',id,'nome',nome)) from public.fornecedores where oficina_id=p_oficina),'[]'),
 'ordens',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'numero',w.numero,'cliente_id',w.cliente_id,'cliente',w.dados_cliente->>'nome','veiculo',w.dados_veiculo->>'modelo',
 'ficha_especialidade',w.ficha_especialidade,'tipo',w.tipo_servico,'situacao',w.situacao,'total',w.total_centavos,'entrada',w.recebido_em,'inicio',w.iniciado_em,'pronta',w.concluido_em,'entrega',w.entregue_em,'cancelamento',w.cancelado_em,'prazo',w.entrega_prevista_em,
 'orcado',coalesce((select total_aprovado_centavos from public.aprovacoes_orcamento a where a.oficina_id=p_oficina and a.versao_orcamento_id=v.id and a.decisao='approved'),v.total_centavos),'orcamento',w.orcamento_origem_id,'adicionais',coalesce((select sum(coalesce((select ap.total_aprovado_centavos from public.aprovacoes_orcamento ap where ap.oficina_id=p_oficina and ap.versao_orcamento_id=va.id and ap.decisao='approved'),va.total_centavos)) from public.complementos_ordem_servico c join public.versoes_orcamento va on va.id=c.versao_aplicada_id where c.oficina_id=p_oficina and c.ordem_servico_id=w.id),0),
 'mao_obra',coalesce((select round(sum(extract(epoch from (t.encerrado_em-t.iniciado_em))/3600*t.custo_hora_centavos)) from public.apontamentos_tempo t where t.oficina_id=p_oficina and t.ordem_servico_id=w.id and t.encerrado_em is not null),0)))
 from public.ordens_servico w left join public.versoes_orcamento v on v.id=w.versao_orcamento_origem_id where w.oficina_id=p_oficina and w.id in (select id from relevantes)),'[]'),
 'itens',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'os',i.ordem_servico_id,'catalogo',i.item_catalogo_id,'produto',i.produto_estoque_id,'tipo',i.tipo,'nome',i.descricao,'quantidade',i.quantidade,'receita',i.base_calculada)) from private.bases_comissao_itens i join public.itens_ordem_servico real_item on real_item.id=i.id join public.ordens_servico w on w.id=i.ordem_servico_id where i.oficina_id=p_oficina and real_item.removido_em is null and w.id in (select id from relevantes)),'[]'),
 'historico',coalesce((select jsonb_agg(jsonb_build_object('os',ordem_servico_id,'data',ocorrido_em,'de',metadados->>'old_status','para',metadados->>'new_status')) from public.historico_ordem_servico where oficina_id=p_oficina and ordem_servico_id in (select id from relevantes) and metadados ? 'new_status'),'[]'),
 'paradas',coalesce((select jsonb_agg(jsonb_build_object('os',ordem_servico_id,'motivo',motivo,'inicio',iniciado_em,'fim',encerrado_em)) from public.paradas_ordem_servico where oficina_id=p_oficina and ordem_servico_id in (select id from relevantes)),'[]'),
 'qualidade',coalesce((select jsonb_agg(to_jsonb(q)-'oficina_id'-'criado_por') from public.ocorrencias_qualidade q where oficina_id=p_oficina and (ordem_original_id in (select id from relevantes) or ordem_retrabalho_id in (select id from relevantes) or (aberto_em >= p_inicio::timestamp at time zone 'America/Sao_Paulo' and aberto_em < (p_fim+1)::timestamp at time zone 'America/Sao_Paulo'))),'[]'),
 'orcamentos',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'numero',o.numero,'situacao',o.situacao,'data',o.criado_em,'cliente_id',o.cliente_id,'tipo',v.tipo_servico,'valor',case when o.situacao='approved' then coalesce((select total_aprovado_centavos from public.aprovacoes_orcamento a where a.oficina_id=p_oficina and a.versao_orcamento_id=v.id and a.decisao='approved'),v.total_centavos) else v.total_centavos end)) from public.orcamentos o left join public.versoes_orcamento v on v.id=o.versao_atual_id where o.oficina_id=p_oficina and o.arquivado_em is null and o.criado_em >= p_inicio::timestamp at time zone 'America/Sao_Paulo' and o.criado_em < (p_fim+1)::timestamp at time zone 'America/Sao_Paulo'),'[]'),
 'titulos',coalesce((select jsonb_agg(jsonb_build_object('id',id,'os',ordem_servico_id,'nome',descricao,'categoria',categoria,'natureza',natureza,'data',competencia,'valor',valor_centavos,'comissao',comissao_id,'compra',compra_id,'vencimento',vencimento)) from titulos_selecionados),'[]'),
 'pagamentos',coalesce((select jsonb_agg(jsonb_build_object('forma',b.forma,'valor',case when b.estorno_de is null then b.valor_centavos else -b.valor_centavos end,'estorno',b.estorno_de is not null,'data',b.data)) from public.baixas_financeiras b join public.titulos_financeiros t on t.id=b.titulo_id where b.oficina_id=p_oficina and t.natureza='receber' and t.categoria<>'transferencia' and b.data between p_inicio and p_fim),'[]'),
 'produtos',coalesce((select jsonb_agg(jsonb_build_object('id',e.item_catalogo_id,'nome',c.descricao,'unidade',c.unidade,'codigo',e.codigo,'saldo',e.saldo,'minimo',e.minimo,'custo',e.custo_centavos,'fornecedor',e.fornecedor,'criado',c.criado_em,
 'ultima_movimentacao',(select max(m.criado_em) from public.movimentacoes_estoque m where m.oficina_id=p_oficina and m.item_catalogo_id=e.item_catalogo_id),
 'reservado',coalesce((select sum(i.quantidade) from public.itens_ordem_servico i join public.ordens_servico w on w.id=i.ordem_servico_id where i.oficina_id=p_oficina and coalesce(i.produto_estoque_id,i.item_catalogo_id)=e.item_catalogo_id and i.tipo='part' and coalesce(i.origem_peca,'estoque')='estoque' and i.situacao<>'cancelled' and i.removido_em is null and w.situacao not in ('delivered','cancelled') and w.arquivado_em is null),0))) from public.estoque_produtos e join public.itens_catalogo c on c.id=e.item_catalogo_id where e.oficina_id=p_oficina and c.arquivado_em is null),'[]'),
 'movimentos',coalesce((select jsonb_agg(jsonb_build_object('id',id,'produto',item_catalogo_id,'os',ordem_servico_id,'item',item_os_id,'tipo',tipo,'quantidade',quantidade,'custo',custo_centavos,'motivo',motivo,'data',criado_em,'estorno',estorno_de)) from public.movimentacoes_estoque where oficina_id=p_oficina and (ordem_servico_id in (select id from relevantes) or (criado_em >= p_inicio::timestamp at time zone 'America/Sao_Paulo' and criado_em < (p_fim+1)::timestamp at time zone 'America/Sao_Paulo'))),'[]'),
 'compras',coalesce((select jsonb_agg(jsonb_build_object('id',id,'fornecedor_id',fornecedor_id,'fornecedor',nome_fornecedor,'documento',documento,'data',data,'total',total_centavos)) from public.compras_estoque where oficina_id=p_oficina and cancelado_em is null and data between p_inicio and p_fim),'[]'),
 'agenda',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'inicio',a.inicio,'fim',a.fim,'recurso',a.recurso,'servico',a.servico,'cliente',c.nome,'identificacao',a.identificacao)) from public.agenda_atendimentos a left join public.clientes c on c.id=a.cliente_id where a.oficina_id=p_oficina and a.situacao<>'cancelado' and a.inicio>=least(p_inicio,(now() at time zone 'America/Sao_Paulo')::date)::timestamp at time zone 'America/Sao_Paulo' and a.inicio<(greatest(p_fim,(now() at time zone 'America/Sao_Paulo')::date+7)+1)::timestamp at time zone 'America/Sao_Paulo'),'[]'),
 'comissoes',coalesce((select jsonb_agg(jsonb_build_object('os',ordem_servico_id,'item',item_id,'valor',prevista_centavos,'liberada',liberada_centavos,'paga',pago_centavos,'profissional',case when equipe then profissional_id end)) from private.comissoes_calculadas where oficina_id=p_oficina and ordem_servico_id in (select id from relevantes)),'[]'),
 'profissionais',case when equipe then coalesce((select jsonb_agg(jsonb_build_object('id',id,'nome',nome)) from public.profissionais_comissao where oficina_id=p_oficina),'[]') else '[]'::jsonb end
 ) into r;return r;
end $function$;

-- Projeção compartilhada: as duas entradas públicas validam o acesso uma vez.
-- O relatório evita repetir consultas de permissão para cada linha do período.
create function private.detalhes_atendimento_json(a public.atendimentos_servicos,gerente boolean,equipe boolean)
returns jsonb language sql stable set search_path='' as $$ select jsonb_build_object('atendimento',to_jsonb(a),'cliente',(select jsonb_build_object('nome',nome,'telefone',telefone_e164) from public.clientes where id=a.cliente_id),'objeto',(select to_jsonb(o) from public.objetos_atendimento o where id=a.objeto_id),
 'itens',(select coalesce(jsonb_agg(case when gerente then to_jsonb(i) else to_jsonb(i)-'custo_centavos' end order by i.tipo,i.descricao,i.id),'[]') from public.itens_atendimento_servico i where atendimento_id=a.id),
 'comercial',case when gerente then coalesce((select to_jsonb(c) from public.comercial_atendimento c where atendimento_id=a.id),'{}')||jsonb_build_object('comissao_total_centavos',(select coalesce(sum(comissao_centavos),0) from public.equipe_atendimento where atendimento_id=a.id)) else jsonb_build_object('desconto_centavos',(select desconto_centavos from public.comercial_atendimento where atendimento_id=a.id)) end,
 'equipe',(select coalesce(jsonb_agg((case when equipe then to_jsonb(e) else to_jsonb(e)-'percentual'-'comissao_centavos'-'titulo_id' end || jsonb_build_object('nome',f.nome)) - case when gerente then 'campo_inexistente' else 'custo_hora_centavos' end order by f.nome),'[]') from public.equipe_atendimento e join public.funcionarios f on f.id=e.funcionario_id where atendimento_id=a.id),
 'horas',(select coalesce(jsonb_agg(to_jsonb(h) order by inicio desc),'[]') from public.horas_atendimento h where atendimento_id=a.id),
 'qualidade',case when gerente then (select coalesce(jsonb_agg(to_jsonb(q) order by aberto_em desc),'[]') from public.qualidade_atendimento q where atendimento_id=a.id) else '[]'::jsonb end,
 'eventos',(select coalesce(jsonb_agg(to_jsonb(x) order by id desc),'[]') from (select tipo,antes,depois,criado_em,id from public.eventos_atendimento where atendimento_id=a.id and (gerente or tipo in ('situacao','etapa')) order by id desc limit 100)x)) $$;
revoke all on function private.detalhes_atendimento_json(public.atendimentos_servicos,boolean,boolean) from public,anon,authenticated;
create or replace function public.consultar_detalhes_atendimento(p_oficina uuid,p_atendimento uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.atendimentos_servicos; gerente boolean; equipe boolean;
begin
 perform private.exigir_servicos(p_oficina);
 select * into a from public.atendimentos_servicos where oficina_id=p_oficina and id=p_atendimento;
 if not found then raise exception 'Atendimento indisponível.' using errcode='42501';end if;
 gerente:=exists(select 1 from public.membros_oficina where oficina_id=p_oficina and usuario_id=auth.uid() and ativo and perfil in ('owner','manager'));
 equipe:=gerente and private.has_feature(p_oficina,'employee_reports');
 return private.detalhes_atendimento_json(a,gerente,equipe);
end $$;


CREATE OR REPLACE FUNCTION public.consultar_relatorios_servicos(p_oficina uuid, p_inicio date, p_fim date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare detalhes jsonb; financeiro boolean; equipe boolean;
begin
 perform private.gerencia_servicos(p_oficina);
 if not private.has_feature(p_oficina,'reports') then raise exception 'Relatórios indisponíveis no plano.' using errcode='42501';end if;
 if p_inicio is null or p_fim is null or p_fim<p_inicio or p_fim-p_inicio>366 then raise exception 'Selecione um período de até 367 dias.' using errcode='22023';end if;
 financeiro:=private.has_feature(p_oficina,'finance'); equipe:=private.has_feature(p_oficina,'employee_reports');
 select coalesce(jsonb_agg(private.detalhes_atendimento_json(a,true,equipe) order by a.data_servico,a.numero),'[]') into detalhes
 from public.atendimentos_servicos a where a.oficina_id=p_oficina and a.data_servico between p_inicio and p_fim;
 return jsonb_build_object('agora',now(),'detalhes',detalhes,
 'abertos',(select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('funcionarios',(select coalesce(jsonb_agg(eq.funcionario_id),'[]') from public.equipe_atendimento eq where eq.atendimento_id=a.id)) order by data_servico),'[]') from public.atendimentos_servicos a where oficina_id=p_oficina and situacao not in ('concluido','cancelado')),
 'agenda',(select coalesce(jsonb_agg(to_jsonb(g)||jsonb_build_object('titulo',(select titulo from public.atendimentos_servicos where id=g.atendimento_id),'recurso',(select nome from public.recursos_agenda where id=g.recurso_id)) order by inicio),'[]') from public.agenda_servicos g where oficina_id=p_oficina and inicio>=now() and inicio<now()+interval '8 days' and situacao in ('agendado','confirmado')),
 'qualidade',(select coalesce(jsonb_agg(to_jsonb(q)||jsonb_build_object('titulo',a.titulo,'cliente',c.nome,'cliente_id',c.id,'subsetor',a.ficha_especialidade->>'especialidade') order by q.aberto_em desc),'[]') from public.qualidade_atendimento q join public.atendimentos_servicos a on a.id=q.atendimento_id join public.clientes c on c.id=a.cliente_id where q.oficina_id=p_oficina and q.aberto_em between p_inicio and p_fim),
 'titulos',case when financeiro then (select coalesce(jsonb_agg(to_jsonb(t)),'[]') from private.financeiro_saldos t where oficina_id=p_oficina and cancelado_em is null and (competencia between p_inicio and p_fim or aberto_centavos>0)) else '[]'::jsonb end,
 'baixas',case when financeiro then (select coalesce(jsonb_agg(to_jsonb(b)||jsonb_build_object('natureza',t.natureza,'categoria',t.categoria)),'[]') from public.baixas_financeiras b join public.titulos_financeiros t on t.id=b.titulo_id where b.oficina_id=p_oficina and b.data between p_inicio and p_fim) else '[]'::jsonb end,
 'devedores',case when financeiro then (select coalesce(jsonb_agg(jsonb_build_object('atendimento_id',a.id,'numero',a.numero,'titulo',a.titulo,'data_servico',a.data_servico,'cliente_id',a.cliente_id,'cliente',c.nome,'telefone',c.telefone_e164,'titulo_id',t.id,'total',t.valor_centavos,'pago',t.baixado_centavos,'saldo',t.aberto_centavos,'vencimento',t.vencimento) order by t.aberto_centavos desc),'[]') from public.cobrancas_atendimento ca join public.atendimentos_servicos a on a.id=ca.atendimento_id join public.clientes c on c.id=a.cliente_id join private.financeiro_saldos t on t.id=ca.titulo_id where ca.oficina_id=p_oficina and t.cancelado_em is null and t.aberto_centavos>0) else '[]'::jsonb end,
 'estoque',case when private.has_feature(p_oficina,'inventory') then (select coalesce(jsonb_agg(jsonb_build_object('id',e.item_catalogo_id,'descricao',c.descricao,'saldo',e.saldo,'minimo',e.minimo,'custo_centavos',e.custo_centavos,'fornecedor',e.fornecedor,'ultima_movimentacao',(select max(criado_em) from public.movimentacoes_estoque m where m.oficina_id=p_oficina and m.item_catalogo_id=e.item_catalogo_id),'consumido',(select coalesce(-sum(m.quantidade),0) from public.movimentacoes_estoque m where m.oficina_id=p_oficina and m.item_catalogo_id=e.item_catalogo_id and m.tipo='saida' and m.atendimento_id is not null and (m.criado_em at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim and not exists(select 1 from public.movimentacoes_estoque x where x.estorno_de=m.id)),'reservado',(select coalesce(sum(i.quantidade),0) from public.itens_atendimento_servico i join public.atendimentos_servicos a on a.id=i.atendimento_id where i.oficina_id=p_oficina and i.produto_id=e.item_catalogo_id and a.situacao in ('aprovado','em_execucao','aguardando')))),'[]') from public.estoque_produtos e join public.itens_catalogo c on c.id=e.item_catalogo_id where e.oficina_id=p_oficina and c.arquivado_em is null) else '[]'::jsonb end);
end $function$;
