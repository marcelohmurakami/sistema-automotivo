begin;

-- Cada unidade física tem identidade própria: dois equipamentos iguais são dois recursos.
create table public.ativos_agenda (
 id uuid primary key, oficina_id uuid not null references public.oficinas(id),
 nome text not null check(length(trim(nome)) between 2 and 100),
 tipo text not null check(tipo in ('box','equipamento')),
 movel boolean not null default false, ativo boolean not null default true,
 bloqueios jsonb not null default '[]', revisao integer not null default 1,
 check(tipo='equipamento' or not movel), unique(oficina_id,id)
);
create unique index ativos_agenda_nome on public.ativos_agenda(oficina_id,lower(trim(nome)));
alter table public.ativos_agenda enable row level security;
revoke all on public.ativos_agenda from public,anon,authenticated;
alter table public.agenda_atendimentos add column recursos_reservados uuid[] not null default '{}', add column resumo_recursos jsonb not null default '[]';
alter table public.agenda_servicos add column recursos_reservados uuid[] not null default '{}', add column resumo_recursos jsonb not null default '[]';
create index agenda_auto_ativos on public.agenda_atendimentos using gin(recursos_reservados) where situacao in ('agendado','convertido');
create index agenda_servicos_ativos on public.agenda_servicos using gin(recursos_reservados) where situacao in ('agendado','confirmado');
create index agenda_auto_recursos_periodo on public.agenda_atendimentos(oficina_id,fim) where situacao in ('agendado','convertido');
create index agenda_servicos_recursos_periodo on public.agenda_servicos(oficina_id,fim) where situacao in ('agendado','confirmado');

