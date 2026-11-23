begin;

-- Valor desconhecido é uma pendência, nunca uma dívida de valor inventado.
alter table public.contas_recorrentes drop constraint contas_recorrentes_valor_centavos_check;
alter table public.contas_recorrentes add constraint contas_recorrentes_valor_centavos_check
 check(valor_centavos between 1 and 10000000000 or (valor_variavel and valor_centavos=0));
create table public.contas_mensais_pendentes (
 id uuid primary key default gen_random_uuid(), oficina_id uuid not null,
 recorrencia_id uuid not null, competencia date not null, vencimento date not null,
 descricao text not null, natureza text not null check(natureza in ('pagar','receber')), categoria text not null,
 titulo_id uuid, criado_em timestamptz not null default now(),
 unique(recorrencia_id,competencia),
 foreign key(oficina_id,recorrencia_id) references public.contas_recorrentes(oficina_id,id),
 foreign key(oficina_id,titulo_id) references public.titulos_financeiros(oficina_id,id)
);
create index contas_mensais_pendentes_empresa on public.contas_mensais_pendentes(oficina_id,vencimento,id) where titulo_id is null;
create index contas_mensais_pendentes_titulo on public.contas_mensais_pendentes(oficina_id,titulo_id) where titulo_id is not null;
alter table public.contas_mensais_pendentes enable row level security;
revoke all on public.contas_mensais_pendentes from public,anon,authenticated;

-- Mantém as validações, permissões, revisão e regras de pausa já utilizadas.
do $$ declare s text; novo text; begin
 s:=pg_get_functiondef('public.salvar_conta_recorrente(uuid,uuid,jsonb,integer)'::regprocedure);
 novo:=replace(s,'dia,inicio,fim,ativa,proximo_mes)', 'dia,inicio,fim,ativa,proximo_mes,valor_variavel)');
 novo:=replace(novo,$t$date_trunc('month',inicio)::date)$t$,$t$date_trunc('month',inicio)::date,coalesce((p_dados->>'valor_variavel')::boolean,false))$t$);
 novo:=replace(novo,'valor_centavos=excluded.valor_centavos,dia=excluded.dia', 'valor_variavel=excluded.valor_variavel,valor_centavos=excluded.valor_centavos,dia=excluded.dia');
 novo:=replace(novo,'perform private.exigir_financeiro(p_oficina);', $t$perform private.exigir_financeiro(p_oficina);
 if not private.acesso_area(p_oficina,'financeiro',true) then raise exception 'Sem permissão para alterar contas mensais.' using errcode='42501';end if;$t$);
 if novo=s or position('proximo_mes,valor_variavel)' in novo)=0 then raise exception 'Contrato de recorrência mudou';end if;
 execute novo;
end $$;

