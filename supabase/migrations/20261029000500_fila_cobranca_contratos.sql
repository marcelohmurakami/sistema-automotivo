begin;
create index faturas_contrato_titulo on public.faturas_contrato(titulo_id) where titulo_id is not null;
create index contratos_preventivos_vigencia on public.contratos_preventivos(oficina_id,inicio,id);

create function public.consultar_cobrancas_contratos(p_oficina uuid,p_mes date,p_pagina integer default 0,p_pendentes boolean default true) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb; total bigint;
begin
 perform private.exigir_financeiro(p_oficina);perform private.gerencia_planejamento(p_oficina);
 if p_mes is null or not isfinite(p_mes) or p_mes<date '2020-01-01' or extract(day from p_mes)<>1 or p_mes>=date_trunc('month',now() at time zone 'America/Sao_Paulo')::date or p_pagina is null or p_pagina not between 0 and 10000 then raise exception 'Escolha um mês já encerrado.' using errcode='22023';end if;
 select count(*) into total from public.contratos_preventivos c where c.oficina_id=p_oficina and c.inicio<p_mes+interval '1 month' and least(coalesce(c.fim,date '2099-12-31'),coalesce(c.encerrado_em,date '2099-12-31'))>=p_mes and (not p_pendentes or not exists(select 1 from public.faturas_contrato f where f.contrato_id=c.id and f.competencia=p_mes));
 with contratos as (select c.* from public.contratos_preventivos c where c.oficina_id=p_oficina and c.inicio<p_mes+interval '1 month' and least(coalesce(c.fim,date '2099-12-31'),coalesce(c.encerrado_em,date '2099-12-31'))>=p_mes and (not p_pendentes or not exists(select 1 from public.faturas_contrato f where f.contrato_id=c.id and f.competencia=p_mes)) order by c.nome,c.id limit 30 offset p_pagina*30)
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'nome',c.nome,'cliente',cl.nome,'fatura',v.r,'assinatura',md5(v.r::text),'fechada',f.contrato_id is not null,'titulo_id',f.titulo_id,'cancelada',t.cancelado_em is not null,'aberto',t.aberto_centavos) order by c.nome,c.id),'[]') into r
 from contratos c join public.clientes cl on cl.id=c.cliente_id left join public.faturas_contrato f on f.contrato_id=c.id and f.competencia=p_mes left join private.financeiro_saldos t on t.id=f.titulo_id
 cross join lateral (select coalesce(f.resumo,private.previa_fatura_contrato(c,p_mes)) r)v;
 return jsonb_build_object('itens',r,'total',total);
end $$;

-- Confere a prévia apresentada e fecha o lote inteiro na mesma transação.
create function public.faturar_lote_contratos(p_oficina uuid,p_mes date,p_itens jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.contratos_preventivos; item jsonb; previa jsonb; r jsonb:='[]'; f public.faturas_contrato;
begin
 perform private.exigir_financeiro(p_oficina);perform private.gerencia_planejamento(p_oficina);
 if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) not between 1 and 30 or p_mes is null or not isfinite(p_mes) or extract(day from p_mes)<>1 or p_mes>=date_trunc('month',now() at time zone 'America/Sao_Paulo')::date then raise exception 'Selecione até 30 contratos de um mês encerrado.' using errcode='22023';end if;
 if (select count(distinct x->>'id') from jsonb_array_elements(p_itens)x)<>jsonb_array_length(p_itens) then raise exception 'Contrato repetido na seleção.' using errcode='22023';end if;
 for item in select value from jsonb_array_elements(p_itens) order by value->>'id' loop
  perform pg_advisory_xact_lock(hashtextextended('contrato:'||(item->>'id')::uuid,0));
  select * into c from public.contratos_preventivos where oficina_id=p_oficina and id=(item->>'id')::uuid;
  if not found then raise exception 'Contrato indisponível.' using errcode='42501';end if;
  select * into f from public.faturas_contrato where contrato_id=c.id and competencia=p_mes;
  previa:=coalesce(f.resumo,private.previa_fatura_contrato(c,p_mes));
  if md5(previa::text) is distinct from item->>'assinatura' then raise exception 'O consumo ou as regras mudaram. Atualize e confira novamente.' using errcode='PT409';end if;
  r:=r||jsonb_build_array(public.faturar_contrato(p_oficina,c.id,p_mes,true)||jsonb_build_object('contrato_id',c.id));
 end loop;
 return r;
end $$;

-- A cobrança fica vinculada ao demonstrativo: ajustes não podem mudar seu valor sem rever o contrato.
create function private.proteger_titulo_contrato() returns trigger language plpgsql set search_path='' as $$begin
 if exists(select 1 from public.faturas_contrato where titulo_id=old.id) and row(new.oficina_id,new.natureza,new.valor_centavos,new.competencia,new.categoria) is distinct from row(old.oficina_id,old.natureza,old.valor_centavos,old.competencia,old.categoria) then raise exception 'O valor e a competência vêm do demonstrativo do contrato. Não podem ser alterados isoladamente.' using errcode='22023';end if;
 return new;
end $$;
create trigger proteger_titulo_contrato before update on public.titulos_financeiros for each row execute function private.proteger_titulo_contrato();
revoke all on function private.proteger_titulo_contrato(),public.consultar_cobrancas_contratos(uuid,date,integer,boolean),public.faturar_lote_contratos(uuid,date,jsonb) from public,anon,authenticated;
grant execute on function public.consultar_cobrancas_contratos(uuid,date,integer,boolean),public.faturar_lote_contratos(uuid,date,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
