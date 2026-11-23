begin;
create table public.plano_apuracao (
 oficina_id uuid not null references public.oficinas(id),categoria text not null,
 grupo text not null check(grupo in ('receita','deducoes','custos','operacionais','receita_financeira','despesa_financeira','tributo_lucro')),
 conta_debito text not null default '' check(length(conta_debito)<=60),conta_credito text not null default '' check(length(conta_credito)<=60),
 revisao integer not null default 1, primary key(oficina_id,categoria),
 check(categoria in ('servicos','outras_receitas','pecas_externas','pessoal','aluguel','agua_luz','impostos','terceiros','outras_despesas','estoque_consumido','taxas','depreciacao','provisao','tributos_lucro','deducoes_receita'))
);
create table public.ajustes_apuracao (
 id uuid primary key,oficina_id uuid not null references public.oficinas(id),competencia date not null,
 categoria text not null check(categoria in ('depreciacao','provisao','tributos_lucro','deducoes_receita','impostos','outras_despesas','outras_receitas')),
 descricao text not null check(length(trim(descricao)) between 3 and 300),valor bigint not null check(valor between -10000000000 and 10000000000 and valor<>0),
 cancelado_em timestamptz,motivo_cancelamento text,criado_por uuid not null references auth.users(id),criado_em timestamptz not null default now()
);
create index ajustes_apuracao_periodo on public.ajustes_apuracao(oficina_id,competencia,id) where cancelado_em is null;
create table public.conferencias_apuracao (
 oficina_id uuid not null references public.oficinas(id),inicio date not null,fim date not null,assinatura text not null,
 observacao text not null check(length(trim(observacao)) between 3 and 1000),autor uuid not null references auth.users(id),conferido_em timestamptz not null default now(),primary key(oficina_id,inicio,fim)
);
create table public.simulacoes_precos (
 id uuid primary key,oficina_id uuid not null references public.oficinas(id),nome text not null check(length(trim(nome)) between 3 and 180),
 mes date not null,parametros jsonb not null,entrada jsonb not null,resultado jsonb not null,criado_em timestamptz not null default now(),criado_por uuid not null references auth.users(id)
);
create index simulacoes_precos_oficina on public.simulacoes_precos(oficina_id,criado_em desc,id);
create function private.grupo_apuracao(c text,n text) returns text language sql immutable set search_path='' as $$
 select case when n='receber' then 'receita' when c in ('estoque_consumido','pecas_externas','terceiros') then 'custos' when c='tributos_lucro' then 'tributo_lucro' when c='deducoes_receita' then 'deducoes' when c='taxas' then 'despesa_financeira' else 'operacionais' end;
$$;
create function private.validar_periodo_apuracao(i date,f date) returns void language plpgsql immutable set search_path='' as $$begin
 if i is null or f is null or not isfinite(i) or not isfinite(f) or f<i or f-i>366 then raise exception 'Escolha um período de até 367 dias.' using errcode='22023';end if;
