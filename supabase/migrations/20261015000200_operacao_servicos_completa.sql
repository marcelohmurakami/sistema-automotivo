begin;
alter table public.atendimentos_servicos add column numero bigint generated always as identity,
 add column data_servico date not null default ((now() at time zone 'America/Sao_Paulo')::date),
 add column concluido_em timestamptz;
update public.atendimentos_servicos set data_servico=(criado_em at time zone 'America/Sao_Paulo')::date,
 concluido_em=case when situacao='concluido' then criado_em end;
create table public.itens_atendimento_servico (
 id uuid primary key, oficina_id uuid not null, atendimento_id uuid not null,
 tipo text not null check(tipo in ('servico','material')), descricao text not null check(length(trim(descricao)) between 1 and 300),
 quantidade numeric(15,3) not null check(quantidade>0 and quantidade<=1000000), unidade text not null default 'un' check(length(unidade) between 1 and 12),
 preco_centavos bigint not null check(preco_centavos between 0 and 100000000), custo_centavos bigint not null check(custo_centavos between 0 and 100000000),
 produto_id uuid, origem text not null default 'externa' check(origem in ('estoque','externa','cliente')),
 unique(oficina_id,id), foreign key(oficina_id,atendimento_id) references public.atendimentos_servicos(oficina_id,id),
 foreign key(oficina_id,produto_id) references public.estoque_produtos(oficina_id,item_catalogo_id),
 check((origem='estoque' and tipo='material' and produto_id is not null) or (origem<>'estoque' and produto_id is null))
);
create index itens_atendimento_pai on public.itens_atendimento_servico(oficina_id,atendimento_id);
create table public.comercial_atendimento (
 oficina_id uuid not null, atendimento_id uuid primary key,
 desconto_centavos bigint not null default 0 check(desconto_centavos between 0 and 10000000000),
 custo_extra_centavos bigint not null default 0 check(custo_extra_centavos between 0 and 10000000000),
 orcado_centavos bigint, motivo_custo text not null default '' check(length(motivo_custo)<=1000),
 foreign key(oficina_id,atendimento_id) references public.atendimentos_servicos(oficina_id,id)
);
create table public.equipe_atendimento (
 id uuid primary key, oficina_id uuid not null, atendimento_id uuid not null, funcionario_id uuid not null,
 percentual numeric(6,2) not null default 0 check(percentual between 0 and 100), custo_hora_centavos bigint not null default 0 check(custo_hora_centavos between 0 and 100000000),
 comissao_centavos bigint not null default 0, titulo_id uuid,
 unique(atendimento_id,funcionario_id), foreign key(oficina_id,atendimento_id) references public.atendimentos_servicos(oficina_id,id),
 foreign key(oficina_id,funcionario_id) references public.funcionarios(oficina_id,id), foreign key(oficina_id,titulo_id) references public.titulos_financeiros(oficina_id,id)
);
create table public.horas_atendimento (
 id uuid primary key, oficina_id uuid not null, atendimento_id uuid not null, funcionario_id uuid not null,
 inicio timestamptz not null, fim timestamptz, descricao text not null default '' check(length(descricao)<=1000),
 check(fim is null or (fim>inicio and fim<=inicio+interval '24 hours')),
 foreign key(oficina_id,atendimento_id) references public.atendimentos_servicos(oficina_id,id),
 foreign key(oficina_id,funcionario_id) references public.funcionarios(oficina_id,id)
);
create unique index uma_hora_aberta on public.horas_atendimento(oficina_id,funcionario_id) where fim is null;
create index horas_atendimento_pai on public.horas_atendimento(oficina_id,atendimento_id);
create table public.qualidade_atendimento (
 id uuid primary key, oficina_id uuid not null, atendimento_id uuid not null, funcionario_id uuid,
 tipo text not null check(tipo in ('garantia','retrabalho','reclamacao')), motivo text not null check(length(trim(motivo)) between 3 and 2000),
 solucao text not null default '' check(length(solucao)<=3000), aberto_em date not null, resolvido_em date,
 custo_centavos bigint not null default 0 check(custo_centavos between 0 and 10000000000),
 minutos integer not null default 0 check(minutos between 0 and 1000000), nota integer check(nota between 1 and 5),
 revisao integer not null default 1, check(resolvido_em is null or resolvido_em>=aberto_em),
 foreign key(oficina_id,atendimento_id) references public.atendimentos_servicos(oficina_id,id),
 foreign key(oficina_id,funcionario_id) references public.funcionarios(oficina_id,id)
);
create index qualidade_atendimento_pai on public.qualidade_atendimento(oficina_id,atendimento_id);
create table public.eventos_atendimento (
 id bigint generated always as identity primary key, oficina_id uuid not null, atendimento_id uuid not null,
 tipo text not null, antes text, depois text, criado_em timestamptz not null default now(), autor uuid references auth.users(id),
 foreign key(oficina_id,atendimento_id) references public.atendimentos_servicos(oficina_id,id)
);
create index eventos_atendimento_pai on public.eventos_atendimento(oficina_id,atendimento_id,criado_em);
alter table public.movimentacoes_estoque add column atendimento_id uuid,
 add foreign key(oficina_id,atendimento_id) references public.atendimentos_servicos(oficina_id,id);
