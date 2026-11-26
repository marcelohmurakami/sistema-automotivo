begin;

-- Uma configuração operacional por funcionário; dados pessoais continuam na ficha.
create table public.configuracoes_funcionario (
 oficina_id uuid not null, funcionario_id uuid primary key,
 recurso_id uuid, nome_agenda text not null,
 jornada jsonb check(jornada is null or jsonb_typeof(jornada)='array'),
 revisao integer not null default 1,
 foreign key(oficina_id,funcionario_id) references public.funcionarios(oficina_id,id),
 foreign key(oficina_id,recurso_id) references public.recursos_agenda(oficina_id,id),
 unique(oficina_id,nome_agenda), unique(oficina_id,recurso_id)
);
create unique index configuracoes_funcionario_nome on public.configuracoes_funcionario(oficina_id,lower(trim(nome_agenda)));
create table public.servicos_funcionario (
 oficina_id uuid not null, funcionario_id uuid not null, item_catalogo_id uuid not null,
 ativo boolean not null default true, duracao_minutos integer check(duracao_minutos between 1 and 1440),
 preco_centavos bigint check(preco_centavos between 0 and 10000000000),
 primary key(oficina_id,funcionario_id,item_catalogo_id),
 foreign key(oficina_id,funcionario_id) references public.funcionarios(oficina_id,id),
 foreign key(oficina_id,item_catalogo_id) references public.itens_catalogo(oficina_id,id)
);
create table public.bloqueios_funcionario (
 id uuid primary key, oficina_id uuid not null references public.oficinas(id), funcionario_id uuid,
 tipo text not null check(tipo in ('folga','ferias','atestado','bloqueio','feriado','manutencao','evento','outro')),
 inicio timestamptz not null, fim timestamptz not null, dia_inteiro boolean not null default false,
 motivo text not null default '' check(length(motivo)<=500), cancelamento_motivo text check(length(cancelamento_motivo)<=500), cancelado_em timestamptz,
 criado_por uuid not null references auth.users(id), criado_em timestamptz not null default now(),
 check(fim>inicio and fim<=inicio+interval '2 years'),
 foreign key(oficina_id,funcionario_id) references public.funcionarios(oficina_id,id)
);
create index bloqueios_funcionario_periodo on public.bloqueios_funcionario(oficina_id,inicio,fim) where cancelado_em is null;
alter table public.configuracoes_funcionario enable row level security;
alter table public.servicos_funcionario enable row level security;
alter table public.bloqueios_funcionario enable row level security;
revoke all on public.configuracoes_funcionario,public.servicos_funcionario,public.bloqueios_funcionario from public,anon,authenticated;

create function private.preparar_agenda_funcionario(w uuid,fid uuid) returns void language plpgsql security definer set search_path='' as $$
declare f public.funcionarios; p public.perfis_distribuicao; c public.configuracoes_funcionario; nome text; rid uuid; auto boolean; n integer:=1;
begin
 select * into f from public.funcionarios where oficina_id=w and id=fid;
 if not found then raise exception 'Funcionário indisponível.' using errcode='42501';end if;
 if coalesce(f.dados->>'atende_clientes','true') not in ('true','false') or coalesce(f.dados->>'cor_agenda','#3b82f6') !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Revise a cor e a opção de atendimento.' using errcode='22023';end if;
 select * into c from public.configuracoes_funcionario where funcionario_id=fid;
 select * into p from public.perfis_distribuicao where oficina_id=w and funcionario_id=fid;
 select ramo='automotivo' into auto from public.oficinas where id=w;
 nome:=coalesce(c.nome_agenda,p.nome,left(f.nome,90));
 if length(trim(nome))<2 then nome:=nome||' ·';end if;
 if c.funcionario_id is null then
  while exists(select 1 from public.configuracoes_funcionario where oficina_id=w and lower(trim(nome_agenda))=lower(trim(nome))) loop n:=n+1;nome:=left(f.nome,85)||' ('||n||')';end loop;
 end if;
 rid:=case when auto then null else coalesce(c.recurso_id,p.recurso_id,fid) end;
 if rid is not null then
  insert into public.recursos_agenda(id,oficina_id,nome,ativo) values(rid,w,nome,f.ativo and coalesce(f.dados->>'atende_clientes','true')='true')
  on conflict(id) do update set ativo=excluded.ativo,revisao=recursos_agenda.revisao+1 where recursos_agenda.oficina_id=w;
 end if;
 insert into public.configuracoes_funcionario(oficina_id,funcionario_id,recurso_id,nome_agenda,jornada)
 values(w,fid,rid,nome,p.jornada) on conflict(funcionario_id) do nothing;
 update public.perfis_distribuicao set ativo=f.ativo and coalesce(f.dados->>'atende_clientes','true')='true' where oficina_id=w and funcionario_id=fid;