end $$;
create function private.linhas_apuracao(w uuid,i date,f date) returns table(chave text,data date,descricao text,categoria text,grupo text,valor bigint,conta_debito text,conta_credito text) language sql stable set search_path='' as $$
 with fontes as (
 select 'titulo:'||t.id chave,t.competencia data,t.descricao,t.categoria,t.natureza,t.valor_centavos valor from public.titulos_financeiros t where t.oficina_id=w and t.cancelado_em is null and not t.provisorio and t.competencia between i and f and t.categoria not in ('compra_estoque','aporte','retirada','saldo_inicial','transferencia')
 union all select 'estoque:'||m.id,(m.criado_em at time zone 'America/Sao_Paulo')::date,'Consumo/devolução de estoque','estoque_consumido','pagar',round(-m.quantidade*m.custo_centavos)::bigint from public.movimentacoes_estoque m where m.oficina_id=w and (m.ordem_servico_id is not null or m.atendimento_id is not null) and m.criado_em >= (i::timestamp at time zone 'America/Sao_Paulo') and m.criado_em<((f+1)::timestamp at time zone 'America/Sao_Paulo')
 union all select 'taxa:'||b.id,b.data,'Taxa de recebimento','taxas','pagar',case when b.estorno_de is null then b.taxa_centavos else -b.taxa_centavos end from public.baixas_financeiras b where b.oficina_id=w and b.data between i and f and b.taxa_centavos>0
 union all select 'ajuste:'||a.id,a.competencia,a.descricao,a.categoria,case when a.categoria='outras_receitas' then 'receber' else 'pagar' end,a.valor from public.ajustes_apuracao a where a.oficina_id=w and a.competencia between i and f and a.cancelado_em is null)
 select x.chave,x.data,x.descricao,x.categoria,coalesce(p.grupo,private.grupo_apuracao(x.categoria,x.natureza)),x.valor,coalesce(p.conta_debito,''),coalesce(p.conta_credito,'') from fontes x left join public.plano_apuracao p on p.oficina_id=w and p.categoria=x.categoria;
$$;
create function public.salvar_plano_apuracao(p_oficina uuid,p_categoria text,p_dados jsonb,p_revisao integer default null) returns void language plpgsql security definer set search_path='' as $$declare r integer;begin
 perform private.exigir_financeiro(p_oficina);perform pg_advisory_xact_lock(hashtextextended('plano:'||p_oficina::text||p_categoria,0));
 select revisao into r from public.plano_apuracao where oficina_id=p_oficina and categoria=p_categoria;
 if r is distinct from p_revisao then raise exception 'Classificação alterada. Atualize a tela.' using errcode='PT409';end if;
 if (p_categoria in ('servicos','outras_receitas')) is distinct from (p_dados->>'grupo' in ('receita','receita_financeira')) then raise exception 'Mantenha receitas em grupos de receita e gastos em grupos de custo ou despesa.' using errcode='22023';end if;
 insert into public.plano_apuracao values(p_oficina,p_categoria,p_dados->>'grupo',coalesce(p_dados->>'conta_debito',''),coalesce(p_dados->>'conta_credito',''),1) on conflict(oficina_id,categoria) do update set grupo=excluded.grupo,conta_debito=excluded.conta_debito,conta_credito=excluded.conta_credito,revisao=plano_apuracao.revisao+1;
 perform private.evento_financeiro(p_oficina,gen_random_uuid(),'accounting_mapping');
end $$;
create function public.registrar_ajuste_apuracao(p_oficina uuid,p_id uuid,p_dados jsonb) returns void language plpgsql security definer set search_path='' as $$declare a public.ajustes_apuracao;begin
 perform private.exigir_financeiro(p_oficina);perform pg_advisory_xact_lock(hashtextextended('ajuste:'||p_oficina::text||p_id::text,0));
 select * into a from public.ajustes_apuracao where oficina_id=p_oficina and id=p_id;
 if a.id is not null then if a.valor is distinct from (p_dados->>'valor')::bigint or a.competencia is distinct from (p_dados->>'competencia')::date or a.categoria is distinct from p_dados->>'categoria' or a.descricao is distinct from p_dados->>'descricao' then raise exception 'Ajuste já utilizado com outros dados.' using errcode='PT409';end if;return;end if;
 if not isfinite((p_dados->>'competencia')::date) then raise exception 'Informe uma data válida.' using errcode='22023';end if;
 insert into public.ajustes_apuracao(id,oficina_id,competencia,categoria,descricao,valor,criado_por) values(p_id,p_oficina,(p_dados->>'competencia')::date,p_dados->>'categoria',p_dados->>'descricao',(p_dados->>'valor')::bigint,auth.uid());
 perform private.evento_financeiro(p_oficina,p_id,'accrual_adjustment');