create function private.travar_reserva_recursos(w uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 -- Mesma ordem e mesmo bloqueio utilizados pelos salvamentos atuais da agenda.
 perform pg_advisory_xact_lock(hashtextextended((case when (select ramo from public.oficinas where id=w)='automotivo' then 'produtividade:' else 'agenda:' end)||w::text,0));
end $$;

create function private.ids_recursos_agenda(p jsonb) returns uuid[] language plpgsql immutable set search_path='' as $$
declare r uuid[];
begin
 if p is null then return '{}';end if;
 if jsonb_typeof(p)<>'array' or jsonb_array_length(p)>20 then raise exception 'Selecione até 20 boxes e equipamentos.' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(p) x where jsonb_typeof(x)<>'string' or (x#>>'{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then raise exception 'Recurso inválido. Selecione novamente.' using errcode='22023';end if;
 select coalesce(array_agg(distinct x::uuid order by x::uuid),'{}') into r from jsonb_array_elements_text(p) x;
 if cardinality(r)<>jsonb_array_length(p) then raise exception 'O mesmo recurso foi selecionado mais de uma vez.' using errcode='22023';end if;
 return r;
end $$;

create function private.disponibilidade_ativo(a public.ativos_agenda,d jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare i timestamptz:=(d->>'inicio')::timestamptz; f timestamptz:=nullif(d->>'fim','')::timestamptz;
 ini timestamptz; fimv timestamptz; excl uuid:=nullif(d->>'id','')::uuid; l jsonb; v boolean:=coalesce((d->>'visita')::boolean,false); m integer:=coalesce((d->>'deslocamento_minutos')::integer,0); motivo text:='';
begin
 if i is null or f is null or not isfinite(i) or not isfinite(f) or f<=i or f>i+interval '31 days' then raise exception 'Informe início e término para reservar boxes e equipamentos (até 31 dias).' using errcode='22023';end if;
 if m not between 0 and 720 then raise exception 'Revise o tempo de deslocamento.' using errcode='22023';end if;
 l:=private.normalizar_logistica(coalesce(d->'logistica','{}'));
 ini:=private.inicio_visita(i,v and a.movel,m,l);fimv:=private.fim_visita(f,i,v and a.movel,l);
 if not a.ativo then motivo:='Recurso inativo';
 elsif exists(select 1 from jsonb_array_elements(a.bloqueios) b where (b->>'inicio')::timestamptz<fimv and (b->>'fim')::timestamptz>ini) then motivo:='Em manutenção ou indisponível neste período';
 elsif exists(select 1 from public.agenda_atendimentos g where g.oficina_id=a.oficina_id and g.id is distinct from excl and g.situacao in ('agendado','convertido') and g.recursos_reservados @> array[a.id] and g.fim>ini-interval '12 hours' and g.inicio<fimv+interval '15 hours' and private.inicio_visita(g.inicio,g.visita and a.movel,g.deslocamento_minutos,g.logistica)<fimv and private.fim_visita(g.fim,g.inicio,g.visita and a.movel,g.logistica)>ini)
 or exists(select 1 from public.agenda_servicos g where g.oficina_id=a.oficina_id and g.id is distinct from excl and g.situacao in ('agendado','confirmado') and g.recursos_reservados @> array[a.id] and g.fim>ini-interval '12 hours' and g.inicio<fimv+interval '15 hours' and private.inicio_visita(g.inicio,g.visita and a.movel,g.deslocamento_minutos,g.logistica)<fimv and private.fim_visita(g.fim,g.inicio,g.visita and a.movel,g.logistica)>ini) then motivo:='Já reservado neste horário';end if;
 return jsonb_build_object('id',a.id,'nome',a.nome,'tipo',a.tipo,'movel',a.movel,'ativo',a.ativo,'disponivel',motivo='','motivo',motivo,'inicio',ini,'fim',fimv);
end $$;

create function public.consultar_recursos_reserva(p_oficina uuid,p_dados jsonb default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;
begin
 perform private.exigir_distribuicao(p_oficina);
 if p_dados is not null and (jsonb_typeof(p_dados)<>'object' or octet_length(p_dados::text)>12000) then raise exception 'Consulta inválida.' using errcode='22023';end if;
 select coalesce(jsonb_agg(case when p_dados is null then to_jsonb(a) else private.disponibilidade_ativo(a,p_dados) end order by a.tipo,a.nome),'[]') into r from public.ativos_agenda a where a.oficina_id=p_oficina;
 return r;
end $$;

create function public.salvar_ativo_agenda(p_oficina uuid,p_id uuid,p_dados jsonb,p_revisao integer default null) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.ativos_agenda%rowtype; b jsonb:=coalesce(p_dados->'bloqueios','[]'); g record; m boolean:=coalesce((p_dados->>'movel')::boolean,false);
begin
 perform private.exigir_distribuicao(p_oficina);
 if not exists(select 1 from public.membros_oficina where oficina_id=p_oficina and usuario_id=auth.uid() and ativo and perfil in ('owner','manager')) then raise exception 'Somente a gerência pode configurar boxes e equipamentos.' using errcode='42501';end if;
 if p_id is null or jsonb_typeof(p_dados)<>'object' or octet_length(p_dados::text)>24000 then raise exception 'Recurso inválido.' using errcode='22023';end if;
 perform private.travar_reserva_recursos(p_oficina);
 select * into a from public.ativos_agenda where id=p_id for update;
 if a.id is not null and a.oficina_id<>p_oficina then raise exception 'Recurso indisponível.' using errcode='42501';end if;
 if a.id is not null and p_revisao is null then return p_id;end if;
 if a.id is not null and a.revisao is distinct from p_revisao then raise exception 'Recurso alterado. Atualize a tela.' using errcode='PT409';end if;
 if a.id is null and (select count(*) from public.ativos_agenda where oficina_id=p_oficina)>=300 then raise exception 'Limite de 300 boxes e equipamentos por empresa.' using errcode='22023';end if;
 if p_dados->>'tipo'='box' then m:=false;end if;
 if jsonb_typeof(b)<>'array' or jsonb_array_length(b)>100 then raise exception 'Informe até 100 períodos de indisponibilidade.' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(b) x where nullif(x->>'inicio','') is null or nullif(x->>'fim','') is null or (x->>'fim')::timestamptz<=(x->>'inicio')::timestamptz or not isfinite((x->>'inicio')::timestamptz) or not isfinite((x->>'fim')::timestamptz) or length(coalesce(x->>'motivo',''))>200) then raise exception 'Revise os períodos de indisponibilidade.' using errcode='22023';end if;
 -- Impede que uma alteração silenciosa invalide reservas já combinadas com clientes.
 for g in select to_jsonb(x) d from public.agenda_atendimentos x where x.oficina_id=p_oficina and x.recursos_reservados @> array[p_id] and x.situacao in ('agendado','convertido') and private.fim_visita(x.fim,x.inicio,x.visita,x.logistica)>now()
 union all select to_jsonb(x) from public.agenda_servicos x where x.oficina_id=p_oficina and x.recursos_reservados @> array[p_id] and x.situacao in ('agendado','confirmado') and private.fim_visita(x.fim,x.inicio,x.visita,x.logistica)>now() loop
  if a.tipo is distinct from p_dados->>'tipo' or a.movel<>m or not coalesce((p_dados->>'ativo')::boolean,true) then raise exception 'Este recurso tem reservas futuras. Remarque ou cancele essas reservas antes de inativar ou mudar o tipo.' using errcode='22023';end if;
  if exists(select 1 from jsonb_array_elements(b) x where (x->>'inicio')::timestamptz<private.fim_visita((g.d->>'fim')::timestamptz,(g.d->>'inicio')::timestamptz,(g.d->>'visita')::boolean and m,g.d->'logistica') and (x->>'fim')::timestamptz>private.inicio_visita((g.d->>'inicio')::timestamptz,(g.d->>'visita')::boolean and m,(g.d->>'deslocamento_minutos')::integer,g.d->'logistica')) then raise exception 'A indisponibilidade conflita com uma reserva. Remarque ou cancele o agendamento primeiro.' using errcode='23P01';end if;
 end loop;
 insert into public.ativos_agenda(id,oficina_id,nome,tipo,movel,ativo,bloqueios) values(p_id,p_oficina,trim(p_dados->>'nome'),p_dados->>'tipo',m,coalesce((p_dados->>'ativo')::boolean,true),b)
 on conflict(id) do update set nome=excluded.nome,tipo=excluded.tipo,movel=excluded.movel,ativo=excluded.ativo,bloqueios=excluded.bloqueios,revisao=ativos_agenda.revisao+1;
 return p_id;
end $$;

create function private.validar_reservas_simultaneas() returns trigger language plpgsql security definer set search_path='' as $$
declare a public.ativos_agenda%rowtype; r jsonb; resumo jsonb:='[]'; ids uuid[];
begin
 ids:=private.ids_recursos_agenda(to_jsonb(new.recursos_reservados));
 if cardinality(ids)=0 then new.resumo_recursos:='[]';return new;end if;
 perform private.travar_reserva_recursos(new.oficina_id);
 if (select count(*) from public.ativos_agenda where oficina_id=new.oficina_id and id=any(ids))<>cardinality(ids) then raise exception 'Um dos recursos não pertence a esta empresa ou não existe.' using errcode='22023';end if;
 for a in select * from public.ativos_agenda where oficina_id=new.oficina_id and id=any(ids) order by tipo,nome loop
  if new.situacao in ('agendado','confirmado','convertido') then
   r:=private.disponibilidade_ativo(a,to_jsonb(new));
   if not (r->>'disponivel')::boolean then raise exception '%: %. Escolha outro recurso ou horário.',a.nome,r->>'motivo' using errcode='23P01';end if;
  end if;
  resumo:=resumo||jsonb_build_array(jsonb_build_object('id',a.id,'nome',a.nome,'tipo',a.tipo,'movel',a.movel));
 end loop;
 new.recursos_reservados:=ids;new.resumo_recursos:=resumo;
 return new;
end $$;
create trigger zz_reservas_simultaneas before insert or update on public.agenda_atendimentos for each row execute function private.validar_reservas_simultaneas();
create trigger zz_reservas_simultaneas before insert or update on public.agenda_servicos for each row execute function private.validar_reservas_simultaneas();

-- O mesmo salvamento confirma técnico, box e equipamentos numa única transação.
do $$ declare s text; original text; assinatura text; begin
 foreach assinatura in array array['public.salvar_agenda_servico(uuid,uuid,jsonb,integer)','public.operar_produtividade(uuid,text,jsonb)'] loop
  s:=pg_get_functiondef(assinatura::regprocedure);original:=s;
  s:=replace(s,'logistica,distribuicao)','logistica,distribuicao,recursos_reservados)');
  s:=replace(s,'coalesce(p_dados->''distribuicao'',a.distribuicao,''{}''))','coalesce(p_dados->''distribuicao'',a.distribuicao,''{}''),case when p_dados ? ''recursos_reservados'' then private.ids_recursos_agenda(p_dados->''recursos_reservados'') else coalesce(a.recursos_reservados,''{}'') end)');
  s:=replace(s,'distribuicao=excluded.distribuicao,','distribuicao=excluded.distribuicao,recursos_reservados=excluded.recursos_reservados,');
  if s=original or position('recursos_reservados=excluded.recursos_reservados' in s)=0 or position('private.ids_recursos_agenda(p_dados' in s)=0 then raise exception 'Contrato de agenda alterado: %',assinatura;end if;execute s;
 end loop;
end $$;

-- Um nome digitado com capitalização diferente continua sendo o mesmo responsável.
do $$ declare s text; begin
 s:=pg_get_functiondef('private.validar_logistica_agenda()'::regprocedure);
 if position('g.recurso=new.recurso' in s)=0 then raise exception 'Contrato da logística alterado';end if;
 execute replace(s,'g.recurso=new.recurso','lower(trim(g.recurso))=lower(trim(new.recurso))');
end $$;

revoke all on function private.travar_reserva_recursos(uuid),private.ids_recursos_agenda(jsonb),private.disponibilidade_ativo(public.ativos_agenda,jsonb),private.validar_reservas_simultaneas() from public,anon,authenticated;
revoke all on function public.consultar_recursos_reserva(uuid,jsonb),public.salvar_ativo_agenda(uuid,uuid,jsonb,integer) from public,anon;
grant execute on function public.consultar_recursos_reserva(uuid,jsonb),public.salvar_ativo_agenda(uuid,uuid,jsonb,integer) to authenticated;
notify pgrst,'reload schema';
commit;
