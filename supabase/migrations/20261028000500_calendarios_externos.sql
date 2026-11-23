create table public.assinaturas_calendario (
 id uuid primary key, oficina_id uuid not null references public.oficinas(id), nome text not null check(length(nome) between 2 and 100),
 token_hash text not null unique, recurso text not null default '', detalhes boolean not null default false,
 criado_em timestamptz not null default now(), criado_por uuid not null, revogado_em timestamptz
);
create index assinatura_calendario_empresa on public.assinaturas_calendario(oficina_id,criado_em desc);
alter table public.assinaturas_calendario enable row level security;
revoke all on public.assinaturas_calendario from public,anon,authenticated;
alter table public.agenda_atendimentos add column atualizado_calendario timestamptz not null default now();
alter table public.agenda_servicos add column atualizado_calendario timestamptz not null default now();
create function private.atualizar_calendario() returns trigger language plpgsql set search_path='' as $$begin new.atualizado_calendario:=now();return new;end $$;
create trigger atualizar_calendario before update on public.agenda_atendimentos for each row execute function private.atualizar_calendario();
create trigger atualizar_calendario before update on public.agenda_servicos for each row execute function private.atualizar_calendario();
create function public.gerenciar_assinatura_calendario(p_oficina uuid,p_acao text default 'listar',p_id uuid default null,p_dados jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid; h text; a public.assinaturas_calendario;
begin
 perform private.gerencia_planejamento(p_oficina);u:=auth.uid();
 perform pg_advisory_xact_lock(hashtextextended('assinatura-calendario:'||p_oficina,0));
 if p_acao='criar' then
 if coalesce(p_dados->>'token','')!~'^[0-9a-f]{64}$' or p_id is null or length(coalesce(p_dados->>'recurso',''))>120 then raise exception 'Assinatura inválida.' using errcode='22023';end if;
 h:=encode(sha256(convert_to(p_dados->>'token','UTF8')),'hex');
 select * into a from public.assinaturas_calendario where id=p_id;
 if found then
 if a.oficina_id<>p_oficina or a.token_hash<>h then raise exception 'Assinatura indisponível.' using errcode='42501';end if;
 else
 if (select count(*) from public.assinaturas_calendario where oficina_id=p_oficina and revogado_em is null)>=20 then raise exception 'Revogue uma assinatura antes de criar outra. Limite: 20.' using errcode='22023';end if;
 insert into public.assinaturas_calendario(id,oficina_id,nome,token_hash,recurso,detalhes,criado_por) values(p_id,p_oficina,trim(p_dados->>'nome'),h,coalesce(p_dados->>'recurso',''),coalesce((p_dados->>'detalhes')::boolean,false),u);
 end if;
 elsif p_acao='revogar' then
 update public.assinaturas_calendario set revogado_em=coalesce(revogado_em,now()) where oficina_id=p_oficina and id=p_id;
 if not found then raise exception 'Assinatura indisponível.' using errcode='42501';end if;
 elsif p_acao<>'listar' then raise exception 'Ação inválida.' using errcode='22023';end if;
 return jsonb_build_object('itens',(select coalesce(jsonb_agg(to_jsonb(x) order by criado_em desc),'[]') from (select id,nome,recurso,detalhes,criado_em,revogado_em from public.assinaturas_calendario where oficina_id=p_oficina and revogado_em is null order by criado_em desc limit 20)x));
end $$;

-- Somente a função de servidor acessa este exportador. O segredo nunca fica nas tabelas públicas.
create function public.exportar_calendario(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.assinaturas_calendario; lista jsonb;
begin
 if coalesce(p_token,'')!~'^[0-9a-f]{64}$' then raise exception 'Agenda indisponível.' using errcode='P0002';end if;
 select * into a from public.assinaturas_calendario where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and revogado_em is null;
 if not found or not exists(select 1 from public.membros_oficina where oficina_id=a.oficina_id and usuario_id=a.criado_por and ativo and perfil in ('owner','manager')) or not private.has_feature(a.oficina_id,'work_orders') then raise exception 'Agenda indisponível.' using errcode='P0002';end if;
 with eventos as (
 select g.id,g.inicio,coalesce(g.fim,g.inicio+interval '1 hour') fim,g.situacao,g.revisao,g.atualizado_calendario atualizado,
 case when a.detalhes then g.servico else 'Horário reservado' end titulo,
 case when a.detalhes then coalesce(c.nome,'')||' · '||g.recurso else '' end descricao,
 case when a.detalhes then coalesce(g.logistica->>'destino','') else '' end local,
 private.inicio_visita(g.inicio,g.visita,g.deslocamento_minutos,g.logistica) saida,private.fim_visita(g.fim,g.inicio,g.visita,g.logistica) retorno
 from public.agenda_atendimentos g left join public.clientes c on c.id=g.cliente_id
 where g.oficina_id=a.oficina_id and g.inicio>=now()-interval '30 days' and g.inicio<now()+interval '366 days' and (a.recurso='' or lower(trim(g.recurso))=lower(trim(a.recurso)))
 union all
 select g.id,g.inicio,g.fim,g.situacao,g.revisao,g.atualizado_calendario,
 case when a.detalhes then s.titulo else 'Horário reservado' end,
 case when a.detalhes then coalesce(c.nome,'')||' · '||r.nome else '' end,
 case when a.detalhes then coalesce(g.logistica->>'destino','') else '' end,
 private.inicio_visita(g.inicio,g.visita,g.deslocamento_minutos,g.logistica),private.fim_visita(g.fim,g.inicio,g.visita,g.logistica)
 from public.agenda_servicos g join public.atendimentos_servicos s on s.id=g.atendimento_id join public.recursos_agenda r on r.id=g.recurso_id left join public.clientes c on c.id=s.cliente_id
 where g.oficina_id=a.oficina_id and g.inicio>=now()-interval '30 days' and g.inicio<now()+interval '366 days' and (a.recurso='' or r.id::text=a.recurso or lower(trim(r.nome))=lower(trim(a.recurso)))
 ) select coalesce(jsonb_agg(to_jsonb(e) order by inicio,id),'[]') into lista from (select * from eventos order by inicio,id limit 5001)e;
 if jsonb_array_length(lista)>5000 then raise exception 'Use uma assinatura por equipe. A agenda excede 5.000 eventos.' using errcode='54000';end if;
 return jsonb_build_object('nome',a.nome,'eventos',lista);
end $$;
revoke all on function private.atualizar_calendario(),public.gerenciar_assinatura_calendario(uuid,text,uuid,jsonb),public.exportar_calendario(text) from public,anon,authenticated;
grant execute on function public.gerenciar_assinatura_calendario(uuid,text,uuid,jsonb) to authenticated;
grant execute on function public.exportar_calendario(text) to service_role;
