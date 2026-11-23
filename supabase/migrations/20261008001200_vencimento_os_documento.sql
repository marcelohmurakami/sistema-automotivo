begin;
alter table public.ordens_servico add column vencimento_pagamento date;
create or replace function public.salvar_ordem_servico(p_oficina uuid,p_dados jsonb,p_chave uuid,p_os uuid default null,p_revisao integer default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid; w public.ordens_servico%rowtype; c public.clientes%rowtype; v public.veiculos%rowtype; n bigint; id_os uuid; campo text; retifica boolean; begin
 u:=private.exigir_os(p_oficina);
 select especialidade='retifica' into retifica from public.oficinas where id=p_oficina;
 if p_dados ? 'motor_livre' or p_dados ? 'carro_livre' then
 if not retifica or length(trim(coalesce(p_dados->>'motor_livre',''))) not between 1 and 160 or length(trim(coalesce(p_dados->>'carro_livre',''))) not between 1 and 160 then raise exception 'Informe carro e motor válidos para a retífica.' using errcode='22023';end if;
 end if;
 foreach campo in array array['queixa_cliente','diagnostico','observacoes_internas','resumo_cliente','pertences','condicoes_garantia'] loop if length(p_dados->>campo)>5000 then raise exception 'Texto muito longo' using errcode='22023'; end if; end loop;
 if length(p_dados->>'responsavel')>160 or length((p_dados->'checklist')::text)>2000 then raise exception 'Dados inválidos' using errcode='22023'; end if;
 if p_os is null then
  if p_chave is null then raise exception 'Chave obrigatória' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_chave::text,0));
  select id into id_os from public.ordens_servico where oficina_id=p_oficina and chave_criacao=p_chave; if found then return public.consultar_ordem_servico(p_oficina,id_os); end if;
  if retifica and p_dados ? 'motor_livre' then
    p_dados:=p_dados||jsonb_build_object('veiculo_id',public.cadastrar_veiculo_orcamento(p_oficina,(p_dados->>'cliente_id')::uuid,trim(p_dados->>'carro_livre'),null));
  end if;
  select * into c from public.clientes where oficina_id=p_oficina and id=(p_dados->>'cliente_id')::uuid and arquivado_em is null;
  select * into v from public.veiculos where oficina_id=p_oficina and id=(p_dados->>'veiculo_id')::uuid and arquivado_em is null;
  if c.id is null or v.id is null or not exists(select 1 from public.clientes_veiculos where oficina_id=p_oficina and cliente_id=c.id and veiculo_id=v.id and encerrado_em is null) then raise exception 'Selecione cliente e veículo vinculados' using errcode='22023'; end if;
  update public.oficinas set proximo_numero_os=proximo_numero_os+1 where id=p_oficina returning proximo_numero_os-1 into n;
  insert into public.ordens_servico(oficina_id,numero,cliente_id,veiculo_id,dados_cliente,dados_veiculo,criado_por,chave_criacao,recebido_em) values(p_oficina,n,c.id,v.id,jsonb_build_object('nome',c.nome,'telefone_e164',c.telefone_e164),jsonb_build_object('modelo',v.modelo,'marca',v.marca,'placa',v.placa),u,p_chave,now()) returning * into w;
 else
  select * into w from public.ordens_servico where oficina_id=p_oficina and id=p_os for update;
  if not found then raise exception 'OS não encontrada' using errcode='P0002'; end if;
  if p_revisao is distinct from w.revisao then raise exception 'OS alterada. Reabra antes de salvar.' using errcode='40001'; end if;
 end if;
 if w.situacao in ('delivered','cancelled') then raise exception 'OS encerrada: histórico preservado' using errcode='22023'; end if;
 update public.ordens_servico set vencimento_pagamento=case when p_dados ? 'vencimento_pagamento' then nullif(p_dados->>'vencimento_pagamento','')::date else vencimento_pagamento end,dados_veiculo=case when retifica and p_dados ? 'motor_livre' then jsonb_build_object('modelo',trim(p_dados->>'carro_livre'),'motor',trim(p_dados->>'motor_livre'),'especialidade','retifica') else dados_veiculo end,tipo_servico=case when p_dados ? 'tipo_servico' then nullif(p_dados->>'tipo_servico','') else tipo_servico end,detalhes_especialidade=case when p_dados ? 'detalhes_especialidade' then coalesce(p_dados->>'detalhes_especialidade','') else detalhes_especialidade end,queixa_cliente=p_dados->>'queixa_cliente',diagnostico=p_dados->>'diagnostico',observacoes_internas=p_dados->>'observacoes_internas',resumo_cliente=p_dados->>'resumo_cliente',responsavel=p_dados->>'responsavel',prioridade=coalesce(p_dados->>'prioridade','normal'),quilometragem_entrada=nullif(p_dados->>'quilometragem_entrada','')::integer,quilometragem_saida=nullif(p_dados->>'quilometragem_saida','')::integer,combustivel_percentual=nullif(p_dados->>'combustivel_percentual','')::smallint,pertences=p_dados->>'pertences',entrega_prevista_em=nullif(p_dados->>'entrega_prevista_em','')::timestamptz,condicoes_garantia=p_dados->>'condicoes_garantia',garantia_ate=nullif(p_dados->>'garantia_ate','')::date,checklist=coalesce(p_dados->'checklist','{}') where id=w.id;
 perform private.evento_os(p_oficina,w.id,case when p_os is null then 'Ordem de serviço aberta.' else 'Dados do atendimento atualizados.' end,jsonb_build_object('antes',to_jsonb(w),'depois',p_dados));
 return public.consultar_ordem_servico(p_oficina,w.id);
