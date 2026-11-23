begin;
alter table public.itens_pedido_compra add column creditado numeric(15,3) not null default 0 check(creditado>=0),add column sem_reposicao numeric(15,3) not null default 0 check(sem_reposicao>=0),add constraint pedido_resolucao_devolucao check(reposto+creditado+sem_reposicao<=devolvido);
create table public.devolucoes_fornecedor (
 id uuid primary key default gen_random_uuid(),oficina_id uuid not null references public.oficinas(id),fornecedor_id uuid not null,produto_id uuid not null,
 item_pedido_id uuid references public.itens_pedido_compra(id),recebimento_id uuid references public.recebimentos_pedido(id),saida_id uuid references public.movimentacoes_estoque(id),deposito_id uuid not null,
 quantidade numeric(15,3) not null check(quantidade>0),substituido numeric(15,3) not null default 0,creditado numeric(15,3) not null default 0,sem_reposicao numeric(15,3) not null default 0,
 credito_centavos bigint not null default 0 check(credito_centavos>=0),usado_centavos bigint not null default 0 check(usado_centavos between 0 and credito_centavos),custo_centavos bigint not null default 0,
 estado text not null default 'aberto' check(estado in ('aberto','enviado','analise','resolvido','encerrado')),
 motivo text not null check(length(trim(motivo)) between 3 and 1000),protocolo text not null default '' check(length(protocolo)<=160),prazo date,observacoes text not null default '' check(length(observacoes)<=2000),
 revisao integer not null default 1,criado_em timestamptz not null default now(),autor uuid,assinatura text,
 check(substituido>=0 and creditado>=0 and sem_reposicao>=0 and substituido+creditado+sem_reposicao<=quantidade),unique(recebimento_id,item_pedido_id),unique(oficina_id,id),
 foreign key(oficina_id,fornecedor_id) references public.fornecedores(oficina_id,id),foreign key(oficina_id,produto_id) references public.estoque_produtos(oficina_id,item_catalogo_id),foreign key(oficina_id,deposito_id) references public.depositos_estoque(oficina_id,id)
);
create index devolucoes_fornecedor_empresa on public.devolucoes_fornecedor(oficina_id,criado_em desc,id);
create index devolucoes_fornecedor_pedido on public.devolucoes_fornecedor(item_pedido_id,criado_em,id);
create table public.movimentos_credito_fornecedor (
 id uuid primary key,oficina_id uuid not null,devolucao_id uuid not null,titulo_id uuid not null,valor_centavos bigint not null check(valor_centavos>0),
 estorno_de uuid unique references public.movimentos_credito_fornecedor(id),criado_em timestamptz not null default now(),autor uuid not null,motivo text not null check(length(trim(motivo)) between 3 and 1000),
 foreign key(oficina_id,devolucao_id) references public.devolucoes_fornecedor(oficina_id,id),foreign key(oficina_id,titulo_id) references public.titulos_financeiros(oficina_id,id)
);
create index credito_fornecedor_titulo on public.movimentos_credito_fornecedor(titulo_id,estorno_de);
create trigger credito_fornecedor_imutavel before update or delete on public.movimentos_credito_fornecedor for each row execute function private.reject_mutation();
alter table public.titulos_financeiros add column credito_fornecedor_centavos bigint not null default 0 check(credito_fornecedor_centavos>=0);
alter table public.titulos_financeiros drop constraint titulos_financeiros_valor_centavos_check;
alter table public.titulos_financeiros add constraint titulos_valor_apos_credito check(valor_centavos between 0 and 10000000000 and valor_centavos+credito_fornecedor_centavos>0);
-- Preserva as colunas existentes e expõe o abatimento nos detalhes financeiros.
do $$declare s text;n text;begin
 s:=pg_get_viewdef('private.financeiro_saldos'::regclass,true);
 n:=replace(s,'t.valor_confirmado_em','t.valor_confirmado_em, t.credito_fornecedor_centavos');
 if n=s then raise exception 'Contrato da consulta financeira alterado.';end if;
 execute 'create or replace view private.financeiro_saldos as '||n;
end $$;

