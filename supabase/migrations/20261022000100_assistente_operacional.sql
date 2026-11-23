begin;
-- O modelo só prepara propostas. A confirmação humana é outra RPC, transacional.
create table public.sessoes_assistente (
 id uuid primary key, oficina_id uuid not null references public.oficinas(id), usuario_id uuid not null references auth.users(id),
 versao integer not null default 0, atualizado_em timestamptz not null default now()
);
create table public.turnos_assistente (
 id uuid primary key, sessao_id uuid not null references public.sessoes_assistente(id), versao integer not null,
 criado_em timestamptz not null default now(), resposta jsonb, unique(sessao_id,versao)
);
create table public.propostas_assistente (
 id uuid primary key default gen_random_uuid(), sessao_id uuid not null references public.sessoes_assistente(id), versao integer not null,
 acao text not null, dados jsonb not null, resumo jsonb not null,
 situacao text not null default 'pendente' check(situacao in ('pendente','cancelada','concluida')),
 expira_em timestamptz not null default now()+interval '15 minutes', resultado jsonb, criado_em timestamptz not null default now(),
 unique(sessao_id,versao)
);
create index sessoes_assistente_usuario on public.sessoes_assistente(oficina_id,usuario_id);
create index turnos_assistente_cota on public.turnos_assistente(criado_em,sessao_id);
alter table public.sessoes_assistente enable row level security;
alter table public.turnos_assistente enable row level security;
alter table public.propostas_assistente enable row level security;
revoke all on public.sessoes_assistente,public.turnos_assistente,public.propostas_assistente from public,anon,authenticated;