end $$;
create function private.sincronizar_agenda_funcionario() returns trigger language plpgsql security definer set search_path='' as $$
begin perform private.preparar_agenda_funcionario(new.oficina_id,new.id);return new;end $$;
create trigger sincronizar_agenda_funcionario after insert or update of ativo,dados,nome on public.funcionarios for each row execute function private.sincronizar_agenda_funcionario();
do $$declare f record;begin for f in select oficina_id,id from public.funcionarios loop perform private.preparar_agenda_funcionario(f.oficina_id,f.id);end loop;end $$;


-- Mantém a jornada existente da distribuição e a ficha em sincronia.
create function private.sincronizar_jornada_equipe() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.funcionario_id is not null then
  update public.configuracoes_funcionario set jornada=new.jornada,revisao=revisao+1 where oficina_id=new.oficina_id and funcionario_id=new.funcionario_id and jornada is distinct from new.jornada;
 end if;return new;
end $$;
create trigger sincronizar_jornada_equipe after insert or update of jornada,funcionario_id on public.perfis_distribuicao for each row execute function private.sincronizar_jornada_equipe();
revoke all on function private.sincronizar_jornada_equipe() from public,anon,authenticated;

create function public.consultar_gestao_funcionario(p_oficina uuid,p_funcionario uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.exigir_cadastro_funcionarios(p_oficina);
 if not exists(select 1 from public.funcionarios where oficina_id=p_oficina and id=p_funcionario) then raise exception 'Funcionário indisponível.' using errcode='42501';end if;
 return jsonb_build_object('configuracao',(select to_jsonb(c) from public.configuracoes_funcionario c where oficina_id=p_oficina and funcionario_id=p_funcionario),
 'servicos',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from public.servicos_funcionario s where oficina_id=p_oficina and funcionario_id=p_funcionario),
 'catalogo',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'descricao',c.descricao,'preco_centavos',c.preco_padrao_centavos,'duracao_minutos',fc.duracao_minutos) order by c.descricao),'[]') from public.itens_catalogo c left join public.fichas_servico_catalogo fc on fc.oficina_id=c.oficina_id and fc.item_id=c.id where c.oficina_id=p_oficina and c.tipo='service' and c.arquivado_em is null));