create function private.registrar_caso_devolucao() returns trigger language plpgsql security definer set search_path='' as $$
declare j jsonb;i public.itens_pedido_compra;p public.pedidos_compra;d public.devolucoes_fornecedor;q numeric;uso numeric;begin
 select * into p from public.pedidos_compra where id=new.pedido_id;
 if new.tipo='devolucao' then
  for j in select value from jsonb_array_elements(new.itens) loop
   q:=(j->>'quantidade')::numeric;if q<=0 then continue;end if;select * into i from public.itens_pedido_compra where id=(j->>'item_id')::uuid;
   insert into public.devolucoes_fornecedor(oficina_id,fornecedor_id,produto_id,item_pedido_id,recebimento_id,deposito_id,quantidade,motivo,custo_centavos,autor)
   values(new.oficina_id,p.fornecedor_id,i.produto_id,i.id,new.id,private.exigir_deposito(new.oficina_id,nullif(current_setting('patio.deposito',true),'')::uuid),q,new.motivo,(select custo_centavos from public.estoque_produtos where oficina_id=new.oficina_id and item_catalogo_id=i.produto_id),new.autor);
  end loop;
 elsif new.tipo='reposicao' then
  for j in select value from jsonb_array_elements(new.itens) loop
   q:=coalesce((j->>'quantidade')::numeric,0);
   for d in select * from public.devolucoes_fornecedor where item_pedido_id=(j->>'item_id')::uuid and quantidade>substituido+creditado+sem_reposicao order by criado_em,id for update loop
    uso:=least(q,d.quantidade-d.substituido-d.creditado-d.sem_reposicao);if uso<=0 then exit;end if;
    update public.devolucoes_fornecedor set substituido=substituido+uso,revisao=revisao+1,estado=case when substituido+uso+creditado+sem_reposicao=quantidade then 'resolvido' else estado end where id=d.id;
    insert into public.eventos_suprimentos(oficina_id,entidade,tipo,dados,autor) values(new.oficina_id,d.id,'reposicao',jsonb_build_object('quantidade',uso,'recebimento_id',new.id),new.autor);q:=q-uso;
   end loop;
   if q>0 then raise exception 'Reposição sem devolução pendente. Atualize o pedido.' using errcode='22023';end if;
  end loop;
 end if;return new;
end $$;
create trigger registrar_caso_devolucao after insert on public.recebimentos_pedido for each row execute function private.registrar_caso_devolucao();
-- Apenas os saldos ainda pendentes anteriores à migração passam a ter acompanhamento.
insert into public.devolucoes_fornecedor(oficina_id,fornecedor_id,produto_id,item_pedido_id,deposito_id,quantidade,motivo,custo_centavos)
select i.oficina_id,p.fornecedor_id,i.produto_id,i.id,private.deposito_padrao(i.oficina_id),i.devolvido-i.reposto,'Devolução pendente anterior ao acompanhamento',case when i.devolvido>0 then round(i.custo_devolvido_centavos/i.devolvido) else 0 end from public.itens_pedido_compra i join public.pedidos_compra p on p.id=i.pedido_id where i.devolvido>i.reposto;
do $$declare f text;n text;begin
 foreach n in array array['public.receber_pedido_compra(uuid,uuid,uuid,integer,text,date,date,text,jsonb,text)','public.consultar_pedidos_compra(uuid,text,integer,uuid)','public.sugerir_compras_estoque(uuid,text,integer,integer)'] loop
  f:=pg_get_functiondef(n::regprocedure);
  f:=replace(f,'i.quantidade-i.recebido+i.devolvido-i.reposto','i.quantidade-i.recebido+i.devolvido-i.reposto-i.creditado-i.sem_reposicao');
  f:=replace(f,'quantidade-recebido+devolvido-reposto>0','quantidade-recebido+devolvido-reposto-creditado-sem_reposicao>0');
  f:=replace(f,'then i.devolvido-i.reposto else','then i.devolvido-i.reposto-i.creditado-i.sem_reposicao else');execute f;
 end loop;
end $$;

