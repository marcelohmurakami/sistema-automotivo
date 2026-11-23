begin;

-- Regras escolhidas pelo proprietário. Nenhuma comissão é atribuída retroativamente.
create table public.profissionais_comissao (
  id uuid primary key default gen_random_uuid(),
  oficina_id uuid not null references public.oficinas(id),
  nome text not null check (length(trim(nome)) between 2 and 160),
  usuario_id uuid,
  ativo boolean not null default true,
  tipo text not null check (tipo in ('percentual','fixo')),
  valor numeric(12,2) not null,
  liberacao text not null check (liberacao in ('entrega','recebimento')),
  revisao integer not null default 1,
  criado_em timestamptz not null default now(),
  unique(oficina_id,id),
  foreign key(oficina_id,usuario_id) references public.membros_oficina(oficina_id,usuario_id),
  check ((tipo='percentual' and valor between 0.01 and 100) or (tipo='fixo' and valor between 0.01 and 1000000))
);
create unique index profissional_comissao_usuario on public.profissionais_comissao(oficina_id,usuario_id) where usuario_id is not null;
create index profissional_comissao_oficina on public.profissionais_comissao(oficina_id,ativo,nome);

create table public.comissoes_servico (
  id uuid primary key default gen_random_uuid(), oficina_id uuid not null,
  ordem_servico_id uuid not null, item_id uuid not null, profissional_id uuid not null,
  nome_profissional text not null, tipo text not null check(tipo in ('percentual','fixo')),
  valor numeric(12,2) not null check(valor>0),
  liberacao text not null check(liberacao in ('entrega','recebimento')),
  regra_revisao integer not null, descricao_servico text not null,
  base_centavos bigint check(base_centavos>=0), quantidade numeric(12,3),
  total_centavos bigint check(total_centavos between 0 and 10000000000),
  congelada_em timestamptz, criado_em timestamptz not null default now(),
  unique(oficina_id,id), unique(oficina_id,item_id),
  foreign key(oficina_id,ordem_servico_id) references public.ordens_servico(oficina_id,id),
  foreign key(oficina_id,item_id) references public.itens_ordem_servico(oficina_id,id),
  foreign key(oficina_id,profissional_id) references public.profissionais_comissao(oficina_id,id)
);
create index comissoes_servico_os on public.comissoes_servico(oficina_id,ordem_servico_id);
create index comissoes_servico_profissional on public.comissoes_servico(oficina_id,profissional_id);
alter table public.titulos_financeiros add column comissao_id uuid,
  add constraint financeiro_comissao_fk foreign key(oficina_id,comissao_id) references public.comissoes_servico(oficina_id,id),
  add constraint financeiro_comissao_tipo check(comissao_id is null or (natureza='pagar' and categoria='pessoal' and not automatico and ordem_servico_id is not null));
create unique index financeiro_comissao_unica on public.titulos_financeiros(oficina_id,comissao_id) where comissao_id is not null;

alter table public.profissionais_comissao enable row level security;
alter table public.comissoes_servico enable row level security;
revoke all on public.profissionais_comissao,public.comissoes_servico from anon,authenticated;
-- Leitura e escrita passam pelas RPCs: isolamento por oficina, plano e perfil.

create function private.evento_comissao(p_oficina uuid,p_id uuid,p_acao text,p_dados jsonb) returns void
language plpgsql security definer set search_path='' as $$ begin
  insert into public.registros_auditoria(oficina_id,usuario_autor_id,tipo_autor,acao,tipo_entidade,entidade_id,correlacao_id)
  values(p_oficina,auth.uid(),'user',p_acao,'comissao',p_id,gen_random_uuid());
  insert into public.eventos_negocio(oficina_id,tipo_evento,tipo_agregado,agregado_id,versao_agregado,chave_deduplicacao,dados)
  values(p_oficina,'commission.'||p_acao,'commission',p_id,1,gen_random_uuid()::text,p_dados);
end $$;

