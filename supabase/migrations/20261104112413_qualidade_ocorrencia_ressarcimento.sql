begin;

alter table public.titulos_financeiros add column acompanhamento_qualidade_id uuid;
alter table public.titulos_financeiros add constraint financeiro_garantia_empresa foreign key(oficina_id,acompanhamento_qualidade_id) references public.acompanhamentos_qualidade(oficina_id,id);
create unique index financeiro_garantia_unica on public.titulos_financeiros(oficina_id,acompanhamento_qualidade_id) where acompanhamento_qualidade_id is not null;

alter function public.salvar_acompanhamento_qualidade(uuid,uuid,text,uuid,text,text,jsonb,integer) set schema private;
revoke all on function private.salvar_acompanhamento_qualidade(uuid,uuid,text,uuid,text,text,jsonb,integer) from public,anon,authenticated;
create function public.salvar_acompanhamento_qualidade(p_oficina uuid,p_id uuid,p_origem text,p_documento uuid,p_tipo text,p_situacao text,p_dados jsonb,p_revisao integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.titulos_financeiros; pago bigint:=0; valor bigint; aprovado boolean; r jsonb; venc date;
begin
 perform private.exigir_gestao(p_oficina,'work_orders');
 perform pg_advisory_xact_lock(hashtextextended('garantia-financeiro:'||p_id,0));
 if p_tipo='fabricante' then
  if exists(select 1 from jsonb_each(p_dados) e where e.key in ('solicitado_centavos','autorizado_centavos','recebido_centavos') and (e.value::text)::numeric<>trunc((e.value::text)::numeric)) then raise exception 'Informe valores em centavos inteiros.' using errcode='22023';end if;
  select * into t from public.titulos_financeiros where oficina_id=p_oficina and acompanhamento_qualidade_id=p_id for update;
  if t.id is not null then select baixado_centavos into pago from private.financeiro_saldos where id=t.id;end if;
  if coalesce((p_dados->>'recebido_centavos')::bigint,0)<>pago then
   raise exception 'Registre o ressarcimento no botão Receber. O caixa usa somente recebimentos confirmados.' using errcode='22023';
  end if;
  valor:=coalesce((p_dados->>'autorizado_centavos')::bigint,0);
  aprovado:=p_situacao in ('autorizada','enviada','recebida','ressarcida','encerrada') and valor>0;
  if aprovado or t.id is not null then perform private.exigir_financeiro(p_oficina);end if;
  if aprovado and length(trim(coalesce(p_dados->>'autorizacao','')))<3 then raise exception 'Registre a autorização do fabricante.' using errcode='22023';end if;
  if pago>valor or (pago>0 and not aprovado) then raise exception 'Estorne o recebimento antes de reduzir ou cancelar a garantia.' using errcode='22023';end if;
  venc:=coalesce(nullif(p_dados->>'vencimento_ressarcimento','')::date,t.vencimento,(now() at time zone 'America/Sao_Paulo')::date);
 end if;
 r:=private.salvar_acompanhamento_qualidade(p_oficina,p_id,p_origem,p_documento,p_tipo,p_situacao,p_dados,p_revisao);
 if p_tipo='fabricante' then
  if aprovado and t.id is null then
   insert into public.titulos_financeiros(oficina_id,natureza,descricao,categoria,valor_centavos,competencia,vencimento,pessoa,observacoes,acompanhamento_qualidade_id,criado_por)
   values(p_oficina,'receber','Garantia · '||left(p_dados->>'fabricante',150),'outras_receitas',valor,(now() at time zone 'America/Sao_Paulo')::date,venc,left(p_dados->>'fabricante',200),'Ressarcimento do fabricante. Aprovação não é recebimento.',p_id,auth.uid()) returning * into t;
   perform private.evento_financeiro(p_oficina,t.id,'warranty_approved');
  elsif t.id is not null and (t.valor_centavos is distinct from valor or t.vencimento<>venc or (t.cancelado_em is null)<>aprovado) then
   update public.titulos_financeiros set valor_centavos=case when aprovado then valor else valor_centavos end,vencimento=venc,
    cancelado_em=case when aprovado then null else coalesce(cancelado_em,now()) end,motivo_cancelamento=case when not aprovado then 'Garantia não aprovada ou cancelada' end,revisao=revisao+1 where id=t.id;
   perform private.evento_financeiro(p_oficina,t.id,'warranty_updated');
  end if;
 end if;
 return r;
end $$;

-- Recebimentos e estornos usam o mesmo fluxo financeiro da OS e mantêm a garantia atualizada.
create function private.atualizar_ressarcimento_garantia() returns trigger language plpgsql security definer set search_path='' as $$
declare a public.acompanhamentos_qualidade; antes jsonb; pago bigint; total bigint; aid uuid;
begin
 select acompanhamento_qualidade_id,valor_centavos into aid,total from public.titulos_financeiros where id=new.titulo_id and oficina_id=new.oficina_id;
 if aid is null then return new;end if;
 select * into a from public.acompanhamentos_qualidade where id=aid and oficina_id=new.oficina_id for update;
 antes:=to_jsonb(a);
 select baixado_centavos into pago from private.financeiro_saldos where id=new.titulo_id;
 update public.acompanhamentos_qualidade set dados=dados||jsonb_build_object('recebido_centavos',pago,'comprovante','Recebimento e estornos registrados no financeiro'),
 situacao=case when pago=total then 'ressarcida' when situacao='ressarcida' then 'autorizada' else situacao end,revisao=revisao+1,atualizado_em=now(),autor=auth.uid() where id=aid returning * into a;
 insert into public.historico_acompanhamento_qualidade(oficina_id,acompanhamento_id,revisao,antes,depois,autor) values(a.oficina_id,aid,a.revisao,antes,to_jsonb(a),auth.uid());
 return new;
end $$;
create trigger ressarcimento_garantia after insert on public.baixas_financeiras for each row execute function private.atualizar_ressarcimento_garantia();
revoke all on function private.atualizar_ressarcimento_garantia() from public,anon,authenticated;

create function public.consultar_financeiro_garantia(p_oficina uuid,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform private.exigir_financeiro(p_oficina);return (select to_jsonb(t) from private.financeiro_saldos t join public.titulos_financeiros v on v.id=t.id and v.oficina_id=t.oficina_id where t.oficina_id=p_oficina and v.acompanhamento_qualidade_id=p_id);end $$;

-- Valores/cancelamento são controlados pela garantia; vencimento e pagamentos continuam no financeiro.
do $$declare s text;begin
 s:=pg_get_functiondef('public.salvar_titulo_financeiro(uuid,uuid,jsonb,integer)'::regprocedure);
 if position('t.automatico or t.compra_id is not null' in s)=0 then raise exception 'Validação financeira não encontrada';end if;
 s:=replace(s,'t.automatico or t.compra_id is not null','t.automatico or t.acompanhamento_qualidade_id is not null or t.compra_id is not null');execute s;
 s:=pg_get_functiondef('public.cancelar_titulo_financeiro(uuid,uuid,integer,text)'::regprocedure);
 if position('t.automatico or t.compra_id is not null' in s)=0 then raise exception 'Validação de cancelamento não encontrada';end if;
 execute replace(s,'t.automatico or t.compra_id is not null','t.automatico or t.acompanhamento_qualidade_id is not null or t.compra_id is not null');
end $$;

create table public.ocorrencias_da_analise (
 oficina_id uuid not null,analise_id uuid primary key,ocorrencia_id uuid not null unique,
 foreign key(oficina_id,analise_id) references public.acompanhamentos_qualidade(oficina_id,id)
);
alter table public.ocorrencias_da_analise enable row level security;
revoke all on public.ocorrencias_da_analise from public,anon,authenticated;
create function public.ocorrencia_da_analise(p_oficina uuid,p_id uuid,p_criar boolean default false,p_dados jsonb default null,p_revisao integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.acompanhamentos_qualidade; oid uuid; q jsonb;
begin
 perform private.exigir_gestao(p_oficina,'work_orders');
 select * into a from public.acompanhamentos_qualidade where oficina_id=p_oficina and id=p_id and tipo='analise';
 if not found then raise exception 'Análise indisponível.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('ocorrencia-analise:'||p_id,0));
 select ocorrencia_id into oid from public.ocorrencias_da_analise where oficina_id=p_oficina and analise_id=p_id;
 if oid is null and p_criar then
  oid:=gen_random_uuid();
  if a.ordem_servico_id is not null then
   perform public.salvar_ocorrencia_qualidade(p_oficina,oid,jsonb_build_object('ordem_original_id',a.ordem_servico_id,'tipo','garantia','motivo','outro','descricao',a.dados->>'descricao','diagnostico',coalesce(a.dados->>'conclusao','')),null);
  else
   perform public.salvar_qualidade_atendimento(p_oficina,a.atendimento_id,oid,jsonb_build_object('tipo','garantia','motivo',a.dados->>'descricao','aberto_em',(now() at time zone 'America/Sao_Paulo')::date,'custo_centavos',0,'minutos',0),null);
  end if;
  insert into public.ocorrencias_da_analise values(p_oficina,p_id,oid);
 end if;
 if oid is null then return null;end if;
 if a.ordem_servico_id is not null then
  select to_jsonb(o) into q from public.ocorrencias_qualidade o where oficina_id=p_oficina and id=oid;
 else
  select to_jsonb(o) into q from public.qualidade_atendimento o where oficina_id=p_oficina and id=oid;
 end if;
 if p_dados is not null then
  if p_revisao is null or p_revisao is distinct from (q->>'revisao')::integer then raise exception 'Ocorrência alterada. Atualize antes de salvar.' using errcode='PT409';end if;
  if a.ordem_servico_id is not null then
   perform public.salvar_ocorrencia_qualidade(p_oficina,oid,q||jsonb_build_object('outros_custos_centavos',(p_dados->>'custo_centavos')::bigint,'horas_retrabalho',(p_dados->>'minutos')::numeric/60),p_revisao);
   select to_jsonb(o) into q from public.ocorrencias_qualidade o where oficina_id=p_oficina and id=oid;
  else
   perform public.salvar_qualidade_atendimento(p_oficina,a.atendimento_id,oid,q||jsonb_build_object('custo_centavos',(p_dados->>'custo_centavos')::bigint,'minutos',(p_dados->>'minutos')::integer),p_revisao);
   select to_jsonb(o) into q from public.qualidade_atendimento o where oficina_id=p_oficina and id=oid;
  end if;
 end if;
 return q||jsonb_build_object('origem',case when a.ordem_servico_id is not null then 'os' else 'atendimento' end,'custo_centavos',coalesce(q->'outros_custos_centavos',q->'custo_centavos'),'minutos',coalesce(q->'minutos',to_jsonb(round((q->>'horas_retrabalho')::numeric*60))));
end $$;
revoke all on function public.salvar_acompanhamento_qualidade(uuid,uuid,text,uuid,text,text,jsonb,integer),public.consultar_financeiro_garantia(uuid,uuid),public.ocorrencia_da_analise(uuid,uuid,boolean,jsonb,integer) from public,anon;
grant execute on function public.salvar_acompanhamento_qualidade(uuid,uuid,text,uuid,text,text,jsonb,integer),public.consultar_financeiro_garantia(uuid,uuid),public.ocorrencia_da_analise(uuid,uuid,boolean,jsonb,integer) to authenticated;
notify pgrst,'reload schema';
commit;