create function public.abrir_devolucao_fornecedor(p_oficina uuid,p_id uuid,p_fornecedor uuid,p_produto uuid,p_deposito uuid,p_quantidade numeric,p_revisao integer,p_motivo text,p_unidades jsonb default null) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.devolucoes_fornecedor;e public.estoque_produtos;m uuid;sig text;begin
 perform private.gerencia_compras(p_oficina);perform pg_advisory_xact_lock(hashtextextended('devolucao:'||p_id,0));
 sig:=md5(jsonb_build_array(p_fornecedor,p_produto,p_deposito,p_quantidade,p_motivo,p_unidades)::text);select * into d from public.devolucoes_fornecedor where id=p_id;
 if found then if d.oficina_id<>p_oficina or d.assinatura<>sig then raise exception 'Devolução já registrada com outros dados.' using errcode='PT409';end if;return p_id;end if;
 if not exists(select 1 from public.fornecedores where oficina_id=p_oficina and id=p_fornecedor and arquivado_em is null) then raise exception 'Selecione o fornecedor desta devolução.' using errcode='22023';end if;
 select * into e from public.estoque_produtos where oficina_id=p_oficina and item_catalogo_id=p_produto for update;
 if e.rastreado and (jsonb_typeof(p_unidades) is distinct from 'array' or jsonb_array_length(p_unidades)<>p_quantidade) then raise exception 'Selecione cada unidade devolvida.' using errcode='22023';end if;
 m:=public.movimentar_estoque_deposito(p_oficina,p_produto,p_deposito,p_id,p_revisao,'saida',p_quantidade,p_motivo,p_unidades);
 insert into public.devolucoes_fornecedor(id,oficina_id,fornecedor_id,produto_id,saida_id,deposito_id,quantidade,motivo,custo_centavos,autor,assinatura)
 values(p_id,p_oficina,p_fornecedor,p_produto,m,private.exigir_deposito(p_oficina,p_deposito),p_quantidade,p_motivo,e.custo_centavos,auth.uid(),sig);
 insert into public.eventos_suprimentos(oficina_id,entidade,tipo,dados,autor) values(p_oficina,p_id,'devolucao_aberta',jsonb_build_object('quantidade',p_quantidade,'motivo',p_motivo,'movimento_id',m),auth.uid());return p_id;
end $$;

create function public.atualizar_devolucao_fornecedor(p_oficina uuid,p_id uuid,p_revisao integer,p_acao text,p_dados jsonb) returns void language plpgsql security definer set search_path='' as $$
declare d public.devolucoes_fornecedor;q numeric;v bigint;obs text;begin
 perform private.gerencia_compras(p_oficina);
 -- Mesma ordem de travas do recebimento: pedido, produto e acompanhamento.
 perform 1 from public.pedidos_compra where id=(select i.pedido_id from public.itens_pedido_compra i join public.devolucoes_fornecedor x on x.item_pedido_id=i.id where x.id=p_id and x.oficina_id=p_oficina) for update;
 select * into d from public.devolucoes_fornecedor where oficina_id=p_oficina and id=p_id for update;
 if not found or d.revisao is distinct from p_revisao or d.estado='encerrado' then raise exception 'Devolução alterada ou encerrada. Atualize a tela.' using errcode='PT409';end if;
 obs:=coalesce(p_dados->>'observacoes','');if length(obs)>2000 then raise exception 'Use até 2.000 caracteres.' using errcode='22023';end if;
 if p_acao='acompanhar' then
  if p_dados->>'estado' is null or p_dados->>'estado' not in ('aberto','enviado','analise') or d.quantidade=d.substituido+d.creditado+d.sem_reposicao then raise exception 'Situação inválida para esta devolução.' using errcode='22023';end if;
  update public.devolucoes_fornecedor set estado=p_dados->>'estado',protocolo=coalesce(p_dados->>'protocolo',''),prazo=nullif(p_dados->>'prazo','')::date,observacoes=obs,revisao=revisao+1 where id=p_id;
 elsif p_acao in ('credito','sem_reposicao') then
  q:=(p_dados->>'quantidade')::numeric;v:=coalesce((p_dados->>'credito_centavos')::bigint,0);
  if q is null or q<=0 or q<>round(q,3) or q>d.quantidade-d.substituido-d.creditado-d.sem_reposicao or length(trim(obs))<3 or (p_acao='credito' and v not between 1 and 10000000000) then raise exception 'Confira quantidade pendente, valor e justificativa da decisão.' using errcode='22023';end if;
  if exists(select 1 from public.itens_catalogo where id=d.produto_id and lower(unidade) in ('un','unid','peca','peça')) and q<>trunc(q) then raise exception 'Use quantidade inteira.' using errcode='22023';end if;
  update public.devolucoes_fornecedor set creditado=creditado+case when p_acao='credito' then q else 0 end,sem_reposicao=sem_reposicao+case when p_acao='sem_reposicao' then q else 0 end,credito_centavos=credito_centavos+case when p_acao='credito' then v else 0 end,observacoes=obs,estado=case when substituido+creditado+sem_reposicao+q=quantidade then 'resolvido' else estado end,revisao=revisao+1 where id=p_id;
  update public.itens_pedido_compra set creditado=creditado+case when p_acao='credito' then q else 0 end,sem_reposicao=sem_reposicao+case when p_acao='sem_reposicao' then q else 0 end where id=d.item_pedido_id;
  update public.pedidos_compra set revisao=revisao+1 where id=(select pedido_id from public.itens_pedido_compra where id=d.item_pedido_id);
 elsif p_acao='encerrar' then
  if d.quantidade<>d.substituido+d.creditado+d.sem_reposicao or length(trim(obs))<3 then raise exception 'Resolva todas as unidades e registre a conclusão antes de encerrar.' using errcode='22023';end if;
  update public.devolucoes_fornecedor set estado='encerrado',observacoes=obs,revisao=revisao+1 where id=p_id;
 else raise exception 'Ação inválida.' using errcode='22023';end if;
 insert into public.eventos_suprimentos(oficina_id,entidade,tipo,dados,autor) values(p_oficina,p_id,p_acao,p_dados,auth.uid());
