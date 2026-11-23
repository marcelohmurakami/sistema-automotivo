begin;
-- Uma previsão por OS. Datas são calculadas, nunca inventadas pela IA.
create function private.previsao_troca_oleo(p_ficha jsonb,p_data date,p_km integer) returns jsonb
language plpgsql immutable set search_path='' as $$
declare c jsonb:=p_ficha->'campos'; atual numeric; alvo numeric; uso numeric; prevista date; manual date; base text;
begin
 if p_ficha->>'especialidade' is distinct from 'troca_oleo' or p_data is null then return null;end if;
 if coalesce(c->>'km_atual','') ~ '^\d{1,9}$' then atual:=(c->>'km_atual')::numeric;
 elsif coalesce(c->>'km_atual','') ~ '^\d{1,3}(\.\d{3}){1,2}$' then atual:=replace(c->>'km_atual','.','')::numeric;
 else atual:=p_km;end if;
 if coalesce(c->>'proxima_km','') ~ '^\d{1,9}(\.0+)?$' then alvo:=(c->>'proxima_km')::numeric;end if;
 if coalesce(c->>'km_por_dia','') ~ '^\d{1,4}([.,]\d{1,3})?$' then uso:=replace(c->>'km_por_dia',',','.')::numeric;end if;
 if atual>=0 and alvo>atual and uso>0 and uso<=2000 and ceil((alvo-atual)/uso)<=730 then
   prevista:=p_data+ceil((alvo-atual)/uso)::integer;base:='uso informado pelo cliente';
 end if;
 if coalesce(c->>'proxima_data','') ~ '^\d{4}-\d{2}-\d{2}$' then
   begin manual:=(c->>'proxima_data')::date;exception when others then manual:=null;end;
   if manual>=p_data and manual<=p_data+730 and (prevista is null or manual<prevista) then prevista:=manual;base:='data informada pela empresa';end if;
 end if;
 if prevista is null then return null;end if;
 return jsonb_build_object('data_prevista',prevista,'km_na_troca',atual,'proxima_km',alvo,'km_por_dia',uso,'base',base);
end $$;
revoke all on function private.previsao_troca_oleo(jsonb,date,integer) from public,anon,authenticated;

create table public.recontatos_oleo (
 ordem_servico_id uuid primary key, oficina_id uuid not null, cliente_id uuid not null,
 data_prevista date not null, previsao jsonb not null, sugestao text, modelo text,
 situacao text not null default 'pendente' check(situacao in('pendente','gerando','sugerido','contatado','dispensado','cancelado')),
 tentativa uuid, tentativas integer not null default 0, iniciado_em timestamptz, proxima_tentativa timestamptz not null default now(),
 atualizado_em timestamptz not null default now(),
 foreign key(oficina_id,ordem_servico_id) references public.ordens_servico(oficina_id,id),
 foreign key(oficina_id,cliente_id) references public.clientes(oficina_id,id)
);
alter table public.recontatos_oleo enable row level security;
revoke all on public.recontatos_oleo from public,anon,authenticated;
create index recontatos_oleo_oficina on public.recontatos_oleo(oficina_id,data_prevista,ordem_servico_id);
create index recontatos_oleo_fila on public.recontatos_oleo(data_prevista,proxima_tentativa) where situacao in('pendente','gerando');

create function private.atualizar_recontato_oleo() returns trigger language plpgsql security definer set search_path='' as $$
declare previsao_nova jsonb;
begin
 if tg_op='UPDATE' and new.situacao is not distinct from old.situacao and new.ficha_especialidade is not distinct from old.ficha_especialidade and new.data_servico is not distinct from old.data_servico and new.cliente_id is not distinct from old.cliente_id and new.veiculo_id is not distinct from old.veiculo_id and new.quilometragem_entrada is not distinct from old.quilometragem_entrada then return new;end if;
 if new.situacao in('ready','delivered') and new.cliente_id is not null then previsao_nova:=private.previsao_troca_oleo(new.ficha_especialidade,new.data_servico,new.quilometragem_entrada);end if;
 if previsao_nova is null then
   update public.recontatos_oleo set situacao='cancelado',tentativa=null,atualizado_em=now() where ordem_servico_id=new.id and situacao not in('contatado','dispensado');return new;
 end if;
 -- A troca mais recente substitui a lembrança antiga do mesmo veículo e cliente.
 if new.veiculo_id is not null then
   if exists(select 1 from public.ordens_servico o where o.oficina_id=new.oficina_id and o.veiculo_id=new.veiculo_id and o.cliente_id=new.cliente_id and o.situacao in('ready','delivered') and o.ficha_especialidade->>'especialidade'='troca_oleo' and (o.data_servico,o.criado_em,o.id)>(new.data_servico,new.criado_em,new.id)) then return new;end if;
   update public.recontatos_oleo r set situacao='cancelado',tentativa=null,atualizado_em=now() from public.ordens_servico o where r.ordem_servico_id=o.id and o.oficina_id=new.oficina_id and o.veiculo_id=new.veiculo_id and o.cliente_id=new.cliente_id and o.id<>new.id and r.situacao not in('contatado','dispensado','cancelado');
 end if;
 insert into public.recontatos_oleo(ordem_servico_id,oficina_id,cliente_id,data_prevista,previsao)
 values(new.id,new.oficina_id,new.cliente_id,(previsao_nova->>'data_prevista')::date,previsao_nova)
 on conflict(ordem_servico_id) do update set cliente_id=excluded.cliente_id,data_prevista=excluded.data_prevista,previsao=excluded.previsao,situacao='pendente',sugestao=null,modelo=null,tentativa=null,tentativas=0,proxima_tentativa=now(),atualizado_em=now()
 where public.recontatos_oleo.previsao is distinct from excluded.previsao or public.recontatos_oleo.cliente_id is distinct from excluded.cliente_id or public.recontatos_oleo.situacao='cancelado';
 return new;