-- Rateio do desconto geral, com os centavos distribuídos pela ordem dos itens.
-- Inclui peças no rateio; somente mão de obra pode gerar comissão.
create view private.bases_comissao_itens as
select x.*,case when soma>0 then
  (round(acumulado*least(total_os,soma)::numeric/soma)-round((acumulado-total_item_centavos)*least(total_os,soma)::numeric/soma))::bigint
  else 0::bigint end base_calculada
from (
  select i.*,w.total_centavos total_os,
    sum(i.total_item_centavos) over(partition by i.ordem_servico_id) soma,
    sum(i.total_item_centavos) over(partition by i.ordem_servico_id order by i.posicao,i.id rows unbounded preceding) acumulado
  from public.itens_ordem_servico i join public.ordens_servico w on w.id=i.ordem_servico_id and w.oficina_id=i.oficina_id
  where i.situacao<>'cancelled'
) x;

create view private.comissoes_calculadas as
with valores as (
  select c.*,w.numero numero_os,w.situacao situacao_os,w.dados_cliente->>'nome' cliente,
    w.entregue_em,w.total_centavos total_os,
    coalesce(c.base_centavos,b.base_calculada,0)::bigint base_atual_centavos,
    case when w.situacao='cancelled' or i.situacao='cancelled' then 0
      else coalesce(c.total_centavos,case when c.tipo='percentual' then round(coalesce(b.base_calculada,0)*c.valor/100)
      else round(i.quantidade*c.valor*100) end) end::bigint prevista_centavos,
    coalesce(rec.baixado_centavos,0)::bigint recebido_centavos,
    t.id titulo_id,coalesce(t.baixado_centavos,0)::bigint pago_centavos,
    coalesce((w.entregue_em at time zone 'America/Sao_Paulo')::date,(w.criado_em at time zone 'America/Sao_Paulo')::date) competencia
  from public.comissoes_servico c
  join public.ordens_servico w on w.id=c.ordem_servico_id and w.oficina_id=c.oficina_id
  join public.itens_ordem_servico i on i.id=c.item_id and i.oficina_id=c.oficina_id
  left join private.bases_comissao_itens b on b.id=c.item_id
  left join private.financeiro_saldos rec on rec.oficina_id=c.oficina_id and rec.ordem_servico_id=c.ordem_servico_id and rec.automatico and rec.cancelado_em is null
  left join public.titulos_financeiros tf on tf.oficina_id=c.oficina_id and tf.comissao_id=c.id
  left join private.financeiro_saldos t on t.id=tf.id
), liberadas as (
  select *,case when situacao_os<>'delivered' or congelada_em is null then 0
    when liberacao='entrega' then prevista_centavos
    when total_os>0 then floor(prevista_centavos::numeric*least(greatest(recebido_centavos,0),total_os)/total_os)::bigint
    else 0 end::bigint liberada_centavos from valores
)
select *,greatest(liberada_centavos-pago_centavos,0)::bigint disponivel_centavos,
  greatest(prevista_centavos-liberada_centavos,0)::bigint aguardando_centavos from liberadas;