end $$;

create function public.repor_devolucao_fornecedor(p_oficina uuid,p_id uuid,p_revisao integer,p_chave uuid,p_deposito uuid,p_quantidade numeric,p_unidades jsonb default null) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.devolucoes_fornecedor;e public.estoque_produtos;m uuid;anterior text:=current_setting('patio.deposito',true);sig text;ev public.eventos_suprimentos;begin
 perform private.gerencia_compras(p_oficina);perform pg_advisory_xact_lock(hashtextextended('reposicao:'||p_chave,0));
 sig:=md5(jsonb_build_array(p_id,p_deposito,p_quantidade,p_unidades)::text);
 select * into ev from public.eventos_suprimentos where oficina_id=p_oficina and entidade=p_id and tipo='reposicao_avulsa' and dados->>'chave'=p_chave::text;
 if found then if ev.dados->>'assinatura'<>sig then raise exception 'Reposição já registrada com outros dados.' using errcode='PT409';end if;return (ev.dados->>'movimento_id')::uuid;end if;
 select * into e from public.estoque_produtos where oficina_id=p_oficina and item_catalogo_id=(select produto_id from public.devolucoes_fornecedor where oficina_id=p_oficina and id=p_id) for update;
 select * into d from public.devolucoes_fornecedor where oficina_id=p_oficina and id=p_id for update;
 if not found or d.revisao is distinct from p_revisao or d.item_pedido_id is not null or d.estado='encerrado' then raise exception 'Devolução alterada. Para uma devolução de pedido, receba a reposição no próprio pedido.' using errcode='PT409';end if;
 if p_quantidade is null or p_quantidade<=0 or p_quantidade<>round(p_quantidade,3) or p_quantidade>d.quantidade-d.substituido-d.creditado-d.sem_reposicao then raise exception 'Quantidade maior que a pendência.' using errcode='22023';end if;
 if exists(select 1 from public.itens_catalogo where id=d.produto_id and lower(unidade) in ('un','unid','peca','peça')) and p_quantidade<>trunc(p_quantidade) then raise exception 'Use quantidade inteira.' using errcode='22023';end if;
 if e.rastreado and (jsonb_typeof(p_unidades) is distinct from 'array' or jsonb_array_length(p_unidades)<>p_quantidade) then raise exception 'Informe a série de cada unidade recebida.' using errcode='22023';end if;
 perform set_config('patio.deposito',private.exigir_deposito(p_oficina,p_deposito)::text,true);
 update public.estoque_produtos set saldo=saldo+p_quantidade,custo_centavos=round((saldo*custo_centavos+p_quantidade*d.custo_centavos)/(saldo+p_quantidade)),revisao=revisao+1 where oficina_id=p_oficina and item_catalogo_id=d.produto_id;
 insert into public.movimentacoes_estoque(oficina_id,item_catalogo_id,tipo,quantidade,saldo_apos,custo_centavos,motivo,chave,criado_por) values(p_oficina,d.produto_id,'entrada',p_quantidade,e.saldo+p_quantidade,d.custo_centavos,'Reposição do fornecedor sem nova cobrança',p_chave,auth.uid()) returning id into m;
 -- Séries novas ou as mesmas unidades devolvidas neste acompanhamento.
 if e.rastreado then
  perform set_config('patio.devolucao',p_id::text,true);perform private.inserir_unidades_compra(p_oficina,d.produto_id,m,p_unidades);perform set_config('patio.devolucao','',true);
 end if;
 perform set_config('patio.deposito',coalesce(anterior,''),true);
 update public.devolucoes_fornecedor set substituido=substituido+p_quantidade,estado=case when substituido+creditado+sem_reposicao+p_quantidade=quantidade then 'resolvido' else estado end,revisao=revisao+1 where id=p_id;
 insert into public.eventos_suprimentos(oficina_id,entidade,tipo,dados,autor) values(p_oficina,p_id,'reposicao_avulsa',jsonb_build_object('chave',p_chave,'assinatura',sig,'movimento_id',m,'quantidade',p_quantidade),auth.uid());return m;
