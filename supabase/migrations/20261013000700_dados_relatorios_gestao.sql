begin;
-- Complementos gerenciais preservam os cadastros e os lançamentos originais.
create table public.complementos_gestao (
 oficina_id uuid not null references public.oficinas(id), entidade text not null check(entidade in ('oficina','os','produto','compra','despesa','profissional')),
 registro_id uuid not null, dados jsonb not null check(jsonb_typeof(dados)='object'), revisao integer not null default 1,
 atualizado_em timestamptz not null default now(), atualizado_por uuid references auth.users(id), primary key(oficina_id,entidade,registro_id)
);
alter table public.complementos_gestao enable row level security;
revoke all on public.complementos_gestao from public,anon,authenticated;
create table public.historico_complementos_gestao (
 id bigint generated always as identity primary key, oficina_id uuid not null, entidade text not null, registro_id uuid not null,
 antes jsonb, depois jsonb not null, autor uuid references auth.users(id), ocorrido_em timestamptz not null default now()
);
alter table public.historico_complementos_gestao enable row level security;
revoke all on public.historico_complementos_gestao from public,anon,authenticated;
create function public.salvar_complemento_gestao(p_oficina uuid,p_entidade text,p_id uuid,p_dados jsonb,p_revisao integer default 0)
returns void language plpgsql security definer set search_path='' as $$
declare a public.complementos_gestao%rowtype; d jsonb; u uuid; f uuid;begin
 u:=private.exigir_gestao(p_oficina,'reports');
 if p_id is null or jsonb_typeof(p_dados) is distinct from 'object' then raise exception 'Informe os dados.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('gestao:'||p_oficina||':'||p_entidade||':'||p_id,0));
 select * into a from public.complementos_gestao where oficina_id=p_oficina and entidade=p_entidade and registro_id=p_id;
 if coalesce(a.revisao,0) is distinct from p_revisao then raise exception 'Dados alterados. Atualize antes de salvar.' using errcode='PT409';end if;
 if p_entidade='oficina' and p_id=p_oficina then
  d:=jsonb_build_object('capacidade',(p_dados->>'capacidade')::integer,'abertura',p_dados->>'abertura','fechamento',p_dados->>'fechamento','dias',p_dados->'dias');
  if not coalesce((d->>'capacidade')::integer between 1 and 10000 and (d->>'abertura')::time<(d->>'fechamento')::time and jsonb_array_length(d->'dias') between 1 and 7,false)
   or exists(select 1 from jsonb_array_elements_text(d->'dias') v where v::int not between 0 and 6) then raise exception 'Informe capacidade, expediente e dias de trabalho válidos.' using errcode='22023';end if;
 elsif p_entidade='os' and exists(select 1 from public.ordens_servico where oficina_id=p_oficina and id=p_id) then
  f:=nullif(p_dados->>'funcionario_id','')::uuid;
  d:=jsonb_build_object('funcionario_id',f,'custos_conferidos',coalesce((p_dados->>'custos_conferidos')::boolean,false),'custo_externo_centavos',coalesce((p_dados->>'custo_externo_centavos')::bigint,0));
  if (d->>'custo_externo_centavos')::bigint not between 0 and 10000000000 then raise exception 'Custo inválido.' using errcode='22023';end if;
 elsif p_entidade='produto' and exists(select 1 from public.estoque_produtos where oficina_id=p_oficina and item_catalogo_id=p_id) then
  d:=jsonb_build_object('maximo',nullif(p_dados->>'maximo','')::numeric,'reposicao_dias',nullif(p_dados->>'reposicao_dias','')::integer,'fornecedor_id',nullif(p_dados->>'fornecedor_id','')::uuid);
  if (d->>'maximo')::numeric<0 or exists(select 1 from public.estoque_produtos where oficina_id=p_oficina and item_catalogo_id=p_id and minimo>(d->>'maximo')::numeric) or (d->>'reposicao_dias')::int not between 0 and 3650 or
   ((d->>'fornecedor_id') is not null and not exists(select 1 from public.fornecedores where oficina_id=p_oficina and id=(d->>'fornecedor_id')::uuid)) then raise exception 'Confira estoque máximo, prazo e fornecedor.' using errcode='22023';end if;
 elsif p_entidade='compra' and exists(select 1 from public.compras_estoque where oficina_id=p_oficina and id=p_id) then
  d:=jsonb_build_object('pedido_em',nullif(p_dados->>'pedido_em','')::date,'prevista_em',nullif(p_dados->>'prevista_em','')::date,'condicoes',left(coalesce(p_dados->>'condicoes',''),500));
  if (d->>'prevista_em')::date<(d->>'pedido_em')::date or exists(select 1 from public.compras_estoque where oficina_id=p_oficina and id=p_id and data<(d->>'pedido_em')::date) then raise exception 'Pedido deve anteceder a previsão e o recebimento.' using errcode='22023';end if;
 elsif p_entidade='despesa' and exists(select 1 from public.titulos_financeiros where oficina_id=p_oficina and id=p_id and natureza='pagar') then
  perform private.exigir_financeiro(p_oficina);
  if coalesce(p_dados->>'classificacao','') not in ('fixa','variavel','nao_classificada') then raise exception 'Escolha a classificação.' using errcode='22023';end if;
  d:=jsonb_build_object('classificacao',p_dados->>'classificacao');
 elsif p_entidade='profissional' and exists(select 1 from public.profissionais_comissao where oficina_id=p_oficina and id=p_id) then
  perform private.exigir_gestao(p_oficina,'employee_reports');
  f:=nullif(p_dados->>'funcionario_id','')::uuid;d:=jsonb_build_object('funcionario_id',f);
 else raise exception 'Registro indisponível.' using errcode='42501';end if;
 if f is not null and not exists(select 1 from public.funcionarios where oficina_id=p_oficina and id=f) then raise exception 'Funcionário indisponível.' using errcode='42501';end if;
 insert into public.complementos_gestao(oficina_id,entidade,registro_id,dados,atualizado_por) values(p_oficina,p_entidade,p_id,d,u)
 on conflict(oficina_id,entidade,registro_id) do update set dados=excluded.dados,revisao=complementos_gestao.revisao+1,atualizado_por=u,atualizado_em=now();
 insert into public.historico_complementos_gestao(oficina_id,entidade,registro_id,antes,depois,autor) values(p_oficina,p_entidade,p_id,a.dados,d,u);
