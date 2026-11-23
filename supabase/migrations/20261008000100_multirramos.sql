begin;
alter table public.oficinas add column ramo text not null default 'automotivo'
 check (ramo in ('automotivo','assistencia_tecnica','manutencao_campo','limpeza'));

create function public.configurar_nova_empresa(p_chave uuid,p_nome text,p_telefone text,p_endereco jsonb,p_ramo text)
returns uuid language plpgsql security definer set search_path='' as $$
declare w uuid; begin
 if p_ramo is null or p_ramo not in ('automotivo','assistencia_tecnica','manutencao_campo','limpeza') then raise exception 'Selecione um ramo válido antes de cadastrar a empresa.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_chave::text,0));
 select oficina_id into w from public.cadastros_oficina where usuario_id=auth.uid() and chave=p_chave;
 if found then
  if (select ramo from public.oficinas where id=w)<>p_ramo then raise exception 'Este cadastro já foi concluído em outro ramo.' using errcode='22023'; end if;
  return w;
 end if;
 w:=public.configurar_nova_oficina(p_chave,p_nome,p_telefone,p_endereco);
 update public.oficinas set ramo=p_ramo where id=w;
 return w;
end $$;

create or replace function public.consultar_meu_acesso()
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'nome',o.nome,'ramo',o.ramo,'perfil',m.perfil,
 'codigo_plano',s.codigo_plano,'nome_plano',p.nome,'situacao',s.situacao,'valido_ate',s.valido_ate,
 'recursos',(select coalesce(jsonb_agg(r.codigo order by r.codigo),'[]'::jsonb) from public.recursos r where private.has_feature(o.id,r.codigo))) order by o.nome,o.id),'[]'::jsonb)
 from public.membros_oficina m join public.oficinas o on o.id=m.oficina_id
 left join public.assinaturas_oficina s on s.oficina_id=o.id left join public.planos p on p.codigo=s.codigo_plano
 where m.usuario_id=auth.uid() and m.ativo and o.arquivado_em is null;
$$;

create function private.exigir_servicos(p_oficina uuid,p_recurso text default 'work_orders') returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid; begin
 u:=private.require_staff(p_oficina);
 if not exists(select 1 from public.oficinas where id=p_oficina and ramo<>'automotivo' and arquivado_em is null)
 or not private.has_feature(p_oficina,p_recurso) then raise exception 'Módulo indisponível para esta empresa ou plano.' using errcode='42501'; end if;
 return u;
end $$;

create table public.objetos_atendimento (
 id uuid primary key, oficina_id uuid not null references public.oficinas(id), cliente_id uuid not null,
 nome text not null check(length(trim(nome)) between 2 and 160), dados jsonb not null default '{}' check(jsonb_typeof(dados)='object' and length(dados::text)<=12000),
 arquivado boolean not null default false, revisao integer not null default 1,
 unique(oficina_id,id), foreign key(oficina_id,cliente_id) references public.clientes(oficina_id,id)
);
create table public.recursos_agenda (
 id uuid primary key, oficina_id uuid not null references public.oficinas(id),
 nome text not null check(length(trim(nome)) between 2 and 120), ativo boolean not null default true,
 revisao integer not null default 1, unique(oficina_id,id)
);
create table public.atendimentos_servicos (
 id uuid primary key, oficina_id uuid not null references public.oficinas(id), cliente_id uuid not null, objeto_id uuid not null,
 titulo text not null check(length(trim(titulo)) between 3 and 180),
 situacao text not null default 'orcamento' check(situacao in ('orcamento','aprovado','em_execucao','aguardando','concluido','cancelado')),
 dados jsonb not null default '{}' check(jsonb_typeof(dados)='object' and length(dados::text)<=30000),
 valor_centavos bigint not null default 0 check(valor_centavos between 0 and 10000000000),
 vencimento date not null, revisao integer not null default 1, criado_em timestamptz not null default now(),
 unique(oficina_id,id), foreign key(oficina_id,cliente_id) references public.clientes(oficina_id,id),
 foreign key(oficina_id,objeto_id) references public.objetos_atendimento(oficina_id,id)
);
create table public.agenda_servicos (
 id uuid primary key, oficina_id uuid not null references public.oficinas(id), atendimento_id uuid not null, recurso_id uuid not null,
 inicio timestamptz not null, fim timestamptz not null, situacao text not null default 'agendado' check(situacao in ('agendado','confirmado','concluido','cancelado','faltou')),
 observacoes text not null default '' check(length(observacoes)<=2000), revisao integer not null default 1,
 check(fim>inicio and fim<=inicio+interval '7 days'), unique(oficina_id,id),
 foreign key(oficina_id,atendimento_id) references public.atendimentos_servicos(oficina_id,id),
 foreign key(oficina_id,recurso_id) references public.recursos_agenda(oficina_id,id)
);
create index agenda_servicos_periodo on public.agenda_servicos(oficina_id,inicio,fim);
create index atendimentos_servicos_cliente on public.atendimentos_servicos(oficina_id,cliente_id);
create table public.cobrancas_atendimento (
 oficina_id uuid not null, atendimento_id uuid primary key, titulo_id uuid not null unique,
 foreign key(oficina_id,atendimento_id) references public.atendimentos_servicos(oficina_id,id),
 foreign key(oficina_id,titulo_id) references public.titulos_financeiros(oficina_id,id)
);
alter table public.objetos_atendimento enable row level security;
alter table public.recursos_agenda enable row level security;
alter table public.atendimentos_servicos enable row level security;
alter table public.agenda_servicos enable row level security;
alter table public.cobrancas_atendimento enable row level security;
-- Acesso exclusivamente por funções com validação de empresa, ramo e plano.
revoke all on public.objetos_atendimento,public.recursos_agenda,public.atendimentos_servicos,public.agenda_servicos,public.cobrancas_atendimento from anon,authenticated;