create table public.consumos_atendimento (
 id uuid primary key default gen_random_uuid(), oficina_id uuid not null, atendimento_id uuid not null, movimento_id uuid not null unique,
 estorno_id uuid unique, foreign key(oficina_id,atendimento_id) references public.atendimentos_servicos(oficina_id,id),
 foreign key(movimento_id) references public.movimentacoes_estoque(id), foreign key(estorno_id) references public.movimentacoes_estoque(id)
);
do $$ declare t text; begin
 foreach t in array array['itens_atendimento_servico','comercial_atendimento','equipe_atendimento','horas_atendimento','qualidade_atendimento','eventos_atendimento','consumos_atendimento'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 end loop;
end $$;
create trigger eventos_atendimento_imutaveis before update or delete on public.eventos_atendimento for each row execute function private.reject_mutation();

create function private.gerencia_servicos(p_oficina uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 perform private.exigir_servicos(p_oficina);
 perform private.exigir_cadastro_funcionarios(p_oficina);
end $$;
create function private.auditar_atendimento_completo() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if tg_op='INSERT' or new.situacao is distinct from old.situacao then
 insert into public.eventos_atendimento(oficina_id,atendimento_id,tipo,antes,depois,autor)
 values(new.oficina_id,new.id,'situacao',case when tg_op='UPDATE' then old.situacao end,new.situacao,auth.uid());
 end if;
 if tg_op='UPDATE' and new.ficha_especialidade->>'etapa' is distinct from old.ficha_especialidade->>'etapa' then
 insert into public.eventos_atendimento(oficina_id,atendimento_id,tipo,antes,depois,autor)
 values(new.oficina_id,new.id,'etapa',old.ficha_especialidade->>'etapa',new.ficha_especialidade->>'etapa',auth.uid());end if;
 return new;
end $$;
create trigger auditar_atendimento_completo after insert or update on public.atendimentos_servicos for each row execute function private.auditar_atendimento_completo();

create function private.concluir_materiais_servico(p_oficina uuid,p_atendimento uuid) returns void language plpgsql security definer set search_path='' as $$
declare i record; e public.estoque_produtos; m uuid; c public.comercial_atendimento; base numeric; subtotal numeric;
begin
 if exists(select 1 from public.horas_atendimento where oficina_id=p_oficina and atendimento_id=p_atendimento and fim is null) then raise exception 'Encerre os apontamentos de tempo antes de concluir.' using errcode='22023';end if;
 -- Mesma ordem de travamento para atendimentos concorrentes consumindo vários produtos.
 for i in select produto_id,sum(quantidade) quantidade from public.itens_atendimento_servico where oficina_id=p_oficina and atendimento_id=p_atendimento and origem='estoque' group by produto_id order by produto_id loop
 perform private.exigir_estoque(p_oficina);
 select * into e from public.estoque_produtos where oficina_id=p_oficina and item_catalogo_id=i.produto_id for update;
 if not found or exists(select 1 from public.itens_catalogo where id=i.produto_id and arquivado_em is not null) then raise exception 'Há material arquivado. Revise os itens antes de concluir.' using errcode='22023';end if;
 if e.saldo<i.quantidade then raise exception 'Estoque insuficiente. Confira os materiais antes de concluir.' using errcode='22023';end if;
 update public.estoque_produtos set saldo=saldo-i.quantidade,revisao=revisao+1 where oficina_id=p_oficina and item_catalogo_id=i.produto_id;
 insert into public.movimentacoes_estoque(oficina_id,item_catalogo_id,tipo,quantidade,saldo_apos,custo_centavos,motivo,documento,chave,criado_por,atendimento_id)
 values(p_oficina,i.produto_id,'saida',-i.quantidade,e.saldo-i.quantidade,e.custo_centavos,'Material utilizado no atendimento',p_atendimento::text,gen_random_uuid(),auth.uid(),p_atendimento) returning id into m;
 insert into public.consumos_atendimento(oficina_id,atendimento_id,movimento_id) values(p_oficina,p_atendimento,m);
 update public.itens_atendimento_servico set custo_centavos=e.custo_centavos where oficina_id=p_oficina and atendimento_id=p_atendimento and produto_id=i.produto_id;
 end loop;
 select * into c from public.comercial_atendimento where atendimento_id=p_atendimento;
 select coalesce(sum(round(quantidade*preco_centavos)),0),coalesce(sum(round(quantidade*preco_centavos)) filter(where tipo='servico'),0) into subtotal,base from public.itens_atendimento_servico where oficina_id=p_oficina and atendimento_id=p_atendimento;
 if subtotal=0 then select valor_centavos into base from public.atendimentos_servicos where id=p_atendimento;else base:=greatest(0,base*(subtotal-coalesce(c.desconto_centavos,0))/subtotal);end if;
 update public.equipe_atendimento set comissao_centavos=round(base*percentual/100) where oficina_id=p_oficina and atendimento_id=p_atendimento;
end $$;

alter function public.salvar_atendimento_servico(uuid,uuid,jsonb,integer) rename to salvar_atendimento_servico_base;
revoke all on function public.salvar_atendimento_servico_base(uuid,uuid,jsonb,integer) from public,anon,authenticated;
create function public.salvar_atendimento_servico(p_oficina uuid,p_id uuid,p_dados jsonb,p_revisao integer default null) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.atendimentos_servicos; novo uuid; total bigint;
begin
 perform private.exigir_servicos(p_oficina);
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_id::text,0));
 select * into a from public.atendimentos_servicos where oficina_id=p_oficina and id=p_id for update;
 if a.id is not null and p_revisao is null then return p_id;end if;
 if a.situacao='concluido' and p_dados->>'situacao'<>'concluido' then raise exception 'Use Reabrir atendimento para devolver os materiais e preservar o histórico.' using errcode='22023';end if;
 if exists(select 1 from public.itens_atendimento_servico where atendimento_id=p_id) then
 select sum(round(quantidade*preco_centavos))-coalesce((select desconto_centavos from public.comercial_atendimento where atendimento_id=p_id),0) into total from public.itens_atendimento_servico where atendimento_id=p_id;
 if total is distinct from (p_dados->>'valor_centavos')::bigint then raise exception 'O total é calculado pelos itens. Edite os itens e o desconto.' using errcode='22023';end if;end if;
 novo:=public.salvar_atendimento_servico_base(p_oficina,p_id,p_dados,p_revisao);
 if p_dados ? 'data_servico' then update public.atendimentos_servicos set data_servico=(p_dados->>'data_servico')::date where id=p_id;end if;
 if p_dados->>'situacao'='aprovado' and a.situacao is distinct from 'aprovado' then
 insert into public.comercial_atendimento(oficina_id,atendimento_id,orcado_centavos) values(p_oficina,p_id,(p_dados->>'valor_centavos')::bigint)
 on conflict(atendimento_id) do update set orcado_centavos=coalesce(comercial_atendimento.orcado_centavos,excluded.orcado_centavos);end if;
 if p_dados->>'situacao'='concluido' and a.situacao is distinct from 'concluido' then
 perform private.concluir_materiais_servico(p_oficina,p_id);
 update public.atendimentos_servicos set concluido_em=now() where id=p_id;end if;
 return novo;
