begin;
alter table public.agenda_servicos add column logistica jsonb not null default '{}';
alter table public.agenda_atendimentos add column visita boolean not null default false,
 add column deslocamento_minutos integer not null default 0 check(deslocamento_minutos between 0 and 720),
 add column logistica jsonb not null default '{}';

create function private.normalizar_logistica(p jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare k text; n integer; r jsonb;
begin
 if p is null then return '{}';end if;
 if jsonb_typeof(p)<>'object' or octet_length(p::text)>4000 then raise exception 'Planejamento de visita inválido.' using errcode='22023';end if;
 if length(coalesce(p->>'origem',''))>300 or length(coalesce(p->>'destino',''))>300 then raise exception 'Endereço muito longo.' using errcode='22023';end if;
 r:=jsonb_build_object('origem',trim(coalesce(p->>'origem','')),'destino',trim(coalesce(p->>'destino','')),'fonte',case when p->>'fonte'='openrouteservice' then 'openrouteservice' else 'manual' end);
 foreach k in array array['margem_minutos','retorno_minutos','distancia_metros','retorno_metros'] loop
  if coalesce(p->>k,'0') !~ '^[0-9]{1,7}$' then raise exception 'Informe minutos e distância em números inteiros positivos.' using errcode='22023';end if;
  n:=coalesce(p->>k,'0')::integer;
  if n>(case when k='margem_minutos' then 180 when k='retorno_minutos' then 720 else 2000000 end) then raise exception 'Tempo de viagem ou distância acima do limite.' using errcode='22023';end if;
  r:=r||jsonb_build_object(k,n);
 end loop;
 if nullif(p->>'calculado_em','') is not null then r:=r||jsonb_build_object('calculado_em',(p->>'calculado_em')::timestamptz);end if;
 return r;
end $$;
create function private.inicio_visita(i timestamptz,v boolean,m integer,l jsonb) returns timestamptz language sql immutable set search_path='' as $$
 select i-make_interval(mins=>case when v then m+coalesce((l->>'margem_minutos')::integer,0) else 0 end)
$$;
create function private.fim_visita(f timestamptz,i timestamptz,v boolean,l jsonb) returns timestamptz language sql immutable set search_path='' as $$
 select coalesce(f,i+interval '1 microsecond')+make_interval(mins=>case when v then coalesce((l->>'retorno_minutos')::integer,0) else 0 end)
$$;
create function private.validar_logistica_agenda() returns trigger language plpgsql security definer set search_path='' as $$
declare auto boolean:=tg_table_name='agenda_atendimentos'; conflito boolean; ini timestamptz; fimv timestamptz;
begin
 new.logistica:=case when new.visita then private.normalizar_logistica(new.logistica) else '{}' end;
 if not new.visita then new.deslocamento_minutos:=0;end if;
 if new.visita and (new.fim is null or new.fim<=new.inicio) then raise exception 'Informe o término da visita para reservar o deslocamento e evitar conflitos.' using errcode='22023';end if;
 if new.situacao not in ('agendado','confirmado','convertido') then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended((case when auto then 'produtividade:' else 'agenda:' end)||new.oficina_id::text,0));
 ini:=private.inicio_visita(new.inicio,new.visita,new.deslocamento_minutos,new.logistica);
 fimv:=private.fim_visita(new.fim,new.inicio,new.visita,new.logistica);
 if auto then
  select exists(select 1 from public.agenda_atendimentos g where g.oficina_id=new.oficina_id and g.id<>new.id and g.situacao in ('agendado','convertido')
   and (g.recurso=new.recurso or g.veiculo_id=new.veiculo_id)
   and private.inicio_visita(g.inicio,g.visita,g.deslocamento_minutos,g.logistica)<fimv
   and private.fim_visita(g.fim,g.inicio,g.visita,g.logistica)>ini) into conflito;
 else
  select exists(select 1 from public.agenda_servicos g where g.oficina_id=new.oficina_id and g.id<>new.id and g.recurso_id=new.recurso_id and g.situacao in ('agendado','confirmado')
   and private.inicio_visita(g.inicio,g.visita,g.deslocamento_minutos,g.logistica)<fimv
   and private.fim_visita(g.fim,g.inicio,g.visita,g.logistica)>ini) into conflito;
 end if;
 if conflito then raise exception 'Horário ocupado, incluindo deslocamento, margem de segurança ou retorno. Ajuste o horário ou escolha outra equipe.' using errcode='23P01';end if;
 return new;
end $$;
create trigger validar_logistica before insert or update of inicio,fim,visita,deslocamento_minutos,logistica,situacao,recurso_id on public.agenda_servicos for each row execute function private.validar_logistica_agenda();
create trigger validar_logistica before insert or update of inicio,fim,visita,deslocamento_minutos,logistica,situacao,recurso,veiculo_id on public.agenda_atendimentos for each row execute function private.validar_logistica_agenda();