create function public.salvar_profissional_comissao(p_oficina uuid,p_id uuid,p_dados jsonb,p_revisao integer default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid; anterior public.profissionais_comissao%rowtype; vinculo uuid; begin
  u:=private.exigir_financeiro(p_oficina);
  if not exists(select 1 from public.membros_oficina where oficina_id=p_oficina and usuario_id=u and ativo and perfil='owner') then
    raise exception 'Somente o proprietário pode definir as regras de comissão.' using errcode='42501'; end if;
  if p_id is null or p_dados is null or jsonb_typeof(p_dados)<>'object' then raise exception 'Informe o profissional e a regra.' using errcode='22023';end if;
  perform pg_advisory_xact_lock(hashtextextended('profissional-comissao:'||p_oficina||':'||p_id,0));
  select * into anterior from public.profissionais_comissao where id=p_id;
  if found and anterior.oficina_id<>p_oficina then raise exception 'Profissional não encontrado.' using errcode='P0002';end if;
  if anterior.id is not null and anterior.revisao is distinct from p_revisao then raise exception 'A regra foi alterada. Atualize antes de salvar.' using errcode='PT409';end if;
  vinculo:=nullif(p_dados->>'usuario_id','')::uuid;
  if vinculo is not null and vinculo is distinct from anterior.usuario_id and not exists(select 1 from public.membros_oficina where oficina_id=p_oficina and usuario_id=vinculo and ativo) then
    raise exception 'Escolha uma pessoa ativa desta oficina.' using errcode='22023';end if;
  if length(trim(coalesce(p_dados->>'nome',''))) not between 2 and 160 or coalesce(p_dados->>'tipo','') not in ('percentual','fixo')
    or coalesce(p_dados->>'liberacao','') not in ('entrega','recebimento') or (p_dados->>'valor')::numeric is null
    or not ((p_dados->>'tipo'='percentual' and (p_dados->>'valor')::numeric between 0.01 and 100) or (p_dados->>'tipo'='fixo' and (p_dados->>'valor')::numeric between 0.01 and 1000000))
    or (p_dados->>'valor')::numeric<>round((p_dados->>'valor')::numeric,2) then
    raise exception 'Informe nome, regra e valor válidos. O percentual deve ficar entre 0,01 e 100.' using errcode='22023';end if;
  insert into public.profissionais_comissao(id,oficina_id,nome,usuario_id,ativo,tipo,valor,liberacao)
    values(p_id,p_oficina,trim(p_dados->>'nome'),vinculo,coalesce((p_dados->>'ativo')::boolean,true),p_dados->>'tipo',(p_dados->>'valor')::numeric,p_dados->>'liberacao')
  on conflict(id) do update set nome=excluded.nome,usuario_id=excluded.usuario_id,ativo=excluded.ativo,tipo=excluded.tipo,valor=excluded.valor,liberacao=excluded.liberacao,revisao=profissionais_comissao.revisao+1;
  perform private.evento_comissao(p_oficina,p_id,'regra_salva',jsonb_build_object('antes',to_jsonb(anterior),'depois',p_dados));
  return p_id;
end $$;

create function public.definir_comissoes_os(p_oficina uuid,p_os uuid,p_revisao integer,p_atribuicoes jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare w public.ordens_servico%rowtype; d jsonb; i public.itens_ordem_servico%rowtype; p public.profissionais_comissao%rowtype;
  c public.comissoes_servico%rowtype; pid uuid; begin
  perform private.exigir_financeiro(p_oficina);
  select * into w from public.ordens_servico where id=p_os and oficina_id=p_oficina for update;
  if not found then raise exception 'OS não encontrada.' using errcode='P0002';end if;
  if w.revisao is distinct from p_revisao then raise exception 'A OS mudou. Atualize antes de salvar as comissões.' using errcode='PT409';end if;
  if w.situacao in ('delivered','cancelled') then raise exception 'Defina as comissões antes da entrega. O histórico da OS encerrada é preservado.' using errcode='22023';end if;
  if p_atribuicoes is null or jsonb_typeof(p_atribuicoes)<>'array' or jsonb_array_length(p_atribuicoes) not between 1 and 200 then raise exception 'Escolha os profissionais dos serviços.' using errcode='22023';end if;
  if (select count(*)<>count(distinct x->>'item_id') from jsonb_array_elements(p_atribuicoes) x) then raise exception 'Cada serviço deve aparecer apenas uma vez.' using errcode='22023';end if;
  for d in select * from jsonb_array_elements(p_atribuicoes) loop
    select * into i from public.itens_ordem_servico where oficina_id=p_oficina and ordem_servico_id=p_os and id=(d->>'item_id')::uuid;
    if not found or i.tipo<>'service' then raise exception 'Somente serviços desta OS podem receber comissão.' using errcode='22023';end if;
    pid:=nullif(d->>'profissional_id','')::uuid;
    select * into c from public.comissoes_servico where oficina_id=p_oficina and item_id=i.id;
    if pid is null then
      delete from public.comissoes_servico where oficina_id=p_oficina and item_id=i.id;
    elsif c.profissional_id is distinct from pid then
      select * into p from public.profissionais_comissao where oficina_id=p_oficina and id=pid and ativo for share;
      if not found or i.situacao='cancelled' then raise exception 'Escolha um profissional ativo e um serviço não cancelado.' using errcode='22023';end if;
      insert into public.comissoes_servico(oficina_id,ordem_servico_id,item_id,profissional_id,nome_profissional,tipo,valor,liberacao,regra_revisao,descricao_servico)
      values(p_oficina,p_os,i.id,p.id,p.nome,p.tipo,p.valor,p.liberacao,p.revisao,i.descricao)
      on conflict(oficina_id,item_id) do update set profissional_id=excluded.profissional_id,nome_profissional=excluded.nome_profissional,tipo=excluded.tipo,valor=excluded.valor,liberacao=excluded.liberacao,regra_revisao=excluded.regra_revisao,descricao_servico=excluded.descricao_servico;
    end if;
  end loop;
  perform private.evento_comissao(p_oficina,p_os,'atribuida',jsonb_build_object('atribuicoes',p_atribuicoes));
  -- O histórico operacional não expõe valores de comissão ao funcionário.
  perform private.evento_os(p_oficina,p_os,'Profissionais dos serviços definidos pela gerência.');
end $$;

create function private.gerar_comissoes_entrega() returns trigger language plpgsql security definer set search_path='' as $$
declare c record; t uuid; begin
  if new.situacao<>'delivered' or old.situacao='delivered' then return new;end if;
  perform pg_advisory_xact_lock(hashtextextended('financeiro-os:'||new.oficina_id||':'||new.id,0));
  for c in select * from private.comissoes_calculadas where oficina_id=new.oficina_id and ordem_servico_id=new.id loop
    update public.comissoes_servico set base_centavos=c.base_atual_centavos,total_centavos=c.prevista_centavos,
      quantidade=(select quantidade from public.itens_ordem_servico where id=c.item_id),
      descricao_servico=(select descricao from public.itens_ordem_servico where id=c.item_id),congelada_em=new.entregue_em where id=c.id;
    if c.prevista_centavos>0 then
      insert into public.titulos_financeiros(oficina_id,natureza,descricao,categoria,valor_centavos,competencia,vencimento,pessoa,ordem_servico_id,comissao_id,criado_por)
      values(new.oficina_id,'pagar',left('Comissão · '||c.nome_profissional||' · OS #'||new.numero,200),'pessoal',c.prevista_centavos,
        (new.entregue_em at time zone 'America/Sao_Paulo')::date,(new.entregue_em at time zone 'America/Sao_Paulo')::date,c.nome_profissional,new.id,c.id,auth.uid())
      on conflict(oficina_id,comissao_id) where comissao_id is not null do nothing returning id into t;
      if t is not null then perform private.evento_comissao(new.oficina_id,c.id,'gerada',jsonb_build_object('titulo_id',t,'os',new.id,'valor_centavos',c.prevista_centavos));end if;
    end if;
  end loop;
  return new;
end $$;
create trigger zz_comissoes_entrega after update of situacao on public.ordens_servico for each row execute function private.gerar_comissoes_entrega();

-- O título completo compõe o custo/lucro na entrega. A regra controla quanto pode ser pago.
create or replace view private.financeiro_saldos as
select t.id,t.oficina_id,t.natureza,t.descricao,t.categoria,t.valor_centavos,t.competencia,t.vencimento,t.pessoa,t.observacoes,t.transferencia_id,t.ordem_servico_id,t.automatico,t.custos_revisados,t.cancelado_em,t.motivo_cancelamento,t.revisao,t.criado_por,t.criado_em,
coalesce(b.baixado,0)::bigint as baixado_centavos,(t.valor_centavos-coalesce(b.baixado,0))::bigint as aberto_centavos,t.compra_id,t.provisorio,t.pagamento_combinado,t.comissao_id
from public.titulos_financeiros t left join lateral(select sum(case when estorno_de is null then valor_centavos else -valor_centavos end) baixado from public.baixas_financeiras where titulo_id=t.id and oficina_id=t.oficina_id) b on true;

create function private.proteger_titulo_comissao() returns trigger language plpgsql security definer set search_path='' as $$ begin
  if old.comissao_id is not null and (new.comissao_id is distinct from old.comissao_id or new.valor_centavos<>old.valor_centavos or new.natureza<>old.natureza
    or new.categoria<>old.categoria or new.ordem_servico_id is distinct from old.ordem_servico_id or new.competencia<>old.competencia
    or new.cancelado_em is distinct from old.cancelado_em or new.pessoa<>old.pessoa) then
    raise exception 'Esta despesa pertence a uma comissão. Valores e vínculo são preservados; registre pagamentos ou estornos.' using errcode='22023';end if;
  return new;
end $$;
create trigger proteger_titulo_comissao before update on public.titulos_financeiros for each row execute function private.proteger_titulo_comissao();

-- Pagamentos e estornos da mesma OS usam a mesma trava antes de bloquear os títulos.
create function private.travar_financeiro_os(p_oficina uuid,p_titulo uuid) returns void language plpgsql security definer set search_path='' as $$
declare os uuid;begin
  select ordem_servico_id into os from public.titulos_financeiros where oficina_id=p_oficina and id=p_titulo;
  if os is not null then perform pg_advisory_xact_lock(hashtextextended('financeiro-os:'||p_oficina||':'||os,0));end if;
end $$;

create function private.travar_comissoes_os() returns trigger language plpgsql security definer set search_path='' as $$ begin
  perform pg_advisory_xact_lock(hashtextextended('financeiro-os:'||new.oficina_id||':'||new.id,0));
  return new;
end $$;
create trigger aa_comissoes_trava_financeiro before update of situacao,subtotal_centavos,desconto_centavos on public.ordens_servico for each row execute function private.travar_comissoes_os();

create function private.validar_baixa_comissao() returns trigger language plpgsql security definer set search_path='' as $$
declare t public.titulos_financeiros%rowtype; c record; recebido bigint; novo_recebido bigint; liberado_na_data bigint; begin
  select * into t from public.titulos_financeiros where id=new.titulo_id and oficina_id=new.oficina_id;
  if t.comissao_id is not null and new.estorno_de is null then
    select * into c from private.comissoes_calculadas where id=t.comissao_id;
    if new.valor_centavos>c.disponivel_centavos or new.data<(c.entregue_em at time zone 'America/Sao_Paulo')::date then
      raise exception 'Pagamento acima da comissão liberada ou anterior à entrega. Confira a regra e os recebimentos da OS.' using errcode='22023';end if;
    if c.liberacao='recebimento' then
      select coalesce(sum(case when b.estorno_de is null then b.valor_centavos else -b.valor_centavos end),0) into recebido
        from public.baixas_financeiras b join public.titulos_financeiros r on r.id=b.titulo_id
        where r.oficina_id=t.oficina_id and r.ordem_servico_id=t.ordem_servico_id and r.automatico and b.data<=new.data;
      liberado_na_data:=case when c.total_os>0 then floor(c.prevista_centavos::numeric*least(greatest(recebido,0),c.total_os)/c.total_os)::bigint else 0 end;
      if c.pago_centavos+new.valor_centavos>liberado_na_data then raise exception 'Na data informada, o cliente ainda não havia pago o suficiente para liberar esta comissão.' using errcode='22023';end if;
    end if;
  elsif t.automatico and new.estorno_de is not null then
    select baixado_centavos into recebido from private.financeiro_saldos where id=t.id;
    novo_recebido:=greatest(recebido-new.valor_centavos,0);
    if exists(select 1 from private.comissoes_calculadas x where x.oficina_id=t.oficina_id and x.ordem_servico_id=t.ordem_servico_id
      and x.liberacao='recebimento' and x.pago_centavos>case when x.total_os>0 then floor(x.prevista_centavos::numeric*least(novo_recebido,x.total_os)/x.total_os) else 0 end) then
      raise exception 'Estorne primeiro a comissão correspondente. Este recebimento já liberou uma comissão paga.' using errcode='22023';end if;
  end if;
  return new;
end $$;
create trigger validar_baixa_comissao before insert on public.baixas_financeiras for each row execute function private.validar_baixa_comissao();

create function public.consultar_comissoes(p_oficina uuid,p_inicio date,p_fim date,p_profissional uuid default null,p_os uuid default null,p_pagina integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare lista jsonb; resumo jsonb; profissionais jsonb; total bigint;begin
  perform private.exigir_financeiro(p_oficina);
  if p_inicio is null or p_fim is null or p_inicio>p_fim or p_fim-p_inicio>366 or p_pagina is null or p_pagina<0 or p_pagina>100000 then raise exception 'Selecione um período de até 367 dias.' using errcode='22023';end if;
  if p_os is not null and not exists(select 1 from public.ordens_servico where id=p_os and oficina_id=p_oficina) then raise exception 'OS não encontrada.' using errcode='P0002';end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.ativo desc,x.nome,x.id),'[]') into profissionais from public.profissionais_comissao x where oficina_id=p_oficina;
  select count(*),jsonb_build_object('prevista',coalesce(sum(prevista_centavos),0),'aguardando',coalesce(sum(aguardando_centavos),0),'disponivel',coalesce(sum(disponivel_centavos),0),'pago',coalesce(sum(pago_centavos),0)) into total,resumo
  from private.comissoes_calculadas where oficina_id=p_oficina and (p_os is null or ordem_servico_id=p_os) and (p_os is not null or competencia between p_inicio and p_fim) and (p_profissional is null or profissional_id=p_profissional);
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into lista from (select * from private.comissoes_calculadas where oficina_id=p_oficina
    and (p_os is null or ordem_servico_id=p_os) and (p_os is not null or competencia between p_inicio and p_fim) and (p_profissional is null or profissional_id=p_profissional)
    order by competencia desc,numero_os desc,criado_em,id limit (case when p_os is null then 50 else 200 end) offset p_pagina*50) x;
  return jsonb_build_object('profissionais',profissionais,'itens',lista,'resumo',resumo,'total',total);
end $$;

do $$ declare f record;begin
  for f in select p.oid::regprocedure assinatura,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where p.proname in ('evento_comissao','salvar_profissional_comissao','definir_comissoes_os','gerar_comissoes_entrega','proteger_titulo_comissao','travar_financeiro_os','travar_comissoes_os','validar_baixa_comissao','consultar_comissoes') and n.nspname in ('private','public') loop
    execute format('revoke all on function %s from public,anon,authenticated',f.assinatura);
    if f.nspname='public' then execute format('grant execute on function %s to authenticated',f.assinatura);end if;
  end loop;
end $$;

-- As funções existentes mantêm assinaturas, auditoria e validações. A trava é tomada
-- antes do FOR UPDATE original, evitando inversão entre recebimento e comissão.
do $$ declare d text;begin
  d:=pg_get_functiondef('public.baixar_titulo_financeiro(uuid,uuid,uuid,bigint,bigint,date,text,text,text)'::regprocedure);
  if position('u:=private.exigir_financeiro(p_oficina);' in d)=0 then raise exception 'Definição de pagamento inesperada; migração interrompida.';end if;
  d:=replace(d,'u:=private.exigir_financeiro(p_oficina);','u:=private.exigir_financeiro(p_oficina); perform private.travar_financeiro_os(p_oficina,p_titulo);');
  execute d;
  d:=pg_get_functiondef('public.estornar_baixa_financeira(uuid,uuid,date,text)'::regprocedure);
  if position('perform 1 from public.titulos_financeiros where id=b.titulo_id for update;' in d)=0 then raise exception 'Definição de estorno inesperada; migração interrompida.';end if;
  d:=replace(d,'perform 1 from public.titulos_financeiros where id=b.titulo_id for update;','perform private.travar_financeiro_os(p_oficina,b.titulo_id); perform 1 from public.titulos_financeiros where id=b.titulo_id for update;');
  execute d;
end $$;
notify pgrst,'reload schema';
commit;
