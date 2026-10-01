begin;
insert into public.recursos(codigo,descricao) values('finance','Financeiro da oficina');
insert into public.recursos_plano(codigo_plano,codigo_recurso,habilitado) values('intermediate','finance',true),('complete','finance',true);

create table public.titulos_financeiros (
 id uuid primary key default gen_random_uuid(), oficina_id uuid not null references public.oficinas(id),
 natureza text not null check(natureza in ('receber','pagar')), descricao text not null check(length(trim(descricao)) between 3 and 200),
 categoria text not null check(categoria in ('servicos','outras_receitas','pecas_externas','pessoal','aluguel','agua_luz','impostos','terceiros','outras_despesas','compra_estoque','aporte','retirada','saldo_inicial','transferencia')),
 valor_centavos bigint not null check(valor_centavos between 1 and 10000000000), competencia date not null, vencimento date not null,
 pessoa text not null default '' check(length(pessoa)<=200), observacoes text not null default '' check(length(observacoes)<=2000),
 transferencia_id uuid, ordem_servico_id uuid, automatico boolean not null default false, custos_revisados boolean not null default false,
 cancelado_em timestamptz, motivo_cancelamento text, revisao integer not null default 1,
 criado_por uuid references auth.users(id), criado_em timestamptz not null default now(),
 unique(oficina_id,id), foreign key(oficina_id,ordem_servico_id) references public.ordens_servico(oficina_id,id),
 check(not automatico or (ordem_servico_id is not null and natureza='receber' and categoria='servicos'))
);
create unique index financeiro_os_unica on public.titulos_financeiros(oficina_id,ordem_servico_id) where automatico;
create index financeiro_periodo on public.titulos_financeiros(oficina_id,competencia,vencimento);
create table public.baixas_financeiras (
 id uuid primary key default gen_random_uuid(), oficina_id uuid not null, titulo_id uuid not null,
 valor_centavos bigint not null check(valor_centavos between 1 and 10000000000), taxa_centavos bigint not null default 0 check(taxa_centavos>=0 and taxa_centavos<valor_centavos),
 data date not null, conta text not null check(conta in ('caixa','banco')), forma text not null check(forma in ('pix','dinheiro','debito','credito','boleto','transferencia','outro')),
 observacao text not null default '' check(length(observacao)<=1000), estorno_de uuid unique references public.baixas_financeiras(id),
 chave uuid not null, criado_por uuid not null references auth.users(id), criado_em timestamptz not null default now(),
 foreign key(oficina_id,titulo_id) references public.titulos_financeiros(oficina_id,id), unique(oficina_id,chave)
);
create index baixas_financeiras_titulo on public.baixas_financeiras(oficina_id,titulo_id);
create index baixas_financeiras_data on public.baixas_financeiras(oficina_id,data);
create trigger financeiro_baixas_imutaveis before update or delete on public.baixas_financeiras for each row execute function private.reject_mutation();
create function private.exigir_financeiro(p_oficina uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid;begin u:=private.require_staff(p_oficina);
 if not private.has_feature(p_oficina,'finance') or not exists(select 1 from public.membros_oficina where oficina_id=p_oficina and usuario_id=u and ativo and perfil in ('owner','manager')) then raise exception 'Financeiro disponível somente à gerência e nos planos habilitados.' using errcode='42501';end if;return u;end $$;
alter table public.titulos_financeiros enable row level security;
alter table public.baixas_financeiras enable row level security;
grant select on public.titulos_financeiros,public.baixas_financeiras to authenticated;
create policy financeiro_titulos_leitura on public.titulos_financeiros for select to authenticated using(private.has_feature(oficina_id,'finance') and exists(select 1 from public.membros_oficina where oficina_id=titulos_financeiros.oficina_id and usuario_id=auth.uid() and ativo and perfil in ('owner','manager')));
create policy financeiro_baixas_leitura on public.baixas_financeiras for select to authenticated using(private.has_feature(oficina_id,'finance') and exists(select 1 from public.membros_oficina where oficina_id=baixas_financeiras.oficina_id and usuario_id=auth.uid() and ativo and perfil in ('owner','manager')));

create function private.evento_financeiro(p_oficina uuid,p_id uuid,p_acao text) returns void language plpgsql security definer set search_path='' as $$begin
 insert into public.registros_auditoria(oficina_id,usuario_autor_id,tipo_autor,acao,tipo_entidade,entidade_id,correlacao_id) values(p_oficina,auth.uid(),'user',p_acao,'financeiro',p_id,gen_random_uuid());
 insert into public.eventos_negocio(oficina_id,tipo_evento,tipo_agregado,agregado_id,versao_agregado,chave_deduplicacao,dados) values(p_oficina,'finance.'||p_acao,'finance',p_id,1,gen_random_uuid()::text,jsonb_build_object('titulo_id',p_id));
end $$;
create function private.gerar_financeiro_os() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.situacao='delivered' and old.situacao<>'delivered' and new.total_centavos>0 then
 insert into public.titulos_financeiros(oficina_id,natureza,descricao,categoria,valor_centavos,competencia,vencimento,pessoa,ordem_servico_id,automatico,criado_por)
 values(new.oficina_id,'receber','OS #'||new.numero,'servicos',new.total_centavos,(new.entregue_em at time zone 'America/Sao_Paulo')::date,(new.entregue_em at time zone 'America/Sao_Paulo')::date,coalesce(new.dados_cliente->>'nome','Cliente'),new.id,true,auth.uid()) on conflict do nothing;
 perform private.evento_financeiro(new.oficina_id,new.id,'os_generated');end if;return new;end $$;
create trigger os_financeiro after update of situacao on public.ordens_servico for each row execute function private.gerar_financeiro_os();
-- OS anteriores entram a receber; não presumimos que o cliente já pagou.
insert into public.titulos_financeiros(oficina_id,natureza,descricao,categoria,valor_centavos,competencia,vencimento,pessoa,ordem_servico_id,automatico)
select oficina_id,'receber','OS #'||numero,'servicos',total_centavos,(entregue_em at time zone 'America/Sao_Paulo')::date,(entregue_em at time zone 'America/Sao_Paulo')::date,coalesce(dados_cliente->>'nome','Cliente'),id,true from public.ordens_servico where situacao='delivered' and total_centavos>0 on conflict do nothing;

create view private.financeiro_saldos as select t.*,coalesce(b.baixado,0)::bigint as baixado_centavos,(t.valor_centavos-coalesce(b.baixado,0))::bigint as aberto_centavos
from public.titulos_financeiros t left join lateral(select sum(case when estorno_de is null then valor_centavos else -valor_centavos end) baixado from public.baixas_financeiras where titulo_id=t.id and oficina_id=t.oficina_id) b on true;

create function public.salvar_titulo_financeiro(p_oficina uuid,p_id uuid,p_dados jsonb,p_revisao integer default null) returns uuid language plpgsql security definer set search_path='' as $$
declare t public.titulos_financeiros%rowtype;u uuid;v bigint;n text;c text;begin
 u:=private.exigir_financeiro(p_oficina);if p_id is null then raise exception 'Identificador obrigatório' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_id::text,0));
 select * into t from public.titulos_financeiros where oficina_id=p_oficina and id=p_id for update;
 if found and p_revisao is null then return p_id;end if;
 if t.id is not null and (t.revisao is distinct from p_revisao or t.cancelado_em is not null) then raise exception 'Lançamento alterado ou cancelado. Atualize a tela.' using errcode='40001';end if;
 v:=(p_dados->>'valor_centavos')::bigint;n:=p_dados->>'natureza';c:=p_dados->>'categoria';
 if v is null or v not between 1 and 10000000000 or n is null or n not in ('pagar','receber') or c is null or
 (n='receber' and c not in ('servicos','outras_receitas','aporte','saldo_inicial')) or
 (n='pagar' and c not in ('pecas_externas','pessoal','aluguel','agua_luz','impostos','terceiros','outras_despesas','compra_estoque','retirada','saldo_inicial')) or
 length(trim(coalesce(p_dados->>'descricao',''))) not between 3 and 200 or (p_dados->>'competencia')::date is null or (p_dados->>'vencimento')::date is null then raise exception 'Confira descrição, categoria, datas e valor.' using errcode='22023';end if;
 if t.id is not null and (t.automatico or exists(select 1 from public.baixas_financeiras where titulo_id=t.id)) then
 if v<>t.valor_centavos or n<>t.natureza or c<>t.categoria or (p_dados->>'competencia')::date<>t.competencia or nullif(p_dados->>'ordem_servico_id','')::uuid is distinct from t.ordem_servico_id then raise exception 'Após pagamento ou integração com OS, apenas descrição, vencimento e observações podem mudar. Estorne e cancele para corrigir valores manuais.' using errcode='22023';end if;end if;
 if nullif(p_dados->>'ordem_servico_id','') is not null and not exists(select 1 from public.ordens_servico where oficina_id=p_oficina and id=(p_dados->>'ordem_servico_id')::uuid) then raise exception 'OS não encontrada nesta oficina' using errcode='22023';end if;
 if n='receber' and nullif(p_dados->>'ordem_servico_id','') is not null and t.id is null then raise exception 'A receita da OS é gerada automaticamente na entrega.' using errcode='22023';end if;
 insert into public.titulos_financeiros(id,oficina_id,natureza,descricao,categoria,valor_centavos,competencia,vencimento,pessoa,observacoes,ordem_servico_id,criado_por)
 values(p_id,p_oficina,n,trim(p_dados->>'descricao'),c,v,(p_dados->>'competencia')::date,(p_dados->>'vencimento')::date,coalesce(p_dados->>'pessoa',''),coalesce(p_dados->>'observacoes',''),nullif(p_dados->>'ordem_servico_id','')::uuid,u)
 on conflict(id) do update set descricao=excluded.descricao,natureza=excluded.natureza,categoria=excluded.categoria,valor_centavos=excluded.valor_centavos,competencia=excluded.competencia,vencimento=excluded.vencimento,pessoa=excluded.pessoa,observacoes=excluded.observacoes,ordem_servico_id=excluded.ordem_servico_id,revisao=public.titulos_financeiros.revisao+1 where titulos_financeiros.oficina_id=p_oficina;
 perform private.evento_financeiro(p_oficina,p_id,'saved');return p_id;end $$;

