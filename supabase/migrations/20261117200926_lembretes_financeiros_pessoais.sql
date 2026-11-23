begin;

-- Preferências pessoais. Conferir ou adiar nunca altera uma conta ou seu saldo.
create table public.preferencias_lembretes_financeiros (
 oficina_id uuid not null references public.oficinas(id),
 usuario_id uuid not null references auth.users(id),
 mostrar_entrada boolean not null default true,
 frequencia text not null default 'uteis' check(frequencia in ('todos','uteis','desligado')),
 horario time not null default '17:00',
 conferido_em date, adiado_ate timestamptz,
 primary key(oficina_id,usuario_id)
);
create table public.adiamentos_lembretes_financeiros (
 oficina_id uuid not null references public.oficinas(id),
 usuario_id uuid not null references auth.users(id),
 tipo text not null check(tipo in ('financeiro','conta_mensal')),
 referencia_id uuid not null, vencimento date not null, ate timestamptz not null,
 primary key(oficina_id,usuario_id,tipo,referencia_id)
);
-- Acesso somente pelas funções abaixo, com empresa, usuário, plano, papel e MFA.
alter table public.preferencias_lembretes_financeiros enable row level security;
alter table public.adiamentos_lembretes_financeiros enable row level security;
revoke all on public.preferencias_lembretes_financeiros,public.adiamentos_lembretes_financeiros from public,anon,authenticated;