end $$;
create or replace function public.consultar_ordem_servico(p_oficina uuid,p_os uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d jsonb; c public.clientes; pagamento text; documento text; begin
 d:=private.consultar_os_incluindo_removidos(p_oficina,p_os);
 select * into c from public.clientes where oficina_id=p_oficina and id=(d->>'cliente_id')::uuid;
 documento:=substring(c.observacoes from 'CPF/CNPJ: ([^\r\n]+)');
 d:=jsonb_set(d,'{dados_cliente}',coalesce(d->'dados_cliente','{}')||jsonb_build_object('documento',coalesce(nullif(d->'dados_cliente'->>'documento',''),documento,''),'endereco',coalesce(nullif(d->'dados_cliente'->>'endereco',''),c.endereco,'')));
 pagamento:=substring(d->>'observacoes_internas' from 'Forma original: ([^\r\n]+)\. Vencimento original:');
 d:=d||jsonb_build_object('forma_pagamento',coalesce(nullif(d->>'forma_pagamento',''),pagamento,''));
 d:=d||jsonb_build_object('vencimento_pagamento',coalesce(
 (select vencimento from public.titulos_financeiros where oficina_id=p_oficina and ordem_servico_id=p_os and automatico and cancelado_em is null limit 1),
 nullif(d->>'vencimento_pagamento','')::date,
 (((nullif(d->>'concluido_em','')::timestamptz at time zone 'America/Sao_Paulo')::date + interval '1 month')::date),
 (select vencimento from public.titulos_financeiros where oficina_id=p_oficina and ordem_servico_id=p_os and automatico and cancelado_em is null limit 1)));
 return jsonb_set(d,'{itens}',coalesce((select jsonb_agg(i) from jsonb_array_elements(d->'itens') i where i->>'removido_em' is null),'[]'));
end $$;


create function private.vencimento_padrao_titulo_os() returns trigger language plpgsql security definer set search_path='' as $$
declare o public.ordens_servico; begin
 if new.automatico and new.ordem_servico_id is not null and not new.pagamento_combinado then
 select * into o from public.ordens_servico where id=new.ordem_servico_id and oficina_id=new.oficina_id;
 new.vencimento:=coalesce(o.vencimento_pagamento,((o.concluido_em at time zone 'America/Sao_Paulo')::date + interval '1 month')::date,new.vencimento);
 end if; return new;
end $$;
create trigger vencimento_padrao_os before insert or update of provisorio on public.titulos_financeiros for each row execute function private.vencimento_padrao_titulo_os();
revoke all on function private.vencimento_padrao_titulo_os() from public,anon,authenticated;
notify pgrst, 'reload schema';
commit;