create function public.baixar_titulo_financeiro(p_oficina uuid,p_titulo uuid,p_chave uuid,p_valor bigint,p_taxa bigint,p_data date,p_conta text,p_forma text,p_observacao text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare t public.titulos_financeiros%rowtype;u uuid;s bigint;b uuid;begin
 u:=private.exigir_financeiro(p_oficina);
 select * into t from public.titulos_financeiros where oficina_id=p_oficina and id=p_titulo for update;
 if not found then raise exception 'Lançamento não encontrado' using errcode='P0002';end if;
 select id into b from public.baixas_financeiras where oficina_id=p_oficina and chave=p_chave;if found then return b;end if;
 select aberto_centavos into s from private.financeiro_saldos where id=t.id;
 if t.cancelado_em is not null or p_valor is null or p_valor<=0 or p_valor>s or p_taxa is null or p_taxa<0 or p_taxa>=p_valor or (t.natureza='pagar' and p_taxa<>0) or p_data is null or p_data>(now() at time zone 'America/Sao_Paulo')::date or p_chave is null then raise exception 'Confira valor, taxa e data. Não é possível pagar acima do saldo ou em data futura.' using errcode='22023';end if;
 insert into public.baixas_financeiras(oficina_id,titulo_id,chave,valor_centavos,taxa_centavos,data,conta,forma,observacao,criado_por) values(p_oficina,t.id,p_chave,p_valor,p_taxa,p_data,p_conta,p_forma,p_observacao,u) returning id into b;
 update public.titulos_financeiros set revisao=revisao+1 where id=t.id;
 perform private.evento_financeiro(p_oficina,t.id,'paid');return b;end $$;
create function public.estornar_baixa_financeira(p_oficina uuid,p_baixa uuid,p_data date,p_motivo text) returns uuid language plpgsql security definer set search_path='' as $$
declare b public.baixas_financeiras%rowtype;u uuid;id_novo uuid;begin
 u:=private.exigir_financeiro(p_oficina);select * into b from public.baixas_financeiras where oficina_id=p_oficina and id=p_baixa;
 if not found then raise exception 'Pagamento não encontrado' using errcode='P0002';end if;
 perform 1 from public.titulos_financeiros where id=b.titulo_id for update;
 select id into id_novo from public.baixas_financeiras where estorno_de=b.id;if found then return id_novo;end if;
 if exists(select 1 from public.titulos_financeiros where id=b.titulo_id and transferencia_id is not null) then raise exception 'Use o estorno da transferência para corrigir as duas contas juntas.' using errcode='22023';end if;
 if b.estorno_de is not null or p_data is null or p_data<b.data or p_data>(now() at time zone 'America/Sao_Paulo')::date or length(trim(coalesce(p_motivo,''))) not between 3 and 1000 then raise exception 'Informe motivo e data válidos para o estorno.' using errcode='22023';end if;
 insert into public.baixas_financeiras(oficina_id,titulo_id,valor_centavos,taxa_centavos,data,conta,forma,observacao,estorno_de,chave,criado_por) values(p_oficina,b.titulo_id,b.valor_centavos,b.taxa_centavos,p_data,b.conta,b.forma,p_motivo,b.id,gen_random_uuid(),u) returning id into id_novo;
 update public.titulos_financeiros set revisao=revisao+1 where id=b.titulo_id;
 perform private.evento_financeiro(p_oficina,b.titulo_id,'reversed');return id_novo;end $$;
create function public.cancelar_titulo_financeiro(p_oficina uuid,p_titulo uuid,p_revisao integer,p_motivo text) returns void language plpgsql security definer set search_path='' as $$
declare t public.titulos_financeiros%rowtype;begin
 perform private.exigir_financeiro(p_oficina);select * into t from public.titulos_financeiros where oficina_id=p_oficina and id=p_titulo for update;
 if not found then raise exception 'Lançamento não encontrado' using errcode='P0002';end if;
 if t.revisao is distinct from p_revisao then raise exception 'Atualize o lançamento antes de cancelar.' using errcode='40001';end if;
 if t.automatico or (select baixado_centavos from private.financeiro_saldos where id=t.id)<>0 or length(trim(coalesce(p_motivo,''))) not between 3 and 1000 then raise exception 'Estorne os pagamentos e informe o motivo. Receita automática de OS não pode ser cancelada por aqui.' using errcode='22023';end if;
 update public.titulos_financeiros set cancelado_em=now(),motivo_cancelamento=p_motivo,revisao=revisao+1 where id=t.id;
 perform private.evento_financeiro(p_oficina,t.id,'cancelled');end $$;
create function public.revisar_custos_financeiro(p_oficina uuid,p_titulo uuid) returns void language plpgsql security definer set search_path='' as $$begin
 perform private.exigir_financeiro(p_oficina);update public.titulos_financeiros set custos_revisados=true,revisao=revisao+1 where oficina_id=p_oficina and id=p_titulo and automatico;
 if not found then raise exception 'Receita de OS não encontrada' using errcode='P0002';end if;perform private.evento_financeiro(p_oficina,p_titulo,'costs_reviewed');end $$;
create function public.historico_financeiro(p_oficina uuid,p_titulo uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare r jsonb;begin
 perform private.exigir_financeiro(p_oficina);select coalesce(jsonb_agg(to_jsonb(b) order by b.criado_em desc,b.id),'[]') into r from public.baixas_financeiras b where oficina_id=p_oficina and titulo_id=p_titulo;return r;end $$;

create function public.consultar_financeiro(p_oficina uuid,p_inicio date,p_fim date,p_busca text default '',p_filtro text default 'abertos',p_natureza text default '',p_pagina integer default 0,p_os uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare resumo jsonb;lista jsonb;total bigint;contas jsonb;os jsonb;begin
 perform private.exigir_financeiro(p_oficina);
 if p_inicio is null or p_fim is null or p_inicio>p_fim or p_fim-p_inicio>366 then raise exception 'Selecione um período de até 367 dias.' using errcode='22023';end if;
 with t as(select * from private.financeiro_saldos where oficina_id=p_oficina and cancelado_em is null),
 b as(select x.*,t.natureza,t.categoria,case when x.estorno_de is null then 1 else -1 end sinal from public.baixas_financeiras x join public.titulos_financeiros t on t.id=x.titulo_id where x.oficina_id=p_oficina and x.data between p_inicio and p_fim),
 c as(select coalesce(sum(round(-m.quantidade*m.custo_centavos)),0) valor from public.movimentacoes_estoque m where m.oficina_id=p_oficina and m.ordem_servico_id is not null and (m.criado_em at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim)
 select jsonb_build_object(
 'receitas',coalesce((select sum(valor_centavos) from t where natureza='receber' and categoria in ('servicos','outras_receitas') and competencia between p_inicio and p_fim),0),
 'despesas',coalesce((select sum(valor_centavos) from t where natureza='pagar' and categoria not in ('compra_estoque','retirada','saldo_inicial','transferencia') and competencia between p_inicio and p_fim),0),
 'pecas',(select valor from c),'taxas',coalesce((select sum(sinal*taxa_centavos) from b),0),
 'entradas',coalesce((select sum(sinal*(valor_centavos-taxa_centavos)) from b where natureza='receber' and categoria<>'transferencia'),0),
 'saidas',coalesce((select sum(sinal*valor_centavos) from b where natureza='pagar' and categoria<>'transferencia'),0),
 'receber',coalesce((select sum(aberto_centavos) from t where natureza='receber'),0),
 'pagar',coalesce((select sum(aberto_centavos) from t where natureza='pagar'),0),
 'receber_atrasado',coalesce((select sum(aberto_centavos) from t where natureza='receber' and vencimento<(now() at time zone 'America/Sao_Paulo')::date),0),
 'pagar_atrasado',coalesce((select sum(aberto_centavos) from t where natureza='pagar' and vencimento<(now() at time zone 'America/Sao_Paulo')::date),0),
 'revisar_custos',(select count(*) from t where automatico and not custos_revisados and competencia between p_inicio and p_fim)) into resumo;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into contas from (select b.conta,sum((case when b.estorno_de is null then 1 else -1 end)*(case when t.natureza='receber' then b.valor_centavos-b.taxa_centavos else -b.valor_centavos end))::bigint saldo from public.baixas_financeiras b join public.titulos_financeiros t on t.id=b.titulo_id where b.oficina_id=p_oficina group by b.conta) x;
 select count(*) into total from private.financeiro_saldos t where t.oficina_id=p_oficina and (p_os is null or t.ordem_servico_id=p_os) and (p_natureza='' or t.natureza=p_natureza) and concat(t.descricao,' ',t.pessoa) ilike '%'||left(p_busca,120)||'%' and
 case p_filtro when 'abertos' then t.cancelado_em is null and t.aberto_centavos>0 when 'atrasados' then t.cancelado_em is null and t.aberto_centavos>0 and t.vencimento<(now() at time zone 'America/Sao_Paulo')::date when 'pagos' then t.cancelado_em is null and t.aberto_centavos=0 and t.competencia between p_inicio and p_fim when 'cancelados' then t.cancelado_em is not null and t.competencia between p_inicio and p_fim when 'vencimentos' then t.cancelado_em is null and t.vencimento between p_inicio and p_fim else t.cancelado_em is null and t.competencia between p_inicio and p_fim end;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into lista from (select t.* from private.financeiro_saldos t where t.oficina_id=p_oficina and (p_os is null or t.ordem_servico_id=p_os) and (p_natureza='' or t.natureza=p_natureza) and concat(t.descricao,' ',t.pessoa) ilike '%'||left(p_busca,120)||'%' and
 case p_filtro when 'abertos' then t.cancelado_em is null and t.aberto_centavos>0 when 'atrasados' then t.cancelado_em is null and t.aberto_centavos>0 and t.vencimento<(now() at time zone 'America/Sao_Paulo')::date when 'pagos' then t.cancelado_em is null and t.aberto_centavos=0 and t.competencia between p_inicio and p_fim when 'cancelados' then t.cancelado_em is not null and t.competencia between p_inicio and p_fim when 'vencimentos' then t.cancelado_em is null and t.vencimento between p_inicio and p_fim else t.cancelado_em is null and t.competencia between p_inicio and p_fim end order by t.vencimento,t.id limit 30 offset greatest(p_pagina,0)*30) x;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into os from (
 select t.id,t.ordem_servico_id,t.descricao,t.pessoa,t.valor_centavos,t.custos_revisados,
 coalesce((select sum(round(-m.quantidade*m.custo_centavos)) from public.movimentacoes_estoque m where m.oficina_id=p_oficina and m.ordem_servico_id=t.ordem_servico_id),0)::bigint as pecas,
 coalesce((select sum(d.valor_centavos) from public.titulos_financeiros d where d.oficina_id=p_oficina and d.ordem_servico_id=t.ordem_servico_id and d.natureza='pagar' and d.cancelado_em is null and d.categoria not in ('compra_estoque','retirada','saldo_inicial','transferencia')),0)::bigint despesas,
 coalesce((select sum(case when b.estorno_de is null then b.taxa_centavos else -b.taxa_centavos end) from public.baixas_financeiras b where b.titulo_id=t.id),0)::bigint taxas
 from public.titulos_financeiros t where t.oficina_id=p_oficina and t.automatico and t.competencia between p_inicio and p_fim order by t.competencia desc,t.id limit 100) x;
 return jsonb_build_object('resumo',resumo,'contas',contas,'itens',lista,'total',total,'ordens',os);end $$;

create function public.transferir_financeiro(p_oficina uuid,p_chave uuid,p_valor bigint,p_data date,p_origem text,p_destino text) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid;t uuid;n text;begin
 u:=private.exigir_financeiro(p_oficina);if p_chave is null or p_valor is null or p_valor not between 1 and 10000000000 or p_data is null or p_data>(now() at time zone 'America/Sao_Paulo')::date or p_origem is null or p_destino is null or p_origem=p_destino or p_origem not in ('caixa','banco') or p_destino not in ('caixa','banco') then raise exception 'Confira valor, data e contas diferentes.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_chave::text,0));
 if exists(select 1 from public.titulos_financeiros where oficina_id=p_oficina and transferencia_id=p_chave) then return p_chave;end if;
 foreach n in array array['pagar','receber'] loop
 insert into public.titulos_financeiros(oficina_id,natureza,descricao,categoria,valor_centavos,competencia,vencimento,transferencia_id,criado_por) values(p_oficina,n,'Transferência entre caixa e banco','transferencia',p_valor,p_data,p_data,p_chave,u) returning id into t;
 perform public.baixar_titulo_financeiro(p_oficina,t,gen_random_uuid(),p_valor,0,p_data,case when n='pagar' then p_origem else p_destino end,'transferencia','Transferência interna');
 end loop;return p_chave;end $$;
create function public.estornar_transferencia_financeira(p_oficina uuid,p_transferencia uuid,p_data date,p_motivo text) returns void language plpgsql security definer set search_path='' as $$
declare u uuid;b record;begin
 u:=private.exigir_financeiro(p_oficina);
 perform 1 from public.titulos_financeiros where oficina_id=p_oficina and transferencia_id=p_transferencia order by id for update;
 if not found then raise exception 'Transferência não encontrada.' using errcode='P0002';end if;
 if p_data is null or p_data>(now() at time zone 'America/Sao_Paulo')::date or length(trim(coalesce(p_motivo,''))) not between 3 and 1000 then raise exception 'Informe data e motivo válidos.' using errcode='22023';end if;
 for b in select x.* from public.baixas_financeiras x join public.titulos_financeiros t on t.id=x.titulo_id where t.oficina_id=p_oficina and t.transferencia_id=p_transferencia and x.estorno_de is null loop
 if p_data<b.data then raise exception 'Estorno não pode anteceder a transferência.' using errcode='22023';end if;
 insert into public.baixas_financeiras(oficina_id,titulo_id,valor_centavos,taxa_centavos,data,conta,forma,observacao,estorno_de,chave,criado_por) values(p_oficina,b.titulo_id,b.valor_centavos,0,p_data,b.conta,b.forma,p_motivo,b.id,gen_random_uuid(),u) on conflict(estorno_de) do nothing;
 update public.titulos_financeiros set cancelado_em=coalesce(cancelado_em,now()),motivo_cancelamento=p_motivo,revisao=revisao+1 where id=b.titulo_id;
 end loop;perform private.evento_financeiro(p_oficina,p_transferencia,'transfer_reversed');end $$;

do $$declare r record;begin for r in select p.oid::regprocedure assinatura,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='public' and p.proname in ('transferir_financeiro','estornar_transferencia_financeira','salvar_titulo_financeiro','baixar_titulo_financeiro','estornar_baixa_financeira','cancelar_titulo_financeiro','revisar_custos_financeiro','historico_financeiro','consultar_financeiro')) or (n.nspname='private' and p.proname in ('exigir_financeiro','evento_financeiro','gerar_financeiro_os')) loop execute format('revoke all on function %s from public,anon,authenticated',r.assinatura);if r.nspname='public' then execute format('grant execute on function %s to authenticated',r.assinatura);end if;end loop;end $$;
notify pgrst,'reload schema';
commit;
