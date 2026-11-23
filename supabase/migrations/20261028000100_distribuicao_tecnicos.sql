begin;

-- Perfis operacionais não contêm salários, credenciais nem localização em tempo real.
create table public.perfis_distribuicao (
 id uuid primary key, oficina_id uuid not null references public.oficinas(id),
 recurso_id uuid, nome text not null check(length(trim(nome)) between 2 and 100),
 funcionario_id uuid, ativo boolean not null default true,
 habilidades text[] not null default '{}', ferramentas text[] not null default '{}', regioes text[] not null default '{}',
 base_endereco text not null default '' check(length(base_endereco)<=300), base_ponto jsonb,
 jornada jsonb not null, bloqueios jsonb not null default '[]', revisao integer not null default 1,
 unique(oficina_id,id), foreign key(oficina_id,recurso_id) references public.recursos_agenda(oficina_id,id),
 foreign key(oficina_id,funcionario_id) references public.funcionarios(oficina_id,id)
);
create unique index perfil_distribuicao_recurso on public.perfis_distribuicao(oficina_id,recurso_id) where recurso_id is not null;
create unique index perfil_distribuicao_nome on public.perfis_distribuicao(oficina_id,lower(trim(nome)));
create unique index perfil_distribuicao_funcionario on public.perfis_distribuicao(oficina_id,funcionario_id) where funcionario_id is not null;
alter table public.perfis_distribuicao enable row level security;
revoke all on public.perfis_distribuicao from public,anon,authenticated;
alter table public.agenda_servicos add column distribuicao jsonb not null default '{}';
alter table public.agenda_atendimentos add column distribuicao jsonb not null default '{}';