create function private.consultar_lembretes_financeiros(p_oficina uuid,p_pagina integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid; hoje date:=(now() at time zone 'America/Sao_Paulo')::date; preferencias jsonb; resultado jsonb;
begin
 perform private.conferir_operacao(p_oficina,'consultar_financeiro');
 perform private.exigir_financeiro(p_oficina);u:=auth.uid();
 if p_pagina is null or p_pagina not between 0 and 100000 then raise exception 'Página inválida.' using errcode='22023';end if;
 perform private.gerar_contas_recorrentes(p_oficina);
 select to_jsonb(p)-'oficina_id'-'usuario_id' into preferencias
 from public.preferencias_lembretes_financeiros p where oficina_id=p_oficina and usuario_id=u;
 preferencias:=coalesce(preferencias,jsonb_build_object('mostrar_entrada',true,'frequencia','uteis','horario','17:00','conferido_em',null,'adiado_ate',null));
 with pendentes as materialized (
  select 'financeiro'::text tipo,t.id,t.descricao,t.natureza,t.vencimento,t.aberto_centavos valor_centavos,
   coalesce(v.valor_variavel and v.valor_confirmado_em is null,false) valor_pendente,
   case when t.ordem_servico_id is not null or exists(select 1 from public.cobrancas_atendimento c where c.oficina_id=p_oficina and c.titulo_id=t.id) then 'Ordem de serviço'
    when t.compra_id is not null then 'Compra' when t.recorrencia_id is not null then 'Conta mensal' else 'Conta' end origem
  from private.financeiro_saldos t join public.titulos_financeiros v on v.id=t.id and v.oficina_id=t.oficina_id
  where t.oficina_id=p_oficina and t.cancelado_em is null and t.transferencia_id is null
   and t.aberto_centavos>0 and t.vencimento<=hoje and (not t.provisorio or t.pagamento_combinado)
  union all
  select 'conta_mensal',p.id,p.descricao,p.natureza,p.vencimento,null::bigint,true,'Conta mensal'
  from public.contas_mensais_pendentes p where p.oficina_id=p_oficina and p.titulo_id is null and p.vencimento<=hoje
 ), visiveis as materialized (
  select p.* from pendentes p where not exists(
   select 1 from public.adiamentos_lembretes_financeiros a where a.oficina_id=p_oficina and a.usuario_id=u
    and a.tipo=p.tipo and a.referencia_id=p.id and a.vencimento=p.vencimento and a.ate>now())
 ) select jsonb_build_object(
  'total',(select count(*) from visiveis),
  'receber',(select count(*) from visiveis where natureza='receber'),
  'pagar',(select count(*) from visiveis where natureza='pagar'),
  'itens',coalesce((select jsonb_agg(to_jsonb(x) order by vencimento,tipo,id) from
   (select * from visiveis order by vencimento,tipo,id limit 20 offset p_pagina*20) x),'[]'),
  'preferencias',preferencias,
  'adiamentos',coalesce((select jsonb_agg(jsonb_build_object('tipo',tipo,'id',referencia_id,'vencimento',vencimento,'ate',ate))
   from public.adiamentos_lembretes_financeiros where oficina_id=p_oficina and usuario_id=u and ate>now()),'[]')
 ) into resultado;
 return resultado;
end $$;
create function public.consultar_lembretes_financeiros(p_oficina uuid,p_pagina integer default 0)
returns jsonb language sql security invoker set search_path='' as $$select private.consultar_lembretes_financeiros(p_oficina,p_pagina)$$;

create function private.atualizar_lembretes_financeiros(p_oficina uuid,p_acao text,p_dados jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare u uuid; adiar_ate timestamptz; vence date; ref uuid; tipo_alvo text;
begin
 -- Um gerente com leitura financeira pode ajustar seus próprios avisos.
 perform private.conferir_operacao(p_oficina,'consultar_financeiro');
 perform private.exigir_financeiro(p_oficina);u:=auth.uid();
 if jsonb_typeof(p_dados) is distinct from 'object' then raise exception 'Dados inválidos.' using errcode='22023';end if;
 if p_acao='configurar' then
  if jsonb_typeof(p_dados->'mostrar_entrada') is distinct from 'boolean'
   or coalesce(p_dados->>'frequencia','') not in ('todos','uteis','desligado')
   or coalesce(p_dados->>'horario','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  then raise exception 'Confira a frequência e o horário.' using errcode='22023';end if;
  insert into public.preferencias_lembretes_financeiros(oficina_id,usuario_id,mostrar_entrada,frequencia,horario)
  values(p_oficina,u,(p_dados->>'mostrar_entrada')::boolean,p_dados->>'frequencia',(p_dados->>'horario')::time)
  on conflict(oficina_id,usuario_id) do update set mostrar_entrada=excluded.mostrar_entrada,frequencia=excluded.frequencia,horario=excluded.horario;
 elsif p_acao='conferir' then
  insert into public.preferencias_lembretes_financeiros(oficina_id,usuario_id,conferido_em)
  values(p_oficina,u,(now() at time zone 'America/Sao_Paulo')::date)
  on conflict(oficina_id,usuario_id) do update set conferido_em=excluded.conferido_em;
 elsif p_acao in ('adiar','adiar_item') then
  adiar_ate:=(p_dados->>'ate')::timestamptz;
  if adiar_ate is null or adiar_ate<=now() or adiar_ate>now()+interval '366 days' then raise exception 'Escolha um horário futuro, em até um ano.' using errcode='22023';end if;
  if p_acao='adiar' then
   insert into public.preferencias_lembretes_financeiros(oficina_id,usuario_id,adiado_ate) values(p_oficina,u,adiar_ate)
   on conflict(oficina_id,usuario_id) do update set adiado_ate=excluded.adiado_ate;
  else
   ref:=(p_dados->>'id')::uuid;tipo_alvo:=p_dados->>'tipo';
   if tipo_alvo='financeiro' then
    select vencimento into vence from private.financeiro_saldos where oficina_id=p_oficina and id=ref
     and cancelado_em is null and aberto_centavos>0 and transferencia_id is null and (not provisorio or pagamento_combinado);
   elsif tipo_alvo='conta_mensal' then
    select vencimento into vence from public.contas_mensais_pendentes where oficina_id=p_oficina and id=ref and titulo_id is null;
   end if;
   if vence is null then raise exception 'Esta conta já foi resolvida ou não está disponível. Atualize os avisos.' using errcode='22023';end if;
   insert into public.adiamentos_lembretes_financeiros(oficina_id,usuario_id,tipo,referencia_id,vencimento,ate)
   values(p_oficina,u,tipo_alvo,ref,vence,adiar_ate) on conflict(oficina_id,usuario_id,tipo,referencia_id)
   do update set vencimento=excluded.vencimento,ate=excluded.ate;
   -- Ao voltar, o aviso adiado deve chamar atenção mesmo se já estava lido.
   -- Exclusões explícitas continuam preservadas.
   delete from public.alertas_lidos l where l.oficina_id=p_oficina and l.usuario_id=u
    and l.excluido_em is null and l.chave like tipo_alvo||':'||ref||':'||vence||':%';
  end if;
 elsif p_acao='reativar' then
  update public.preferencias_lembretes_financeiros set adiado_ate=null where oficina_id=p_oficina and usuario_id=u;
  delete from public.adiamentos_lembretes_financeiros where oficina_id=p_oficina and usuario_id=u;
 else raise exception 'Ação inválida.' using errcode='22023';
 end if;
end $$;
create function public.atualizar_lembretes_financeiros(p_oficina uuid,p_acao text,p_dados jsonb default '{}')
returns void language sql security invoker set search_path='' as $$select private.atualizar_lembretes_financeiros(p_oficina,p_acao,p_dados)$$;

revoke all on function private.consultar_lembretes_financeiros(uuid,integer),public.consultar_lembretes_financeiros(uuid,integer),
 private.atualizar_lembretes_financeiros(uuid,text,jsonb),public.atualizar_lembretes_financeiros(uuid,text,jsonb) from public,anon;
grant execute on function private.consultar_lembretes_financeiros(uuid,integer),public.consultar_lembretes_financeiros(uuid,integer),
 private.atualizar_lembretes_financeiros(uuid,text,jsonb),public.atualizar_lembretes_financeiros(uuid,text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