end $$;
create function public.salvar_gestao_funcionario(p_oficina uuid,p_funcionario uuid,p_secao text,p_dados jsonb,p_revisao integer) returns void language plpgsql security definer set search_path='' as $$
declare c public.configuracoes_funcionario; payload jsonb;
begin
 perform private.exigir_cadastro_funcionarios(p_oficina);
 perform pg_advisory_xact_lock(hashtextextended('agenda-funcionarios:'||p_oficina,0));
 select * into c from public.configuracoes_funcionario where oficina_id=p_oficina and funcionario_id=p_funcionario for update;
 if not found then raise exception 'Funcionário indisponível.' using errcode='42501';end if;
 if p_revisao is distinct from c.revisao then raise exception 'Configuração alterada. Atualize a ficha antes de salvar.' using errcode='PT409';end if;
 if jsonb_typeof(p_dados) is distinct from 'array' or octet_length(p_dados::text)>200000 then raise exception 'Configuração inválida.' using errcode='22023';end if;
 if p_secao='jornada' then
  if jsonb_array_length(p_dados)>28 or exists(select 1 from jsonb_array_elements(p_dados)x where coalesce(x->>'dia','')!~'^[0-6]$' or coalesce(x->>'inicio','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(x->>'fim','')!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' or x->>'fim'<=x->>'inicio') then raise exception 'Revise os dias e horários da jornada.' using errcode='22023';end if;
  if exists(select 1 from jsonb_array_elements(p_dados) with ordinality a(x,i),jsonb_array_elements(p_dados) with ordinality b(x,i) where a.i<b.i and a.x->>'dia'=b.x->>'dia' and a.x->>'inicio'<b.x->>'fim' and a.x->>'fim'>b.x->>'inicio') then raise exception 'Há horários sobrepostos na jornada.' using errcode='22023';end if;
  update public.configuracoes_funcionario set jornada=p_dados where funcionario_id=p_funcionario;
  update public.perfis_distribuicao set jornada=p_dados,revisao=revisao+1 where oficina_id=p_oficina and funcionario_id=p_funcionario;
 elsif p_secao='servicos' then
  if jsonb_array_length(p_dados)>1000 then raise exception 'Altere até 1000 serviços por vez.' using errcode='22023';end if;
  for payload in select value from jsonb_array_elements(p_dados) loop
   if not exists(select 1 from public.itens_catalogo where oficina_id=p_oficina and id=(payload->>'item_catalogo_id')::uuid and tipo='service') then raise exception 'Serviço indisponível nesta empresa.' using errcode='42501';end if;
   insert into public.servicos_funcionario(oficina_id,funcionario_id,item_catalogo_id,ativo,duracao_minutos,preco_centavos)
   values(p_oficina,p_funcionario,(payload->>'item_catalogo_id')::uuid,coalesce((payload->>'ativo')::boolean,false),(payload->>'duracao_minutos')::integer,(payload->>'preco_centavos')::bigint)
   on conflict(oficina_id,funcionario_id,item_catalogo_id) do update set ativo=excluded.ativo,duracao_minutos=excluded.duracao_minutos,preco_centavos=excluded.preco_centavos;
  end loop;
 else raise exception 'Seção inválida.' using errcode='22023';end if;
 update public.configuracoes_funcionario set revisao=revisao+1 where funcionario_id=p_funcionario;
end $$;
create function public.listar_bloqueios_funcionario(p_oficina uuid,p_funcionario uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.exigir_cadastro_funcionarios(p_oficina);
 return (select coalesce(jsonb_agg(to_jsonb(b)||jsonb_build_object('funcionario_nome',f.nome) order by b.inicio),'[]') from public.bloqueios_funcionario b left join public.funcionarios f on f.oficina_id=b.oficina_id and f.id=b.funcionario_id where b.oficina_id=p_oficina and (p_funcionario is null or b.funcionario_id=p_funcionario) and b.fim>=now()-interval '30 days');
end $$;
create function public.registrar_bloqueio_funcionario(p_oficina uuid,p_id uuid,p_dados jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid; fid uuid:=nullif(p_dados->>'funcionario_id','')::uuid; anterior public.bloqueios_funcionario;
begin
 uid:=private.exigir_cadastro_funcionarios(p_oficina);
 perform pg_advisory_xact_lock(hashtextextended('agenda-funcionarios:'||p_oficina,0));
 select * into anterior from public.bloqueios_funcionario where id=p_id;
 if found then
  if anterior.oficina_id<>p_oficina or anterior.funcionario_id is distinct from fid or anterior.inicio is distinct from (p_dados->>'inicio')::timestamptz or anterior.fim is distinct from (p_dados->>'fim')::timestamptz or anterior.tipo is distinct from p_dados->>'tipo' or anterior.motivo is distinct from trim(coalesce(p_dados->>'motivo','')) or anterior.dia_inteiro is distinct from coalesce((p_dados->>'dia_inteiro')::boolean,false) then raise exception 'Identificador já utilizado.' using errcode='PT409';end if;
  return p_id;
 end if;
 if fid is not null and not exists(select 1 from public.funcionarios where oficina_id=p_oficina and id=fid) then raise exception 'Funcionário indisponível.' using errcode='42501';end if;
 if exists(select 1 from public.agenda_atendimentos a where a.oficina_id=p_oficina and a.situacao in ('agendado','convertido') and (fid is null or lower(trim(a.recurso))=(select lower(trim(nome_agenda)) from public.configuracoes_funcionario where funcionario_id=fid)) and private.inicio_visita(a.inicio,a.visita,a.deslocamento_minutos,private.normalizar_logistica(a.logistica))<(p_dados->>'fim')::timestamptz and private.fim_visita(a.fim,a.inicio,a.visita,private.normalizar_logistica(a.logistica))>(p_dados->>'inicio')::timestamptz)
 or exists(select 1 from public.agenda_servicos a where a.oficina_id=p_oficina and a.situacao in ('agendado','confirmado') and (fid is null or a.recurso_id=(select recurso_id from public.configuracoes_funcionario where funcionario_id=fid)) and private.inicio_visita(a.inicio,a.visita,a.deslocamento_minutos,private.normalizar_logistica(a.logistica))<(p_dados->>'fim')::timestamptz and private.fim_visita(a.fim,a.inicio,a.visita,private.normalizar_logistica(a.logistica))>(p_dados->>'inicio')::timestamptz) then raise exception 'Já existem agendamentos neste período. Remarque ou cancele antes de bloquear.' using errcode='23P01';end if;
 insert into public.bloqueios_funcionario(id,oficina_id,funcionario_id,tipo,inicio,fim,dia_inteiro,motivo,criado_por)
 values(p_id,p_oficina,fid,p_dados->>'tipo',(p_dados->>'inicio')::timestamptz,(p_dados->>'fim')::timestamptz,coalesce((p_dados->>'dia_inteiro')::boolean,false),trim(coalesce(p_dados->>'motivo','')),uid);
 return p_id;
end $$;
create function public.cancelar_bloqueio_funcionario(p_oficina uuid,p_id uuid,p_motivo text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.exigir_cadastro_funcionarios(p_oficina);
 perform pg_advisory_xact_lock(hashtextextended('agenda-funcionarios:'||p_oficina,0));
 if nullif(trim(p_motivo),'') is null or length(p_motivo)>500 then raise exception 'Informe o motivo do cancelamento.' using errcode='22023';end if;
 update public.bloqueios_funcionario set cancelado_em=coalesce(cancelado_em,now()),cancelamento_motivo=coalesce(cancelamento_motivo,nullif(trim(p_motivo),'')) where oficina_id=p_oficina and id=p_id;
 if not found then raise exception 'Bloqueio indisponível.' using errcode='42501';end if;
end $$;

-- A agenda lê somente dados operacionais, nunca salário, CPF ou contato pessoal.
create function public.listar_profissionais_agenda(p_oficina uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.exigir_distribuicao(p_oficina);
 return (select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'nome',f.nome,'ativo',f.ativo,'atende_clientes',coalesce(f.dados->>'atende_clientes','true')='true','cor_agenda',coalesce(f.dados->>'cor_agenda','#3b82f6'),'recurso_id',g.recurso_id,'nome_agenda',g.nome_agenda,'servicos',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'descricao',c.descricao,'preco_centavos',coalesce(s.preco_centavos,c.preco_padrao_centavos),'duracao_minutos',coalesce(s.duracao_minutos,fc.duracao_minutos)) order by c.descricao),'[]') from public.servicos_funcionario s join public.itens_catalogo c on c.oficina_id=s.oficina_id and c.id=s.item_catalogo_id left join public.fichas_servico_catalogo fc on fc.oficina_id=c.oficina_id and fc.item_id=c.id where s.oficina_id=f.oficina_id and s.funcionario_id=f.id and s.ativo and c.arquivado_em is null)) order by f.nome),'[]') from public.funcionarios f join public.configuracoes_funcionario g on g.funcionario_id=f.id where f.oficina_id=p_oficina);