create function private.exigir_distribuicao(w uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if (select ramo from public.oficinas where id=w)='automotivo' then perform private.exigir_os(w);else perform private.exigir_servicos(w);end if;
end $$;
create function private.textos_distribuicao(p jsonb) returns text[] language plpgsql immutable set search_path='' as $$
declare r text[];begin
 if jsonb_typeof(coalesce(p,'[]'))<>'array' or jsonb_array_length(coalesce(p,'[]'))>50 then raise exception 'Informe até 50 habilidades, ferramentas ou regiões.' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(coalesce(p,'[]')) x where jsonb_typeof(x)<>'string' or length(trim(x#>>'{}')) not between 1 and 100) then raise exception 'Revise os nomes de habilidades, ferramentas e regiões.' using errcode='22023';end if;
 select coalesce(array_agg(distinct translate(lower(trim(x)),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')),'{}') into r from jsonb_array_elements_text(coalesce(p,'[]')) x;
 return r;
end $$;
create function private.ponto_distribuicao(p jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
begin
 if p is null or p='null' then return null;end if;
 if jsonb_typeof(p)<>'array' or jsonb_array_length(p)<>2 or jsonb_typeof(p->0)<>'number' or jsonb_typeof(p->1)<>'number' then raise exception 'Localização inválida. Localize o endereço novamente.' using errcode='22023';end if;
 if abs((p->>0)::numeric)>180 or abs((p->>1)::numeric)>90 then raise exception 'Localização fora do mapa.' using errcode='22023';end if;
 return p;
end $$;

create function public.consultar_distribuicao_agenda(p_oficina uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.exigir_distribuicao(p_oficina);
 return jsonb_build_object(
 'perfis',(select coalesce(jsonb_agg(to_jsonb(p) order by p.nome),'[]') from public.perfis_distribuicao p where p.oficina_id=p_oficina),
 'recursos',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'nome',r.nome,'ativo',r.ativo) order by r.nome),'[]') from public.recursos_agenda r where r.oficina_id=p_oficina),
 'funcionarios',(select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'nome',f.nome) order by f.nome),'[]') from public.funcionarios f where f.oficina_id=p_oficina and f.ativo));
end $$;

create function public.salvar_perfil_distribuicao(p_oficina uuid,p_id uuid,p_dados jsonb,p_revisao integer default null) returns uuid language plpgsql security definer set search_path='' as $$
declare antigo public.perfis_distribuicao%rowtype; j jsonb; b jsonb; auto boolean; rid uuid:=nullif(p_dados->>'recurso_id','')::uuid; fid uuid:=nullif(p_dados->>'funcionario_id','')::uuid;
begin
 perform private.exigir_distribuicao(p_oficina);
 if not exists(select 1 from public.membros_oficina where oficina_id=p_oficina and usuario_id=auth.uid() and ativo and perfil in ('owner','manager')) then raise exception 'Somente a gerência pode configurar a distribuição.' using errcode='42501';end if;
 if p_id is null or jsonb_typeof(p_dados)<>'object' or octet_length(p_dados::text)>24000 then raise exception 'Perfil inválido.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('distribuicao:'||p_oficina,0));
 select * into antigo from public.perfis_distribuicao where id=p_id for update;
 if antigo.id is not null and antigo.oficina_id<>p_oficina then raise exception 'Perfil indisponível.' using errcode='42501';end if;
 if antigo.id is not null and p_revisao is null then return p_id;end if;
 if antigo.id is not null and antigo.revisao is distinct from p_revisao then raise exception 'Perfil alterado. Atualize a tela.' using errcode='PT409';end if;
 if antigo.id is null and (select count(*) from public.perfis_distribuicao where oficina_id=p_oficina)>=200 then raise exception 'Limite de 200 perfis por empresa.' using errcode='22023';end if;
 select ramo='automotivo' into auto from public.oficinas where id=p_oficina;
 if not auto and not exists(select 1 from public.recursos_agenda where oficina_id=p_oficina and id=rid and (ativo or not coalesce((p_dados->>'ativo')::boolean,true))) then raise exception 'Selecione uma equipe ativa da agenda.' using errcode='22023';end if;
 if auto then rid:=null;end if;
 if fid is not null and not exists(select 1 from public.funcionarios where oficina_id=p_oficina and id=fid and ativo) then raise exception 'Funcionário indisponível.' using errcode='22023';end if;
 j:=p_dados->'jornada';b:=coalesce(p_dados->'bloqueios','[]');
 if jsonb_typeof(j)<>'array' or coalesce(jsonb_array_length(j),0) not between 1 and 28 or jsonb_typeof(b)<>'array' or jsonb_array_length(b)>100 then raise exception 'Informe a jornada e até 100 períodos de indisponibilidade.' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(j) x where coalesce(x->>'dia','') !~ '^[0-6]$' or coalesce(x->>'inicio','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or coalesce(x->>'fim','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or x->>'fim'<=x->>'inicio') then raise exception 'Revise os dias e horários da jornada. Para pausas, cadastre dois turnos no dia.' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(b) x where nullif(x->>'inicio','') is null or nullif(x->>'fim','') is null or (x->>'fim')::timestamptz<=(x->>'inicio')::timestamptz or length(coalesce(x->>'motivo',''))>200) then raise exception 'Revise os períodos de indisponibilidade.' using errcode='22023';end if;
 insert into public.perfis_distribuicao(id,oficina_id,recurso_id,nome,funcionario_id,ativo,habilidades,ferramentas,regioes,base_endereco,base_ponto,jornada,bloqueios)
 values(p_id,p_oficina,rid,trim(p_dados->>'nome'),fid,coalesce((p_dados->>'ativo')::boolean,true),private.textos_distribuicao(p_dados->'habilidades'),private.textos_distribuicao(p_dados->'ferramentas'),private.textos_distribuicao(p_dados->'regioes'),trim(coalesce(p_dados->>'base_endereco','')),private.ponto_distribuicao(p_dados->'base_ponto'),j,b)
 on conflict(id) do update set recurso_id=excluded.recurso_id,nome=excluded.nome,funcionario_id=excluded.funcionario_id,ativo=excluded.ativo,habilidades=excluded.habilidades,ferramentas=excluded.ferramentas,regioes=excluded.regioes,base_endereco=excluded.base_endereco,base_ponto=excluded.base_ponto,jornada=excluded.jornada,bloqueios=excluded.bloqueios,revisao=perfis_distribuicao.revisao+1;
 return p_id;
end $$;

