-- O abatimento é parte do preço da OS; nunca uma entrada fictícia no caixa.
create table private.descontos_recebimento_os (
  baixa_id uuid primary key references public.baixas_financeiras(id),
  desconto_centavos bigint not null check (desconto_centavos > 0),
  saldo_antes_desconto_centavos bigint not null check (saldo_antes_desconto_centavos > desconto_centavos),
  vencimento_restante date
);
revoke all on private.descontos_recebimento_os from public,anon,authenticated;
create trigger descontos_recebimento_imutaveis before update or delete on private.descontos_recebimento_os
  for each row execute function private.reject_mutation();

create function public.baixar_titulo_com_desconto_os(
  p_oficina uuid, p_titulo uuid, p_chave uuid, p_valor bigint, p_taxa bigint,
  p_data date, p_conta text, p_forma text, p_desconto bigint, p_saldo bigint,
  p_observacao text default '', p_vencimento date default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  t public.titulos_financeiros%rowtype;
  o public.ordens_servico%rowtype;
  a public.atendimentos_servicos%rowtype;
  anterior public.baixas_financeiras%rowtype;
  desconto_anterior private.descontos_recebimento_os%rowtype;
  atendimento uuid; saldo bigint; baixa uuid;
begin
  perform private.conferir_operacao(p_oficina,'baixar_titulo_com_desconto_os');
  perform private.exigir_financeiro(p_oficina);
  perform private.conferir_operacao(p_oficina,'salvar_ordem_servico');
  select * into t from public.titulos_financeiros where oficina_id=p_oficina and id=p_titulo;
  if not found or t.natureza<>'receber' then
    raise exception 'Este desconto é exclusivo para recebimentos de OS.' using errcode='22023';
  end if;
  if t.automatico and t.ordem_servico_id is not null then
    perform private.exigir_os(p_oficina);
    -- A edição da OS também obtém a linha antes da trava financeira.
    select * into o from public.ordens_servico where oficina_id=p_oficina and id=t.ordem_servico_id for update;
    if not found or o.arquivado_em is not null or o.situacao='cancelled' then
      raise exception 'OS indisponível para desconto.' using errcode='22023';
    end if;
    perform private.travar_financeiro_os(p_oficina,p_titulo);
  else
    perform private.exigir_servicos(p_oficina);
    select atendimento_id into atendimento from public.cobrancas_atendimento where oficina_id=p_oficina and titulo_id=p_titulo;
    if atendimento is null then
      raise exception 'Este desconto é exclusivo para recebimentos de OS.' using errcode='22023';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||atendimento::text,0));
    select * into a from public.atendimentos_servicos where oficina_id=p_oficina and id=atendimento for update;
    if not found or a.situacao in ('orcamento','cancelado') then
      raise exception 'OS indisponível para desconto.' using errcode='22023';
    end if;
  end if;
  select * into t from public.titulos_financeiros where oficina_id=p_oficina and id=p_titulo for update;
  select * into anterior from public.baixas_financeiras where oficina_id=p_oficina and chave=p_chave;
  if found then
    select * into desconto_anterior from private.descontos_recebimento_os where baixa_id=anterior.id;
    if anterior.titulo_id=p_titulo and anterior.estorno_de is null
       and desconto_anterior.desconto_centavos=p_desconto and anterior.valor_centavos=p_valor
       and anterior.taxa_centavos=p_taxa and anterior.data=p_data
       and anterior.conta=p_conta and anterior.forma=p_forma
       and anterior.observacao=coalesce(p_observacao,'')
       and desconto_anterior.vencimento_restante is not distinct from p_vencimento
       and desconto_anterior.saldo_antes_desconto_centavos=p_saldo then return anterior.id; end if;
    raise exception 'Esta confirmação já foi usada. Reabra o pagamento.' using errcode='22023';
  end if;
  select aberto_centavos into saldo from private.financeiro_saldos where oficina_id=p_oficina and id=p_titulo;
  if saldo is distinct from p_saldo then
    raise exception 'O saldo mudou. Reabra o pagamento para conferir o desconto.' using errcode='PT409';
  end if;
  if t.cancelado_em is not null or p_desconto is null or p_desconto<=0 or p_desconto>=saldo
     or p_valor is null or p_valor<=0 or p_valor>saldo-p_desconto then
    raise exception 'Confira o desconto e o valor pago. Deve restar um valor maior que zero para receber.' using errcode='22023';
  end if;
  if (atendimento is null and o.total_centavos<>t.valor_centavos)
     or (atendimento is not null and a.valor_centavos<>t.valor_centavos) then
    raise exception 'O total da OS diverge da cobrança. Confira os valores antes de receber.' using errcode='22023';
  end if;
  if atendimento is null then
    update public.ordens_servico set desconto_centavos=desconto_centavos+p_desconto
      where oficina_id=p_oficina and id=o.id;
    -- O gatilho da OS sincroniza o título e protege os pagamentos anteriores.
    perform private.evento_os(p_oficina,o.id,'Desconto concedido no recebimento',
      jsonb_build_object('desconto_centavos',p_desconto,'saldo_anterior_centavos',saldo,'chave',p_chave));
  else
    insert into public.comercial_atendimento(oficina_id,atendimento_id,desconto_centavos)
      values(p_oficina,atendimento,p_desconto)
      on conflict(atendimento_id) do update
      set desconto_centavos=public.comercial_atendimento.desconto_centavos+excluded.desconto_centavos;
    update public.atendimentos_servicos set valor_centavos=valor_centavos-p_desconto,revisao=revisao+1
      where oficina_id=p_oficina and id=atendimento;
    update public.titulos_financeiros set valor_centavos=valor_centavos-p_desconto,revisao=revisao+1
      where oficina_id=p_oficina and id=p_titulo;
    insert into public.eventos_atendimento(oficina_id,atendimento_id,tipo,antes,depois,autor)
      values(p_oficina,atendimento,'desconto_recebimento',a.valor_centavos::text,(a.valor_centavos-p_desconto)::text,auth.uid());
  end if;
  -- A baixa e o desconto pertencem à mesma transação: falha desfaz ambos.
  if p_vencimento is null then
    baixa:=public.baixar_titulo_financeiro(p_oficina,p_titulo,p_chave,p_valor,p_taxa,p_data,p_conta,p_forma,p_observacao);
  else
    baixa:=public.baixar_titulo_com_restante(p_oficina,p_titulo,p_chave,p_valor,p_taxa,p_data,p_conta,p_forma,p_vencimento,p_observacao);
  end if;
  insert into private.descontos_recebimento_os(baixa_id,desconto_centavos,saldo_antes_desconto_centavos,vencimento_restante)
    values(baixa,p_desconto,saldo,p_vencimento);
  return baixa;
end $$;
revoke all on function public.baixar_titulo_com_desconto_os(uuid,uuid,uuid,bigint,bigint,date,text,text,bigint,bigint,text,date) from public,anon;
grant execute on function public.baixar_titulo_com_desconto_os(uuid,uuid,uuid,bigint,bigint,date,text,text,bigint,bigint,text,date) to authenticated;

create or replace function public.historico_financeiro(p_oficina uuid,p_titulo uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;
begin
  perform private.conferir_operacao(p_oficina,'historico_financeiro');
  perform private.exigir_financeiro(p_oficina);
  select coalesce(jsonb_agg(to_jsonb(b)||jsonb_build_object(
    'desconto_centavos',coalesce(d.desconto_centavos,0),
    'saldo_antes_desconto_centavos',d.saldo_antes_desconto_centavos
  ) order by b.criado_em desc,b.id),'[]') into r
  from public.baixas_financeiras b left join private.descontos_recebimento_os d on d.baixa_id=b.id
  where b.oficina_id=p_oficina and b.titulo_id=p_titulo;
  return r;
end $$;