end $$;
create trigger recontato_troca_oleo after insert or update on public.ordens_servico for each row execute function private.atualizar_recontato_oleo();

create function public.consultar_recontatos_oleo(p_oficina uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.exigir_gestao(p_oficina,'automations');
 return (select coalesce(jsonb_agg(to_jsonb(x) order by x.data_prevista,x.ordem_servico_id),'[]') from (
 select r.ordem_servico_id,r.data_prevista,r.previsao,r.sugestao,r.situacao,c.nome cliente,c.telefone_e164 telefone,o.numero
 from public.recontatos_oleo r join public.clientes c on c.id=r.cliente_id and c.oficina_id=r.oficina_id join public.ordens_servico o on o.id=r.ordem_servico_id and o.oficina_id=r.oficina_id
 where r.oficina_id=p_oficina and r.situacao in('pendente','gerando','sugerido') and c.arquivado_em is null
 order by r.data_prevista,r.ordem_servico_id limit 100) x);
end $$;
create function public.encerrar_recontato_oleo(p_oficina uuid,p_os uuid,p_contatado boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.exigir_gestao(p_oficina,'automations');
 update public.recontatos_oleo set situacao=case when p_contatado then 'contatado' else 'dispensado' end,tentativa=null,atualizado_em=now() where oficina_id=p_oficina and ordem_servico_id=p_os and situacao in('pendente','gerando','sugerido');
 if not found then raise exception 'Recontato indisponível. Atualize a lista.' using errcode='PT409';end if;
end $$;
create function public.reservar_recontato_oleo() returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.recontatos_oleo;
begin
 select q.* into r from public.recontatos_oleo q join public.clientes c on c.oficina_id=q.oficina_id and c.id=q.cliente_id
 where q.situacao in('pendente','gerando') and q.tentativas<3 and q.proxima_tentativa<=now() and q.data_prevista<=(now() at time zone 'America/Sao_Paulo')::date+14
 and (q.situacao='pendente' or q.iniciado_em<now()-interval '10 minutes') and c.arquivado_em is null
 and private.has_feature(q.oficina_id,'automations') and private.has_feature(q.oficina_id,'ai')
 order by q.data_prevista,q.ordem_servico_id for update of q skip locked limit 1;
 if not found then return null;end if;
 update public.recontatos_oleo set situacao='gerando',tentativa=gen_random_uuid(),tentativas=tentativas+1,iniciado_em=now(),proxima_tentativa=now()+interval '1 day' where ordem_servico_id=r.ordem_servico_id returning * into r;
 return jsonb_build_object('id',r.ordem_servico_id,'tentativa',r.tentativa,'previsao',r.previsao);
end $$;
create function public.concluir_recontato_oleo(p_os uuid,p_tentativa uuid,p_sugestao text,p_modelo text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_sugestao is not null and length(trim(p_sugestao)) not between 10 and 1500 then raise exception 'Sugestão inválida.' using errcode='22023';end if;
 update public.recontatos_oleo set situacao=case when p_sugestao is null then 'pendente' else 'sugerido' end,sugestao=p_sugestao,modelo=left(p_modelo,100),tentativa=null,atualizado_em=now() where ordem_servico_id=p_os and tentativa=p_tentativa and situacao='gerando';
end $$;
revoke all on function public.consultar_recontatos_oleo(uuid),public.encerrar_recontato_oleo(uuid,uuid,boolean),public.reservar_recontato_oleo(),public.concluir_recontato_oleo(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.consultar_recontatos_oleo(uuid),public.encerrar_recontato_oleo(uuid,uuid,boolean) to authenticated;
grant execute on function public.reservar_recontato_oleo(),public.concluir_recontato_oleo(uuid,uuid,text,text) to service_role;
commit;
