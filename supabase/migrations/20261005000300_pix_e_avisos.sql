begin;
alter table public.baixas_financeiras add constraint baixas_oficina_id_unico unique(oficina_id,id);
create table public.cobrancas_pix(
 id uuid primary key,oficina_id uuid not null,titulo_id uuid not null,valor_centavos bigint not null check(valor_centavos>0),ambiente text not null check(ambiente in ('teste','producao')),
 email_pagador text not null check(length(email_pagador)<=254),situacao text not null default 'criando' check(situacao in ('criando','pendente','aprovado','expirado','cancelado','falhou','divergente','estornado')),
 provedor_id text,recebedor_id text,codigo_pix text,expira_em timestamptz,baixa_id uuid,taxa_centavos bigint not null default 0,conciliacao_manual boolean not null default false,
 criado_por uuid not null references auth.users(id),criado_em timestamptz not null default now(),atualizado_em timestamptz not null default now(),
 foreign key(oficina_id,titulo_id) references public.titulos_financeiros(oficina_id,id),foreign key(oficina_id,baixa_id) references public.baixas_financeiras(oficina_id,id),unique(oficina_id,provedor_id)
);
create index pix_por_titulo on public.cobrancas_pix(oficina_id,titulo_id,criado_em desc);
alter table public.cobrancas_pix enable row level security;
revoke all on public.cobrancas_pix from public,anon,authenticated;
create function public.consultar_cobrancas_pix(p_oficina uuid,p_titulo uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform private.exigir_financeiro(p_oficina);return coalesce((select jsonb_agg(to_jsonb(c)-'email_pagador'-'recebedor_id' order by criado_em desc) from public.cobrancas_pix c where oficina_id=p_oficina and titulo_id=p_titulo),'[]');end $$;
create function public.reservar_cobranca_pix(p_oficina uuid,p_titulo uuid,p_chave uuid,p_valor bigint,p_email text,p_ambiente text) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid;t public.titulos_financeiros;c public.cobrancas_pix;saldo bigint;reservado bigint;begin
 u:=private.exigir_financeiro(p_oficina);select * into t from public.titulos_financeiros where oficina_id=p_oficina and id=p_titulo for update;
 if not found or t.natureza<>'receber' or t.ordem_servico_id is null or t.cancelado_em is not null then raise exception 'Selecione uma conta a receber vinculada à OS.' using errcode='22023';end if;
 select * into c from public.cobrancas_pix where id=p_chave;
 if found then if c.oficina_id<>p_oficina or c.titulo_id<>p_titulo or c.valor_centavos<>p_valor or c.ambiente<>p_ambiente then raise exception 'Chave da cobrança já utilizada.' using errcode='22023';end if;return to_jsonb(c);end if;
 if p_email is null or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_chave is null or p_valor is null or p_valor<=0 then raise exception 'Informe valor e e-mail válidos.' using errcode='22023';end if;
 select aberto_centavos into saldo from private.financeiro_saldos where id=t.id;
 select coalesce(sum(valor_centavos),0) into reservado from public.cobrancas_pix where oficina_id=p_oficina and titulo_id=t.id and situacao in ('criando','pendente','divergente');
 if p_valor>saldo-reservado then raise exception 'Já há uma cobrança aberta ou o valor supera o saldo. Consulte a cobrança existente.' using errcode='22023';end if;
 insert into public.cobrancas_pix(id,oficina_id,titulo_id,valor_centavos,ambiente,email_pagador,criado_por) values(p_chave,p_oficina,t.id,p_valor,p_ambiente,lower(trim(p_email)),u) returning * into c;return to_jsonb(c);
end $$;
-- Apenas o servidor, após consultar o provedor, confirma o recebimento.
create function public.atualizar_cobranca_pix(p_id uuid,p_dados jsonb) returns void language plpgsql security definer set search_path='' as $$
declare c public.cobrancas_pix;t public.titulos_financeiros;saldo bigint;b uuid;taxa bigint;status text:=p_dados->>'situacao';estornado boolean;
begin
 select * into c from public.cobrancas_pix where id=p_id for update;if not found then raise exception 'Cobrança não encontrada.' using errcode='P0002';end if;
 if p_dados->>'referencia' is distinct from c.id::text or (p_dados->>'valor_centavos')::bigint is distinct from c.valor_centavos or p_dados->>'ambiente' is distinct from c.ambiente or coalesce(p_dados->>'moeda','')<>'BRL' or coalesce(p_dados->>'provedor_id','') !~ '^[0-9]+$' or coalesce(p_dados->>'recebedor_id','') !~ '^[0-9]+$' or (c.provedor_id is not null and c.provedor_id<>p_dados->>'provedor_id') or (c.recebedor_id is not null and c.recebedor_id<>p_dados->>'recebedor_id') then raise exception 'Pagamento incompatível com a cobrança.' using errcode='22023';end if;
 if status not in ('pendente','aprovado','expirado','cancelado','falhou','estornado') or status is null then raise exception 'Situação do pagamento inválida.' using errcode='22023';end if;
 taxa:=coalesce((p_dados->>'taxa_centavos')::bigint,0);if taxa<0 or taxa>=c.valor_centavos or length(coalesce(p_dados->>'codigo_pix',''))>4096 then raise exception 'Dados do pagamento inválidos.' using errcode='22023';end if;
 select * into t from public.titulos_financeiros where oficina_id=c.oficina_id and id=c.titulo_id for update;
 b:=c.baixa_id;
 if status='aprovado' and b is null then
  select aberto_centavos into saldo from private.financeiro_saldos where id=t.id;
  if t.cancelado_em is not null or saldo<c.valor_centavos then status:='divergente';
  else
   insert into public.baixas_financeiras(oficina_id,titulo_id,chave,valor_centavos,taxa_centavos,data,conta,forma,observacao,criado_por) values(c.oficina_id,t.id,c.id,c.valor_centavos,taxa,(now() at time zone 'America/Sao_Paulo')::date,'banco','pix','Pix confirmado pelo provedor · '||(p_dados->>'provedor_id'),c.criado_por) returning id into b;
   update public.titulos_financeiros set revisao=revisao+1 where id=t.id;perform private.evento_financeiro(c.oficina_id,t.id,'Pix confirmado');
  end if;
 end if;
 if status='estornado' and b is not null then
  select exists(select 1 from public.baixas_financeiras where oficina_id=c.oficina_id and estorno_de=b) into estornado;
  if not estornado and (p_dados->>'reembolsado_centavos')::bigint=c.valor_centavos then
   insert into public.baixas_financeiras(oficina_id,titulo_id,chave,valor_centavos,taxa_centavos,data,conta,forma,observacao,estorno_de,criado_por) select oficina_id,titulo_id,gen_random_uuid(),valor_centavos,taxa_centavos,(now() at time zone 'America/Sao_Paulo')::date,conta,forma,'Reembolso integral confirmado pelo provedor',id,c.criado_por from public.baixas_financeiras where id=b;
   update public.titulos_financeiros set revisao=revisao+1 where id=t.id;perform private.evento_financeiro(c.oficina_id,t.id,'Pix reembolsado integralmente');
  end if;
 end if;
 -- Eventos atrasados não desfazem recebimentos nem estornos confirmados.
 if c.situacao='estornado' or (b is not null and status not in ('aprovado','estornado','divergente')) then status:=c.situacao;end if;
 update public.cobrancas_pix set situacao=status,provedor_id=p_dados->>'provedor_id',recebedor_id=p_dados->>'recebedor_id',codigo_pix=coalesce(nullif(p_dados->>'codigo_pix',''),codigo_pix),expira_em=coalesce(nullif(p_dados->>'expira_em','')::timestamptz,expira_em),baixa_id=b,taxa_centavos=taxa,conciliacao_manual=status='divergente' or (status='estornado' and coalesce((p_dados->>'reembolsado_centavos')::bigint,0)<>c.valor_centavos),atualizado_em=now() where id=c.id;
end $$;
-- O bot de entrada continua desligado. O operador resolve explicitamente envios incertos.
create function public.resolver_aviso_incerto(p_oficina uuid,p_id uuid,p_resultado text) returns void language plpgsql security definer set search_path='' as $$
begin perform private.exigir_gestao(p_oficina,'automations');
 if p_resultado not in ('confirmado','cancelado','revisar') or p_resultado is null then raise exception 'Informe o resultado da conferência.' using errcode='22023';end if;
 update public.avisos_automaticos set situacao=case p_resultado when 'confirmado' then 'enviado' when 'cancelado' then 'cancelado' else 'revisao' end,aprovado_por=case when p_resultado='revisar' then null else aprovado_por end,aprovado_em=case when p_resultado='revisar' then null else aprovado_em end,telefone_aprovado=case when p_resultado='revisar' then null else telefone_aprovado end where oficina_id=p_oficina and id=p_id and situacao='incerto';
 if not found then raise exception 'Aviso alterado. Atualize a tela.' using errcode='PT409';end if;
end $$;
revoke all on function public.consultar_cobrancas_pix(uuid,uuid),public.reservar_cobranca_pix(uuid,uuid,uuid,bigint,text,text),public.atualizar_cobranca_pix(uuid,jsonb),public.resolver_aviso_incerto(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.consultar_cobrancas_pix(uuid,uuid),public.reservar_cobranca_pix(uuid,uuid,uuid,bigint,text,text),public.resolver_aviso_incerto(uuid,uuid,text) to authenticated;
grant execute on function public.atualizar_cobranca_pix(uuid,jsonb) to service_role;
notify pgrst,'reload schema';commit;