end $$;

create function public.salvar_itens_atendimento(p_oficina uuid,p_atendimento uuid,p_revisao integer,p_itens jsonb,p_desconto bigint default 0,p_custo_extra bigint default 0,p_motivo text default '') returns void language plpgsql security definer set search_path='' as $$
declare a public.atendimentos_servicos; i jsonb; e public.estoque_produtos; total bigint; custo bigint;
begin
 perform private.gerencia_servicos(p_oficina);
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_atendimento::text,0));
 select * into a from public.atendimentos_servicos where oficina_id=p_oficina and id=p_atendimento for update;
 if not found then raise exception 'Atendimento indisponível.' using errcode='42501';end if;
 if a.revisao is distinct from p_revisao then raise exception 'Atendimento alterado. Atualize a tela.' using errcode='40001';end if;
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
end $$;

create function public.reabrir_atendimento_servico(p_oficina uuid,p_atendimento uuid,p_revisao integer,p_motivo text) returns void language plpgsql security definer set search_path='' as $$
declare a public.atendimentos_servicos; m record; e public.estoque_produtos; novo uuid;
begin
 perform private.gerencia_servicos(p_oficina);
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_atendimento::text,0));
 select * into a from public.atendimentos_servicos where oficina_id=p_oficina and id=p_atendimento for update;
 if not found then raise exception 'Atendimento indisponível.' using errcode='42501';end if;
 if a.revisao is distinct from p_revisao then raise exception 'Atendimento alterado.' using errcode='40001';end if;
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
end $$;