end $$;

alter table public.agenda_atendimentos add column profissional jsonb not null default '{}';
alter table public.agenda_servicos add column profissional jsonb not null default '{}';
do $$declare assinatura text; s text; anterior text;begin
 foreach assinatura in array array['public.salvar_agenda_servico(uuid,uuid,jsonb,integer)','public.operar_produtividade(uuid,text,jsonb)'] loop
  s:=pg_get_functiondef(assinatura::regprocedure);anterior:=s;
  s:=replace(s,'distribuicao,recursos_reservados)','distribuicao,profissional,recursos_reservados)');
  s:=replace(s,'coalesce(p_dados->''distribuicao'',a.distribuicao,''{}''),case','coalesce(p_dados->''distribuicao'',a.distribuicao,''{}''),coalesce(p_dados->''profissional'',a.profissional,''{}''),case');
  s:=replace(s,'distribuicao=excluded.distribuicao,','distribuicao=excluded.distribuicao,profissional=excluded.profissional,');
  if s=anterior or position('profissional=excluded.profissional' in s)=0 then raise exception 'Contrato da agenda mudou: %',assinatura;end if;execute s;
 end loop;
end $$;
create function private.validar_agenda_funcionario() returns trigger language plpgsql security definer set search_path='' as $$
declare c public.configuracoes_funcionario; f public.funcionarios; fid uuid; ini timestamptz; fimv timestamptz; j jsonb; s public.servicos_funcionario; item public.itens_catalogo; auto boolean:=tg_table_name='agenda_atendimentos';
begin
 if new.situacao not in ('agendado','confirmado','convertido') then return new;end if;
 if tg_op='UPDATE' and (to_jsonb(new)-array['revisao','situacao'])=(to_jsonb(old)-array['revisao','situacao']) and old.situacao in ('agendado','confirmado','convertido') then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended('agenda-funcionarios:'||new.oficina_id,0));
 if jsonb_typeof(new.profissional) is distinct from 'object' or octet_length(new.profissional::text)>3000 then raise exception 'Profissional inválido.' using errcode='22023';end if;
 fid:=nullif(new.profissional->>'funcionario_id','')::uuid;
 if fid is not null then
  select * into c from public.configuracoes_funcionario where oficina_id=new.oficina_id and funcionario_id=fid;
  if not found then raise exception 'Funcionário indisponível nesta empresa.' using errcode='42501';end if;
  if (auto and lower(trim(c.nome_agenda)) is distinct from lower(trim(to_jsonb(new)->>'recurso'))) or (not auto and c.recurso_id::text is distinct from to_jsonb(new)->>'recurso_id') then raise exception 'A equipe mudou. Selecione o funcionário novamente.' using errcode='22023';end if;
 else
  select * into c from public.configuracoes_funcionario where oficina_id=new.oficina_id and case when auto then lower(trim(nome_agenda))=lower(trim(to_jsonb(new)->>'recurso')) else recurso_id::text=to_jsonb(new)->>'recurso_id' end;
  fid:=c.funcionario_id;
 end if;
 ini:=private.inicio_visita(new.inicio,new.visita,new.deslocamento_minutos,private.normalizar_logistica(new.logistica));
 fimv:=private.fim_visita(new.fim,new.inicio,new.visita,private.normalizar_logistica(new.logistica));
 if exists(select 1 from public.bloqueios_funcionario b where b.oficina_id=new.oficina_id and b.cancelado_em is null and (b.funcionario_id is null or b.funcionario_id=fid) and b.inicio<fimv and b.fim>ini) then raise exception 'Horário bloqueado: confira as ausências e os bloqueios da equipe.' using errcode='23P01';end if;
 if fid is null then return new;end if;
 select * into f from public.funcionarios where oficina_id=new.oficina_id and id=fid;
 if not f.ativo or coalesce(f.dados->>'atende_clientes','true')='false' then raise exception 'Funcionário inativo ou sem atendimento habilitado.' using errcode='22023';end if;
 if (f.admissao is not null and f.admissao>(ini at time zone 'America/Sao_Paulo')::date) or (f.desligamento is not null and f.desligamento<=(ini at time zone 'America/Sao_Paulo')::date) then raise exception 'Funcionário fora do período de contratação.' using errcode='22023';end if;
 if exists(select 1 from public.perfis_distribuicao p cross join lateral jsonb_array_elements(p.bloqueios)b where p.oficina_id=new.oficina_id and p.funcionario_id=fid and (b->>'inicio')::timestamptz<fimv and (b->>'fim')::timestamptz>ini) then raise exception 'Funcionário indisponível no período.' using errcode='23P01';end if;
 j:=c.jornada;
 if j is not null and not exists(select 1 from jsonb_array_elements(j)x where (x->>'dia')::int=extract(dow from ini at time zone 'America/Sao_Paulo') and (ini at time zone 'America/Sao_Paulo')::date=(fimv at time zone 'America/Sao_Paulo')::date and (ini at time zone 'America/Sao_Paulo')::time>=(x->>'inicio')::time and (fimv at time zone 'America/Sao_Paulo')::time<=(x->>'fim')::time) then raise exception 'Horário fora da jornada do funcionário, incluindo intervalo e deslocamento.' using errcode='23P01';end if;
 if exists(select 1 from public.registros_funcionario r where r.oficina_id=new.oficina_id and r.funcionario_id=fid and r.tipo in ('ausencia','ferias','afastamento','treinamento') and r.situacao<>'cancelado' and r.inicio<=((fimv-interval '1 microsecond') at time zone 'America/Sao_Paulo')::date and coalesce(r.fim,r.inicio)>=(ini at time zone 'America/Sao_Paulo')::date) then raise exception 'Funcionário ausente no período.' using errcode='23P01';end if;
 new.profissional:=new.profissional||jsonb_build_object('funcionario_id',fid,'nome',f.nome,'cor_agenda',coalesce(f.dados->>'cor_agenda','#3b82f6'));
 if nullif(new.profissional->>'item_catalogo_id','') is not null then
  select * into s from public.servicos_funcionario where oficina_id=new.oficina_id and funcionario_id=fid and item_catalogo_id=(new.profissional->>'item_catalogo_id')::uuid and ativo;
  if not found then raise exception 'Este serviço não está habilitado para o funcionário.' using errcode='22023';end if;
  select * into item from public.itens_catalogo where oficina_id=new.oficina_id and id=s.item_catalogo_id and arquivado_em is null;
  if not found then raise exception 'Serviço indisponível.' using errcode='22023';end if;
  new.profissional:=new.profissional||jsonb_build_object('servico',item.descricao,'preco_centavos',coalesce(s.preco_centavos,item.preco_padrao_centavos),'duracao_minutos',coalesce(s.duracao_minutos,(select duracao_minutos from public.fichas_servico_catalogo where oficina_id=new.oficina_id and item_id=item.id)));
 end if;
 return new;
