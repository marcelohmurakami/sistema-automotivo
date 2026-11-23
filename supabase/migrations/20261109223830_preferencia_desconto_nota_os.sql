-- Preferência documental: não altera o desconto comercial nem o financeiro.
alter table public.ordens_servico add column mostrar_desconto_nota boolean not null default false;
alter table public.atendimentos_servicos add column mostrar_desconto_nota boolean not null default false;

-- Preserva as validações e permissões das rotinas existentes.
do $migration$
declare codigo text; marcador text;
begin
  codigo := pg_get_functiondef('public.salvar_ordem_servico(uuid,jsonb,uuid,uuid,integer)'::regprocedure);
  marcador := 'update public.ordens_servico set data_servico=';
  if strpos(codigo,marcador)=0 then raise exception 'Rotina de OS incompatível'; end if;
  execute replace(codigo,marcador,'update public.ordens_servico set mostrar_desconto_nota=case when p_dados ? ''mostrar_desconto_nota'' then coalesce((p_dados->>''mostrar_desconto_nota'')::boolean,false) else mostrar_desconto_nota end, data_servico=');
  codigo := pg_get_functiondef('public.salvar_atendimento_servico(uuid,uuid,jsonb,integer)'::regprocedure);
  marcador := 'return r;';
  if strpos(codigo,marcador)=0 then raise exception 'Rotina de atendimento incompatível'; end if;
  execute replace(codigo,marcador,$trecho$
    if not repetido and p_dados ? 'mostrar_desconto_nota' then
      update public.atendimentos_servicos
      set mostrar_desconto_nota=coalesce((p_dados->>'mostrar_desconto_nota')::boolean,false)
      where oficina_id=p_oficina and id=r;
    end if;
    return r;
  $trecho$);
end $migration$;

create function private.salvar_itens_atendimento_nota(
  p_oficina uuid,p_atendimento uuid,p_revisao integer,p_itens jsonb,p_mostrar_desconto_nota boolean,
  p_desconto bigint default 0,p_custo_extra bigint default 0,p_motivo text default ''
) returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.salvar_itens_atendimento(p_oficina,p_atendimento,p_revisao,p_itens,p_desconto,p_custo_extra,p_motivo);
  update public.atendimentos_servicos set mostrar_desconto_nota=coalesce(p_mostrar_desconto_nota,false)
    where oficina_id=p_oficina and id=p_atendimento;
end $$;
create function public.salvar_itens_atendimento_nota(
  p_oficina uuid,p_atendimento uuid,p_revisao integer,p_itens jsonb,p_mostrar_desconto_nota boolean,
  p_desconto bigint default 0,p_custo_extra bigint default 0,p_motivo text default ''
) returns void language sql security invoker set search_path='' as $$
  select private.salvar_itens_atendimento_nota(p_oficina,p_atendimento,p_revisao,p_itens,p_mostrar_desconto_nota,p_desconto,p_custo_extra,p_motivo);
$$;

create function private.baixar_titulo_com_desconto_nota(
  p_oficina uuid,p_titulo uuid,p_chave uuid,p_valor bigint,p_taxa bigint,p_data date,
  p_conta text,p_forma text,p_desconto bigint,p_saldo bigint,p_mostrar_desconto_nota boolean,
  p_observacao text default '',p_vencimento date default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare baixa uuid; repetido boolean; t public.titulos_financeiros%rowtype;
begin
  perform private.conferir_operacao(p_oficina,'baixar_titulo_com_desconto_os');
  perform private.exigir_financeiro(p_oficina);
  perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_chave::text,91));
  select exists(select 1 from public.baixas_financeiras where oficina_id=p_oficina and chave=p_chave) into repetido;
  baixa:=public.baixar_titulo_com_desconto_os(p_oficina,p_titulo,p_chave,p_valor,p_taxa,p_data,p_conta,p_forma,p_desconto,p_saldo,p_observacao,p_vencimento);
  if not repetido then
    select * into t from public.titulos_financeiros where oficina_id=p_oficina and id=p_titulo;
    if t.automatico and t.ordem_servico_id is not null then
      update public.ordens_servico set mostrar_desconto_nota=coalesce(p_mostrar_desconto_nota,false)
        where oficina_id=p_oficina and id=t.ordem_servico_id;
    else
      update public.atendimentos_servicos set mostrar_desconto_nota=coalesce(p_mostrar_desconto_nota,false)
        where oficina_id=p_oficina and id in
          (select atendimento_id from public.cobrancas_atendimento where oficina_id=p_oficina and titulo_id=p_titulo);
    end if;
  end if;
  return baixa;
end $$;
create function public.baixar_titulo_com_desconto_nota(
  p_oficina uuid,p_titulo uuid,p_chave uuid,p_valor bigint,p_taxa bigint,p_data date,
  p_conta text,p_forma text,p_desconto bigint,p_saldo bigint,p_mostrar_desconto_nota boolean,
  p_observacao text default '',p_vencimento date default null
) returns uuid language sql security invoker set search_path='' as $$
  select private.baixar_titulo_com_desconto_nota(p_oficina,p_titulo,p_chave,p_valor,p_taxa,p_data,p_conta,p_forma,p_desconto,p_saldo,p_mostrar_desconto_nota,p_observacao,p_vencimento);
$$;

revoke all on function private.salvar_itens_atendimento_nota(uuid,uuid,integer,jsonb,boolean,bigint,bigint,text),public.salvar_itens_atendimento_nota(uuid,uuid,integer,jsonb,boolean,bigint,bigint,text),private.baixar_titulo_com_desconto_nota(uuid,uuid,uuid,bigint,bigint,date,text,text,bigint,bigint,boolean,text,date),public.baixar_titulo_com_desconto_nota(uuid,uuid,uuid,bigint,bigint,date,text,text,bigint,bigint,boolean,text,date) from public,anon;
grant execute on function private.salvar_itens_atendimento_nota(uuid,uuid,integer,jsonb,boolean,bigint,bigint,text),public.salvar_itens_atendimento_nota(uuid,uuid,integer,jsonb,boolean,bigint,bigint,text),private.baixar_titulo_com_desconto_nota(uuid,uuid,uuid,bigint,bigint,date,text,text,bigint,bigint,boolean,text,date),public.baixar_titulo_com_desconto_nota(uuid,uuid,uuid,bigint,bigint,date,text,text,bigint,bigint,boolean,text,date) to authenticated;