end $$;
create function public.cancelar_ajuste_apuracao(p_oficina uuid,p_id uuid,p_motivo text) returns void language plpgsql security definer set search_path='' as $$begin
 perform private.exigir_financeiro(p_oficina);if length(trim(coalesce(p_motivo,'')))<3 then raise exception 'Informe o motivo.' using errcode='22023';end if;
 update public.ajustes_apuracao set cancelado_em=now(),motivo_cancelamento=left(p_motivo,1000) where oficina_id=p_oficina and id=p_id and cancelado_em is null;
 if not found and not exists(select 1 from public.ajustes_apuracao where oficina_id=p_oficina and id=p_id) then raise exception 'Ajuste indisponível.' using errcode='42501';end if;
 perform private.evento_financeiro(p_oficina,p_id,'accrual_reversed');
end $$;
create function public.consultar_apuracao_completa(p_oficina uuid,p_inicio date,p_fim date) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;grupos jsonb;clientes jsonb;revisar int;operacionais_pendentes int;variaveis int;sem_mapa int;sig text;custos_sig text;conferencia jsonb;v_receita numeric;begin
 perform private.exigir_financeiro(p_oficina);perform private.validar_periodo_apuracao(p_inicio,p_fim);
 select coalesce(jsonb_object_agg(grupo,total),'{}') into grupos from(select grupo,sum(valor) total from private.linhas_apuracao(p_oficina,p_inicio,p_fim) group by grupo)x;
 select count(*),md5(coalesce(string_agg(concat_ws(':',chave,data,grupo,valor,conta_debito,conta_credito),'|' order by chave),'')) into sem_mapa,sig from private.linhas_apuracao(p_oficina,p_inicio,p_fim) where conta_debito='' or conta_credito='';
 -- A assinatura inclui também fontes já mapeadas e os valores, para reabrir conferências após alterações.
 select md5(coalesce(string_agg(concat_ws(':',chave,data,grupo,valor,conta_debito,conta_credito),'|' order by chave),'')) into sig from private.linhas_apuracao(p_oficina,p_inicio,p_fim);
 select count(*) into variaveis from public.titulos_financeiros where oficina_id=p_oficina and competencia between p_inicio and p_fim and cancelado_em is null and valor_variavel and valor_confirmado_em is null;
 with docs as materialized(select private.detalhe_custeio(p_oficina,id) d from private.documentos_custeio where oficina_id=p_oficina and data between p_inicio and p_fim),
 c as (select coalesce(d->>'cliente_id','avulso:'||(d->>'cliente')) id,min(d->>'cliente') cliente,sum((d->>'receita')::bigint) receita,sum((d->>'custo')::bigint) custo,count(*) quantidade,count(*) filter(where not(d->>'conferido')::boolean) pendentes from docs group by 1)
 select (select count(*) from docs where not(d->>'conferido')::boolean),
 (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from(select *,receita-custo margem from c order by receita-custo desc,id limit 100)x)
  ,(select md5(coalesce(string_agg(d::text,'|' order by d->>'id'),'')) from docs) into revisar,clientes,custos_sig;
 
 select count(*) into operacionais_pendentes from private.documentos_custeio doc cross join lateral private.fontes_custeio(p_oficina,doc.id) f left join public.conferencias_custeio cc on cc.oficina_id=p_oficina and cc.documento_id=doc.id
 where doc.oficina_id=p_oficina and doc.data between p_inicio and p_fim and not f.financeiro and f.valor>0 and f.chave not like 'estoque:%' and f.chave not like 'hora:%' and not coalesce(cc.dados->'desconsideradas','{}')?f.chave;
 sig:=md5(sig||custos_sig||revisar::text||variaveis::text||operacionais_pendentes::text);
 select to_jsonb(c) into conferencia from public.conferencias_apuracao c where oficina_id=p_oficina and inicio=p_inicio and fim=p_fim;
 v_receita:=coalesce((grupos->>'receita')::numeric,0);
 r:=jsonb_build_object('grupos',grupos,'receita_liquida',v_receita-coalesce((grupos->>'deducoes')::numeric,0),'resultado_bruto',v_receita-coalesce((grupos->>'deducoes')::numeric,0)-coalesce((grupos->>'custos')::numeric,0),'resultado_operacional',v_receita-coalesce((grupos->>'deducoes')::numeric,0)-coalesce((grupos->>'custos')::numeric,0)-coalesce((grupos->>'operacionais')::numeric,0),
 'resultado_liquido',v_receita-coalesce((grupos->>'deducoes')::numeric,0)-coalesce((grupos->>'custos')::numeric,0)-coalesce((grupos->>'operacionais')::numeric,0)+coalesce((grupos->>'receita_financeira')::numeric,0)-coalesce((grupos->>'despesa_financeira')::numeric,0)-coalesce((grupos->>'tributo_lucro')::numeric,0),
 'custos_sem_financeiro',operacionais_pendentes,'servicos_revisar',revisar,'valores_nao_confirmados',variaveis,'sem_mapeamento',sem_mapa,'clientes',clientes,'assinatura',sig,'conferido',coalesce(conferencia->>'assinatura'=sig,false) and revisar=0 and variaveis=0 and operacionais_pendentes=0,'conferencia',conferencia,
 'plano',coalesce((select jsonb_agg(to_jsonb(p) order by categoria) from public.plano_apuracao p where oficina_id=p_oficina),'[]'),
 'ajustes',coalesce((select jsonb_agg(to_jsonb(a) order by competencia desc,id) from public.ajustes_apuracao a where oficina_id=p_oficina and competencia between p_inicio and p_fim and cancelado_em is null),'[]'));
 return r;