create function public.consultar_servicos(p_oficina uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.exigir_servicos(p_oficina,'customers');
 return jsonb_build_object(
 'objetos',(select coalesce(jsonb_agg(to_jsonb(o) order by o.nome),'[]') from public.objetos_atendimento o where oficina_id=p_oficina),
 'recursos',(select coalesce(jsonb_agg(to_jsonb(r) order by r.nome),'[]') from public.recursos_agenda r where oficina_id=p_oficina),
 'atendimentos',case when private.has_feature(p_oficina,'work_orders') then (select coalesce(jsonb_agg(to_jsonb(a) order by a.criado_em desc),'[]') from public.atendimentos_servicos a where oficina_id=p_oficina) else '[]'::jsonb end,
 'agenda',case when private.has_feature(p_oficina,'work_orders') then (select coalesce(jsonb_agg(to_jsonb(a) order by a.inicio),'[]') from public.agenda_servicos a where oficina_id=p_oficina) else '[]'::jsonb end,
 'cobrancas',case when private.has_feature(p_oficina,'finance') and exists(select 1 from public.membros_oficina where oficina_id=p_oficina and usuario_id=auth.uid() and perfil in ('owner','manager') and ativo) then (select coalesce(jsonb_agg(to_jsonb(c)),'[]') from public.cobrancas_atendimento c where oficina_id=p_oficina) else '[]'::jsonb end);
end $$;

create function public.salvar_objeto_atendimento(p_oficina uuid,p_id uuid,p_dados jsonb,p_revisao integer default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare o public.objetos_atendimento%rowtype; begin
 perform private.exigir_servicos(p_oficina,'customers');
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_id::text,0));
 select * into o from public.objetos_atendimento where oficina_id=p_oficina and id=p_id for update;
 if found and p_revisao is null then return p_id; end if;
 if o.id is not null and o.revisao is distinct from p_revisao then raise exception 'Cadastro alterado. Atualize a tela.' using errcode='40001'; end if;
 if not exists(select 1 from public.clientes where oficina_id=p_oficina and id=(p_dados->>'cliente_id')::uuid and arquivado_em is null) then raise exception 'Cliente inválido.' using errcode='22023'; end if;
 if o.id is not null and o.cliente_id<>(p_dados->>'cliente_id')::uuid and exists(select 1 from public.atendimentos_servicos where objeto_id=o.id) then raise exception 'Não é possível trocar o cliente de um cadastro com atendimentos.'; end if;
 insert into public.objetos_atendimento(id,oficina_id,cliente_id,nome,dados,arquivado)
 values(p_id,p_oficina,(p_dados->>'cliente_id')::uuid,trim(p_dados->>'nome'),coalesce(p_dados->'dados','{}'),coalesce((p_dados->>'arquivado')::boolean,false))
 on conflict(id) do update set nome=excluded.nome,cliente_id=excluded.cliente_id,dados=excluded.dados,arquivado=excluded.arquivado,revisao=objetos_atendimento.revisao+1 where objetos_atendimento.oficina_id=p_oficina;
 if not found then raise exception 'Cadastro indisponível.' using errcode='42501'; end if;
 return p_id;