create function public.salvar_equipe_atendimento(p_oficina uuid,p_atendimento uuid,p_revisao integer,p_equipe jsonb) returns void language plpgsql security definer set search_path='' as $$
declare a public.atendimentos_servicos; i jsonb;
begin
 perform private.gerencia_servicos(p_oficina);
 select * into a from public.atendimentos_servicos where oficina_id=p_oficina and id=p_atendimento for update;
 if not found then raise exception 'Atendimento indisponível.' using errcode='42501';end if;
 if a.revisao is distinct from p_revisao then raise exception 'Atendimento alterado.' using errcode='40001';end if;
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
end $$;

create function public.registrar_horas_atendimento(p_oficina uuid,p_atendimento uuid,p_id uuid,p_funcionario uuid,p_inicio timestamptz,p_fim timestamptz default null,p_descricao text default '') returns void language plpgsql security definer set search_path='' as $$
declare h public.horas_atendimento;
begin
 perform private.exigir_servicos(p_oficina);
 perform pg_advisory_xact_lock(hashtextextended('horas-servico:'||p_oficina||p_funcionario,0));
 perform 1 from public.atendimentos_servicos where oficina_id=p_oficina and id=p_atendimento and situacao in ('aprovado','em_execucao','aguardando') for update;
 if not found or not exists(select 1 from public.equipe_atendimento where oficina_id=p_oficina and atendimento_id=p_atendimento and funcionario_id=p_funcionario) then raise exception 'Atendimento ou integrante indisponível.' using errcode='22023';end if;
 select * into h from public.horas_atendimento where id=p_id;
 if found then
 if h.oficina_id<>p_oficina or h.atendimento_id<>p_atendimento or h.funcionario_id<>p_funcionario or h.inicio<>p_inicio then raise exception 'Apontamento divergente.' using errcode='22023';end if;
 if h.fim is not null then if h.fim is not distinct from p_fim then return;end if;raise exception 'Apontamento já encerrado.' using errcode='22023';end if;end if;
 if p_inicio>now()+interval '1 minute' or p_fim>now()+interval '1 minute' then raise exception 'Não é possível registrar horas futuras.' using errcode='22023';end if;
 if exists(select 1 from public.horas_atendimento where oficina_id=p_oficina and funcionario_id=p_funcionario and id<>p_id and inicio<coalesce(p_fim,'infinity'::timestamptz) and coalesce(fim,'infinity'::timestamptz)>p_inicio) then raise exception 'Há outro apontamento deste funcionário no mesmo horário.' using errcode='23P01';end if;
 insert into public.horas_atendimento(id,oficina_id,atendimento_id,funcionario_id,inicio,fim,descricao) values(p_id,p_oficina,p_atendimento,p_funcionario,p_inicio,p_fim,coalesce(p_descricao,''))
 on conflict(id) do update set fim=excluded.fim;
end $$;