-- Preserva as demais regras atuais das funções. Falha a migração se o contrato mudou.
do $$
declare s text; anterior text;
begin
 s:=pg_get_functiondef('public.salvar_agenda_servico(uuid,uuid,jsonb,integer)'::regprocedure);anterior:=s;
 s:=replace(s,'observacoes,visita,deslocamento_minutos)','observacoes,visita,deslocamento_minutos,logistica)');
 s:=replace(s,'visita_nova,deslocamento)','visita_nova,deslocamento,coalesce(p_dados->''logistica'',a.logistica,''{}''))');
 s:=replace(s,'deslocamento_minutos=excluded.deslocamento_minutos,','deslocamento_minutos=excluded.deslocamento_minutos,logistica=excluded.logistica,');
 if s=anterior or position('logistica=excluded.logistica' in s)=0 then raise exception 'Contrato salvar_agenda_servico mudou';end if;execute s;
 s:=pg_get_functiondef('public.operar_produtividade(uuid,text,jsonb)'::regprocedure);anterior:=s;
 s:=replace(s,'inicio,fim,servico,identificacao)','inicio,fim,servico,identificacao,visita,deslocamento_minutos,logistica)');
 s:=replace(s,'nullif(trim(p_dados->>''identificacao''),'''')) on conflict','nullif(trim(p_dados->>''identificacao''),''''),coalesce((p_dados->>''visita'')::boolean,a.visita,false),coalesce((p_dados->>''deslocamento_minutos'')::integer,a.deslocamento_minutos,0),coalesce(p_dados->''logistica'',a.logistica,''{}'')) on conflict');
 s:=replace(s,'set identificacao=excluded.identificacao,','set visita=excluded.visita,deslocamento_minutos=excluded.deslocamento_minutos,logistica=excluded.logistica,identificacao=excluded.identificacao,');
 if s=anterior or position('logistica=excluded.logistica' in s)=0 then raise exception 'Contrato operar_produtividade mudou';end if;execute s;
 s:=pg_get_functiondef('public.pagina_servicos(uuid,jsonb,jsonb)'::regprocedure);anterior:=s;
 s:=replace(s,'(g.inicio-make_interval(mins=>g.deslocamento_minutos))','private.inicio_visita(g.inicio,g.visita,g.deslocamento_minutos,g.logistica)');
 s:=replace(s,'and g.fim>v_inicio','and private.fim_visita(g.fim,g.inicio,g.visita,g.logistica)>v_inicio');
 if s=anterior then raise exception 'Contrato pagina_servicos mudou';end if;execute s;
end $$;
create index agenda_servicos_logistica_recurso on public.agenda_servicos(oficina_id,recurso_id,private.inicio_visita(inicio,visita,deslocamento_minutos,logistica)) where situacao in ('agendado','confirmado');
create index agenda_auto_logistica_recurso on public.agenda_atendimentos(oficina_id,recurso,private.inicio_visita(inicio,visita,deslocamento_minutos,logistica)) where situacao in ('agendado','convertido');
create index agenda_servicos_logistica_periodo on public.agenda_servicos(oficina_id,private.fim_visita(fim,inicio,visita,logistica));

-- Limites compartilhados entre instâncias da Edge Function; não guarda endereços.
create table private.cotas_trajeto(escopo uuid not null, janela timestamptz not null, tipo text not null, quantidade integer not null, primary key(escopo,janela,tipo));
alter table private.cotas_trajeto enable row level security;
revoke all on table private.cotas_trajeto from public,anon,authenticated;
create function public.autorizar_calculo_trajeto(p_oficina uuid) returns void language plpgsql security definer set search_path='' as $$
declare ramo text; global_id uuid:='00000000-0000-0000-0000-000000000000'; j timestamptz; n integer; c record;
begin
 select o.ramo into ramo from public.oficinas o where o.id=p_oficina;
 if ramo='automotivo' then perform private.exigir_os(p_oficina);else perform private.exigir_servicos(p_oficina);end if;
 perform pg_advisory_xact_lock(hashtextextended('cotas_trajeto',0));
 for c in select * from (values (global_id,'minuto',15),(global_id,'dia',500),(p_oficina,'dia',100)) as x(escopo,tipo,limite) loop
  j:=date_trunc(case when c.tipo='minuto' then 'minute' else 'day' end,now());
  insert into private.cotas_trajeto values(c.escopo,j,c.tipo,1) on conflict(escopo,janela,tipo) do update set quantidade=cotas_trajeto.quantidade+1 returning quantidade into n;
  if n>c.limite then raise exception 'Limite de consultas atingido. Aguarde ou informe o deslocamento manualmente.' using errcode='22023';end if;
 end loop;
 delete from private.cotas_trajeto where janela<now()-interval '2 days';
end $$;
revoke all on function public.autorizar_calculo_trajeto(uuid) from public,anon;
grant execute on function public.autorizar_calculo_trajeto(uuid) to authenticated;
revoke all on function private.normalizar_logistica(jsonb),private.inicio_visita(timestamptz,boolean,integer,jsonb),private.fim_visita(timestamptz,timestamptz,boolean,jsonb),private.validar_logistica_agenda() from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