end $$;
create trigger validar_funcionario before insert or update on public.agenda_atendimentos for each row execute function private.validar_agenda_funcionario();
create trigger validar_funcionario before insert or update on public.agenda_servicos for each row execute function private.validar_agenda_funcionario();
revoke all on function private.preparar_agenda_funcionario(uuid,uuid),private.sincronizar_agenda_funcionario(),private.validar_agenda_funcionario() from public,anon,authenticated;
revoke all on function public.consultar_gestao_funcionario(uuid,uuid),public.salvar_gestao_funcionario(uuid,uuid,text,jsonb,integer),public.listar_bloqueios_funcionario(uuid,uuid),public.registrar_bloqueio_funcionario(uuid,uuid,jsonb),public.cancelar_bloqueio_funcionario(uuid,uuid,text),public.listar_profissionais_agenda(uuid) from public,anon;
grant execute on function public.consultar_gestao_funcionario(uuid,uuid),public.salvar_gestao_funcionario(uuid,uuid,text,jsonb,integer),public.listar_bloqueios_funcionario(uuid,uuid),public.registrar_bloqueio_funcionario(uuid,uuid,jsonb),public.cancelar_bloqueio_funcionario(uuid,uuid,text),public.listar_profissionais_agenda(uuid) to authenticated;
commit;