create function public.salvar_qualidade_atendimento(p_oficina uuid,p_atendimento uuid,p_id uuid,p_dados jsonb,p_revisao integer default null) returns void language plpgsql security definer set search_path='' as $$
declare q public.qualidade_atendimento;
begin
 perform private.gerencia_servicos(p_oficina);
 if not exists(select 1 from public.atendimentos_servicos where oficina_id=p_oficina and id=p_atendimento) then raise exception 'Atendimento indisponível.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('qualidade-servico:'||p_id,0));
 select * into q from public.qualidade_atendimento where id=p_id for update;
 if found then
 if q.oficina_id<>p_oficina or q.atendimento_id<>p_atendimento then raise exception 'Ocorrência indisponível.' using errcode='42501';end if;
 if p_revisao is null then return;end if;
 if q.revisao<>p_revisao then raise exception 'Ocorrência alterada.' using errcode='40001';end if;end if;
 insert into public.qualidade_atendimento(id,oficina_id,atendimento_id,funcionario_id,tipo,motivo,solucao,aberto_em,resolvido_em,custo_centavos,minutos,nota)
 values(p_id,p_oficina,p_atendimento,nullif(p_dados->>'funcionario_id','')::uuid,p_dados->>'tipo',trim(p_dados->>'motivo'),coalesce(p_dados->>'solucao',''),(p_dados->>'aberto_em')::date,nullif(p_dados->>'resolvido_em','')::date,coalesce((p_dados->>'custo_centavos')::bigint,0),coalesce((p_dados->>'minutos')::integer,0),nullif(p_dados->>'nota','')::integer)
 on conflict(id) do update set funcionario_id=excluded.funcionario_id,tipo=excluded.tipo,motivo=excluded.motivo,solucao=excluded.solucao,aberto_em=excluded.aberto_em,resolvido_em=excluded.resolvido_em,custo_centavos=excluded.custo_centavos,minutos=excluded.minutos,nota=excluded.nota,revisao=qualidade_atendimento.revisao+1;
 insert into public.eventos_atendimento(oficina_id,atendimento_id,tipo,depois,autor) values(p_oficina,p_atendimento,'qualidade',(p_dados->>'tipo')||': '||(p_dados->>'motivo'),auth.uid());
end $$;