end $$;

create function public.salvar_recurso_agenda(p_oficina uuid,p_id uuid,p_nome text,p_ativo boolean,p_revisao integer default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.recursos_agenda%rowtype; begin
 perform private.exigir_servicos(p_oficina);
 if not exists(select 1 from public.membros_oficina where oficina_id=p_oficina and usuario_id=auth.uid() and perfil in ('owner','manager') and ativo) then raise exception 'Somente a gerência pode configurar a equipe da agenda.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_id::text,0));
 select * into r from public.recursos_agenda where oficina_id=p_oficina and id=p_id for update;
 if found and p_revisao is null then return p_id; end if;
 if r.id is not null and r.revisao is distinct from p_revisao then raise exception 'Equipe alterada. Atualize a tela.' using errcode='40001'; end if;
 insert into public.recursos_agenda(id,oficina_id,nome,ativo) values(p_id,p_oficina,trim(p_nome),p_ativo)
 on conflict(id) do update set nome=excluded.nome,ativo=excluded.ativo,revisao=recursos_agenda.revisao+1 where recursos_agenda.oficina_id=p_oficina;
 if not found then raise exception 'Recurso indisponível.' using errcode='42501'; end if;
 return p_id;
end $$;

create function public.salvar_atendimento_servico(p_oficina uuid,p_id uuid,p_dados jsonb,p_revisao integer default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.atendimentos_servicos%rowtype; begin
 perform private.exigir_servicos(p_oficina);
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_id::text,0));
 select * into a from public.atendimentos_servicos where oficina_id=p_oficina and id=p_id for update;
 if found and p_revisao is null then return p_id; end if;
 if a.id is not null and a.revisao is distinct from p_revisao then raise exception 'Atendimento alterado. Atualize a tela.' using errcode='40001'; end if;
 if not exists(select 1 from public.objetos_atendimento where oficina_id=p_oficina and id=(p_dados->>'objeto_id')::uuid and cliente_id=(p_dados->>'cliente_id')::uuid and not arquivado) then raise exception 'Selecione um cadastro ativo deste cliente.' using errcode='22023'; end if;
 if exists(select 1 from public.cobrancas_atendimento where atendimento_id=p_id) and
 ((p_dados->>'valor_centavos')::bigint is distinct from a.valor_centavos or p_dados->>'situacao'='cancelado' or (p_dados->>'cliente_id')::uuid is distinct from a.cliente_id) then raise exception 'Atendimento faturado: ajuste a cobrança no financeiro antes de alterar o contrato.' using errcode='22023'; end if;
 insert into public.atendimentos_servicos(id,oficina_id,cliente_id,objeto_id,titulo,situacao,dados,valor_centavos,vencimento)
 values(p_id,p_oficina,(p_dados->>'cliente_id')::uuid,(p_dados->>'objeto_id')::uuid,trim(p_dados->>'titulo'),p_dados->>'situacao',coalesce(p_dados->'dados','{}'),(p_dados->>'valor_centavos')::bigint,(p_dados->>'vencimento')::date)
 on conflict(id) do update set cliente_id=excluded.cliente_id,objeto_id=excluded.objeto_id,titulo=excluded.titulo,situacao=excluded.situacao,dados=excluded.dados,valor_centavos=excluded.valor_centavos,vencimento=excluded.vencimento,revisao=atendimentos_servicos.revisao+1 where atendimentos_servicos.oficina_id=p_oficina;
 if not found then raise exception 'Atendimento indisponível.' using errcode='42501'; end if;
 if p_dados->>'situacao'='cancelado' then update public.agenda_servicos set situacao='cancelado',revisao=revisao+1 where oficina_id=p_oficina and atendimento_id=p_id and situacao in ('agendado','confirmado'); end if;
 insert into public.registros_auditoria(oficina_id,usuario_autor_id,tipo_autor,acao,tipo_entidade,entidade_id,correlacao_id) values(p_oficina,auth.uid(),'user','servico.salvo','atendimento',p_id,gen_random_uuid());
 return p_id;
end $$;

