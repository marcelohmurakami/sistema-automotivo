begin;
create table public.configuracao_pesquisa_qualidade (
 oficina_id uuid primary key references public.oficinas(id), ativa boolean not null default false,
 atraso_dias integer not null default 1 check(atraso_dias between 0 and 30), validade_dias integer not null default 30 check(validade_dias between 1 and 90),
 site text not null check(site ~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?$'), autorizada_por uuid not null references auth.users(id), atualizado_em timestamptz not null default now()
);
create table public.contato_pesquisa_qualidade (
 oficina_id uuid not null, cliente_id uuid not null, permite boolean not null, registro text not null check(length(trim(registro)) between 5 and 1000),
 atualizado_em timestamptz not null default now(), autor uuid not null references auth.users(id), primary key(oficina_id,cliente_id),
 foreign key(oficina_id,cliente_id) references public.clientes(oficina_id,id)
);
create table public.pesquisas_qualidade (
 id uuid primary key default gen_random_uuid(), oficina_id uuid not null references public.oficinas(id), origem text not null check(origem in ('os','atendimento')),
 documento_id uuid not null, cliente_id uuid not null, concluido_em timestamptz not null,
 token text not null unique default replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),
 expira_em timestamptz not null, enviar_apos timestamptz not null, revogado_em timestamptz,
 aviso_id uuid unique references public.avisos_automaticos(id), nota integer check(nota between 1 and 5), comentario text check(length(comentario)<=2000),
 respondido_em timestamptz, recusa_contato boolean not null default false, acompanhamento text not null default '' check(length(acompanhamento)<=3000), resolvido_em timestamptz,
 revisao integer not null default 1, unique(oficina_id,origem,documento_id), unique(oficina_id,id),
 foreign key(oficina_id,cliente_id) references public.clientes(oficina_id,id),
 check((nota is null)=(respondido_em is null))
);
create index pesquisas_qualidade_periodo on public.pesquisas_qualidade(oficina_id,concluido_em desc,id);
create index pesquisas_qualidade_envio on public.pesquisas_qualidade(enviar_apos) where aviso_id is null and revogado_em is null and respondido_em is null;
create table public.historico_pesquisa_qualidade (
 id bigint generated always as identity primary key, oficina_id uuid not null, pesquisa_id uuid not null,
 evento text not null, registro text not null, autor uuid, criado_em timestamptz not null default now(),
 foreign key(oficina_id,pesquisa_id) references public.pesquisas_qualidade(oficina_id,id)
);
create index historico_pesquisa_pai on public.historico_pesquisa_qualidade(oficina_id,pesquisa_id,id);
create trigger historico_pesquisa_imutavel before update or delete on public.historico_pesquisa_qualidade for each row execute function private.reject_mutation();
do $$declare t text;begin foreach t in array array['configuracao_pesquisa_qualidade','contato_pesquisa_qualidade','pesquisas_qualidade','historico_pesquisa_qualidade'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);end loop;end $$;