create function private.exigir_assistente(p_oficina uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid; begin
 u:=private.require_staff(p_oficina);
 if not private.has_feature(p_oficina,'ai') then raise exception 'O assistente está disponível no plano com IA.' using errcode='42501';end if;
 return u;
end $$;
create function public.iniciar_turno_assistente(p_oficina uuid,p_sessao uuid,p_chave uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid;s public.sessoes_assistente;t public.turnos_assistente;begin
 u:=private.exigir_assistente(p_oficina);
 if p_sessao is null or p_chave is null then raise exception 'Conversa inválida.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('assistente:'||p_oficina::text,0));
 insert into public.sessoes_assistente(id,oficina_id,usuario_id) values(p_sessao,p_oficina,u) on conflict do nothing;
 select * into s from public.sessoes_assistente where id=p_sessao and oficina_id=p_oficina and usuario_id=u for update;
 if not found then raise exception 'Conversa indisponível.' using errcode='42501';end if;
 select * into t from public.turnos_assistente where id=p_chave;
 if found then
  if t.sessao_id<>s.id or t.versao<>s.versao then raise exception 'Pedido antigo. Inicie outro pedido.' using errcode='PT409';end if;
  if t.resposta is null then raise exception 'Pedido em processamento. Aguarde antes de repetir.' using errcode='PT409';end if;
  return jsonb_build_object('resposta',t.resposta);
 end if;
 if (select count(*) from public.turnos_assistente tt join public.sessoes_assistente ss on ss.id=tt.sessao_id where ss.oficina_id=p_oficina and tt.criado_em>now()-interval '1 day')>=120 then raise exception 'Limite diário de 120 pedidos do assistente atingido.' using errcode='22023';end if;
 update public.propostas_assistente set situacao='cancelada' where sessao_id=s.id and situacao='pendente';
 update public.sessoes_assistente set versao=versao+1,atualizado_em=now() where id=s.id returning * into s;
 insert into public.turnos_assistente(id,sessao_id,versao) values(p_chave,s.id,s.versao);
 return jsonb_build_object('versao',s.versao,'proposta_anterior',(select pp.resumo||jsonb_build_object('dados',pp.dados) from public.propostas_assistente pp where pp.sessao_id=s.id and pp.versao=s.versao-1),'empresa',(select jsonb_build_object('nome',nome,'ramo',ramo,'especialidade',especialidade) from public.oficinas where id=p_oficina));
end $$;
create function public.concluir_turno_assistente(p_oficina uuid,p_sessao uuid,p_chave uuid,p_resposta jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.exigir_assistente(p_oficina);
 if length(p_resposta::text)>150000 then raise exception 'Resposta excedeu o limite.' using errcode='22023';end if;
 update public.turnos_assistente t set resposta=p_resposta from public.sessoes_assistente s where s.id=t.sessao_id and s.id=p_sessao and s.oficina_id=p_oficina and s.usuario_id=auth.uid() and s.versao=t.versao and t.id=p_chave;
 if not found then raise exception 'A conversa mudou. Envie novamente seu pedido.' using errcode='PT409';end if;
end $$;
create function public.cancelar_proposta_assistente(p_oficina uuid,p_sessao uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.exigir_assistente(p_oficina);
 perform 1 from public.sessoes_assistente where id=p_sessao and oficina_id=p_oficina and usuario_id=auth.uid() for update;
 if not found then return;end if;
 update public.propostas_assistente set situacao='cancelada' where sessao_id=p_sessao and situacao='pendente';
 update public.sessoes_assistente set versao=versao+1,atualizado_em=now() where id=p_sessao;
end $$;

-- Contrato de leitura com projeções pequenas. Não dá ao modelo acesso SQL ou tabelas livres.
create function public.consultar_assistente(p_oficina uuid,p_tipo text,p_busca text default '',p_id uuid default null,p_cliente uuid default null,p_inicio date default null,p_fim date default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
<<consulta>>
declare r jsonb;auto boolean;inicio date:=coalesce(p_inicio,date_trunc('month',now() at time zone 'America/Sao_Paulo')::date);fim date:=coalesce(p_fim,(now() at time zone 'America/Sao_Paulo')::date);busca text:=private.padrao_busca(coalesce(p_busca,''));begin
 perform private.exigir_assistente(p_oficina);
 select ramo='automotivo' into auto from public.oficinas where id=p_oficina;
 if length(coalesce(p_busca,''))>200 or fim<inicio or fim>inicio+366 then raise exception 'Use uma busca curta e um período de até um ano.' using errcode='22023';end if;
 if p_tipo in ('clientes','catalogo') then
  r:=public.buscar_cadastros_operacao(p_oficina,p_tipo,coalesce(p_busca,''),p_cliente,p_id,'');
  -- Contato completo não é necessário para interpretar pedidos.
  if p_tipo='clientes' then select coalesce(jsonb_agg(x-'email'-'telefone_e164'),'[]') into r from jsonb_array_elements(r) x;end if;
 elsif p_tipo='objetos' then
  if auto then r:=public.buscar_cadastros_operacao(p_oficina,'veiculos',coalesce(p_busca,''),p_cliente,p_id,'');
  else select coalesce(jsonb_agg(x-'dados'-'oficina_id'),'[]') into r from jsonb_array_elements(public.buscar_selecao_servicos(p_oficina,'objetos',coalesce(p_busca,''),p_cliente,p_id)) x;end if;
 elsif p_tipo in ('servicos','parados') then
  if not private.has_feature(p_oficina,'work_orders') then raise exception 'Ordens de serviço indisponíveis no plano.' using errcode='42501';end if;
  if auto then
   select coalesce(jsonb_agg(to_jsonb(x)),'[]') into r from (
    select o.id,o.numero,o.cliente_id,o.veiculo_id objeto_id,o.revisao,o.situacao,o.dados_cliente->>'nome' cliente,o.dados_veiculo->>'modelo' identificacao,o.total_centavos,o.data_servico,
      (select string_agg(p.motivo||': '||coalesce(p.detalhes,''),'; ') from public.paradas_ordem_servico p where p.oficina_id=p_oficina and p.ordem_servico_id=o.id and p.encerrado_em is null) motivo
    from public.ordens_servico o where o.oficina_id=p_oficina and o.arquivado_em is null and (p_id is null or o.id=p_id) and (p_cliente is null or o.cliente_id=p_cliente)
    and private.texto_busca(o.numero::text||' '||coalesce(o.dados_cliente->>'nome','')||' '||coalesce(o.dados_veiculo->>'modelo','')) like busca
    and (p_tipo<>'parados' or exists(select 1 from public.paradas_ordem_servico p where p.oficina_id=p_oficina and p.ordem_servico_id=o.id and p.encerrado_em is null))
    order by o.criado_em desc,o.id limit 30
   ) x;
  else
   select coalesce(jsonb_agg(to_jsonb(x)),'[]') into r from (
    select a.id,a.numero,a.cliente_id,a.objeto_id,a.revisao,a.situacao,c.nome cliente,o.nome identificacao,a.titulo,a.valor_centavos total_centavos,a.data_servico,coalesce(a.dados->>'motivo_parada',a.dados->>'motivo_espera','') motivo
    from public.atendimentos_servicos a join public.clientes c on c.oficina_id=a.oficina_id and c.id=a.cliente_id join public.objetos_atendimento o on o.oficina_id=a.oficina_id and o.id=a.objeto_id
    where a.oficina_id=p_oficina and (p_id is null or a.id=p_id) and (p_cliente is null or a.cliente_id=p_cliente) and (p_tipo<>'parados' or a.situacao='aguardando')
    and private.texto_busca(a.numero::text||' '||a.titulo||' '||c.nome||' '||o.nome) like busca order by a.criado_em desc,a.id limit 30
   ) x;
  end if;
 elsif p_tipo='estoque' then
  if not private.has_feature(p_oficina,'inventory') then raise exception 'Estoque indisponível no plano.' using errcode='42501';end if;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into r from (
   select e.item_catalogo_id id,e.item_catalogo_id,c.descricao,e.codigo,e.saldo quantidade,e.minimo estoque_minimo,c.preco_padrao_centavos from public.estoque_produtos e join public.itens_catalogo c on c.oficina_id=e.oficina_id and c.id=e.item_catalogo_id
   where e.oficina_id=p_oficina and c.arquivado_em is null and (p_id is null or e.item_catalogo_id=p_id) and private.texto_busca(c.descricao||' '||coalesce(e.codigo,'')) like busca order by c.descricao,e.item_catalogo_id limit 30
  ) x;
 elsif p_tipo in ('contas','devedores','financeiro') then
  perform private.exigir_financeiro(p_oficina);
  if p_tipo='financeiro' then
   r:=jsonb_build_array(jsonb_build_object('inicio',inicio,'fim',fim,'base','Competência para receitas/despesas; data da baixa para dinheiro recebido. Contas canceladas, provisórias e transferências excluídas.',
    'receitas_centavos',(select coalesce(sum(t.valor_centavos),0) from public.titulos_financeiros t where t.oficina_id=p_oficina and t.natureza='receber' and t.categoria in ('servicos','outras_receitas') and t.cancelado_em is null and not t.provisorio and t.transferencia_id is null and t.competencia between consulta.inicio and consulta.fim),
    'despesas_centavos',(select coalesce(sum(t.valor_centavos),0) from public.titulos_financeiros t where t.oficina_id=p_oficina and t.natureza='pagar' and t.categoria not in ('transferencia','retirada','saldo_inicial') and t.cancelado_em is null and not t.provisorio and t.transferencia_id is null and t.competencia between consulta.inicio and consulta.fim),
    'recebido_centavos',(select coalesce(sum(case when b.estorno_de is null then b.valor_centavos else -b.valor_centavos end),0) from public.baixas_financeiras b join public.titulos_financeiros t on t.oficina_id=b.oficina_id and t.id=b.titulo_id where b.oficina_id=p_oficina and t.natureza='receber' and t.categoria in ('servicos','outras_receitas') and t.cancelado_em is null and not t.provisorio and t.transferencia_id is null and b.data between consulta.inicio and consulta.fim)));
  else
   with dividas as (
    select t.id,t.descricao,t.pessoa,t.vencimento,t.valor_centavos,t.baixado_centavos,t.aberto_centavos,t.revisao,
      coalesce(o.cliente_id,a.cliente_id) cliente_id,coalesce(o.id,a.id) servico_id,coalesce(o.numero,a.numero) numero,coalesce(o.data_servico,a.data_servico) data_servico,coalesce(o.dados_veiculo->>'modelo',a.titulo) identificacao,
      coalesce(c.nome,t.pessoa) cliente
    from private.financeiro_saldos t left join public.ordens_servico o on o.oficina_id=t.oficina_id and o.id=t.ordem_servico_id
    left join public.cobrancas_atendimento ca on ca.oficina_id=t.oficina_id and ca.titulo_id=t.id
    left join public.atendimentos_servicos a on a.oficina_id=ca.oficina_id and a.id=ca.atendimento_id
    left join public.clientes c on c.oficina_id=t.oficina_id and c.id=coalesce(o.cliente_id,a.cliente_id)
    where t.oficina_id=p_oficina and t.natureza='receber' and t.cancelado_em is null and not t.provisorio and t.transferencia_id is null and t.aberto_centavos>0
    and (p_id is null or t.id=p_id or o.id=p_id or a.id=p_id) and (p_cliente is null or coalesce(o.cliente_id,a.cliente_id)=p_cliente)
    and private.texto_busca(coalesce(c.nome,t.pessoa,'')||' '||t.descricao) like busca
   ), linhas as (
    select to_jsonb(d) valor,d.aberto_centavos ordem from dividas d where p_tipo='contas'
    union all
    select jsonb_build_object('cliente_id',cliente_id,'cliente',cliente,'aberto_centavos',sum(aberto_centavos),'titulos',count(*),'sem_cadastro',cliente_id is null),sum(aberto_centavos) from dividas where p_tipo='devedores' group by cliente_id,cliente,case when cliente_id is null then id end
   ) select coalesce(jsonb_agg(valor order by ordem desc),'[]') into r from (select * from linhas order by ordem desc limit 30) x;
  end if;
 elsif p_tipo='recursos' then
  if not private.has_feature(p_oficina,'work_orders') then raise exception 'Agenda indisponível no plano.' using errcode='42501';end if;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into r from (select id,nome from public.recursos_agenda where oficina_id=p_oficina and ativo and private.texto_busca(nome) like busca order by nome limit 30) x;
 elsif p_tipo='agenda' then
  if not private.has_feature(p_oficina,'work_orders') then raise exception 'Agenda indisponível no plano.' using errcode='42501';end if;
  if auto then
   select coalesce(jsonb_agg(to_jsonb(x)),'[]') into r from (select g.id,g.inicio,g.fim,g.servico,g.recurso,g.situacao,c.nome cliente from public.agenda_atendimentos g join public.clientes c on c.oficina_id=g.oficina_id and c.id=g.cliente_id where g.oficina_id=p_oficina and (g.inicio at time zone 'America/Sao_Paulo')::date between consulta.inicio and consulta.fim and g.situacao<>'cancelado' order by g.inicio limit 30) x;
  else
   select coalesce(jsonb_agg(to_jsonb(x)),'[]') into r from (select g.id,g.inicio,g.fim,g.visita,g.deslocamento_minutos,g.situacao,r.nome recurso,a.titulo,c.nome cliente from public.agenda_servicos g join public.recursos_agenda r on r.oficina_id=g.oficina_id and r.id=g.recurso_id join public.atendimentos_servicos a on a.oficina_id=g.oficina_id and a.id=g.atendimento_id join public.clientes c on c.oficina_id=a.oficina_id and c.id=a.cliente_id where g.oficina_id=p_oficina and (g.inicio at time zone 'America/Sao_Paulo')::date between consulta.inicio and consulta.fim and g.situacao<>'cancelado' order by g.inicio limit 30) x;
  end if;
 else raise exception 'Consulta não permitida.' using errcode='22023';end if;
 return jsonb_build_object('tipo',p_tipo,'linhas',r,'limite',30,'pode_haver_mais',jsonb_array_length(r)>=30,'consultado_em',now(),'inicio',inicio,'fim',fim);
end $$;

create function public.preparar_assistente(p_oficina uuid,p_sessao uuid,p_versao integer,p_acao text,p_dados jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 s public.sessoes_assistente; p public.propostas_assistente; c public.clientes; cat public.itens_catalogo; w public.ordens_servico; a public.atendimentos_servicos;
 auto boolean; especialidade text; d jsonb:='{}'; resumo jsonb; campos jsonb:='[]'; itens jsonb:='[]'; visuais jsonb:='[]'; precos jsonb:='[]'; x jsonb;
 alvo uuid;objeto uuid;cliente uuid;identificacao text;nome text;tipo text;descricao text;unidade text;preco bigint;quantidade integer;total bigint:=0;desconto bigint;rev integer;saldo bigint;
 forma text;vencimento date;entrega timestamptz;
begin
 perform private.exigir_assistente(p_oficina);
 select * into s from public.sessoes_assistente where id=p_sessao and oficina_id=p_oficina and usuario_id=auth.uid() for update;
 if not found or s.versao<>p_versao then raise exception 'A conversa mudou. Prepare novamente o pedido.' using errcode='PT409';end if;
 if jsonb_typeof(p_dados) is distinct from 'object' or length(p_dados::text)>25000 then raise exception 'Pedido inválido.' using errcode='22023';end if;
 select o.ramo='automotivo',o.especialidade into auto,especialidade from public.oficinas o where o.id=p_oficina;
 alvo:=nullif(p_dados->>'alvo_id','')::uuid;
 if alvo is not null then
  if not private.has_feature(p_oficina,'work_orders') then raise exception 'Ordens de serviço indisponíveis no plano.' using errcode='42501';end if;
  if auto then
   select * into w from public.ordens_servico where oficina_id=p_oficina and id=alvo and arquivado_em is null;
   if not found then raise exception 'OS indisponível nesta empresa.' using errcode='42501';end if;
   rev:=w.revisao;nome:='OS #'||w.numero||' · '||coalesce(w.dados_cliente->>'nome','');
  else
   select * into a from public.atendimentos_servicos where oficina_id=p_oficina and id=alvo;
   if not found then raise exception 'Atendimento indisponível nesta empresa.' using errcode='42501';end if;
   rev:=a.revisao;nome:='OS #'||a.numero||' · '||a.titulo;
  end if;
  campos:=campos||jsonb_build_array(jsonb_build_object('rotulo','Atendimento','valor',nome));
 end if;
 if p_acao='documento' then
  tipo:=p_dados->>'tipo';
  if tipo is null or tipo not in ('orcamento','ordem_servico','adicionar_itens') then raise exception 'Documento inválido.' using errcode='22023';end if;
  if auto then
   if not private.has_feature(p_oficina,case when tipo='orcamento' then 'quotes' else 'work_orders' end) then raise exception 'Documento indisponível no plano.' using errcode='42501';end if;
  else perform private.exigir_servicos(p_oficina,'work_orders');end if;
  if tipo='adicionar_itens' then
   if alvo is null or (auto and w.situacao in ('delivered','cancelled')) or (not auto and a.situacao in ('concluido','cancelado')) then raise exception 'Selecione uma OS aberta para incluir itens.' using errcode='22023';end if;
   if p_dados->>'forma_pagamento' is not null or p_dados->>'vencimento_pagamento' is not null or p_dados->>'entrega_prevista' is not null then raise exception 'A inclusão rápida altera apenas os itens. Ajuste prazo e condições na ficha da OS.' using errcode='22023';end if;
  else
   if alvo is not null then raise exception 'Para novo documento não informe uma OS existente.' using errcode='22023';end if;
   cliente:=nullif(p_dados->>'cliente_id','')::uuid;
   select * into c from public.clientes where oficina_id=p_oficina and id=cliente and arquivado_em is null;
   if not found then raise exception 'Selecione um cliente cadastrado desta empresa.' using errcode='22023';end if;
   objeto:=nullif(p_dados->>'objeto_id','')::uuid;identificacao:=trim(coalesce(p_dados->>'identificacao',''));
   if objeto is not null then
    if auto then
     select v.modelo into identificacao from public.veiculos v where v.oficina_id=p_oficina and v.id=objeto and v.arquivado_em is null and exists(select 1 from public.clientes_veiculos cv where cv.oficina_id=p_oficina and cv.cliente_id=cliente and cv.veiculo_id=v.id and cv.encerrado_em is null);
    else select o.nome into identificacao from public.objetos_atendimento o where o.oficina_id=p_oficina and o.id=objeto and o.cliente_id=cliente and not o.arquivado;end if;
    if not found then raise exception 'Selecione uma identificação pertencente a este cliente.' using errcode='22023';end if;
   end if;
   if length(coalesce(identificacao,'')) not between 2 and 100 or length(trim(coalesce(p_dados->>'titulo',''))) not between 3 and 180 then raise exception 'Informe a identificação e o serviço solicitado.' using errcode='22023';end if;
   if coalesce(p_dados->>'data','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Informe a data do serviço.' using errcode='22023';end if;
   perform (p_dados->>'data')::date;
   forma:=coalesce(p_dados->>'forma_pagamento','Carteira');vencimento:=(p_dados->>'vencimento_pagamento')::date;entrega:=(p_dados->>'entrega_prevista')::timestamptz;
   if forma not in ('Carteira','Pix','Cartão de débito','Cartão de crédito','Crédito parcelado','Cheque','Dinheiro') or (vencimento is not null and forma<>'Carteira') then raise exception 'Vencimento do pagamento é somente para Carteira.' using errcode='22023';end if;
   if entrega is not null and (not isfinite(entrega) or coalesce(p_dados->>'entrega_prevista','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$') then raise exception 'Informe dia, horário e fuso da previsão.' using errcode='22023';end if;
   campos:=campos||jsonb_build_array(jsonb_build_object('rotulo','Pagamento combinado','valor',forma||' · nenhum recebimento será registrado'),jsonb_build_object('rotulo','Vencimento','valor',to_char(vencimento,'DD/MM/YYYY')),jsonb_build_object('rotulo','Previsão (Brasília)','valor',to_char(entrega at time zone 'America/Sao_Paulo','DD/MM/YYYY HH24:MI')));
   campos:=campos||jsonb_build_array(jsonb_build_object('rotulo','Cliente','valor',c.nome),jsonb_build_object('rotulo',case when auto then 'Veículo / peça' else 'Equipamento / local' end,'valor',identificacao),jsonb_build_object('rotulo','Data do serviço','valor',to_char((p_dados->>'data')::date,'DD/MM/YYYY')),jsonb_build_object('rotulo','Serviço','valor',p_dados->>'titulo'));
   if objeto is null then campos:=campos||jsonb_build_array(jsonb_build_object('rotulo','Cadastro','valor','A identificação informada será cadastrada para este cliente.'));end if;
  end if;
  if jsonb_typeof(p_dados->'itens') is distinct from 'array' or jsonb_array_length(p_dados->'itens') not between 1 and 30 then raise exception 'Inclua de 1 a 30 itens.' using errcode='22023';end if;
  for x in select value from jsonb_array_elements(p_dados->'itens') loop
   if coalesce(x->>'quantidade','') !~ '^[0-9]+$' then raise exception 'Use quantidades inteiras.' using errcode='22023';end if;
   quantidade:=(x->>'quantidade')::integer;
   if quantidade not between 1 and 100000 then raise exception 'Quantidade inválida.' using errcode='22023';end if;
   cat:=null;
   if nullif(x->>'catalogo_id','') is not null then
    if not private.has_feature(p_oficina,'catalog') then raise exception 'Catálogo indisponível.' using errcode='42501';end if;
    select * into cat from public.itens_catalogo where oficina_id=p_oficina and id=(x->>'catalogo_id')::uuid and arquivado_em is null;
    if not found then raise exception 'Item não encontrado no catálogo da empresa.' using errcode='22023';end if;
    descricao:=cat.descricao;preco:=cat.preco_padrao_centavos;unidade:=cat.unidade;
    precos:=precos||jsonb_build_array(jsonb_build_object('id',cat.id,'revisao',cat.revisao,'preco',preco));
   else
    descricao:=trim(x->>'descricao');preco:=(x->>'preco_centavos')::bigint;unidade:='un';
    if x->>'tipo' is null or x->>'tipo' not in ('service','part') then raise exception 'Tipo de item inválido.' using errcode='22023';end if;
   end if;
   if length(coalesce(descricao,'')) not between 1 and 300 or preco is null or preco not between 0 and 100000000 then raise exception 'Informe o preço real e a descrição do item avulso.' using errcode='22023';end if;
   total:=total+preco*quantidade;
   visuais:=visuais||jsonb_build_array(jsonb_build_object('descricao',descricao,'quantidade',quantidade,'preco_centavos',preco,'origem',case when cat.id is null then 'Preço informado' else 'Preço do catálogo' end));
   if auto then
    itens:=itens||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'item_catalogo_id',cat.id,'tipo',coalesce(cat.tipo,x->>'tipo'),'descricao',descricao,'unidade',unidade,'quantidade',quantidade,'preco_unitario_centavos',preco,'situacao','pending'));
   else
    itens:=itens||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'produto_id',case when exists(select 1 from public.estoque_produtos where oficina_id=p_oficina and item_catalogo_id=cat.id) then cat.id end,'tipo',case when coalesce(cat.tipo,x->>'tipo')='service' then 'servico' else 'material' end,'descricao',descricao,'unidade',unidade,'quantidade',quantidade,'preco_centavos',preco,'origem',case when exists(select 1 from public.estoque_produtos where oficina_id=p_oficina and item_catalogo_id=cat.id) then 'estoque' else 'externa' end,'custo_centavos',coalesce((select custo_centavos from public.estoque_produtos where oficina_id=p_oficina and item_catalogo_id=cat.id),0)));
   end if;
  end loop;
  desconto:=coalesce((p_dados->>'desconto_centavos')::bigint,0);
  if total>1000000000 or desconto<0 or desconto>total or (tipo='adicionar_itens' and desconto<>0) then raise exception 'Desconto ou total inválido. Inclusão de itens preserva o desconto existente.' using errcode='22023';end if;
  d:=jsonb_build_object('tipo',tipo,'alvo',alvo,'revisao',rev,'cliente',cliente,'objeto',objeto,'identificacao',identificacao,'titulo',p_dados->>'titulo','data',p_dados->>'data','observacao',coalesce(p_dados->>'observacao',''),'itens',itens,'desconto',desconto,'precos',precos,'forma',forma,'vencimento',vencimento,'entrega',entrega);
  if length(d->>'observacao')>2000 then raise exception 'Use até 2.000 caracteres na observação.' using errcode='22023';end if;
  campos:=campos||jsonb_build_array(jsonb_build_object('rotulo','Observações','valor',d->>'observacao'),jsonb_build_object('rotulo','Desconto (R$)','valor',to_char(desconto/100.0,'FM999999990.00')),jsonb_build_object('rotulo','Situação','valor',case when tipo='adicionar_itens' then 'Adicionar itens; preservar os já existentes.' when tipo='orcamento' then 'Orçamento aguardando aprovação; não autoriza execução.' else 'Recebido; não conclui, entrega ou recebe pagamento.' end));
  if auto and tipo='orcamento' then campos:=campos||jsonb_build_array(jsonb_build_object('rotulo','Validade','valor','7 dias após a confirmação'));end if;
  resumo:=jsonb_build_object('titulo',case tipo when 'orcamento' then 'Criar orçamento' when 'adicionar_itens' then 'Adicionar itens à OS' else 'Criar ordem de serviço' end,'campos',campos,'itens',visuais,'total_centavos',total-desconto);
 elsif p_acao='recebimento' then
  perform private.exigir_financeiro(p_oficina);
  select fs.revisao,fs.aberto_centavos,fs.descricao into rev,saldo,nome from private.financeiro_saldos fs where fs.oficina_id=p_oficina and fs.id=(p_dados->>'titulo_id')::uuid and fs.natureza='receber' and fs.cancelado_em is null and not fs.provisorio;
  if not found then raise exception 'Conta a receber indisponível.' using errcode='22023';end if;
  preco:=(p_dados->>'valor_centavos')::bigint;desconto:=(p_dados->>'taxa_centavos')::bigint;
  if preco is null or preco<=0 or preco>saldo or desconto is null or desconto<0 or desconto>=preco or coalesce(p_dados->>'forma','') not in ('pix','dinheiro','debito','credito','boleto','transferencia','outro') or coalesce(p_dados->>'conta','') not in ('caixa','banco') or (p_dados->>'data')::date>(now() at time zone 'America/Sao_Paulo')::date or (p_dados->>'data') is null then raise exception 'Confira o valor recebido, a taxa, a forma, a conta e a data.' using errcode='22023';end if;
  if p_dados->>'vencimento_restante' is not null then
   if preco=saldo then raise exception 'Pagamento integral não tem vencimento restante.' using errcode='22023';end if;
   perform (p_dados->>'vencimento_restante')::date;
  end if;
  d:=jsonb_build_object('titulo_id',p_dados->>'titulo_id','revisao',rev,'saldo',saldo,'valor',preco,'taxa',desconto,'forma',p_dados->>'forma','conta',p_dados->>'conta','data',p_dados->>'data','vencimento',p_dados->>'vencimento_restante','observacao',left(coalesce(p_dados->>'observacao',''),1000));
  resumo:=jsonb_build_object('titulo','Registrar pagamento recebido','total_centavos',preco,'campos',jsonb_build_array(jsonb_build_object('rotulo','Conta a receber','valor',nome),jsonb_build_object('rotulo','Forma / destino','valor',(d->>'forma')||' · '||(d->>'conta')),jsonb_build_object('rotulo','Data','valor',to_char((d->>'data')::date,'DD/MM/YYYY')),jsonb_build_object('rotulo','Taxa (R$)','valor',to_char(desconto/100.0,'FM999999990.00')),jsonb_build_object('rotulo','Restante (R$)','valor',to_char((saldo-preco)/100.0,'FM999999990.00')),jsonb_build_object('rotulo','Vencimento restante','valor',coalesce(d->>'vencimento','Mantido'))));
 elsif p_acao='agendamento' then
  if not private.has_feature(p_oficina,'work_orders') then raise exception 'Agenda indisponível no plano.' using errcode='42501';end if;
  if coalesce(p_dados->>'inicio','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' or not isfinite((p_dados->>'inicio')::timestamptz) or (p_dados->>'fim' is not null and (coalesce(p_dados->>'fim','') !~ '(Z|[+-][0-9]{2}:[0-9]{2})$' or (p_dados->>'fim')::timestamptz<=(p_dados->>'inicio')::timestamptz)) then raise exception 'Informe dia e horário válidos, com fuso.' using errcode='22023';end if;
  if auto then
   select * into c from public.clientes where oficina_id=p_oficina and id=(p_dados->>'cliente_id')::uuid and arquivado_em is null;
   if not found or length(trim(coalesce(p_dados->>'recurso','')))<2 then raise exception 'Informe cliente e box ou responsável.' using errcode='22023';end if;
   if coalesce((p_dados->>'visita')::boolean,false) then raise exception 'Visitas com deslocamento estão disponíveis na agenda de assistência, manutenção e limpeza.' using errcode='22023';end if;
   nome:=c.nome;identificacao:=p_dados->>'recurso';
  else
   select r.nome into identificacao from public.recursos_agenda r where r.oficina_id=p_oficina and r.id=(p_dados->>'recurso_id')::uuid and r.ativo;
   if not found or alvo is null or p_dados->>'fim' is null then raise exception 'Selecione atendimento, responsável e fim do agendamento.' using errcode='22023';end if;
  end if;
  quantidade:=coalesce((p_dados->>'deslocamento_minutos')::integer,0);
  if quantidade not between 0 and 720 or (quantidade>0 and not coalesce((p_dados->>'visita')::boolean,false)) then raise exception 'Confira o tempo de deslocamento da visita.' using errcode='22023';end if;
  d:=jsonb_build_object('cliente_id',c.id,'atendimento_id',alvo,'identificacao',left(p_dados->>'identificacao',160),'recurso_id',p_dados->>'recurso_id','recurso',identificacao,'inicio',p_dados->>'inicio','fim',p_dados->>'fim','visita',coalesce((p_dados->>'visita')::boolean,false),'deslocamento_minutos',quantidade,'servico',left(p_dados->>'descricao',300),'observacoes',left(p_dados->>'descricao',1000),'situacao','agendado');
  resumo:=jsonb_build_object('titulo','Agendar atendimento','campos',campos||jsonb_build_array(jsonb_build_object('rotulo','Cliente / atendimento','valor',nome),jsonb_build_object('rotulo','Responsável','valor',identificacao),jsonb_build_object('rotulo','Início (Brasília)','valor',to_char((d->>'inicio')::timestamptz at time zone 'America/Sao_Paulo','DD/MM/YYYY HH24:MI')),jsonb_build_object('rotulo','Fim (Brasília)','valor',coalesce(to_char((d->>'fim')::timestamptz at time zone 'America/Sao_Paulo','DD/MM/YYYY HH24:MI'),'Não informado')),jsonb_build_object('rotulo','Visita / deslocamento','valor',case when (d->>'visita')::boolean then 'Sim · '||quantidade||' minutos' else 'Não' end),jsonb_build_object('rotulo','Serviço','valor',d->>'servico')));
 elsif p_acao in ('anotacao','garantia') then
  if alvo is null then raise exception 'Selecione o atendimento.' using errcode='22023';end if;
  descricao:=trim(p_dados->>case when p_acao='anotacao' then 'texto' else 'descricao' end);
  if length(coalesce(descricao,'')) not between 3 and 2000 then raise exception 'Descreva em 3 a 2.000 caracteres.' using errcode='22023';end if;
  d:=jsonb_build_object('alvo',alvo,'revisao',rev,'texto',descricao);
  if p_acao='garantia' then
   if auto then perform private.exigir_gestao(p_oficina,'work_orders');else perform private.gerencia_servicos(p_oficina);end if;
   if coalesce(p_dados->>'motivo','') not in ('execucao','peca','diagnostico','prazo','atendimento','recorrencia','outro') or coalesce((p_dados->>'custo_centavos')::bigint,-1) not between 0 and 100000000 or coalesce((p_dados->>'minutos')::integer,-1) not between 0 and 100000 then raise exception 'Confira motivo, custo e tempo da ocorrência.' using errcode='22023';end if;
   d:=d||jsonb_build_object('motivo',p_dados->>'motivo','custo',p_dados->'custo_centavos','minutos',p_dados->'minutos');
   campos:=campos||jsonb_build_array(jsonb_build_object('rotulo','Motivo','valor',p_dados->>'motivo'),jsonb_build_object('rotulo','Custo informado (R$)','valor',to_char((d->>'custo')::numeric/100,'FM999999990.00')),jsonb_build_object('rotulo','Tempo de retrabalho','valor',(d->>'minutos')||' minutos'),jsonb_build_object('rotulo','Cobertura','valor','Em análise; sem reembolso ou aprovação automática.'));
  end if;
  resumo:=jsonb_build_object('titulo',case when p_acao='anotacao' then 'Acrescentar observação interna' else 'Registrar retorno em garantia' end,'campos',campos||jsonb_build_array(jsonb_build_object('rotulo','Descrição','valor',descricao)));
 else raise exception 'Ação não permitida.' using errcode='22023';end if;
 insert into public.propostas_assistente(sessao_id,versao,acao,dados,resumo) values(s.id,s.versao,p_acao,d,resumo) returning * into p;
 return p.resumo||jsonb_build_object('id',p.id,'acao',p.acao,'expira_em',p.expira_em);
exception when unique_violation then raise exception 'Já existe uma proposta neste pedido. Corrija-a em uma nova mensagem.' using errcode='22023';
end $$;

create function public.confirmar_assistente(p_oficina uuid,p_proposta uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.propostas_assistente;s public.sessoes_assistente;auto boolean;d jsonb;r jsonb;objeto uuid;id_novo uuid;rev integer;saldo bigint;x jsonb;atual jsonb;itens jsonb;url text;esp text;
begin
 perform private.exigir_assistente(p_oficina);
 select s1.* into s from public.sessoes_assistente s1 join public.propostas_assistente p1 on p1.sessao_id=s1.id where p1.id=p_proposta and s1.oficina_id=p_oficina and s1.usuario_id=auth.uid() for update of s1;
 if not found then raise exception 'Proposta indisponível.' using errcode='42501';end if;
 select * into p from public.propostas_assistente where id=p_proposta for update;
 if p.situacao='concluida' then return p.resultado;end if;
 if p.situacao<>'pendente' or p.versao<>s.versao or p.expira_em<now() then raise exception 'Este resumo expirou ou foi substituído. Prepare novamente.' using errcode='PT409';end if;
 select ramo='automotivo',especialidade into auto,esp from public.oficinas where id=p_oficina;
 d:=p.dados;id_novo:=p.id;
 if d->>'alvo' is not null then
  if auto then select revisao,to_jsonb(o) into rev,atual from public.ordens_servico o where oficina_id=p_oficina and id=(d->>'alvo')::uuid for update;
  else select revisao,to_jsonb(a) into rev,atual from public.atendimentos_servicos a where oficina_id=p_oficina and id=(d->>'alvo')::uuid for update;end if;
  if rev is distinct from (d->>'revisao')::integer then raise exception 'O atendimento mudou. Confira um novo resumo antes de salvar.' using errcode='PT409';end if;
 end if;
 if p.acao='documento' then
  for x in select value from jsonb_array_elements(d->'precos') loop
   perform 1 from public.itens_catalogo where oficina_id=p_oficina and id=(x->>'id')::uuid and revisao=(x->>'revisao')::integer and preco_padrao_centavos=(x->>'preco')::bigint and arquivado_em is null for share;
   if not found then raise exception 'Um preço ou item do catálogo mudou. Peça um novo resumo.' using errcode='PT409';end if;
  end loop;
  itens:=d->'itens';
  if d->>'tipo'='adicionar_itens' then
   if auto then
    select coalesce(jsonb_agg(to_jsonb(i) order by posicao),'[]')||itens into itens from public.itens_ordem_servico i where oficina_id=p_oficina and ordem_servico_id=(d->>'alvo')::uuid and removido_em is null;
    r:=public.salvar_os_com_itens(p_oficina,atual||jsonb_build_object('itens',itens),p.id,(d->>'alvo')::uuid,rev);
   else
    r:=public.consultar_detalhes_atendimento(p_oficina,(d->>'alvo')::uuid);
    perform public.salvar_itens_atendimento(p_oficina,(d->>'alvo')::uuid,rev,(r->'itens')||itens,coalesce((r->'comercial'->>'desconto_centavos')::bigint,0),coalesce((r->'comercial'->>'custo_extra_centavos')::bigint,0),coalesce(r->'comercial'->>'motivo_custo',''));
   end if;
   id_novo:=(d->>'alvo')::uuid;
  else
   objeto:=(d->>'objeto')::uuid;
   if objeto is null then
    if auto then objeto:=public.cadastrar_veiculo_orcamento(p_oficina,(d->>'cliente')::uuid,d->>'identificacao',null);
    else objeto:=gen_random_uuid();perform public.salvar_objeto_atendimento(p_oficina,objeto,jsonb_build_object('cliente_id',d->>'cliente','nome',d->>'identificacao','dados','{}'::jsonb,'arquivado',false),null);end if;
   end if;
   if auto then
    atual:=jsonb_build_object('cliente_id',d->>'cliente','veiculo_id',objeto,'itens',itens,'data_servico',d->>'data','observacoes',d->>'observacao','observacoes_internas',d->>'observacao','queixa_cliente',d->>'titulo','condicoes','','desconto_centavos',d->'desconto');
    atual:=atual||jsonb_build_object('forma_pagamento',d->>'forma','vencimento_pagamento',d->>'vencimento','entrega_prevista_em',d->>'entrega');
    if d->>'tipo'='orcamento' then
     if d->>'entrega' is not null then atual:=atual||jsonb_build_object('observacoes',concat_ws(E'\n',nullif(d->>'observacao',''),'Previsão combinada: '||to_char((d->>'entrega')::timestamptz at time zone 'America/Sao_Paulo','DD/MM/YYYY HH24:MI')));end if;
     r:=public.salvar_orcamento(p_oficina,atual,p.id,null,null);
     -- Emite pela mesma regra da tela; o link pode ser gerado ao abrir o registro.
     r:=public.emitir_orcamento(p_oficina,(r->>'id')::uuid,(r->>'revisao')::integer,7,encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex'));
    else r:=public.salvar_os_com_itens(p_oficina,atual,p.id,null,null);end if;
    id_novo:=(r->>'id')::uuid;
   else
    atual:=jsonb_build_object('cliente_id',d->>'cliente','objeto_id',objeto,'titulo',d->>'titulo','situacao','orcamento','vencimento',d->>'data','data_servico',d->>'data','dados',jsonb_build_object('documento',case when d->>'tipo'='orcamento' then 'orcamento' else 'ordem' end,'orcamento_enviado',case when d->>'tipo'='orcamento' then 'sim' else 'nao' end,'detalhes_especialidade',d->>'observacao','solicitacao',d->>'titulo'),'ficha_especialidade',jsonb_build_object('versao',1,'especialidade',esp,'campos','{}'::jsonb,'checklist','{}'::jsonb,'etapa',''));
    atual:=atual||jsonb_build_object('vencimento',coalesce(d->>'vencimento',d->>'data'),'dados',(atual->'dados')||jsonb_build_object('forma_pagamento',d->>'forma','detalhes_especialidade',concat_ws(E'\n',nullif(d->>'observacao',''),'Pagamento combinado: '||(d->>'forma'),case when d->>'entrega' is not null then 'Previsão combinada: '||to_char((d->>'entrega')::timestamptz at time zone 'America/Sao_Paulo','DD/MM/YYYY HH24:MI') end)));
    if d->>'entrega' is not null then atual:=jsonb_set(atual,'{ficha_especialidade,campos,prazo_servico}',to_jsonb(((d->>'entrega')::timestamptz at time zone 'America/Sao_Paulo')::date::text));end if;
    perform public.criar_atendimento_com_itens(p_oficina,p.id,atual,itens,(d->>'desconto')::bigint,null);
   end if;
  end if;
  url:=case when auto and d->>'tipo'='orcamento' then '/orcamentos?orcamento=' when auto then '/ordens-servico?os=' else '/atendimentos?atendimento=' end||id_novo;
 elsif p.acao='recebimento' then
  perform private.exigir_financeiro(p_oficina);
  perform 1 from public.titulos_financeiros where oficina_id=p_oficina and id=(d->>'titulo_id')::uuid for update;
  select revisao,aberto_centavos into rev,saldo from private.financeiro_saldos where oficina_id=p_oficina and id=(d->>'titulo_id')::uuid and natureza='receber' and cancelado_em is null;
  if rev is distinct from (d->>'revisao')::integer or saldo is distinct from (d->>'saldo')::bigint then raise exception 'O saldo mudou. Confira um novo resumo antes de receber.' using errcode='PT409';end if;
  if d->>'vencimento' is null then
   perform public.baixar_titulo_financeiro(p_oficina,(d->>'titulo_id')::uuid,p.id,(d->>'valor')::bigint,(d->>'taxa')::bigint,(d->>'data')::date,d->>'conta',d->>'forma',d->>'observacao');
  else perform public.baixar_titulo_com_restante(p_oficina,(d->>'titulo_id')::uuid,p.id,(d->>'valor')::bigint,(d->>'taxa')::bigint,(d->>'data')::date,d->>'conta',d->>'forma',(d->>'vencimento')::date,d->>'observacao');end if;
  url:='/financeiro?titulo='||(d->>'titulo_id');
 elsif p.acao='agendamento' then
  if auto then perform public.operar_produtividade(p_oficina,'salvar_agenda',d||jsonb_build_object('id',p.id));url:='/produtividade?agendamento='||p.id;
  else perform public.salvar_agenda_servico(p_oficina,p.id,d,null);url:='/agenda?reserva='||p.id;end if;
 elsif p.acao='anotacao' then
  if auto then perform public.registrar_anotacao_os(p_oficina,(d->>'alvo')::uuid,d->>'texto');
  else
   perform private.exigir_servicos(p_oficina,'work_orders');
   insert into public.eventos_atendimento(oficina_id,atendimento_id,tipo,depois,autor) values(p_oficina,(d->>'alvo')::uuid,'anotacao',d->>'texto',auth.uid());
   update public.atendimentos_servicos set revisao=revisao+1 where oficina_id=p_oficina and id=(d->>'alvo')::uuid;
  end if;
  url:=case when auto then '/ordens-servico?os=' else '/atendimentos?atendimento=' end||(d->>'alvo');
 elsif p.acao='garantia' then
  if auto then perform public.salvar_ocorrencia_qualidade(p_oficina,p.id,jsonb_build_object('ordem_original_id',d->>'alvo','tipo','garantia','motivo',d->>'motivo','descricao',d->>'texto','outros_custos_centavos',d->'custo','horas_retrabalho',(d->>'minutos')::numeric/60),null);
  else perform public.salvar_qualidade_atendimento(p_oficina,(d->>'alvo')::uuid,p.id,jsonb_build_object('tipo','garantia','motivo',d->>'texto','aberto_em',(now() at time zone 'America/Sao_Paulo')::date,'custo_centavos',d->'custo','minutos',d->'minutos'),null);end if;
  url:='/garantias';
 else raise exception 'Ação não permitida.' using errcode='22023';end if;
 r:=jsonb_build_object('id',id_novo,'destino',url,'mensagem',case p.acao when 'documento' then 'Documento salvo.' when 'recebimento' then 'Pagamento registrado.' when 'agendamento' then 'Agendamento salvo.' when 'anotacao' then 'Observação registrada.' else 'Ocorrência registrada.' end);
 update public.propostas_assistente set situacao='concluida',resultado=r where id=p.id;
 return r;
end $$;

revoke all on function private.exigir_assistente(uuid) from public,anon,authenticated;
revoke all on function public.iniciar_turno_assistente(uuid,uuid,uuid),public.concluir_turno_assistente(uuid,uuid,uuid,jsonb),public.cancelar_proposta_assistente(uuid,uuid),public.consultar_assistente(uuid,text,text,uuid,uuid,date,date),public.preparar_assistente(uuid,uuid,integer,text,jsonb),public.confirmar_assistente(uuid,uuid) from public,anon;
grant execute on function public.iniciar_turno_assistente(uuid,uuid,uuid),public.concluir_turno_assistente(uuid,uuid,uuid,jsonb),public.cancelar_proposta_assistente(uuid,uuid),public.consultar_assistente(uuid,text,text,uuid,uuid,date,date),public.preparar_assistente(uuid,uuid,integer,text,jsonb),public.confirmar_assistente(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