create function public.salvar_agenda_servico(p_oficina uuid,p_id uuid,p_dados jsonb,p_revisao integer default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.agenda_servicos%rowtype; ri uuid:=(p_dados->>'recurso_id')::uuid; ini timestamptz:=(p_dados->>'inicio')::timestamptz; fimv timestamptz:=(p_dados->>'fim')::timestamptz; begin
 perform private.exigir_servicos(p_oficina);
 -- Serializa as reservas da empresa, inclusive remarcações entre equipes.
 perform pg_advisory_xact_lock(hashtextextended('agenda:'||p_oficina::text,0));
 select * into a from public.agenda_servicos where oficina_id=p_oficina and id=p_id for update;
 if found and p_revisao is null then return p_id; end if;
 if a.id is not null and a.revisao is distinct from p_revisao then raise exception 'Agendamento alterado. Atualize a tela.' using errcode='40001'; end if;
 if not exists(select 1 from public.recursos_agenda where oficina_id=p_oficina and id=ri and ativo) or not exists(select 1 from public.atendimentos_servicos where oficina_id=p_oficina and id=(p_dados->>'atendimento_id')::uuid and situacao<>'cancelado') then raise exception 'Equipe ou atendimento indisponível.' using errcode='22023'; end if;
 if p_dados->>'situacao' in ('agendado','confirmado') and exists(select 1 from public.agenda_servicos where oficina_id=p_oficina and recurso_id=ri and id<>p_id and situacao in ('agendado','confirmado') and inicio<fimv and fim>ini) then raise exception 'Esta equipe já tem um atendimento nesse horário.' using errcode='23P01'; end if;
 insert into public.agenda_servicos(id,oficina_id,atendimento_id,recurso_id,inicio,fim,situacao,observacoes)
 values(p_id,p_oficina,(p_dados->>'atendimento_id')::uuid,ri,ini,fimv,p_dados->>'situacao',coalesce(p_dados->>'observacoes',''))
 on conflict(id) do update set atendimento_id=excluded.atendimento_id,recurso_id=excluded.recurso_id,inicio=excluded.inicio,fim=excluded.fim,situacao=excluded.situacao,observacoes=excluded.observacoes,revisao=agenda_servicos.revisao+1 where agenda_servicos.oficina_id=p_oficina;
 if not found then raise exception 'Agendamento indisponível.' using errcode='42501'; end if;
 return p_id;
end $$;

create function public.faturar_atendimento_servico(p_oficina uuid,p_atendimento uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.atendimentos_servicos%rowtype; t uuid; begin
 perform private.exigir_servicos(p_oficina); perform private.exigir_financeiro(p_oficina);
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_atendimento::text,0));
 select titulo_id into t from public.cobrancas_atendimento where oficina_id=p_oficina and atendimento_id=p_atendimento;
 if found then return t; end if;
 select * into a from public.atendimentos_servicos where oficina_id=p_oficina and id=p_atendimento for update;
 if not found or a.situacao in ('orcamento','cancelado') or a.valor_centavos<=0 then raise exception 'Aprove o atendimento e informe seu valor antes de faturar.' using errcode='22023'; end if;
 t:=gen_random_uuid();
 insert into public.titulos_financeiros(id,oficina_id,natureza,descricao,categoria,valor_centavos,competencia,vencimento,pessoa,criado_por)
 values(t,p_oficina,'receber',a.titulo,'servicos',a.valor_centavos,(now() at time zone 'America/Sao_Paulo')::date,a.vencimento,(select nome from public.clientes where oficina_id=p_oficina and id=a.cliente_id),auth.uid());
 insert into public.cobrancas_atendimento values(p_oficina,p_atendimento,t);
 perform private.evento_financeiro(p_oficina,t,'atendimento_faturado');
 return t;
end $$;