create function public.gerar_comissao_atendimento(p_oficina uuid,p_equipe uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare e public.equipe_atendimento; a public.atendimentos_servicos; t uuid;
begin
 perform private.gerencia_servicos(p_oficina);perform private.exigir_financeiro(p_oficina);
 if not private.has_feature(p_oficina,'employee_reports') then raise exception 'Recurso indisponível no plano.' using errcode='42501';end if;
 select * into e from public.equipe_atendimento where oficina_id=p_oficina and id=p_equipe;
 if not found then raise exception 'Comissão indisponível.' using errcode='42501';end if;
 select * into a from public.atendimentos_servicos where id=e.atendimento_id for update;
 select * into e from public.equipe_atendimento where oficina_id=p_oficina and id=p_equipe for update;
 if not found then raise exception 'Equipe alterada. Atualize o atendimento.' using errcode='40001';end if;
 if a.situacao<>'concluido' or e.comissao_centavos<=0 then raise exception 'Conclua o atendimento com comissão positiva.' using errcode='22023';end if;
 if e.titulo_id is not null and exists(select 1 from public.titulos_financeiros where id=e.titulo_id and cancelado_em is null) then return e.titulo_id;end if;
 t:=gen_random_uuid();
 insert into public.titulos_financeiros(id,oficina_id,natureza,descricao,categoria,valor_centavos,competencia,vencimento,pessoa,criado_por)
 values(t,p_oficina,'pagar','Comissão atendimento #'||a.numero,'pessoal',e.comissao_centavos,(a.concluido_em at time zone 'America/Sao_Paulo')::date,(now() at time zone 'America/Sao_Paulo')::date,(select nome from public.funcionarios where id=e.funcionario_id),auth.uid());
 update public.equipe_atendimento set titulo_id=t where id=e.id;return t;
end $$;

create function public.consultar_detalhes_atendimento(p_oficina uuid,p_atendimento uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.atendimentos_servicos; gerente boolean; equipe boolean;
begin
 perform private.exigir_servicos(p_oficina);
 select * into a from public.atendimentos_servicos where oficina_id=p_oficina and id=p_atendimento;
 if not found then raise exception 'Atendimento indisponível.' using errcode='42501';end if;
 gerente:=exists(select 1 from public.membros_oficina where oficina_id=p_oficina and usuario_id=auth.uid() and ativo and perfil in ('owner','manager'));
 equipe:=gerente and private.has_feature(p_oficina,'employee_reports');
 return jsonb_build_object('atendimento',to_jsonb(a),'cliente',(select jsonb_build_object('nome',nome,'telefone',telefone_e164) from public.clientes where id=a.cliente_id),'objeto',(select to_jsonb(o) from public.objetos_atendimento o where id=a.objeto_id),
 'itens',(select coalesce(jsonb_agg(case when gerente then to_jsonb(i) else to_jsonb(i)-'custo_centavos' end order by i.tipo,i.descricao,i.id),'[]') from public.itens_atendimento_servico i where atendimento_id=a.id),
 'comercial',case when gerente then coalesce((select to_jsonb(c) from public.comercial_atendimento c where atendimento_id=a.id),'{}')||jsonb_build_object('comissao_total_centavos',(select coalesce(sum(comissao_centavos),0) from public.equipe_atendimento where atendimento_id=a.id)) else jsonb_build_object('desconto_centavos',(select desconto_centavos from public.comercial_atendimento where atendimento_id=a.id)) end,
 'equipe',(select coalesce(jsonb_agg((case when equipe then to_jsonb(e) else to_jsonb(e)-'percentual'-'comissao_centavos'-'titulo_id' end || jsonb_build_object('nome',f.nome)) - case when gerente then 'campo_inexistente' else 'custo_hora_centavos' end order by f.nome),'[]') from public.equipe_atendimento e join public.funcionarios f on f.id=e.funcionario_id where atendimento_id=a.id),
 'horas',(select coalesce(jsonb_agg(to_jsonb(h) order by inicio desc),'[]') from public.horas_atendimento h where atendimento_id=a.id),
 'qualidade',case when gerente then (select coalesce(jsonb_agg(to_jsonb(q) order by aberto_em desc),'[]') from public.qualidade_atendimento q where atendimento_id=a.id) else '[]'::jsonb end,
 'eventos',(select coalesce(jsonb_agg(to_jsonb(x) order by id desc),'[]') from (select tipo,antes,depois,criado_em,id from public.eventos_atendimento where atendimento_id=a.id and (gerente or tipo in ('situacao','etapa')) order by id desc limit 100)x));
end $$;

-- O faturamento de uma conta cancelada pode ser refeito, sem duplicar contas ativas.
do $$ declare f text;begin
 f:=pg_get_functiondef('public.faturar_atendimento_servico(uuid,uuid)'::regprocedure);
 f:=replace(f,'if found then return t; end if;', 'if found then if exists(select 1 from public.titulos_financeiros where id=t and cancelado_em is null) then return t;end if;delete from public.cobrancas_atendimento where oficina_id=p_oficina and atendimento_id=p_atendimento;end if;');
 execute f;end $$;

revoke all on function private.gerencia_servicos(uuid),private.auditar_atendimento_completo(),private.concluir_materiais_servico(uuid,uuid) from public,anon,authenticated;
revoke all on function public.salvar_atendimento_servico(uuid,uuid,jsonb,integer),public.salvar_itens_atendimento(uuid,uuid,integer,jsonb,bigint,bigint,text),public.reabrir_atendimento_servico(uuid,uuid,integer,text),public.salvar_equipe_atendimento(uuid,uuid,integer,jsonb),public.registrar_horas_atendimento(uuid,uuid,uuid,uuid,timestamptz,timestamptz,text),public.salvar_qualidade_atendimento(uuid,uuid,uuid,jsonb,integer),public.gerar_comissao_atendimento(uuid,uuid),public.consultar_detalhes_atendimento(uuid,uuid) from public,anon;
grant execute on function public.salvar_atendimento_servico(uuid,uuid,jsonb,integer),public.salvar_itens_atendimento(uuid,uuid,integer,jsonb,bigint,bigint,text),public.reabrir_atendimento_servico(uuid,uuid,integer,text),public.salvar_equipe_atendimento(uuid,uuid,integer,jsonb),public.registrar_horas_atendimento(uuid,uuid,uuid,uuid,timestamptz,timestamptz,text),public.salvar_qualidade_atendimento(uuid,uuid,uuid,jsonb,integer),public.gerar_comissao_atendimento(uuid,uuid),public.consultar_detalhes_atendimento(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;