create or replace function private.gerar_contas_recorrentes(p_oficina uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r public.contas_recorrentes; mes date; vence date; limite date:=(now() at time zone 'America/Sao_Paulo')::date+5;
begin
 for r in select * from public.contas_recorrentes where oficina_id=p_oficina and ativa order by id for update loop
  mes:=r.proximo_mes;
  while mes<=limite and (r.fim is null or mes<=r.fim) loop
   vence:=mes+least(r.dia,extract(day from (mes+interval '1 month - 1 day'))::integer)-1;
   exit when vence>limite;
   if vence>=r.inicio and (r.fim is null or vence<=r.fim) then
    if r.valor_variavel and r.valor_centavos=0 then
     insert into public.contas_mensais_pendentes(oficina_id,recorrencia_id,competencia,vencimento,descricao,natureza,categoria)
     values(p_oficina,r.id,mes,vence,r.descricao,r.natureza,r.categoria) on conflict do nothing;
    else
     insert into public.titulos_financeiros(oficina_id,natureza,descricao,categoria,valor_centavos,competencia,vencimento,recorrencia_id,criado_por)
     values(p_oficina,r.natureza,r.descricao,r.categoria,r.valor_centavos,mes,vence,r.id,auth.uid()) on conflict do nothing;
    end if;
   end if;
   mes:=(mes+interval '1 month')::date;
  end loop;
  update public.contas_recorrentes set proximo_mes=mes where id=r.id;
 end loop;
end $$;

create function private.consultar_contas_mensais_pendentes(p_oficina uuid,p_pagina integer) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform private.conferir_operacao(p_oficina,'consultar_financeiro');perform private.exigir_financeiro(p_oficina);
 if p_pagina is null or p_pagina not between 0 and 100000 then raise exception 'Página inválida.' using errcode='22023';end if;
 perform private.gerar_contas_recorrentes(p_oficina);
 return jsonb_build_object('total',(select count(*) from public.contas_mensais_pendentes where oficina_id=p_oficina and titulo_id is null),
 'itens',coalesce((select jsonb_agg(to_jsonb(p) order by vencimento,id) from
 (select * from public.contas_mensais_pendentes where oficina_id=p_oficina and titulo_id is null order by vencimento,id limit 30 offset p_pagina*30) p),'[]'));
end $$;
create function public.consultar_contas_mensais_pendentes(p_oficina uuid,p_pagina integer default 0) returns jsonb
language sql security invoker set search_path='' as $$select private.consultar_contas_mensais_pendentes(p_oficina,p_pagina)$$;

create function private.informar_valor_conta_mensal(p_oficina uuid,p_id uuid,p_valor bigint) returns uuid
language plpgsql security definer set search_path='' as $$
declare p public.contas_mensais_pendentes;t uuid;begin
 perform private.conferir_operacao(p_oficina,'salvar_titulo_financeiro');perform private.exigir_financeiro(p_oficina);
 if p_valor is null or p_valor not between 1 and 10000000000 then raise exception 'Informe o valor desta conta.' using errcode='22023';end if;
 select * into p from public.contas_mensais_pendentes where oficina_id=p_oficina and id=p_id for update;
 if not found then raise exception 'Conta mensal não encontrada.' using errcode='42501';end if;
 if p.titulo_id is not null then
  if exists(select 1 from public.titulos_financeiros where oficina_id=p_oficina and id=p.titulo_id and valor_centavos=p_valor and cancelado_em is null) then return p.titulo_id;end if;
  raise exception 'O valor já foi informado. Abra a conta no financeiro para alterá-lo.' using errcode='PT409';
 end if;
 insert into public.titulos_financeiros(oficina_id,natureza,descricao,categoria,valor_centavos,competencia,vencimento,recorrencia_id,criado_por,valor_variavel,valor_confirmado_em)
 values(p_oficina,p.natureza,p.descricao,p.categoria,p_valor,p.competencia,p.vencimento,p.recorrencia_id,auth.uid(),true,now()) returning id into t;
 -- O modelo pode ter mudado para fixo desde a geração da pendência.
 update public.titulos_financeiros set valor_variavel=true,valor_confirmado_em=now() where id=t;
 update public.contas_mensais_pendentes set titulo_id=t where id=p.id;
 perform private.evento_financeiro(p_oficina,t,'monthly_amount_confirmed');
 return t;
end $$;
create function public.informar_valor_conta_mensal(p_oficina uuid,p_id uuid,p_valor bigint) returns uuid
language sql security invoker set search_path='' as $$select private.informar_valor_conta_mensal(p_oficina,p_id,p_valor)$$;

alter function public.consultar_alertas(uuid) rename to consultar_alertas_antes_contas_mensais;
create function private.consultar_alertas_contas_mensais(p_oficina uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare lista jsonb;extra jsonb;u uuid;hoje date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 perform private.conferir_operacao(p_oficina,'consultar_alertas');u:=private.require_staff(p_oficina);
 lista:=public.consultar_alertas_antes_contas_mensais(p_oficina);
 if not private.has_feature(p_oficina,'finance') or not private.gerente_custos(p_oficina) or not private.acesso_area(p_oficina,'financeiro') then return lista;end if;
 perform private.gerar_contas_recorrentes(p_oficina);
 with pendentes as (
  select p.*, 'conta_mensal:'||id||':'||vencimento||':'||private.marco_alerta(vencimento-hoje)||':false' chave
  from public.contas_mensais_pendentes p where oficina_id=p_oficina and titulo_id is null and vencimento<=hoje+5
  order by vencimento,id limit 300
 ) select coalesce(jsonb_agg(jsonb_build_object('tipo','conta_mensal','id',p.id,'titulo',p.descricao,'natureza',p.natureza,'data',p.vencimento,'dias',p.vencimento-hoje,
 'valor_centavos',null,'valor_pendente',true,'destino','/financeiro?aba=recorrencias','pronto',false,'chave',p.chave,'lido',l.lido_em is not null)
 order by p.vencimento,p.id),'[]') into extra from pendentes p left join public.alertas_lidos l on l.oficina_id=p_oficina and l.usuario_id=u and l.chave=p.chave where l.excluido_em is null;
 return lista||extra;
end $$;
create function public.consultar_alertas(p_oficina uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.consultar_alertas_contas_mensais(p_oficina) $$;

-- Ficha interna do catálogo, sem expor custos ou observações nos documentos do cliente.
create table public.fichas_servico_catalogo (
 oficina_id uuid not null,item_id uuid primary key, notas text not null default '' check(length(notas)<=6000),
 duracao_minutos integer check(duracao_minutos between 1 and 43200), custos jsonb not null default '[]' check(jsonb_typeof(custos)='array' and jsonb_array_length(custos)<=40),
 foreign key(oficina_id,item_id) references public.itens_catalogo(oficina_id,id)
);
create index fichas_servico_catalogo_empresa on public.fichas_servico_catalogo(oficina_id,item_id);
alter table public.fichas_servico_catalogo enable row level security;
revoke all on public.fichas_servico_catalogo from public,anon,authenticated;
-- Edições pelo cadastro rápido/integrações não deixam uma composição divergente.
create function private.conciliar_composicao_custo_catalogo() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.custo_centavos is distinct from old.custo_centavos then
  update public.fichas_servico_catalogo set custos='[]' where oficina_id=new.oficina_id and item_id=new.id;
 end if;
 return new;
end $$;
create trigger conciliar_composicao_custo_catalogo after update of custo_centavos on public.itens_catalogo
for each row execute function private.conciliar_composicao_custo_catalogo();
revoke all on function private.conciliar_composicao_custo_catalogo() from public,anon,authenticated;
create function private.consultar_ficha_servico(p_oficina uuid,p_item uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare item jsonb;f jsonb;ver_custos boolean;begin
 perform private.conferir_operacao(p_oficina,'consultar_catalogo');perform private.require_staff(p_oficina);
 if not private.has_feature(p_oficina,'catalog') then raise exception 'Catálogo indisponível.' using errcode='42501';end if;
 ver_custos:=private.gerente_custos(p_oficina) and private.acesso_area(p_oficina,'financeiro');
 select to_jsonb(i) into item from public.itens_catalogo i where oficina_id=p_oficina and id=p_item and tipo='service';
 if item is null then raise exception 'Serviço não encontrado.' using errcode='42501';end if;
 select jsonb_build_object('notas',notas,'duracao_minutos',duracao_minutos,'custos',case when ver_custos then custos else '[]'::jsonb end) into f
 from public.fichas_servico_catalogo where oficina_id=p_oficina and item_id=p_item;
 if not ver_custos then item:=item-'custo_centavos';end if;
 return item||jsonb_build_object('ficha',coalesce(f,jsonb_build_object('notas','','duracao_minutos',null,'custos','[]'::jsonb)));
end $$;
create function public.consultar_ficha_servico(p_oficina uuid,p_item uuid) returns jsonb
language sql security invoker set search_path='' as $$select private.consultar_ficha_servico(p_oficina,p_item)$$;
create function private.salvar_servico_detalhado(p_oficina uuid,p_id uuid,p_dados jsonb,p_revisao integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare f jsonb:=p_dados->'ficha';custos jsonb;linha jsonb;total bigint:=0;valor numeric;id uuid;gestor boolean;
begin
 perform private.conferir_operacao(p_oficina,'salvar_item_catalogo');perform private.require_staff(p_oficina);
 if p_dados->>'tipo' is distinct from 'service' or jsonb_typeof(f) is distinct from 'object' then raise exception 'Ficha de serviço inválida.' using errcode='22023';end if;
 custos:=coalesce(f->'custos','[]');gestor:=private.gerente_custos(p_oficina) and private.acesso_area(p_oficina,'financeiro');
 if jsonb_typeof(custos) is distinct from 'array' or jsonb_array_length(custos)>40 then raise exception 'Informe até 40 custos por serviço.' using errcode='22023';end if;
 if not gestor then
  if jsonb_array_length(custos)>0 or p_dados ? 'custo_centavos' then raise exception 'Somente a gerência pode alterar custos.' using errcode='42501';end if;
  select coalesce(c.custos,'[]') into custos from public.fichas_servico_catalogo c where oficina_id=p_oficina and item_id=p_id;
  custos:=coalesce(custos,'[]');
 else
  for linha in select value from jsonb_array_elements(custos) loop
   valor:=(linha->>'valor_centavos')::numeric;
   if jsonb_typeof(linha) is distinct from 'object' or length(trim(coalesce(linha->>'descricao',''))) not between 1 and 160 or valor is null or valor<>trunc(valor) or valor not between 0 and 100000000 then raise exception 'Confira o nome e o valor de cada custo.' using errcode='22023';end if;
   total:=total+valor::bigint;
  end loop;
  if total>100000000 then raise exception 'O custo total ultrapassa o limite do serviço.' using errcode='22023';end if;
  if jsonb_array_length(custos)>0 then p_dados:=p_dados||jsonb_build_object('custo_centavos',total);end if;
 end if;
 id:=public.salvar_item_catalogo(p_oficina,p_id,p_dados,p_revisao);
 insert into public.fichas_servico_catalogo(oficina_id,item_id,notas,duracao_minutos,custos)
 values(p_oficina,id,coalesce(f->>'notas',''),nullif(f->>'duracao_minutos','')::integer,custos)
 on conflict(item_id) do update set notas=excluded.notas,duracao_minutos=excluded.duracao_minutos,custos=excluded.custos;
 return id;
end $$;
create function public.salvar_servico_detalhado(p_oficina uuid,p_id uuid,p_dados jsonb,p_revisao integer default null) returns uuid
language sql security invoker set search_path='' as $$select private.salvar_servico_detalhado(p_oficina,p_id,p_dados,p_revisao)$$;

revoke all on function public.consultar_alertas_antes_contas_mensais(uuid) from public,anon,authenticated;
revoke all on function private.consultar_contas_mensais_pendentes(uuid,integer),public.consultar_contas_mensais_pendentes(uuid,integer),
 private.informar_valor_conta_mensal(uuid,uuid,bigint),public.informar_valor_conta_mensal(uuid,uuid,bigint),
 private.consultar_alertas_contas_mensais(uuid),public.consultar_alertas(uuid),
 private.consultar_ficha_servico(uuid,uuid),public.consultar_ficha_servico(uuid,uuid),
 private.salvar_servico_detalhado(uuid,uuid,jsonb,integer),public.salvar_servico_detalhado(uuid,uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function private.consultar_contas_mensais_pendentes(uuid,integer),public.consultar_contas_mensais_pendentes(uuid,integer),
 private.informar_valor_conta_mensal(uuid,uuid,bigint),public.informar_valor_conta_mensal(uuid,uuid,bigint),
 private.consultar_alertas_contas_mensais(uuid),public.consultar_alertas(uuid),
 private.consultar_ficha_servico(uuid,uuid),public.consultar_ficha_servico(uuid,uuid),
 private.salvar_servico_detalhado(uuid,uuid,jsonb,integer),public.salvar_servico_detalhado(uuid,uuid,jsonb,integer) to authenticated;
commit;