-- Coordenadas confirmadas pelo usuário também ficam disponíveis para o próximo planejamento.
alter function private.normalizar_logistica(jsonb) rename to normalizar_logistica_base;
create function private.normalizar_logistica(p jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
begin
 return private.normalizar_logistica_base(p)||jsonb_strip_nulls(jsonb_build_object('origem_ponto',private.ponto_distribuicao(p->'origem_ponto'),'destino_ponto',private.ponto_distribuicao(p->'destino_ponto')));
end $$;

create function private.avaliar_distribuicao(w uuid,d jsonb,perfil uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare auto boolean; i timestamptz:=(d->>'inicio')::timestamptz; f timestamptz:=nullif(d->>'fim','')::timestamptz; ini timestamptz; fimv timestamptz;
 req jsonb:=coalesce(d->'distribuicao','{}'); habilidades text[]; ferramentas text[]; regiao text[]; destino jsonb; materiais jsonb; faltas jsonb:='[]'; todos jsonb:='[]'; registro record; mat record; anterior record;
 motivos text[]; avisos text[]; tem_materiais boolean:=false; carga numeric; distancia numeric; ponto jsonb; endereco text; dispo boolean; rid uuid:=nullif(d->>'id','')::uuid; aid uuid:=nullif(d->>'atendimento_id','')::uuid;
begin
 if jsonb_typeof(d)<>'object' or octet_length(d::text)>32000 then raise exception 'Pedido de distribuição inválido.' using errcode='22023';end if;
 if i is null or f is null or f<=i or f>i+interval '7 days' then raise exception 'Informe início e término para escolher a equipe.' using errcode='22023';end if;
 habilidades:=private.textos_distribuicao(req->'habilidades');ferramentas:=private.textos_distribuicao(req->'ferramentas');regiao:=private.textos_distribuicao(case when nullif(trim(req->>'regiao'),'') is null then '[]'::jsonb else jsonb_build_array(req->>'regiao') end);
 if cardinality(habilidades)=0 then raise exception 'Selecione ao menos uma habilidade necessária ao serviço.' using errcode='22023';end if;
 destino:=private.ponto_distribuicao(d->'logistica'->'destino_ponto');
 if coalesce((d->>'deslocamento_minutos')::integer,0) not between 0 and 720 then raise exception 'Revise o tempo de ida.' using errcode='22023';end if;
 ini:=private.inicio_visita(i,coalesce((d->>'visita')::boolean,false),coalesce((d->>'deslocamento_minutos')::integer,0),private.normalizar_logistica(coalesce(d->'logistica','{}')));
 fimv:=private.fim_visita(f,i,coalesce((d->>'visita')::boolean,false),private.normalizar_logistica(coalesce(d->'logistica','{}')));
 select ramo='automotivo' into auto from public.oficinas where id=w;
 if aid is not null and not exists(select 1 from public.atendimentos_servicos where oficina_id=w and id=aid) then raise exception 'Atendimento indisponível.' using errcode='42501';end if;
 materiais:=coalesce(req->'materiais','[]');
 if jsonb_typeof(materiais)<>'array' or jsonb_array_length(materiais)>50 then raise exception 'Informe até 50 materiais.' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(materiais) x where nullif(x->>'produto_id','') is null or coalesce(x->>'quantidade','') !~ '^[0-9]+(\.[0-9]{1,3})?$' or (x->>'quantidade')::numeric<=0 or (x->>'quantidade')::numeric>1000000) then raise exception 'Revise os materiais e quantidades.' using errcode='22023';end if;
 if jsonb_array_length(materiais)>0 or exists(select 1 from public.itens_atendimento_servico where oficina_id=w and atendimento_id=aid and origem='estoque') then
  if not private.has_feature(w,'inventory') then raise exception 'O plano precisa permitir consulta de estoque para conferir os materiais.' using errcode='42501';end if;
 end if;
 -- Quantidades explícitas substituem por valor maior a necessidade já registrada no atendimento.
 for mat in with necessidades as (
  select (x->>'produto_id')::uuid produto,sum((x->>'quantidade')::numeric) qtd from jsonb_array_elements(materiais) x group by 1
  union all select produto_id,sum(quantidade) from public.itens_atendimento_servico where oficina_id=w and atendimento_id=aid and origem='estoque' group by produto_id
 ), total as (select produto,max(qtd) qtd from necessidades group by produto)
 select t.*,e.saldo,c.descricao from total t left join public.estoque_produtos e on e.oficina_id=w and e.item_catalogo_id=t.produto left join public.itens_catalogo c on c.oficina_id=w and c.id=t.produto loop
  tem_materiais:=true;
  if mat.saldo is null then raise exception 'Material não disponível no estoque desta empresa.' using errcode='22023';end if;
  if mat.saldo<mat.qtd then faltas:=faltas||jsonb_build_array(jsonb_build_object('produto_id',mat.produto,'nome',mat.descricao,'necessario',mat.qtd,'disponivel',mat.saldo));end if;
 end loop;
 for registro in select p.* from public.perfis_distribuicao p where p.oficina_id=w and (perfil is null or p.id=perfil) order by p.nome loop
  motivos:='{}';avisos:='{}';distancia:=null;ponto:=registro.base_ponto;endereco:=registro.base_endereco;carga:=0;
  if not registro.ativo or (not auto and not exists(select 1 from public.recursos_agenda where oficina_id=w and id=registro.recurso_id and ativo)) then motivos:=array_append(motivos,'Equipe inativa');end if;
  if not habilidades<@registro.habilidades then motivos:=array_append(motivos,'Falta habilidade exigida');end if;
  if not ferramentas<@registro.ferramentas then motivos:=array_append(motivos,'Falta ferramenta ou equipamento exigido');end if;
  if coalesce((d->>'visita')::boolean,false) and cardinality(registro.regioes)>0 and not regiao&&registro.regioes then motivos:=array_append(motivos,case when cardinality(regiao)=0 then 'Informe a região da visita' else 'Fora das regiões atendidas' end);end if;
  if not exists(select 1 from jsonb_array_elements(registro.jornada) x where (x->>'dia')::integer=extract(dow from ini at time zone 'America/Sao_Paulo') and (ini at time zone 'America/Sao_Paulo')::date=(fimv at time zone 'America/Sao_Paulo')::date and (ini at time zone 'America/Sao_Paulo')::time>=(x->>'inicio')::time and (fimv at time zone 'America/Sao_Paulo')::time<=(x->>'fim')::time) then motivos:=array_append(motivos,'Fora da jornada, incluindo deslocamento e retorno');end if;
  if exists(select 1 from jsonb_array_elements(registro.bloqueios) x where (x->>'inicio')::timestamptz<fimv and (x->>'fim')::timestamptz>ini) then motivos:=array_append(motivos,'Período de indisponibilidade');end if;
  if registro.funcionario_id is not null then
   if not exists(select 1 from public.funcionarios where oficina_id=w and id=registro.funcionario_id and ativo and (admissao is null or admissao<=(ini at time zone 'America/Sao_Paulo')::date) and (desligamento is null or desligamento>(ini at time zone 'America/Sao_Paulo')::date)) or exists(select 1 from public.registros_funcionario where oficina_id=w and funcionario_id=registro.funcionario_id and tipo in ('ausencia','ferias','afastamento','treinamento') and situacao<>'cancelado' and inicio<=(fimv at time zone 'America/Sao_Paulo')::date and coalesce(fim,inicio)>=(ini at time zone 'America/Sao_Paulo')::date) then motivos:=array_append(motivos,'Funcionário indisponível no período');end if;
  end if;
  if auto then
   select exists(select 1 from public.agenda_atendimentos g where g.oficina_id=w and g.id is distinct from rid and lower(trim(g.recurso))=lower(trim(registro.nome)) and g.situacao in ('agendado','convertido') and private.inicio_visita(g.inicio,g.visita,g.deslocamento_minutos,g.logistica)<fimv and private.fim_visita(g.fim,g.inicio,g.visita,g.logistica)>ini) into dispo;
   select coalesce(sum(extract(epoch from (least(private.fim_visita(g.fim,g.inicio,g.visita,g.logistica),((i at time zone 'America/Sao_Paulo')::date::timestamp at time zone 'America/Sao_Paulo')+interval '1 day')-greatest(private.inicio_visita(g.inicio,g.visita,g.deslocamento_minutos,g.logistica),((i at time zone 'America/Sao_Paulo')::date::timestamp at time zone 'America/Sao_Paulo'))))/60),0) into carga from public.agenda_atendimentos g where g.oficina_id=w and g.id is distinct from rid and lower(trim(g.recurso))=lower(trim(registro.nome)) and g.situacao in ('agendado','convertido') and g.inicio>=i-interval '1 day' and g.inicio<i+interval '1 day' and private.inicio_visita(g.inicio,g.visita,g.deslocamento_minutos,g.logistica)<((i at time zone 'America/Sao_Paulo')::date::timestamp at time zone 'America/Sao_Paulo')+interval '1 day' and private.fim_visita(g.fim,g.inicio,g.visita,g.logistica)>((i at time zone 'America/Sao_Paulo')::date::timestamp at time zone 'America/Sao_Paulo');
   select g.logistica,g.visita into anterior from public.agenda_atendimentos g where g.oficina_id=w and g.id is distinct from rid and lower(trim(g.recurso))=lower(trim(registro.nome)) and g.situacao in ('agendado','convertido') and g.inicio>=i-interval '1 day' and private.fim_visita(g.fim,g.inicio,g.visita,g.logistica)<=ini order by private.fim_visita(g.fim,g.inicio,g.visita,g.logistica) desc limit 1;
  else
   select exists(select 1 from public.agenda_servicos g where g.oficina_id=w and g.id is distinct from rid and g.recurso_id=registro.recurso_id and g.situacao in ('agendado','confirmado') and private.inicio_visita(g.inicio,g.visita,g.deslocamento_minutos,g.logistica)<fimv and private.fim_visita(g.fim,g.inicio,g.visita,g.logistica)>ini) into dispo;
   select coalesce(sum(extract(epoch from (g.fim-g.inicio))/60+g.deslocamento_minutos+coalesce((g.logistica->>'margem_minutos')::integer,0)+coalesce((g.logistica->>'retorno_minutos')::integer,0)),0) into carga from public.agenda_servicos g where g.oficina_id=w and g.id is distinct from rid and g.recurso_id=registro.recurso_id and g.situacao in ('agendado','confirmado') and g.inicio>=((i at time zone 'America/Sao_Paulo')::date::timestamp at time zone 'America/Sao_Paulo') and g.inicio<((i at time zone 'America/Sao_Paulo')::date::timestamp at time zone 'America/Sao_Paulo')+interval '1 day';
   select g.logistica,g.visita into anterior from public.agenda_servicos g where g.oficina_id=w and g.id is distinct from rid and g.recurso_id=registro.recurso_id and g.situacao in ('agendado','confirmado') and g.inicio>=i-interval '1 day' and private.fim_visita(g.fim,g.inicio,g.visita,g.logistica)<=ini order by private.fim_visita(g.fim,g.inicio,g.visita,g.logistica) desc limit 1;
  end if;
  if dispo then motivos:=array_append(motivos,'Horário ocupado, incluindo ida, margem e retorno');end if;
  if tem_materiais then avisos:=array_append(avisos,'Retire os materiais na base antes da visita; a proximidade considera essa saída.');end if;
  if anterior.visita and not tem_materiais then
   ponto:=case when coalesce((anterior.logistica->>'retorno_minutos')::integer,0)>0 then anterior.logistica->'origem_ponto' else anterior.logistica->'destino_ponto' end;
   endereco:=case when coalesce((anterior.logistica->>'retorno_minutos')::integer,0)>0 then anterior.logistica->>'origem' else anterior.logistica->>'destino' end;
  end if;
  if jsonb_array_length(faltas)>0 then motivos:=array_append(motivos,'Estoque insuficiente para os materiais necessários');end if;
  if coalesce((d->>'visita')::boolean,false) then
   if ponto is not null and ponto<>'null' and destino is not null then distancia:=round((6371*2*asin(sqrt(least(1.0,power(sin(radians((destino->>1)::double precision-(ponto->>1)::double precision)/2),2)+cos(radians((ponto->>1)::double precision))*cos(radians((destino->>1)::double precision))*power(sin(radians((destino->>0)::double precision-(ponto->>0)::double precision)/2),2)))))::numeric,2);
   else avisos:=array_append(avisos,'Proximidade não calculada: localize a base e o endereço da visita');end if;
  end if;
  todos:=todos||jsonb_build_array(jsonb_build_object('id',registro.id,'nome',registro.nome,'recurso_id',registro.recurso_id,'apto',cardinality(motivos)=0,'motivos',motivos,'avisos',avisos,'distancia_km',distancia,'carga_minutos',round(carga),'origem',endereco,'origem_ponto',ponto));
 end loop;
 return jsonb_build_object('candidatos',(select coalesce(jsonb_agg(x order by (x->>'apto')::boolean desc,(x->>'distancia_km')::numeric nulls last,(x->>'carga_minutos')::numeric,x->>'nome',x->>'id'),'[]') from jsonb_array_elements(todos) x),'materiais_faltantes',faltas,'verificado_em',now());
end $$;
create function public.sugerir_tecnico_agenda(p_oficina uuid,p_dados jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform private.exigir_distribuicao(p_oficina);return private.avaliar_distribuicao(p_oficina,p_dados);end $$;

create function private.validar_distribuicao_agenda() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.perfis_distribuicao%rowtype; r jsonb; c jsonb;
begin
 if new.distribuicao='{}' then return new;end if;
 if jsonb_typeof(new.distribuicao)<>'object' or octet_length(new.distribuicao::text)>16000 then raise exception 'Distribuição inválida.' using errcode='22023';end if;
 if new.situacao not in ('agendado','confirmado','convertido') then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended('distribuicao:'||new.oficina_id,0));
 select * into p from public.perfis_distribuicao where oficina_id=new.oficina_id and id=(new.distribuicao->>'perfil_id')::uuid;
 if not found then raise exception 'Perfil de distribuição indisponível. Escolha novamente.' using errcode='22023';end if;
 if (tg_table_name='agenda_servicos' and to_jsonb(new)->>'recurso_id' is distinct from p.recurso_id::text) or (tg_table_name='agenda_atendimentos' and lower(trim(to_jsonb(new)->>'recurso'))<>lower(trim(p.nome))) then raise exception 'A equipe mudou. Selecione novamente ou use a escolha manual.' using errcode='22023';end if;
 r:=private.avaliar_distribuicao(new.oficina_id,to_jsonb(new),p.id);c:=r->'candidatos'->0;
 if c is null or not (c->>'apto')::boolean then raise exception 'Não foi possível distribuir: %. Escolha novamente.',coalesce(c->>'motivos','equipe indisponível') using errcode='22023';end if;
 new.distribuicao:=new.distribuicao||jsonb_build_object('verificado_em',now(),'escolha',c);
 return new;
end $$;
create trigger z_validar_distribuicao before insert or update on public.agenda_servicos for each row execute function private.validar_distribuicao_agenda();
create trigger z_validar_distribuicao before insert or update on public.agenda_atendimentos for each row execute function private.validar_distribuicao_agenda();

do $$ declare s text; anterior text; assinatura text; begin
 foreach assinatura in array array['public.salvar_agenda_servico(uuid,uuid,jsonb,integer)','public.operar_produtividade(uuid,text,jsonb)'] loop
  s:=pg_get_functiondef(assinatura::regprocedure);anterior:=s;
  s:=replace(s,'deslocamento_minutos,logistica)','deslocamento_minutos,logistica,distribuicao)');
  s:=replace(s,'coalesce(p_dados->''logistica'',a.logistica,''{}''))','coalesce(p_dados->''logistica'',a.logistica,''{}''),coalesce(p_dados->''distribuicao'',a.distribuicao,''{}''))');
  s:=replace(s,'logistica=excluded.logistica,','logistica=excluded.logistica,distribuicao=excluded.distribuicao,');
  if s=anterior or position('distribuicao=excluded.distribuicao' in s)=0 then raise exception 'Contrato da agenda alterado: %',assinatura;end if;execute s;
 end loop;
end $$;

revoke all on function public.consultar_distribuicao_agenda(uuid),public.salvar_perfil_distribuicao(uuid,uuid,jsonb,integer),public.sugerir_tecnico_agenda(uuid,jsonb) from public,anon;
grant execute on function public.consultar_distribuicao_agenda(uuid),public.salvar_perfil_distribuicao(uuid,uuid,jsonb,integer),public.sugerir_tecnico_agenda(uuid,jsonb) to authenticated;
revoke all on function private.exigir_distribuicao(uuid),private.textos_distribuicao(jsonb),private.ponto_distribuicao(jsonb),private.normalizar_logistica(jsonb),private.normalizar_logistica_base(jsonb),private.avaliar_distribuicao(uuid,jsonb,uuid),private.validar_distribuicao_agenda() from public,anon,authenticated;
create index agenda_auto_distribuicao on public.agenda_atendimentos(oficina_id,lower(trim(recurso)),inicio) where situacao in ('agendado','convertido');
create index agenda_servicos_distribuicao on public.agenda_servicos(oficina_id,recurso_id,inicio) where situacao in ('agendado','confirmado');
-- A disponibilidade precisa desconsiderar rapidamente os agendamentos já encerrados,
-- mesmo quando a empresa mantém muitos anos de histórico.
create index agenda_auto_distribuicao_fim on public.agenda_atendimentos(oficina_id,lower(trim(recurso)),private.fim_visita(fim,inicio,visita,logistica)) where situacao in ('agendado','convertido');
create index agenda_servicos_distribuicao_fim on public.agenda_servicos(oficina_id,recurso_id,private.fim_visita(fim,inicio,visita,logistica)) where situacao in ('agendado','confirmado');
notify pgrst,'reload schema';
commit;