end $$;
do $$declare f text;alvo text;begin
 f:=pg_get_functiondef('private.inserir_unidades_compra(uuid,uuid,uuid,jsonb)'::regprocedure);
 alvo:='or not exists(select 1 from public.movimentacoes_estoque entrada';
 if position(alvo in f)=0 then raise exception 'Contrato de reposição de séries alterado.';end if;
 f:=replace(f,alvo,'or not (exists(select 1 from public.devolucoes_fornecedor where id=nullif(current_setting(''patio.devolucao'',true),'''')::uuid and oficina_id=w and produto_id=p and saida_id=anterior.movimento_id) or exists(select 1 from public.movimentacoes_estoque entrada');
 f:=replace(f,'ent.pedido_id=dev.pedido_id) then','ent.pedido_id=dev.pedido_id)) then');execute f;
end $$;

create function public.aplicar_credito_fornecedor(p_oficina uuid,p_id uuid,p_devolucao uuid,p_titulo uuid,p_valor bigint,p_revisao integer,p_motivo text,p_estorno uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.devolucoes_fornecedor;t public.titulos_financeiros;orig public.movimentos_credito_fornecedor;ex public.movimentos_credito_fornecedor;begin
 perform private.gerencia_compras(p_oficina);perform pg_advisory_xact_lock(hashtextextended('credito:'||p_id,0));
 select * into ex from public.movimentos_credito_fornecedor where id=p_id;
 if found then if ex.oficina_id<>p_oficina or ex.devolucao_id<>p_devolucao or ex.titulo_id<>p_titulo or ex.valor_centavos<>p_valor or ex.estorno_de is distinct from p_estorno or ex.motivo<>p_motivo then raise exception 'Crédito já lançado com outros dados.' using errcode='PT409';end if;return p_id;end if;
 select * into d from public.devolucoes_fornecedor where oficina_id=p_oficina and id=p_devolucao for update;
 if not found or d.revisao is distinct from p_revisao then raise exception 'Crédito alterado. Atualize a tela.' using errcode='PT409';end if;
 select * into t from public.titulos_financeiros where oficina_id=p_oficina and id=p_titulo for update;
 if not found or t.cancelado_em is not null or not exists(select 1 from public.compras_estoque where id=t.compra_id and fornecedor_id=d.fornecedor_id and cancelado_em is null) then raise exception 'Escolha uma conta de compra do mesmo fornecedor.' using errcode='22023';end if;
 if p_valor is null or p_valor<=0 then raise exception 'Informe um valor positivo.' using errcode='22023';end if;
 if p_estorno is null then
  if p_valor>d.credito_centavos-d.usado_centavos or p_valor>(select aberto_centavos from private.financeiro_saldos where id=t.id) then raise exception 'O abatimento supera o crédito disponível ou o saldo da conta.' using errcode='22023';end if;
  update public.titulos_financeiros set valor_centavos=valor_centavos-p_valor,credito_fornecedor_centavos=credito_fornecedor_centavos+p_valor,revisao=revisao+1 where id=t.id;
  update public.devolucoes_fornecedor set usado_centavos=usado_centavos+p_valor,revisao=revisao+1 where id=d.id;
 else
  select * into orig from public.movimentos_credito_fornecedor where oficina_id=p_oficina and id=p_estorno and estorno_de is null;
  if not found or orig.devolucao_id<>p_devolucao or orig.titulo_id<>p_titulo or orig.valor_centavos<>p_valor or exists(select 1 from public.movimentos_credito_fornecedor where estorno_de=p_estorno) then raise exception 'Aplicação de crédito indisponível para estorno.' using errcode='22023';end if;
  update public.titulos_financeiros set valor_centavos=valor_centavos+p_valor,credito_fornecedor_centavos=credito_fornecedor_centavos-p_valor,revisao=revisao+1 where id=t.id;
  update public.devolucoes_fornecedor set usado_centavos=usado_centavos-p_valor,revisao=revisao+1 where id=d.id;
 end if;
 insert into public.movimentos_credito_fornecedor(id,oficina_id,devolucao_id,titulo_id,valor_centavos,estorno_de,autor,motivo) values(p_id,p_oficina,p_devolucao,p_titulo,p_valor,p_estorno,auth.uid(),p_motivo);
 insert into public.eventos_suprimentos(oficina_id,entidade,tipo,dados,autor) values(p_oficina,d.id,case when p_estorno is null then 'credito_aplicado' else 'credito_estornado' end,jsonb_build_object('id',p_id,'titulo_id',p_titulo,'valor_centavos',p_valor,'motivo',p_motivo),auth.uid());
 perform private.evento_financeiro(p_oficina,t.id,'Crédito do fornecedor: '||case when p_estorno is null then 'abatimento' else 'estorno' end);return p_id;
end $$;
create function private.proteger_credito_fornecedor() returns trigger language plpgsql set search_path='' as $$begin
 if new.cancelado_em is not null and old.cancelado_em is null and old.credito_fornecedor_centavos>0 then raise exception 'Estorne os créditos aplicados antes de cancelar esta conta.' using errcode='22023';end if;return new;
end $$;
create trigger proteger_credito_fornecedor before update on public.titulos_financeiros for each row execute function private.proteger_credito_fornecedor();
create function private.proteger_movimento_devolucao() returns trigger language plpgsql set search_path='' as $$begin
 if new.estorno_de is not null and (exists(select 1 from public.devolucoes_fornecedor where saida_id=new.estorno_de) or exists(select 1 from public.eventos_suprimentos where oficina_id=new.oficina_id and tipo='reposicao_avulsa' and dados->>'movimento_id'=new.estorno_de::text)) then raise exception 'Este movimento pertence a uma devolução ao fornecedor. Use o acompanhamento para resolver a pendência.' using errcode='22023';end if;return new;
end $$;
create trigger proteger_movimento_devolucao before insert on public.movimentacoes_estoque for each row execute function private.proteger_movimento_devolucao();
create function public.consultar_devolucoes_fornecedor(p_oficina uuid,p_busca text default '',p_pagina integer default 0,p_id uuid default null,p_situacao text default 'abertas') returns jsonb language plpgsql security definer set search_path='' as $$declare r jsonb;v public.devolucoes_fornecedor;begin
 perform private.gerencia_compras(p_oficina);if p_pagina is null or p_pagina not between 0 and 10000 then raise exception 'Página inválida.' using errcode='22023';end if;
 if p_id is not null then
  select * into v from public.devolucoes_fornecedor where oficina_id=p_oficina and id=p_id;if not found then raise exception 'Devolução indisponível.' using errcode='42501';end if;
  select to_jsonb(v)||jsonb_build_object('fornecedor',f.nome,'descricao',c.descricao,'unidade',c.unidade,'rastreado',e.rastreado,'pedido_id',i.pedido_id,'pendente',v.quantidade-v.substituido-v.creditado-v.sem_reposicao,'historico',(select coalesce(jsonb_agg(to_jsonb(x) order by id desc),'[]') from (select * from public.eventos_suprimentos where oficina_id=p_oficina and entidade=v.id order by id desc limit 30 offset p_pagina*30)x),'total_historico',(select count(*) from public.eventos_suprimentos where oficina_id=p_oficina and entidade=v.id),'aplicacoes',(select coalesce(jsonb_agg(to_jsonb(x) order by criado_em desc),'[]') from(select m.*,exists(select 1 from public.movimentos_credito_fornecedor z where z.estorno_de=m.id) estornado from public.movimentos_credito_fornecedor m where m.devolucao_id=v.id order by criado_em desc,id limit 30 offset p_pagina*30)x),'contas',(select coalesce(jsonb_agg(to_jsonb(x) order by vencimento,id),'[]') from(select t.id,t.descricao,t.vencimento,t.aberto_centavos,c.documento from private.financeiro_saldos t join public.compras_estoque c on c.id=t.compra_id where t.oficina_id=p_oficina and c.fornecedor_id=v.fornecedor_id and t.cancelado_em is null and t.aberto_centavos>0 order by t.vencimento,t.id limit 30 offset p_pagina*30)x),'total_contas',(select count(*) from private.financeiro_saldos t join public.compras_estoque c on c.id=t.compra_id where t.oficina_id=p_oficina and c.fornecedor_id=v.fornecedor_id and t.cancelado_em is null and t.aberto_centavos>0)) into r from public.fornecedores f,public.itens_catalogo c,public.estoque_produtos e left join public.itens_pedido_compra i on i.id=v.item_pedido_id where f.id=v.fornecedor_id and c.id=v.produto_id and e.oficina_id=p_oficina and e.item_catalogo_id=v.produto_id;return r;
 end if;
 with x as(select d.*,f.nome fornecedor,c.descricao,c.unidade,d.quantidade-d.substituido-d.creditado-d.sem_reposicao pendente from public.devolucoes_fornecedor d join public.fornecedores f on f.id=d.fornecedor_id join public.itens_catalogo c on c.id=d.produto_id where d.oficina_id=p_oficina and concat(f.nome,' ',c.descricao,' ',d.protocolo) ilike '%'||left(coalesce(p_busca,''),100)||'%' and (p_situacao='todas' or (p_situacao='credito' and d.credito_centavos>d.usado_centavos) or (p_situacao='abertas' and d.estado<>'encerrado')))
 select jsonb_build_object('total',(select count(*) from x),'itens',(select coalesce(jsonb_agg(to_jsonb(y) order by criado_em desc,id),'[]') from(select * from x order by criado_em desc,id limit 30 offset p_pagina*30)y)) into r;return r;
end $$;
do $$declare t text;f record;begin
 foreach t in array array['devolucoes_fornecedor','movimentos_credito_fornecedor'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);end loop;
 for f in select p.oid::regprocedure assinatura,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='public' and p.proname in ('abrir_devolucao_fornecedor','atualizar_devolucao_fornecedor','repor_devolucao_fornecedor','aplicar_credito_fornecedor','consultar_devolucoes_fornecedor')) or (n.nspname='private' and p.proname in ('registrar_caso_devolucao','proteger_credito_fornecedor','proteger_movimento_devolucao')) loop execute format('revoke all on function %s from public,anon,authenticated',f.assinatura);if f.nspname='public' then execute format('grant execute on function %s to authenticated',f.assinatura);end if;end loop;
end $$;
-- Uma compra abatida integralmente continua permitindo corrigir descrição e datas.
-- A exceção é restrita ao título existente, já zerado por crédito documentado.
do $$declare s text;begin
 s:=pg_get_functiondef('public.salvar_titulo_financeiro(uuid,uuid,jsonb,integer)'::regprocedure);
 if position('v not between 1 and 10000000000' in s)=0 then raise exception 'Validação financeira incompatível com a atualização de créditos.';end if;
 s:=replace(s,'v not between 1 and 10000000000','(v not between 1 and 10000000000 and not (v=0 and t.id is not null and t.compra_id is not null and t.valor_centavos=0 and t.credito_fornecedor_centavos>0))');
 if position('insert into public.titulos_financeiros(id,' in s)=0 then raise exception 'Gravação financeira incompatível com a atualização de créditos.';end if;
 s:=replace(s,'insert into public.titulos_financeiros(id,',$patch$
 if t.id is not null and t.valor_centavos=0 and t.credito_fornecedor_centavos>0 then
  update public.titulos_financeiros set descricao=trim(p_dados->>'descricao'),vencimento=(p_dados->>'vencimento')::date,pessoa=coalesce(p_dados->>'pessoa',''),observacoes=coalesce(p_dados->>'observacoes',''),revisao=revisao+1 where id=t.id;
  perform private.evento_financeiro(p_oficina,p_id,'saved');return p_id;
 end if;
 insert into public.titulos_financeiros(id,$patch$);
 execute s;
end $$;
notify pgrst,'reload schema';
commit;