create function public.configurar_pesquisa_qualidade(p_oficina uuid,p_ativa boolean,p_atraso integer,p_validade integer,p_site text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.exigir_gestao(p_oficina,'work_orders');
 if p_ativa is null or p_atraso is null or p_validade is null or p_atraso not between 0 and 30 or p_validade not between 1 and 90 or p_site is null or p_site !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?$' then raise exception 'Confira prazo, validade e endereço HTTPS do site publicado.' using errcode='22023';end if;
 if p_ativa and not private.has_feature(p_oficina,'automations') then raise exception 'Pesquisa automática indisponível no plano.' using errcode='42501';end if;
 insert into public.configuracao_pesquisa_qualidade(oficina_id,ativa,atraso_dias,validade_dias,site,autorizada_por) values(p_oficina,p_ativa,p_atraso,p_validade,p_site,auth.uid()) on conflict(oficina_id) do update set ativa=excluded.ativa,atraso_dias=excluded.atraso_dias,validade_dias=excluded.validade_dias,site=excluded.site,autorizada_por=auth.uid(),atualizado_em=now();
end $$;

create function public.registrar_contato_pesquisa(p_oficina uuid,p_cliente uuid,p_permite boolean,p_registro text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.exigir_gestao(p_oficina,'work_orders');
 if p_permite is null or length(trim(coalesce(p_registro,''))) not between 5 and 1000 then raise exception 'Registre a autorização ou a recusa de contato do cliente.' using errcode='22023';end if;
 insert into public.contato_pesquisa_qualidade(oficina_id,cliente_id,permite,registro,autor) values(p_oficina,p_cliente,p_permite,p_registro,auth.uid()) on conflict(oficina_id,cliente_id) do update set permite=excluded.permite,registro=excluded.registro,autor=auth.uid(),atualizado_em=now();
 if not p_permite then update public.avisos_automaticos set situacao='cancelado' where oficina_id=p_oficina and id in(select aviso_id from public.pesquisas_qualidade where oficina_id=p_oficina and cliente_id=p_cliente) and situacao in ('aprovado','revisao');end if;
end $$;

create function private.criar_pesquisa_qualidade(p_oficina uuid,p_origem text,p_documento uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare d record;c public.configuracao_pesquisa_qualidade;r uuid;
begin
 select * into d from private.documentos_qualidade where oficina_id=p_oficina and origem=p_origem and id=p_documento and finalizado;
 if not found or d.finalizado_em is null then raise exception 'Conclua e entregue o atendimento antes de criar a pesquisa.' using errcode='22023';end if;
 select * into c from public.configuracao_pesquisa_qualidade where oficina_id=p_oficina;
 insert into public.pesquisas_qualidade(oficina_id,origem,documento_id,cliente_id,concluido_em,expira_em,enviar_apos)
 values(p_oficina,p_origem,p_documento,d.cliente_id,d.finalizado_em,now()+make_interval(days=>coalesce(c.atraso_dias,1)+coalesce(c.validade_dias,30)),now()+make_interval(days=>coalesce(c.atraso_dias,1)))
 on conflict(oficina_id,origem,documento_id) do nothing returning id into r;
 if r is not null then insert into public.historico_pesquisa_qualidade(oficina_id,pesquisa_id,evento,registro,autor) values(p_oficina,r,'criada','Pesquisa criada após a conclusão do atendimento.',auth.uid());
 else select id into r from public.pesquisas_qualidade where oficina_id=p_oficina and origem=p_origem and documento_id=p_documento;end if;
 return r;
end $$;

create function private.pesquisa_apos_atendimento() returns trigger language plpgsql security definer set search_path='' as $$
declare v_origem text:=case when tg_table_name='ordens_servico' then 'os' else 'atendimento' end;f boolean;
begin
 select finalizado into f from private.documentos_qualidade where oficina_id=new.oficina_id and id=new.id and origem=v_origem;
 if coalesce(f,false) then
  if exists(select 1 from public.configuracao_pesquisa_qualidade where oficina_id=new.oficina_id and ativa) then perform private.criar_pesquisa_qualidade(new.oficina_id,v_origem,new.id);end if;
 else
  update public.pesquisas_qualidade set revogado_em=now(),revisao=revisao+1 where oficina_id=new.oficina_id and documento_id=new.id and origem=v_origem and revogado_em is null;
 end if;
 return new;
end $$;
create trigger zz_pesquisa_qualidade after insert or update on public.ordens_servico for each row execute function private.pesquisa_apos_atendimento();
create trigger zz_pesquisa_qualidade after insert or update on public.atendimentos_servicos for each row execute function private.pesquisa_apos_atendimento();

create function public.gerar_pesquisa_qualidade(p_oficina uuid,p_origem text,p_documento uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r uuid;begin perform private.exigir_gestao(p_oficina,'work_orders');r:=private.criar_pesquisa_qualidade(p_oficina,p_origem,p_documento);return (select to_jsonb(p) from public.pesquisas_qualidade p where id=r);end $$;

create function public.consultar_pesquisa_publica(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.pesquisas_qualidade;begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return null;end if;
 select * into p from public.pesquisas_qualidade where token=p_token and revogado_em is null and expira_em>now();
 if not found or not exists(select 1 from private.documentos_qualidade where oficina_id=p.oficina_id and id=p.documento_id and origem=p.origem and finalizado) then return null;end if;
 return jsonb_build_object('empresa',(select nome from public.oficinas where id=p.oficina_id),'respondida',p.respondido_em is not null,'expira_em',p.expira_em);
end $$;

create function public.responder_pesquisa_qualidade(p_token text,p_nota integer,p_comentario text,p_recusa_contato boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare p public.pesquisas_qualidade;begin
 if p_nota is null or p_nota not between 1 and 5 or length(coalesce(p_comentario,''))>2000 or p_recusa_contato is null or public.consultar_pesquisa_publica(p_token) is null then raise exception 'Pesquisa indisponível. Confira o link ou solicite ajuda à empresa.' using errcode='22023';end if;
 select * into p from public.pesquisas_qualidade where token=p_token for update;
 if p.revogado_em is not null or p.expira_em<=now() then raise exception 'Pesquisa indisponível.' using errcode='22023';end if;
 if p.respondido_em is not null then
  if p.nota=p_nota and p.comentario=trim(coalesce(p_comentario,'')) and p.recusa_contato=p_recusa_contato then return;end if;
  raise exception 'Esta pesquisa já foi respondida.' using errcode='PT409';
 end if;
 update public.pesquisas_qualidade set nota=p_nota,comentario=trim(coalesce(p_comentario,'')),recusa_contato=p_recusa_contato,respondido_em=now(),revisao=revisao+1 where id=p.id;
 insert into public.historico_pesquisa_qualidade(oficina_id,pesquisa_id,evento,registro) values(p.oficina_id,p.id,'respondida','Resposta recebida pelo link individual.');
 -- A recusa prevalece sobre autorizações anteriores. Não exige identificar o cliente no link público.
 if p_recusa_contato then
  update public.contato_pesquisa_qualidade set permite=false,registro='Cliente recusou novos contatos na pesquisa.',atualizado_em=now() where oficina_id=p.oficina_id and cliente_id=p.cliente_id;
  update public.avisos_automaticos set situacao='cancelado' where oficina_id=p.oficina_id and cliente_id=p.cliente_id and id in(select aviso_id from public.pesquisas_qualidade where oficina_id=p.oficina_id) and situacao in ('aprovado','revisao');
 end if;
end $$;

create function public.acompanhar_pesquisa_qualidade(p_oficina uuid,p_id uuid,p_revisao integer,p_acao text,p_registro text) returns void language plpgsql security definer set search_path='' as $$
declare p public.pesquisas_qualidade;begin
 perform private.exigir_gestao(p_oficina,'work_orders');
 select * into p from public.pesquisas_qualidade where oficina_id=p_oficina and id=p_id for update;
 if not found then raise exception 'Pesquisa indisponível.' using errcode='42501';end if;
 if p.revisao is distinct from p_revisao then raise exception 'A pesquisa mudou. Atualize antes de salvar.' using errcode='PT409';end if;
 if p_acao is null or p_acao not in ('revogar','acompanhar','resolver','reabrir') or length(trim(coalesce(p_registro,''))) not between 5 and 3000 or (p_acao<>'revogar' and p.respondido_em is null) then raise exception 'Informe a ação e o registro do acompanhamento.' using errcode='22023';end if;
 update public.pesquisas_qualidade set revogado_em=case when p_acao='revogar' then now() else revogado_em end,acompanhamento=case when p_acao='revogar' then acompanhamento else p_registro end,resolvido_em=case when p_acao='resolver' then now() when p_acao='reabrir' then null else resolvido_em end,revisao=revisao+1 where id=p_id;
 insert into public.historico_pesquisa_qualidade(oficina_id,pesquisa_id,evento,registro,autor) values(p_oficina,p_id,p_acao,p_registro,auth.uid());
end $$;

-- Acopla a pesquisa à fila de envio já usada pela automação. A entrega continua dependendo do canal configurado.
alter function public.processar_lembretes_automaticos() rename to processar_lembretes_antes_pesquisas;
revoke all on function public.processar_lembretes_antes_pesquisas() from public,anon,authenticated,service_role;
create function public.processar_lembretes_automaticos() returns integer language plpgsql security definer set search_path='' as $$
declare n integer; p record; av uuid;begin
 n:=public.processar_lembretes_antes_pesquisas();
 for p in select s.*,c.site,c.autorizada_por,cl.telefone_e164 from public.pesquisas_qualidade s join public.configuracao_pesquisa_qualidade c on c.oficina_id=s.oficina_id and c.ativa
 join public.clientes cl on cl.oficina_id=s.oficina_id and cl.id=s.cliente_id and cl.arquivado_em is null
 join public.contato_pesquisa_qualidade co on co.oficina_id=s.oficina_id and co.cliente_id=s.cliente_id and co.permite
 where s.aviso_id is null and s.revogado_em is null and s.respondido_em is null and not s.recusa_contato and s.enviar_apos<=now() and s.expira_em>now()
 and cl.telefone_e164~'^\+[1-9][0-9]{7,14}$' and private.has_feature(s.oficina_id,'automations')
 and exists(select 1 from private.documentos_qualidade d where d.oficina_id=s.oficina_id and d.origem=s.origem and d.id=s.documento_id and d.finalizado)
 order by s.enviar_apos for update of s skip locked limit 100 loop
  insert into public.avisos_automaticos(oficina_id,cliente_id,chave,mensagem,situacao,aprovado_por,aprovado_em,telefone_aprovado)
  values(p.oficina_id,p.cliente_id,'pesquisa:'||p.id||':'||p.revisao,'Como foi seu atendimento? Sua avaliação ajuda a melhorar nosso serviço: '||p.site||'/pesquisa/'||p.token,'aprovado',p.autorizada_por,now(),p.telefone_e164)
  on conflict(oficina_id,chave) do update set chave=excluded.chave returning id into av;
  update public.pesquisas_qualidade set aviso_id=av where id=p.id;n:=n+1;
 end loop;
 -- Revogações, recusas, reaberturas e pausa da automação cancelam a fila antes da retirada pelo worker.
 update public.avisos_automaticos a set situacao='cancelado' from public.pesquisas_qualidade s
 where a.id=s.aviso_id and a.situacao in ('aprovado','revisao') and not private.pesquisa_pode_enviar(s.id);
 return n;
end $$;

create function private.pesquisa_pode_enviar(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.pesquisas_qualidade p join public.configuracao_pesquisa_qualidade c on c.oficina_id=p.oficina_id and c.ativa
 join public.contato_pesquisa_qualidade co on co.oficina_id=p.oficina_id and co.cliente_id=p.cliente_id and co.permite
 join private.documentos_qualidade d on d.oficina_id=p.oficina_id and d.origem=p.origem and d.id=p.documento_id and d.finalizado
 where p.id=p_id and p.revogado_em is null and p.expira_em>now() and p.respondido_em is null and not p.recusa_contato);
$$;
alter function public.reservar_aviso_automatico(uuid) rename to reservar_aviso_antes_pesquisas;
revoke all on function public.reservar_aviso_antes_pesquisas(uuid) from public,anon,authenticated,service_role;
create function public.reservar_aviso_automatico(p_oficina uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 update public.avisos_automaticos a set situacao='cancelado' from public.pesquisas_qualidade p where p.oficina_id=p_oficina and a.id=p.aviso_id and a.situacao in ('revisao','aprovado') and not private.pesquisa_pode_enviar(p.id);
 return public.reservar_aviso_antes_pesquisas(p_oficina);
end $$;

create function public.consultar_satisfacao_qualidade(p_oficina uuid,p_inicio date,p_fim date,p_pagina integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;tot jsonb;conf jsonb;begin
 perform private.exigir_gestao(p_oficina,'work_orders');
 if p_inicio is null or p_fim is null or p_fim<p_inicio or p_fim-p_inicio>366 or p_pagina not between 0 and 100000 then raise exception 'Selecione até 12 meses e uma página válida.' using errcode='22023';end if;
 select jsonb_build_object('concluidos',count(*),'convidados',count(p.id),'enviados',count(*) filter(where a.situacao='enviado'),'respostas',count(p.respondido_em),'nota_media',round(avg(p.nota),2),'satisfeitos',count(*) filter(where p.nota>=4),'insatisfeitos',count(*) filter(where p.nota<=2 and p.resolvido_em is null),'sem_permissao',count(*) filter(where not coalesce(co.permite,false)),'sem_telefone',count(*) filter(where not coalesce(d.telefone~'^\+[1-9][0-9]{7,14}$',false))) into tot
 from private.documentos_qualidade d left join public.pesquisas_qualidade p on p.oficina_id=d.oficina_id and p.origem=d.origem and p.documento_id=d.id
 left join public.avisos_automaticos a on a.id=p.aviso_id left join public.contato_pesquisa_qualidade co on co.oficina_id=d.oficina_id and co.cliente_id=d.cliente_id
 where d.oficina_id=p_oficina and d.finalizado and d.finalizado_em>=p_inicio::timestamp at time zone 'America/Sao_Paulo' and d.finalizado_em<(p_fim+1)::timestamp at time zone 'America/Sao_Paulo';
 select coalesce(jsonb_agg(to_jsonb(t)),'[]') into r from (
 select d.*,to_jsonb(p) pesquisa,a.situacao envio,co.permite contato_permitido from private.documentos_qualidade d
 left join public.pesquisas_qualidade p on p.oficina_id=d.oficina_id and p.origem=d.origem and p.documento_id=d.id
 left join public.avisos_automaticos a on a.id=p.aviso_id left join public.contato_pesquisa_qualidade co on co.oficina_id=d.oficina_id and co.cliente_id=d.cliente_id
 where d.oficina_id=p_oficina and d.finalizado and d.finalizado_em>=p_inicio::timestamp at time zone 'America/Sao_Paulo' and d.finalizado_em<(p_fim+1)::timestamp at time zone 'America/Sao_Paulo'
 order by (p.nota<=2 and p.resolvido_em is null) desc nulls last,d.finalizado_em desc,d.id limit 51 offset p_pagina*50) t;
 select to_jsonb(c) into conf from public.configuracao_pesquisa_qualidade c where oficina_id=p_oficina;
 return jsonb_build_object('totais',tot,'itens',r,'configuracao',conf);
end $$;

create function public.renovar_pesquisa_qualidade(p_oficina uuid,p_id uuid,p_revisao integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.pesquisas_qualidade;v integer;begin
 perform private.exigir_gestao(p_oficina,'work_orders');
 select * into p from public.pesquisas_qualidade where oficina_id=p_oficina and id=p_id for update;
 if not found then raise exception 'Pesquisa indisponível.' using errcode='42501';end if;
 if p.revisao is distinct from p_revisao then raise exception 'A pesquisa mudou. Atualize antes de renovar.' using errcode='PT409';end if;
 if p.respondido_em is not null or (p.revogado_em is null and p.expira_em>now()) or not exists(select 1 from private.documentos_qualidade where oficina_id=p.oficina_id and origem=p.origem and id=p.documento_id and finalizado) then raise exception 'Somente links vencidos ou revogados de atendimentos entregues, ainda sem resposta, podem ser renovados.' using errcode='22023';end if;
 if exists(select 1 from public.avisos_automaticos where id=p.aviso_id and situacao='enviando') then raise exception 'Há um envio em andamento. Aguarde antes de renovar.' using errcode='PT409';end if;
 update public.avisos_automaticos set situacao='cancelado' where id=p.aviso_id and situacao in ('revisao','aprovado');
 select validade_dias into v from public.configuracao_pesquisa_qualidade where oficina_id=p_oficina;
 update public.pesquisas_qualidade set token=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''),expira_em=now()+make_interval(days=>coalesce(v,30)),enviar_apos=now(),aviso_id=null,revogado_em=null,revisao=revisao+1 where id=p_id returning * into p;
 insert into public.historico_pesquisa_qualidade(oficina_id,pesquisa_id,evento,registro,autor) values(p_oficina,p_id,'renovada','Novo link gerado; o anterior foi invalidado.',auth.uid());
 return to_jsonb(p);
end $$;

alter function public.consultar_alertas(uuid) rename to consultar_alertas_antes_qualidade;
revoke all on function public.consultar_alertas_antes_qualidade(uuid) from public,anon,authenticated;
create function public.consultar_alertas(p_oficina uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid;lista jsonb;extra jsonb;begin
 u:=private.require_staff(p_oficina);lista:=public.consultar_alertas_antes_qualidade(p_oficina);
 if not private.has_feature(p_oficina,'work_orders') or not exists(select 1 from public.membros_oficina where oficina_id=p_oficina and usuario_id=u and ativo and perfil in ('owner','manager')) then return lista;end if;
 with fontes as (
  select p.id,'pesquisa-qualidade:'||p.id chave,c.nome titulo,'Avaliação '||p.nota||'/5 — acompanhar insatisfação' motivo,
   '/garantias?aba=satisfacao&inicio='||(p.concluido_em at time zone 'America/Sao_Paulo')::date||'&fim='||(p.concluido_em at time zone 'America/Sao_Paulo')::date destino,p.respondido_em data
  from public.pesquisas_qualidade p join public.clientes c on c.oficina_id=p.oficina_id and c.id=p.cliente_id where p.oficina_id=p_oficina and p.nota<=2 and p.resolvido_em is null
  union all
  select d.id,'custodia-qualidade:'||d.origem||':'||d.id||':'||to_char(d.pronto_em,'YYYYMMDD'),d.cliente,'Pronto há 7 dias ou mais — combinar retirada','/garantias?aba=custodia',d.pronto_em
  from private.documentos_qualidade d where d.oficina_id=p_oficina and d.aguarda_retirada and d.pronto_em<now()-interval '7 days'
 ), limitados as (select * from fontes order by data desc limit 100)
 select coalesce(jsonb_agg(jsonb_build_object('tipo','contato','id',f.id,'titulo',titulo,'motivo',motivo,'chave',f.chave,'destino',destino,'data',null,'dias',null,'natureza',null,'valor_centavos',null,'pronto',false,'lido',l.chave is not null)),'[]') into extra from limitados f left join public.alertas_lidos l on l.oficina_id=p_oficina and l.usuario_id=u and l.chave=f.chave where l.excluido_em is null;
 return lista||extra;
end $$;

do $$declare r record;begin for r in select p.oid::regprocedure assinatura,p.proname,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in ('configurar_pesquisa_qualidade','registrar_contato_pesquisa','criar_pesquisa_qualidade','pesquisa_apos_atendimento','gerar_pesquisa_qualidade','renovar_pesquisa_qualidade','consultar_pesquisa_publica','responder_pesquisa_qualidade','acompanhar_pesquisa_qualidade','processar_lembretes_automaticos','pesquisa_pode_enviar','reservar_aviso_automatico','consultar_satisfacao_qualidade','consultar_alertas') loop
 execute format('revoke all on function %s from public,anon,authenticated',r.assinatura);
 if r.nspname='public' then
  if r.proname in ('processar_lembretes_automaticos','reservar_aviso_automatico') then execute format('grant execute on function %s to service_role',r.assinatura);
  else execute format('grant execute on function %s to authenticated',r.assinatura);if r.proname in ('consultar_pesquisa_publica','responder_pesquisa_qualidade') then execute format('grant execute on function %s to anon',r.assinatura);end if;end if;
 end if;
end loop;end $$;
notify pgrst,'reload schema';commit;