end $$;

create function public.consultar_relatorios_gestao(p_oficina uuid,p_inicio date,p_fim date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare equipe boolean; r jsonb;begin
 perform private.exigir_gestao(p_oficina,'reports');perform private.exigir_financeiro(p_oficina);
 if p_inicio is null or p_fim is null or p_inicio>p_fim or p_fim-p_inicio>366 then raise exception 'Escolha um período de até 367 dias.' using errcode='22023';end if;
 equipe:=private.has_feature(p_oficina,'employee_reports');
 select jsonb_build_object(
 'agora',now(),'equipe_permitida',equipe,
 'complementos',coalesce((select jsonb_agg(to_jsonb(g)-'oficina_id'-'atualizado_por') from public.complementos_gestao g where oficina_id=p_oficina and (entidade<>'profissional' or equipe)),'[]'),
 'funcionarios',coalesce((select jsonb_agg(jsonb_build_object('id',id,'nome',nome,'ativo',ativo)) from public.funcionarios where oficina_id=p_oficina),'[]'),
 'fornecedores',coalesce((select jsonb_agg(jsonb_build_object('id',id,'nome',nome)) from public.fornecedores where oficina_id=p_oficina),'[]'),
 'ordens',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'numero',w.numero,'cliente_id',w.cliente_id,'cliente',w.dados_cliente->>'nome','veiculo',w.dados_veiculo->>'modelo',
 'tipo',w.tipo_servico,'situacao',w.situacao,'total',w.total_centavos,'entrada',w.recebido_em,'inicio',w.iniciado_em,'pronta',w.concluido_em,'entrega',w.entregue_em,'cancelamento',w.cancelado_em,'prazo',w.entrega_prevista_em,
 'orcado',coalesce((select total_aprovado_centavos from public.aprovacoes_orcamento a where a.oficina_id=p_oficina and a.versao_orcamento_id=v.id and a.decisao='approved'),v.total_centavos),'orcamento',w.orcamento_origem_id,'adicionais',coalesce((select sum(coalesce((select ap.total_aprovado_centavos from public.aprovacoes_orcamento ap where ap.oficina_id=p_oficina and ap.versao_orcamento_id=va.id and ap.decisao='approved'),va.total_centavos)) from public.complementos_ordem_servico c join public.versoes_orcamento va on va.id=c.versao_aplicada_id where c.oficina_id=p_oficina and c.ordem_servico_id=w.id),0),
 'mao_obra',coalesce((select round(sum(extract(epoch from (t.encerrado_em-t.iniciado_em))/3600*t.custo_hora_centavos)) from public.apontamentos_tempo t where t.oficina_id=p_oficina and t.ordem_servico_id=w.id and t.encerrado_em is not null),0)))
 from public.ordens_servico w left join public.versoes_orcamento v on v.id=w.versao_orcamento_origem_id where w.oficina_id=p_oficina and w.arquivado_em is null),'[]'),
 'itens',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'os',i.ordem_servico_id,'catalogo',i.item_catalogo_id,'produto',i.produto_estoque_id,'tipo',i.tipo,'nome',i.descricao,'quantidade',i.quantidade,'receita',i.base_calculada)) from private.bases_comissao_itens i join public.itens_ordem_servico real_item on real_item.id=i.id join public.ordens_servico w on w.id=i.ordem_servico_id where i.oficina_id=p_oficina and real_item.removido_em is null and w.arquivado_em is null),'[]'),
 'historico',coalesce((select jsonb_agg(jsonb_build_object('os',ordem_servico_id,'data',ocorrido_em,'de',metadados->>'old_status','para',metadados->>'new_status')) from public.historico_ordem_servico where oficina_id=p_oficina and metadados ? 'new_status'),'[]'),
 'paradas',coalesce((select jsonb_agg(jsonb_build_object('os',ordem_servico_id,'motivo',motivo,'inicio',iniciado_em,'fim',encerrado_em)) from public.paradas_ordem_servico where oficina_id=p_oficina),'[]'),
 'qualidade',coalesce((select jsonb_agg(to_jsonb(q)-'oficina_id'-'criado_por') from public.ocorrencias_qualidade q where oficina_id=p_oficina),'[]'),
 'orcamentos',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'numero',o.numero,'situacao',o.situacao,'data',o.criado_em,'cliente_id',o.cliente_id,'tipo',v.tipo_servico,'valor',case when o.situacao='approved' then coalesce((select total_aprovado_centavos from public.aprovacoes_orcamento a where a.oficina_id=p_oficina and a.versao_orcamento_id=v.id and a.decisao='approved'),v.total_centavos) else v.total_centavos end)) from public.orcamentos o left join public.versoes_orcamento v on v.id=o.versao_atual_id where o.oficina_id=p_oficina and o.arquivado_em is null),'[]'),
 'titulos',coalesce((select jsonb_agg(jsonb_build_object('id',id,'os',ordem_servico_id,'nome',descricao,'categoria',categoria,'natureza',natureza,'data',competencia,'valor',valor_centavos,'comissao',comissao_id,'compra',compra_id,'vencimento',vencimento)) from public.titulos_financeiros where oficina_id=p_oficina and cancelado_em is null),'[]'),
 'pagamentos',coalesce((select jsonb_agg(jsonb_build_object('forma',b.forma,'valor',case when b.estorno_de is null then b.valor_centavos else -b.valor_centavos end,'estorno',b.estorno_de is not null,'data',b.data)) from public.baixas_financeiras b join public.titulos_financeiros t on t.id=b.titulo_id where b.oficina_id=p_oficina and t.natureza='receber' and t.categoria<>'transferencia' and b.data between p_inicio and p_fim),'[]'),
 'produtos',coalesce((select jsonb_agg(jsonb_build_object('id',e.item_catalogo_id,'nome',c.descricao,'unidade',c.unidade,'codigo',e.codigo,'saldo',e.saldo,'minimo',e.minimo,'custo',e.custo_centavos,'fornecedor',e.fornecedor,'criado',c.criado_em,
 'reservado',coalesce((select sum(i.quantidade) from public.itens_ordem_servico i join public.ordens_servico w on w.id=i.ordem_servico_id where i.oficina_id=p_oficina and coalesce(i.produto_estoque_id,i.item_catalogo_id)=e.item_catalogo_id and i.tipo='part' and coalesce(i.origem_peca,'estoque')='estoque' and i.situacao<>'cancelled' and i.removido_em is null and w.situacao not in ('delivered','cancelled') and w.arquivado_em is null),0))) from public.estoque_produtos e join public.itens_catalogo c on c.id=e.item_catalogo_id where e.oficina_id=p_oficina and c.arquivado_em is null),'[]'),
 'movimentos',coalesce((select jsonb_agg(jsonb_build_object('id',id,'produto',item_catalogo_id,'os',ordem_servico_id,'item',item_os_id,'tipo',tipo,'quantidade',quantidade,'custo',custo_centavos,'motivo',motivo,'data',criado_em,'estorno',estorno_de)) from public.movimentacoes_estoque where oficina_id=p_oficina),'[]'),
 'compras',coalesce((select jsonb_agg(jsonb_build_object('id',id,'fornecedor_id',fornecedor_id,'fornecedor',nome_fornecedor,'documento',documento,'data',data,'total',total_centavos)) from public.compras_estoque where oficina_id=p_oficina and cancelado_em is null),'[]'),
 'agenda',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'inicio',a.inicio,'fim',a.fim,'recurso',a.recurso,'servico',a.servico,'cliente',c.nome,'identificacao',a.identificacao)) from public.agenda_atendimentos a left join public.clientes c on c.id=a.cliente_id where a.oficina_id=p_oficina and a.situacao<>'cancelado' and a.inicio>=least(p_inicio,(now() at time zone 'America/Sao_Paulo')::date)::timestamp at time zone 'America/Sao_Paulo' and a.inicio<(greatest(p_fim,(now() at time zone 'America/Sao_Paulo')::date+7)+1)::timestamp at time zone 'America/Sao_Paulo'),'[]'),
 'comissoes',coalesce((select jsonb_agg(jsonb_build_object('os',ordem_servico_id,'item',item_id,'valor',prevista_centavos,'liberada',liberada_centavos,'paga',pago_centavos,'profissional',case when equipe then profissional_id end)) from private.comissoes_calculadas where oficina_id=p_oficina),'[]'),
 'profissionais',case when equipe then coalesce((select jsonb_agg(jsonb_build_object('id',id,'nome',nome)) from public.profissionais_comissao where oficina_id=p_oficina),'[]') else '[]'::jsonb end
 ) into r;return r;
