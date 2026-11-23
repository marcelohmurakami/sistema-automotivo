begin;
create table public.calendarios_operacao (
 oficina_id uuid primary key references public.oficinas(id),
 feriados jsonb not null default '[]', revisao integer not null default 1
);
create table public.series_calendario (
 id uuid primary key, oficina_id uuid not null references public.oficinas(id),
 pedido jsonb not null, ocorrencias jsonb not null, criado_em timestamptz not null default now(), criado_por uuid not null
);
alter table public.calendarios_operacao enable row level security;
alter table public.series_calendario enable row level security;
revoke all on public.calendarios_operacao,public.series_calendario from public,anon,authenticated;
alter table public.agenda_atendimentos add column serie_calendario_id uuid references public.series_calendario(id);
alter table public.agenda_servicos add column serie_calendario_id uuid references public.series_calendario(id);
create index agenda_auto_serie on public.agenda_atendimentos(oficina_id,serie_calendario_id,inicio) where serie_calendario_id is not null;
create index agenda_servicos_serie on public.agenda_servicos(oficina_id,serie_calendario_id,inicio) where serie_calendario_id is not null;
create index series_calendario_empresa on public.series_calendario(oficina_id,criado_em desc);

create function private.gerencia_planejamento(w uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.exigir_distribuicao(w);
 if not exists(select 1 from public.membros_oficina where oficina_id=w and usuario_id=auth.uid() and ativo and perfil in ('owner','manager')) then raise exception 'Somente a gerência pode alterar o planejamento.' using errcode='42501';end if;
end $$;
create function public.consultar_calendario_operacao(p_oficina uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.exigir_distribuicao(p_oficina);
 return coalesce((select to_jsonb(c) from public.calendarios_operacao c where oficina_id=p_oficina),'{"feriados":[],"revisao":0}'::jsonb);
end $$;
create function public.salvar_calendario_operacao(p_oficina uuid,p_feriados jsonb,p_revisao integer) returns void language plpgsql security definer set search_path='' as $$
declare x jsonb; rev integer;
begin
 perform private.gerencia_planejamento(p_oficina);
 perform private.travar_reserva_recursos(p_oficina);
 select revisao into rev from public.calendarios_operacao where oficina_id=p_oficina for update;
 if coalesce(rev,0) is distinct from p_revisao then raise exception 'Calendário alterado. Atualize antes de salvar.' using errcode='PT409';end if;
 if jsonb_typeof(p_feriados) is distinct from 'array' or jsonb_array_length(p_feriados)>300 or octet_length(p_feriados::text)>60000 then raise exception 'Informe até 300 feriados ou datas de fechamento.' using errcode='22023';end if;
 for x in select * from jsonb_array_elements(p_feriados) loop
  if coalesce(x->>'data','')!~'^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' or length(trim(coalesce(x->>'nome',''))) not between 2 and 100 then raise exception 'Confira a data e o nome do feriado.' using errcode='22023';end if;
  perform (x->>'data')::date;perform coalesce((x->>'anual')::boolean,false);
 end loop;
 insert into public.calendarios_operacao(oficina_id,feriados) values(p_oficina,p_feriados) on conflict(oficina_id) do update set feriados=excluded.feriados,revisao=calendarios_operacao.revisao+1;
end $$;

create function private.dia_util_agenda(d date,r jsonb,feriados jsonb) returns boolean language sql immutable set search_path='' as $$
 select not coalesce((r->'dias_fechados') @> to_jsonb(array[extract(dow from d)::int]),false)
 and not exists(select 1 from jsonb_array_elements(feriados) f where (f->>'data')::date=d or (coalesce((f->>'anual')::boolean,false) and right(f->>'data',5)=to_char(d,'MM-DD')))
$$;
create function private.datas_recorrencia(w uuid,d jsonb,n integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb:=coalesce(d->'regra_calendario','{}'); h jsonb; ini timestamptz:=(d->>'inicio')::timestamptz; fim timestamptz:=(d->>'fim')::timestamptz;
 base date; limite date; dia date; destino date; freq text:=coalesce(r->>'frequencia','semanal'); passo int:=coalesce((r->>'intervalo')::int,1);
 mes int; ordinal int; total int:=0; tentativas int; ex jsonb; resultado jsonb:='[]'; motivo text; ok boolean; v_ini timestamptz; v_fim timestamptz;
begin
 if jsonb_typeof(r)<>'object' or octet_length(r::text)>16000 or n is null or n not between 1 and 52 or passo not between 1 and 24 or freq not in ('diaria','semanal','mensal','anual') then raise exception 'Confira a regra de repetição (até 52 ocorrências).' using errcode='22023';end if;
 if ini is null or fim is null or not isfinite(ini) or not isfinite(fim) or fim<=ini or fim>ini+interval '31 days' then raise exception 'Informe início e término válidos para repetir.' using errcode='22023';end if;
 if coalesce(r->>'feriado','pular') not in ('pular','proximo','anterior','manter') or coalesce(r->>'mensal','dia') not in ('dia','semana') then raise exception 'Regra de calendário inválida.' using errcode='22023';end if;
 if jsonb_typeof(coalesce(r->'dias_fechados','[]'))<>'array' or jsonb_array_length(coalesce(r->'dias_fechados','[]'))>7 or exists(select 1 from jsonb_array_elements_text(coalesce(r->'dias_fechados','[]')) a where a!~'^[0-6]$') or jsonb_typeof(coalesce(r->'dias_semana','[]'))<>'array' or jsonb_array_length(coalesce(r->'dias_semana','[]'))>7 or exists(select 1 from jsonb_array_elements_text(coalesce(r->'dias_semana','[]')) a where a!~'^[0-6]$') or jsonb_typeof(coalesce(r->'excecoes','{}'))<>'object' then raise exception 'Revise os dias da semana e as exceções.' using errcode='22023';end if;
 base:=(ini at time zone 'America/Sao_Paulo')::date;
 if base<'2020-01-01' or base>'2097-12-31' then raise exception 'Data fora do período permitido.' using errcode='22023';end if;
 limite:=least(coalesce(nullif(r->>'ate','')::date,base+730),base+730);
 if limite<base then raise exception 'A data final deve ser posterior ao início.' using errcode='22023';end if;
 select feriados into h from public.calendarios_operacao where oficina_id=w;h:=coalesce(h,'[]');
 for dia in select generate_series(base::timestamp,limite::timestamp,interval '1 day')::date loop
  exit when total>=n;
  mes:=(extract(year from dia)::int-extract(year from base)::int)*12+extract(month from dia)::int-extract(month from base)::int;
  ordinal:=least(5,((extract(day from base)::int-1)/7)+1);
  ok:=case freq
   when 'diaria' then (dia-base)%passo=0
   when 'semanal' then ((date_trunc('week',dia)::date-date_trunc('week',base)::date)/7)%passo=0 and (case when jsonb_array_length(coalesce(r->'dias_semana','[]'))=0 then extract(dow from dia)=extract(dow from base) else (r->'dias_semana') @> to_jsonb(array[extract(dow from dia)::int]) end)
   else mes%(case when freq='anual' then passo*12 else passo end)=0 and
    case when coalesce(r->>'mensal','dia')='semana' then extract(dow from dia)=extract(dow from base) and (((extract(day from dia)::int-1)/7)+1=ordinal or (ordinal=5 and dia+7>(date_trunc('month',dia)+interval '1 month - 1 day')::date))
    else extract(day from dia)=least(extract(day from base),extract(day from date_trunc('month',dia)+interval '1 month - 1 day')) end end;
  if not ok then continue;end if;
  total:=total+1;destino:=dia;motivo:='';ex:=r->'excecoes'->dia::text;
  if ex is not null then
   if ex->>'acao'='pular' then motivo:='Exceção: não realizar';destino:=null;
   elsif ex->>'acao'='mover' and coalesce(ex->>'data','')~'^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' then destino:=(ex->>'data')::date;motivo:='Remarcada por exceção';if destino<base or destino>base+730 then raise exception 'Exceção fora do período de dois anos.' using errcode='22023';end if;
   else raise exception 'Exceção inválida em %.',dia using errcode='22023';end if;
  elsif not private.dia_util_agenda(dia,r,h) and coalesce(r->>'feriado','pular')<>'manter' then
   if coalesce(r->>'feriado','pular')='pular' then destino:=null;motivo:='Feriado ou dia fechado';
   else
    tentativas:=0;while not private.dia_util_agenda(destino,r,h) loop destino:=destino+(case when r->>'feriado'='anterior' then -1 else 1 end);tentativas:=tentativas+1;if tentativas>14 then raise exception 'Não há dia útil próximo de %. Ajuste o calendário.',dia using errcode='22023';end if;end loop;
    motivo:='Ajustada para dia útil';if destino<base or destino>limite then destino:=null;motivo:='Dia útil fora do período';end if;
   end if;
  end if;
  if destino is not null then
   if exists(select 1 from jsonb_array_elements(resultado) x where x->>'data'=destino::text) then raise exception 'Duas visitas cairiam em %. Ajuste as exceções.',destino using errcode='22023';end if;
   v_ini:=(destino+(ini at time zone 'America/Sao_Paulo')::time) at time zone 'America/Sao_Paulo';v_fim:=v_ini+(fim-ini);
  else v_ini:=null;v_fim:=null;end if;
  resultado:=resultado||jsonb_build_array(jsonb_build_object('original',dia,'data',destino,'inicio',v_ini,'fim',v_fim,'motivo',motivo));
 end loop;
 if total=0 then raise exception 'Nenhuma ocorrência nesse período.' using errcode='22023';end if;
 return resultado;
end $$;
create function public.prever_visitas_calendario(p_oficina uuid,p_dados jsonb,p_quantidade integer) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform private.exigir_distribuicao(p_oficina);return private.datas_recorrencia(p_oficina,p_dados,p_quantidade);end $$;

create function public.programar_agenda_calendario(p_oficina uuid,p_chave uuid,p_dados jsonb,p_quantidade integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.series_calendario; lista jsonb; x jsonb; idv uuid; pedido jsonb:=jsonb_build_object('dados',p_dados,'quantidade',p_quantidade); resultado jsonb:='[]'; auto boolean;
begin
 perform private.gerencia_planejamento(p_oficina);perform private.travar_reserva_recursos(p_oficina);
 if p_chave is null or octet_length(pedido::text)>40000 then raise exception 'Programação inválida.' using errcode='22023';end if;
 select * into s from public.series_calendario where id=p_chave;
 if found then if s.oficina_id<>p_oficina then raise exception 'Programação indisponível.' using errcode='42501';end if;if s.pedido<>pedido then raise exception 'Programação já salva com outros dados. Reabra a agenda.' using errcode='PT409';end if;return s.ocorrencias;end if;
 lista:=private.datas_recorrencia(p_oficina,p_dados,p_quantidade);
 if not exists(select 1 from jsonb_array_elements(lista) o where o->>'inicio' is not null) then raise exception 'Todas as ocorrências foram excluídas. Revise o calendário.' using errcode='22023';end if;
 select ramo='automotivo' into auto from public.oficinas where id=p_oficina;
 insert into public.series_calendario(id,oficina_id,pedido,ocorrencias,criado_por) values(p_chave,p_oficina,pedido,lista,auth.uid());
 for x in select * from jsonb_array_elements(lista) loop
  if x->>'inicio' is null then resultado:=resultado||jsonb_build_array(x);continue;end if;
  idv:=md5('calendario:'||p_oficina||':'||p_chave||':'||(x->>'original'))::uuid;
  if auto then
   perform public.operar_produtividade(p_oficina,'salvar_agenda',p_dados||jsonb_build_object('id',idv,'inicio',x->>'inicio','fim',x->>'fim','revisao',null));
   update public.agenda_atendimentos set serie_calendario_id=p_chave where id=idv;
  else
   perform public.salvar_agenda_servico(p_oficina,idv,p_dados||jsonb_build_object('inicio',x->>'inicio','fim',x->>'fim'),null);
   update public.agenda_servicos set serie_calendario_id=p_chave where id=idv;
  end if;
  resultado:=resultado||jsonb_build_array(x||jsonb_build_object('id',idv));
 end loop;
 update public.series_calendario set ocorrencias=resultado where id=p_chave;return resultado;
end $$;
create function public.cancelar_serie_calendario(p_oficina uuid,p_serie uuid,p_desde date) returns integer language plpgsql security definer set search_path='' as $$
declare x record; n integer:=0;
begin
 perform private.gerencia_planejamento(p_oficina);perform private.travar_reserva_recursos(p_oficina);
 if p_desde is null or not exists(select 1 from public.series_calendario where id=p_serie and oficina_id=p_oficina) then raise exception 'Programação indisponível.' using errcode='42501';end if;
 for x in select * from public.agenda_atendimentos where oficina_id=p_oficina and serie_calendario_id=p_serie and (inicio at time zone 'America/Sao_Paulo')::date>=p_desde and situacao='agendado' order by inicio loop perform public.operar_produtividade(p_oficina,'cancelar_agenda',jsonb_build_object('id',x.id,'revisao',x.revisao));n:=n+1;end loop;
 for x in select * from public.agenda_servicos where oficina_id=p_oficina and serie_calendario_id=p_serie and (inicio at time zone 'America/Sao_Paulo')::date>=p_desde and situacao in ('agendado','confirmado') order by inicio loop perform public.salvar_agenda_servico(p_oficina,x.id,to_jsonb(x)||'{"situacao":"cancelado"}',x.revisao);n:=n+1;end loop;
 return n;
end $$;
-- Preserva o fluxo de visitas independentes da limpeza, acrescentando calendário real.
do $$ declare s text;begin
 s:=pg_get_functiondef('public.programar_visitas_limpeza(uuid,uuid,jsonb,integer,integer,integer)'::regprocedure);
 if position('ini := (p_dados' in s)=0 then raise exception 'Contrato de programação de limpeza alterado';end if;
 s:=replace(s,'i integer; idv uuid;','datas jsonb; ocorrencia jsonb; i integer; idv uuid;');
 s:=replace(s,'for i in 0..p_quantidade-1 loop','if p_dados ? ''regra_calendario'' then datas:=private.datas_recorrencia(p_oficina,p_dados,p_quantidade);end if; for i in 0..coalesce(jsonb_array_length(datas),p_quantidade)-1 loop');
 s:=replace(s,'dia := (ini at time zone', 'if datas is not null then ocorrencia:=datas->i; if ocorrencia->>''inicio'' is null then continue;end if;ini:=(ocorrencia->>''inicio'')::timestamptz;fimv:=(ocorrencia->>''fim'')::timestamptz;end if; dia := (ini at time zone');
 s:=replace(s,'insert into public.series_visitas_limpeza','if jsonb_array_length(lista)=0 then raise exception ''Todas as visitas foram excluídas pelo calendário.'' using errcode=''22023'';end if; insert into public.series_visitas_limpeza');
 s:=replace(s,'return lista;', 'if datas is not null then insert into public.series_calendario(id,oficina_id,pedido,ocorrencias,criado_por) values(p_chave,p_oficina,pedido,datas,auth.uid()); update public.agenda_servicos set serie_calendario_id=p_chave where oficina_id=p_oficina and id in (select x::uuid from jsonb_array_elements_text(lista) x); end if; return lista;');
 execute s;
end $$;
create function public.listar_series_calendario(p_oficina uuid,p_pagina integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.gerencia_planejamento(p_oficina);
 return (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select s.id,s.criado_em,coalesce(s.pedido->'dados'->>'servico',(select titulo from public.atendimentos_servicos where oficina_id=p_oficina and id=(s.pedido->'dados'->>'atendimento_id')::uuid),'Visitas recorrentes') titulo,
 (select min(inicio) from(select inicio from public.agenda_atendimentos where oficina_id=p_oficina and serie_calendario_id=s.id and situacao='agendado' union all select inicio from public.agenda_servicos where oficina_id=p_oficina and serie_calendario_id=s.id and situacao in ('agendado','confirmado'))g) proxima
 from public.series_calendario s where s.oficina_id=p_oficina order by s.criado_em desc,s.id limit 20 offset greatest(0,least(p_pagina,100000))*20)x);
end $$;
revoke all on function public.listar_series_calendario(uuid,integer) from public,anon;
grant execute on function public.listar_series_calendario(uuid,integer) to authenticated;
revoke all on function private.gerencia_planejamento(uuid),private.dia_util_agenda(date,jsonb,jsonb),private.datas_recorrencia(uuid,jsonb,integer) from public,anon,authenticated;
do $$declare p regprocedure;begin for p in select oid::regprocedure from pg_proc where pronamespace='public'::regnamespace and proname in ('consultar_calendario_operacao','salvar_calendario_operacao','prever_visitas_calendario','programar_agenda_calendario','cancelar_serie_calendario') loop execute format('revoke all on function %s from public,anon',p);execute format('grant execute on function %s to authenticated',p);end loop;end $$;
notify pgrst,'reload schema';
commit;