end $$;
create function public.conferir_apuracao(p_oficina uuid,p_inicio date,p_fim date,p_assinatura text,p_observacao text) returns void language plpgsql security definer set search_path='' as $$declare r jsonb;begin
 r:=public.consultar_apuracao_completa(p_oficina,p_inicio,p_fim);
 if r->>'assinatura' is distinct from p_assinatura then raise exception 'A apuração mudou. Confira os valores atuais.' using errcode='PT409';end if;
 if (r->>'servicos_revisar')::int>0 or (r->>'valores_nao_confirmados')::int>0 or (r->>'custos_sem_financeiro')::int>0 then raise exception 'Confira os custos dos serviços, vincule os gastos operacionais ao financeiro e confirme os valores variáveis antes de concluir a apuração.' using errcode='22023';end if;
 insert into public.conferencias_apuracao values(p_oficina,p_inicio,p_fim,p_assinatura,p_observacao,auth.uid(),now()) on conflict(oficina_id,inicio,fim) do update set assinatura=excluded.assinatura,observacao=excluded.observacao,autor=auth.uid(),conferido_em=now();
 perform private.evento_financeiro(p_oficina,gen_random_uuid(),'income_reviewed');
end $$;
create function public.exportar_apuracao_contabil(p_oficina uuid,p_inicio date,p_fim date,p_pagina integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$declare l jsonb;t bigint;sig text;begin
 perform private.exigir_financeiro(p_oficina);perform private.validar_periodo_apuracao(p_inicio,p_fim);
 if p_pagina not between 0 and 10000 then raise exception 'Página inválida.' using errcode='22023';end if;
 select count(*) into t from private.linhas_apuracao(p_oficina,p_inicio,p_fim);
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into l from(select * from private.linhas_apuracao(p_oficina,p_inicio,p_fim) order by data,chave limit 300 offset p_pagina*300)x;
 select md5(coalesce(string_agg(row(chave,data,descricao,categoria,grupo,valor,conta_debito,conta_credito)::text,'|' order by chave),'')) into sig from private.linhas_apuracao(p_oficina,p_inicio,p_fim);
 return jsonb_build_object('total',t,'linhas',l,'assinatura',sig);
end $$;
create function public.simular_preco_servico(p_oficina uuid,p_mes date,p_entrada jsonb,p_id uuid default null,p_nome text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare p jsonb;r jsonb;cap numeric;mao numeric;ind numeric;minutos numeric;direto numeric;custo bigint;preco bigint;piso bigint;k text;v numeric;anterior public.simulacoes_precos;begin
 perform private.exigir_financeiro(p_oficina);select dados into p from public.parametros_custeio where oficina_id=p_oficina and mes=p_mes;
 if p is null then raise exception 'Configure a hora produtiva deste mês primeiro.' using errcode='22023';end if;
 foreach k in array array['minutos','materiais','terceiros','outros'] loop v:=(p_entrada->>k)::numeric;if v is null or v<0 or v>10000000000 or (k<>'minutos' and v<>trunc(v)) then raise exception 'Confira a duração e os custos.' using errcode='22023';end if;end loop;
 minutos:=(p_entrada->>'minutos')::numeric;if minutos>1000000 then raise exception 'Duração inválida.' using errcode='22023';end if;
 cap:=(p->>'profissionais')::numeric*(p->>'dias')::numeric*(p->>'horas')::numeric*(p->>'ocupacao')::numeric/100;
 mao:=(p->>'salarios')::numeric*(1+(p->>'encargos')::numeric/100)+(p->>'beneficios')::numeric+(p->>'prolabore')::numeric;ind:=(p->>'indiretos')::numeric+(p->>'depreciacao')::numeric;
 direto:=(p_entrada->>'materiais')::numeric+(p_entrada->>'terceiros')::numeric+(p_entrada->>'outros')::numeric;
 custo:=direto+round(mao/cap*minutos/60)+round(ind/cap*minutos/60);piso:=ceil(custo/(1-((p->>'impostos')::numeric+(p->>'taxas')::numeric)/100));preco:=ceil(custo/(1-((p->>'impostos')::numeric+(p->>'taxas')::numeric+(p->>'margem')::numeric)/100));
 r:=jsonb_build_object('custo',custo,'preco',preco,'piso',piso,'hora',(mao+ind)/cap,'horas_produtivas',cap,'mao_obra',round(mao/cap*minutos/60),'indiretos',round(ind/cap*minutos/60),'tributos',round(preco*(p->>'impostos')::numeric/100),'taxas',round(preco*(p->>'taxas')::numeric/100),'margem_percentual',(p->>'margem')::numeric);
 if p_id is not null then
 perform pg_advisory_xact_lock(hashtextextended('simulacao:'||p_oficina::text||p_id::text,0));select * into anterior from public.simulacoes_precos where oficina_id=p_oficina and id=p_id;
 if anterior.id is not null then if anterior.entrada<>p_entrada or anterior.nome<>p_nome or anterior.mes<>p_mes then raise exception 'Simulação já usada com outros dados.' using errcode='PT409';end if;return anterior.resultado;end if;
 insert into public.simulacoes_precos(id,oficina_id,nome,mes,parametros,entrada,resultado,criado_por) values(p_id,p_oficina,p_nome,p_mes,p,p_entrada,r,auth.uid());end if;
 return r;
end $$;
create function public.listar_simulacoes_precos(p_oficina uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform private.exigir_financeiro(p_oficina);return coalesce((select jsonb_agg(to_jsonb(x)) from(select * from public.simulacoes_precos where oficina_id=p_oficina order by criado_em desc,id limit 30)x),'[]');
end $$;
do $$declare t text;f regprocedure;begin
 foreach t in array array['plano_apuracao','ajustes_apuracao','conferencias_apuracao','simulacoes_precos'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);end loop;
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('salvar_plano_apuracao','registrar_ajuste_apuracao','cancelar_ajuste_apuracao','consultar_apuracao_completa','conferir_apuracao','exportar_apuracao_contabil','simular_preco_servico','listar_simulacoes_precos') loop execute format('revoke all on function %s from public,anon,authenticated',f);execute format('grant execute on function %s to authenticated',f);end loop;
end $$;
revoke all on function private.grupo_apuracao(text,text),private.validar_periodo_apuracao(date,date),private.linhas_apuracao(uuid,date,date) from public,anon,authenticated;
notify pgrst,'reload schema';commit;