end $$;
revoke all on function public.salvar_complemento_gestao(uuid,text,uuid,jsonb,integer),public.consultar_relatorios_gestao(uuid,date,date) from public,anon,authenticated;
grant execute on function public.salvar_complemento_gestao(uuid,text,uuid,jsonb,integer),public.consultar_relatorios_gestao(uuid,date,date) to authenticated;
-- Retornos de clientes avulsos precisam preservar o nome e o telefone da OS original.
do $$declare s text;trecho text;begin
 select pg_get_functiondef('public.operar_produtividade(uuid,text,jsonb)'::regprocedure) into s;
 trecho:='jsonb_build_object(''cliente_id'',w.cliente_id,''veiculo_id'',w.veiculo_id,''queixa_cliente''';
 if position(trecho in s)=0 then raise exception 'Contrato da criação de retorno mudou.';end if;
 s:=replace(s,trecho,'jsonb_build_object(''cliente_id'',w.cliente_id,''veiculo_id'',w.veiculo_id,''cliente_nome_livre'',w.dados_cliente->>''nome'',''cliente_telefone_livre'',w.dados_cliente->>''telefone_e164'',''tipo_servico'',w.tipo_servico,''queixa_cliente''');
 execute s;
end $$;
notify pgrst,'reload schema';
commit;