revoke all on function private.exigir_servicos(uuid,text) from public,anon,authenticated;
revoke all on function public.configurar_nova_empresa(uuid,text,text,jsonb,text),public.consultar_servicos(uuid),public.salvar_objeto_atendimento(uuid,uuid,jsonb,integer),public.salvar_recurso_agenda(uuid,uuid,text,boolean,integer),public.salvar_atendimento_servico(uuid,uuid,jsonb,integer),public.salvar_agenda_servico(uuid,uuid,jsonb,integer),public.faturar_atendimento_servico(uuid,uuid) from public,anon;
grant execute on function public.configurar_nova_empresa(uuid,text,text,jsonb,text),public.consultar_servicos(uuid),public.salvar_objeto_atendimento(uuid,uuid,jsonb,integer),public.salvar_recurso_agenda(uuid,uuid,text,boolean,integer),public.salvar_atendimento_servico(uuid,uuid,jsonb,integer),public.salvar_agenda_servico(uuid,uuid,jsonb,integer),public.faturar_atendimento_servico(uuid,uuid) to authenticated;
-- Preserva integralmente as fontes automotivas e acrescenta os novos prazos.
alter function public.consultar_alertas(uuid) rename to consultar_alertas_base;
revoke all on function public.consultar_alertas_base(uuid) from public,anon,authenticated;
create function public.consultar_alertas(p_oficina uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare lista jsonb; extra jsonb; hoje date:=(now() at time zone 'America/Sao_Paulo')::date; begin
 lista:=public.consultar_alertas_base(p_oficina);
 if not private.has_feature(p_oficina,'work_orders') then return lista; end if;
 with fontes as (
 select 'servico'::text tipo,a.id,a.titulo,a.vencimento data,'/atendimentos?atendimento='||a.id destino
 from public.atendimentos_servicos a where oficina_id=p_oficina and situacao not in ('concluido','cancelado') and vencimento<=hoje+5
 union all
 select 'agenda',g.id,'Agendamento · '||a.titulo,(g.inicio at time zone 'America/Sao_Paulo')::date,'/agenda?reserva='||g.id
 from public.agenda_servicos g join public.atendimentos_servicos a on a.id=g.atendimento_id and a.oficina_id=g.oficina_id
 where g.oficina_id=p_oficina and g.situacao in ('agendado','confirmado') and (g.inicio at time zone 'America/Sao_Paulo')::date<=hoje+5
 ), chaves as (select *,tipo||':'||id||':'||data||':'||private.marco_alerta(data-hoje) chave,data-hoje dias from fontes)
 select coalesce(jsonb_agg(to_jsonb(c)||jsonb_build_object('natureza',null,'valor_centavos',null,'pronto',false,'lido',exists(select 1 from public.alertas_lidos l where l.oficina_id=p_oficina and l.usuario_id=auth.uid() and l.chave=c.chave)) order by c.dias),'[]') into extra from chaves c;
 return lista||extra;
end $$;
revoke all on function public.consultar_alertas(uuid) from public,anon;
grant execute on function public.consultar_alertas(uuid) to authenticated;

create function public.agendar_serie_servico(p_oficina uuid,p_chave uuid,p_dados jsonb,p_quantidade integer,p_intervalo integer) returns void
language plpgsql security definer set search_path='' as $$
declare i integer; idv uuid; begin
 perform private.exigir_servicos(p_oficina);
 if p_chave is null or p_quantidade is null or p_quantidade not between 1 and 52 or p_intervalo is null or p_intervalo not in (1,7,14,30) then raise exception 'Confira a repetição (máximo de 52 agendamentos).' using errcode='22023'; end if;
 for i in 0..p_quantidade-1 loop
  idv:=md5(p_chave::text||':'||i)::uuid;
  perform public.salvar_agenda_servico(p_oficina,idv,p_dados||jsonb_build_object('inicio',(p_dados->>'inicio')::timestamptz+make_interval(days=>i*p_intervalo),'fim',(p_dados->>'fim')::timestamptz+make_interval(days=>i*p_intervalo)),null);
 end loop;
end $$;
revoke all on function public.agendar_serie_servico(uuid,uuid,jsonb,integer,integer) from public,anon;
grant execute on function public.agendar_serie_servico(uuid,uuid,jsonb,integer,integer) to authenticated;

create function private.exigir_ramo_automotivo() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.oficinas where id=new.oficina_id and ramo='automotivo') then raise exception 'Este cadastro é exclusivo do sistema automotivo.' using errcode='22023'; end if;
 return new;
end $$;
revoke all on function private.exigir_ramo_automotivo() from public,anon,authenticated;
create trigger veiculo_ramo before insert or update on public.veiculos for each row execute function private.exigir_ramo_automotivo();
create trigger os_ramo before insert or update on public.ordens_servico for each row execute function private.exigir_ramo_automotivo();
create trigger orcamento_ramo before insert or update on public.orcamentos for each row execute function private.exigir_ramo_automotivo();
notify pgrst,'reload schema';
commit;
