begin;
-- Separação de veículo/motor no assistente e preservação ao editar o orçamento.
-- Não altera permissões nem registros existentes.
create or replace function public.preparar_assistente(p_oficina uuid,p_sessao uuid,p_versao integer,p_acao text,p_dados jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 s public.sessoes_assistente; p public.propostas_assistente; c public.clientes; cat public.itens_catalogo; w public.ordens_servico; a public.atendimentos_servicos;
 auto boolean; especialidade text; d jsonb:='{}'; resumo jsonb; campos jsonb:='[]'; itens jsonb:='[]'; visuais jsonb:='[]'; precos jsonb:='[]'; x jsonb;
 alvo uuid;objeto uuid;cliente uuid;identificacao text;nome text;tipo text;descricao text;unidade text;preco bigint;quantidade integer;total bigint:=0;desconto bigint;rev integer;saldo bigint;
 forma text;vencimento date;entrega timestamptz;motor text;motor_sugerido boolean;
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
  motor:=nullif(trim(p_dados->>'motor'),'');motor_sugerido:=coalesce((p_dados->>'motor_sugerido')::boolean,false);
  if length(motor)>160 or (motor_sugerido and motor is null) then raise exception 'Confira a família do motor.' using errcode='22023';end if;
  if not auto and (motor is not null or motor_sugerido) then raise exception 'O campo motor do veículo é exclusivo do ramo automotivo.' using errcode='22023';end if;
  if tipo='adicionar_itens' and (motor is not null or motor_sugerido) then raise exception 'A inclusão de serviços não altera o motor da OS.' using errcode='22023';end if;
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
   campos:=campos||jsonb_build_array(jsonb_build_object('rotulo','Cliente','valor',c.nome),jsonb_build_object('rotulo',case when auto then 'Veículo / peça' else 'Equipamento / local' end,'valor',identificacao,'editar',case when auto then 'veiculo' else null end),jsonb_build_object('rotulo','Data do serviço','valor',to_char((p_dados->>'data')::date,'DD/MM/YYYY')),jsonb_build_object('rotulo','Serviço','valor',p_dados->>'titulo'));
   if auto then campos:=campos||jsonb_build_array(jsonb_build_object('rotulo',case when motor_sugerido then 'Motor (sugerido)' else 'Motor' end,'valor',coalesce(motor,'Não informado'),'editar','motor'));end if;
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
  d:=jsonb_build_object('tipo',tipo,'alvo',alvo,'revisao',rev,'cliente',cliente,'objeto',objeto,'identificacao',identificacao,'motor',motor,'motor_sugerido',motor_sugerido,'titulo',p_dados->>'titulo','data',p_dados->>'data','observacao',coalesce(p_dados->>'observacao',''),'itens',itens,'desconto',desconto,'precos',precos,'forma',forma,'vencimento',vencimento,'entrega',entrega);
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

create or replace function public.confirmar_assistente(p_oficina uuid,p_proposta uuid) returns jsonb language plpgsql security definer set search_path='' as $$
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
    if d->>'motor' is not null then atual:=atual||jsonb_build_object('motor',d->>'motor');end if;
    atual:=atual||jsonb_build_object('forma_pagamento',d->>'forma','vencimento_pagamento',d->>'vencimento','entrega_prevista_em',d->>'entrega');
    if d->>'tipo'='orcamento' then
     if d->>'entrega' is not null then atual:=atual||jsonb_build_object('observacoes',concat_ws(E'\n',nullif(d->>'observacao',''),'Previsão combinada: '||to_char((d->>'entrega')::timestamptz at time zone 'America/Sao_Paulo','DD/MM/YYYY HH24:MI')));end if;
     r:=public.salvar_orcamento(p_oficina,atual,p.id,null,null);
     -- Emite pela mesma regra da tela; o link pode ser gerado ao abrir o registro.
     r:=public.emitir_orcamento(p_oficina,(r->>'id')::uuid,(r->>'revisao')::integer,7,encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex'));
    else r:=public.salvar_os_com_itens(p_oficina,atual,p.id,null,null);end if;
    id_novo:=(r->>'id')::uuid;
    -- Motor é um campo da ficha do documento, separado do nome do veículo.
    -- Não altera o cadastro de um veículo existente nem informações de outra OS.
    if d->>'motor' is not null and d->>'tipo'<>'orcamento' then
      update public.ordens_servico set dados_veiculo=dados_veiculo||jsonb_build_object('motor',d->>'motor') where oficina_id=p_oficina and id=id_novo;
    end if;
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
 if p_dados ? 'motor' and (jsonb_typeof(p_dados->'motor') not in ('string','null') or length(coalesce(p_dados->>'motor',''))>160) then raise exception 'Informe um motor com até 160 caracteres.' using errcode='22023';end if;
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
 dados_cliente=jsonb_build_object('nome',c.nome,'telefone_e164',c.telefone_e164,'email',c.email),dados_veiculo=case when livre then jsonb_build_object('modelo',trim(p_dados->>'carro_livre'),'motor',trim(p_dados->>'motor_livre'),'especialidade','retifica') else jsonb_build_object('placa',carro.placa,'marca',carro.marca,'modelo',carro.modelo,'ano_modelo',carro.ano_modelo)||case when p_dados ? 'motor' then jsonb_build_object('motor',nullif(trim(p_dados->>'motor'),'')) when q.veiculo_id=carro.id and v.dados_veiculo ? 'motor' then jsonb_build_object('motor',v.dados_veiculo->>'motor') else '{}'::jsonb end end,
 observacoes=coalesce(p_dados->>'observacoes',''),condicoes=coalesce(p_dados->>'condicoes',''),subtotal_centavos=subtotal,desconto_centavos=desconto where id=v.id;
 update public.orcamentos set cliente_id=c.id,veiculo_id=carro.id,revisao=revisao+1,atualizado_em=now() where id=q.id returning * into q;
 perform private.evento_orcamento(p_oficina,q.id,q.revisao,case when novo then 'orcamento.criado' else 'orcamento.editado' end,u);
 return private.dados_orcamento(p_oficina,q.id);
exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'Confira os números e identificadores informados.' using errcode='22023';
end $function$;

create or replace function public.consultar_assistente(p_oficina uuid,p_tipo text,p_busca text default '',p_id uuid default null,p_cliente uuid default null,p_inicio date default null,p_fim date default null) returns jsonb
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
    select o.id,o.numero,o.cliente_id,o.veiculo_id objeto_id,o.revisao,o.situacao,o.dados_cliente->>'nome' cliente,o.dados_veiculo->>'modelo' identificacao,o.dados_veiculo->>'motor' motor,o.total_centavos,o.data_servico,
      (select string_agg(p.motivo||': '||coalesce(p.detalhes,''),'; ') from public.paradas_ordem_servico p where p.oficina_id=p_oficina and p.ordem_servico_id=o.id and p.encerrado_em is null) motivo
    from public.ordens_servico o where o.oficina_id=p_oficina and o.arquivado_em is null and (p_id is null or o.id=p_id) and (p_cliente is null or o.cliente_id=p_cliente)
    and private.texto_busca(o.numero::text||' '||coalesce(o.dados_cliente->>'nome','')||' '||coalesce(o.dados_veiculo->>'modelo','')) like busca
    and ((p_inicio is null and p_fim is null) or o.data_servico between consulta.inicio and consulta.fim)
    and (p_tipo<>'parados' or exists(select 1 from public.paradas_ordem_servico p where p.oficina_id=p_oficina and p.ordem_servico_id=o.id and p.encerrado_em is null))
    order by o.criado_em desc,o.id limit 30
   ) x;
  else
   select coalesce(jsonb_agg(to_jsonb(x)),'[]') into r from (
    select a.id,a.numero,a.cliente_id,a.objeto_id,a.revisao,a.situacao,c.nome cliente,o.nome identificacao,a.titulo,a.valor_centavos total_centavos,a.data_servico,coalesce(nullif(trim(a.ficha_especialidade->'campos'->>'pendencia'),''),
      nullif(nullif(trim(a.ficha_especialidade->'campos'->>'motivo_espera'),''),'Sem pendência'),
      nullif(trim(a.dados->>'motivo_parada'),''),nullif(trim(a.dados->>'motivo_espera'),''),
      case when a.situacao='orcamento' and coalesce(a.dados->>'orcamento_enviado','sim')<>'nao' then 'Aguardando aprovação do orçamento' end,'') motivo
    from public.atendimentos_servicos a join public.clientes c on c.oficina_id=a.oficina_id and c.id=a.cliente_id join public.objetos_atendimento o on o.oficina_id=a.oficina_id and o.id=a.objeto_id
    where a.oficina_id=p_oficina and (p_id is null or a.id=p_id) and (p_cliente is null or a.cliente_id=p_cliente) and (p_tipo<>'parados' or private.etapa_painel_assistencia(a.situacao,a.dados,a.ficha_especialidade) in ('parados','aprovacao'))
    and ((p_inicio is null and p_fim is null) or a.data_servico between consulta.inicio and consulta.fim)
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
 return jsonb_build_object('tipo',p_tipo,'linhas',r,'limite',30,'pode_haver_mais',jsonb_array_length(r)>=30,'consultado_em',now(),'inicio',case when p_tipo in ('financeiro','agenda') or (p_tipo in ('servicos','parados') and (p_inicio is not null or p_fim is not null)) then inicio end,
  'fim',case when p_tipo in ('financeiro','agenda') or (p_tipo in ('servicos','parados') and (p_inicio is not null or p_fim is not null)) then fim end,
  'base',case when p_tipo in ('servicos','parados') then case when p_inicio is not null or p_fim is not null then 'Data do serviço; situação atual.' else 'Situação atual, sem filtro por data.' end else null end);
end $$;
commit;
