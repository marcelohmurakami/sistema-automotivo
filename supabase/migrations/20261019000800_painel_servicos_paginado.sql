create index if not exists atendimentos_servicos_pagina on public.atendimentos_servicos(oficina_id,criado_em desc,id desc);
create index if not exists atendimentos_servicos_objeto_pagina on public.atendimentos_servicos(oficina_id,objeto_id,criado_em desc,id desc);
create index if not exists atendimentos_servicos_situacao_pagina on public.atendimentos_servicos(oficina_id,situacao,criado_em desc,id desc);
create index if not exists objetos_servicos_pagina on public.objetos_atendimento(oficina_id,nome,id);
create index if not exists objetos_servicos_cliente on public.objetos_atendimento(oficina_id,cliente_id,nome,id);
create index if not exists agenda_servicos_retorno on public.agenda_servicos(oficina_id,atendimento_id,inicio) where situacao in ('agendado','confirmado','concluido');

-- Mesmas condições de operacaoServicos.ts, verificadas em testes de paridade.
create function private.operacao_servico(a public.atendimentos_servicos, hoje date)
returns table(aberto boolean,espera boolean,atrasados boolean,retirada boolean,retornos boolean,aceite boolean,prazo text)
-- Invoker, referências qualificadas: permite ao planejador incorporar o cálculo
-- na consulta, sem executar uma função isolada para cada atendimento.
language sql stable as $$
 with ficha as (select a.ficha_especialidade->'campos' c,coalesce(a.ficha_especialidade->>'especialidade','') especialidade,
   coalesce(a.ficha_especialidade->>'etapa','') etapa,a.situacao not in ('cancelado','concluido') aberto),
 dados as (select *, case when a.ficha_especialidade is null then a.vencimento::text else coalesce(c->>'prazo_servico','') end prazo,
   especialidade='assistencia_eletrodomesticos' and coalesce(c->>'modalidade','')='Domicílio' domicilio from ficha)
 select aberto,
   aberto and (a.situacao='aguardando' or coalesce(c->>'motivo_espera','') not in ('','Sem pendência')),
   aberto and prazo<>'' and prazo<hoje::text,
   not domicilio and a.situacao<>'cancelado' and etapa<>'Entregue' and (etapa in ('Pronto para retirada','Pronto para entrega','Disponível para retirada') or (a.situacao='concluido' and especialidade like 'assistencia\_%')),
   a.situacao<>'cancelado' and coalesce(c->>'proxima_data','')<>'' and c->>'proxima_data'<=hoje::text
     and not exists(select 1 from public.agenda_servicos g where g.oficina_id=a.oficina_id and g.atendimento_id=a.id and g.situacao in ('agendado','confirmado','concluido') and g.inicio >= (nullif(c->>'proxima_data','')::date::timestamp at time zone 'America/Sao_Paulo')),
   a.situacao='concluido' and ((domicilio and etapa not in ('Aceite registrado','Entregue')) or ((especialidade like 'manutencao\_%' or especialidade like 'limpeza\_%') and coalesce(c->>'situacao_aceite','') not in ('Aceito','Aceito com ressalvas'))),
   prazo from dados;
$$;

create function public.resumo_operacao_servicos(p_oficina uuid,p_subsetor text default '') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r jsonb; hoje date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 perform private.exigir_servicos(p_oficina,'customers');
 r:=jsonb_build_object('objetos',(select count(*) from public.objetos_atendimento where oficina_id=p_oficina and not arquivado),
   'clientes',(select count(*) from public.clientes where oficina_id=p_oficina and arquivado_em is null));
 if not private.has_feature(p_oficina,'work_orders') then return r; end if;
 return r || (select jsonb_build_object('abertos',count(*) filter(where s.aberto),
   'pendencias',count(*) filter(where s.aberto and s.prazo<>'' and s.prazo<=(hoje+5)::text),
   'espera',count(*) filter(where s.espera),'atrasados',count(*) filter(where s.atrasados),
   'retirada',count(*) filter(where s.retirada),'retornos',count(*) filter(where s.retornos),'aceite',count(*) filter(where s.aceite))
   from public.atendimentos_servicos a cross join lateral private.operacao_servico(a,hoje) s
   where a.oficina_id=p_oficina and (p_subsetor='' or a.ficha_especialidade->>'especialidade'=p_subsetor))
   || jsonb_build_object('agendamentosHoje',(select count(*) from public.agenda_servicos where oficina_id=p_oficina
     and inicio>=hoje::timestamp at time zone 'America/Sao_Paulo' and inicio<(hoje+1)::timestamp at time zone 'America/Sao_Paulo' and situacao not in ('cancelado','faltou')));
end $$;

create function public.pagina_servicos(p_oficina uuid,p_filtros jsonb default '{}',p_apos jsonb default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
 tela text:=coalesce(p_filtros->>'tela','atendimentos'); busca text:=private.texto_busca(trim(coalesce(p_filtros->>'busca','')));
 hoje date:=(now() at time zone 'America/Sao_Paulo')::date;
 atendimentos jsonb:='[]'; objetos jsonb:='[]'; agenda jsonb:='[]'; clientes jsonb; cobrancas jsonb:='[]'; proximo jsonb;
 ids uuid[]; objetos_ids uuid[]; clientes_ids uuid[]; v_inicio date; v_fim date;
begin
 perform private.exigir_servicos(p_oficina,'customers');
 if tela not in ('atendimentos','objetos','agenda') or length(busca)>200 then raise exception 'Filtro inválido.' using errcode='22023'; end if;
 if tela='objetos' then
   select coalesce(jsonb_agg(to_jsonb(x) order by x.nome,x.id),'[]') into objetos from (
     select o.*,(select count(*) from public.atendimentos_servicos a where a.oficina_id=p_oficina and a.objeto_id=o.id and private.has_feature(p_oficina,'work_orders')) quantidade_atendimentos
     from public.objetos_atendimento o join public.clientes c on c.oficina_id=o.oficina_id and c.id=o.cliente_id
     where o.oficina_id=p_oficina and (coalesce(p_filtros->>'cliente','')='' or o.cliente_id=(p_filtros->>'cliente')::uuid)
     and (busca='' or position(busca in private.texto_busca(o.nome||' '||c.nome||' '||o.dados::text))>0)
     and (p_apos is null or (o.nome,o.id)>(p_apos->>'nome',(p_apos->>'id')::uuid))
     order by o.nome,o.id limit 31
   ) x;
   if jsonb_array_length(objetos)>30 then proximo:=jsonb_build_object('nome',objetos->29->'nome','id',objetos->29->'id'); objetos:=objetos-30; end if;
 elsif private.has_feature(p_oficina,'work_orders') then
   if tela='agenda' then
     v_inicio:=coalesce((p_filtros->>'inicio')::date,hoje); v_fim:=coalesce((p_filtros->>'fim')::date,v_inicio+7);
     if v_fim<=v_inicio or v_fim>v_inicio+31 then raise exception 'Selecione até 31 dias de agenda.' using errcode='22023'; end if;
     select coalesce(jsonb_agg(to_jsonb(x) order by x.inicio,x.id),'[]') into agenda from (
       select g.* from public.agenda_servicos g where g.oficina_id=p_oficina
       and g.inicio<v_fim::timestamp at time zone 'America/Sao_Paulo' and g.fim>v_inicio::timestamp at time zone 'America/Sao_Paulo'
       order by g.inicio,g.id limit 2001
     ) x;
     if jsonb_array_length(agenda)>2000 then raise exception 'Muitos agendamentos neste período. Selecione a visão por semana ou dia.' using errcode='22023'; end if;
     select array_agg(distinct (x->>'atendimento_id')::uuid) into ids from jsonb_array_elements(agenda) x;
     select coalesce(jsonb_agg(to_jsonb(a)),'[]') into atendimentos from public.atendimentos_servicos a where a.oficina_id=p_oficina and a.id=any(ids);
   else
     select coalesce(jsonb_agg(to_jsonb(x) order by x.criado_em desc,x.id desc),'[]') into atendimentos from (
       select a.*,exists(select 1 from public.agenda_servicos g where g.oficina_id=a.oficina_id and g.atendimento_id=a.id and g.situacao in ('agendado','confirmado','concluido') and g.inicio >= (nullif(a.ficha_especialidade->'campos'->>'proxima_data','')::date::timestamp at time zone 'America/Sao_Paulo')) retorno_agendado from public.atendimentos_servicos a
       join public.clientes c on c.oficina_id=a.oficina_id and c.id=a.cliente_id
       join public.objetos_atendimento o on o.oficina_id=a.oficina_id and o.id=a.objeto_id
       where a.oficina_id=p_oficina
       and (coalesce(p_filtros->>'cliente','')='' or a.cliente_id=(p_filtros->>'cliente')::uuid)
       and (coalesce(p_filtros->>'estado','')='' or a.situacao=p_filtros->>'estado')
       and (coalesce(p_filtros->>'subsetor','')='' or a.ficha_especialidade->>'especialidade'=p_filtros->>'subsetor')
       and (coalesce(p_filtros->>'etapa','')='' or coalesce(a.ficha_especialidade->>'etapa','')=case when p_filtros->>'etapa'='sem_etapa' then '' else p_filtros->>'etapa' end)
       and (coalesce(p_filtros->>'objeto','')='' or a.objeto_id=(p_filtros->>'objeto')::uuid)
       and (busca='' or position(busca in private.texto_busca(a.numero::text||' '||a.titulo||' '||c.nome||' '||o.nome||' '||o.dados::text||' '||coalesce(a.ficha_especialidade->'campos','{}')::text))>0)
       and (coalesce(p_filtros->>'foco','')='' or exists(select 1 from private.operacao_servico(a,hoje) s where
         case p_filtros->>'foco' when 'espera' then s.espera when 'atrasados' then s.atrasados when 'retirada' then s.retirada when 'retornos' then s.retornos when 'aceite' then s.aceite
           when 'pendencias' then s.aberto and s.prazo<>'' and s.prazo<=(hoje+5)::text else false end))
       and (p_apos is null or (a.criado_em,a.id)<((p_apos->>'criado_em')::timestamptz,(p_apos->>'id')::uuid))
       order by a.criado_em desc,a.id desc limit 31
     ) x;
     if jsonb_array_length(atendimentos)>30 then proximo:=jsonb_build_object('criado_em',atendimentos->29->'criado_em','id',atendimentos->29->'id'); atendimentos:=atendimentos-30; end if;
   end if;
 end if;
 -- Links diretos de notificações recuperam a reserva, mesmo fora do período visível.
 if coalesce(p_filtros->>'reserva','')<>'' and private.has_feature(p_oficina,'work_orders') then
   agenda:=agenda||coalesce((select jsonb_agg(to_jsonb(g)) from public.agenda_servicos g where g.oficina_id=p_oficina and g.id=(p_filtros->>'reserva')::uuid and not exists(select 1 from jsonb_array_elements(agenda) x where x->>'id'=g.id::text)),'[]');
 end if;
 select array_agg((x->>'id')::uuid),array_agg(distinct (x->>'objeto_id')::uuid) into ids,objetos_ids from jsonb_array_elements(atendimentos) x;
 if tela<>'objetos' then
   select coalesce(jsonb_agg(to_jsonb(o) order by o.nome,o.id),'[]') into objetos from public.objetos_atendimento o where o.oficina_id=p_oficina and (o.id=any(objetos_ids) or o.id=nullif(p_filtros->>'objeto','')::uuid);
 end if;
 select array_agg(distinct id) into clientes_ids from (
   select (x->>'cliente_id')::uuid id from jsonb_array_elements(objetos) x union select (x->>'cliente_id')::uuid from jsonb_array_elements(atendimentos) x
 ) v;
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'nome',c.nome,'telefone_e164',c.telefone_e164,'email',c.email)),'[]') into clientes from public.clientes c where c.oficina_id=p_oficina and c.id=any(clientes_ids);
 if private.has_feature(p_oficina,'finance') and exists(select 1 from public.membros_oficina where oficina_id=p_oficina and usuario_id=auth.uid() and perfil in ('owner','manager') and ativo) then
   select coalesce(jsonb_agg(to_jsonb(c)),'[]') into cobrancas from public.cobrancas_atendimento c where c.oficina_id=p_oficina and c.atendimento_id=any(ids);
 end if;
 return jsonb_build_object('atendimentos',atendimentos,'objetos',objetos,'agenda',agenda,'clientes',clientes,'cobrancas',cobrancas,'proximo',proximo,
   'recursos',(select coalesce(jsonb_agg(to_jsonb(r) order by r.nome,r.id),'[]') from public.recursos_agenda r where r.oficina_id=p_oficina));
end $$;

create function public.buscar_selecao_servicos(p_oficina uuid,p_tipo text,p_busca text default '',p_cliente uuid default null,p_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r jsonb; busca text:=private.texto_busca(trim(coalesce(p_busca,'')));
begin
 perform private.exigir_servicos(p_oficina,case when p_tipo='objetos' then 'customers' else 'work_orders' end);
 if p_tipo not in ('objetos','atendimentos') or length(busca)>200 then raise exception 'Busca inválida.' using errcode='22023'; end if;
 if p_tipo='objetos' then
   select coalesce(jsonb_agg(to_jsonb(x) order by x.nome,x.id),'[]') into r from (
     select o.* from public.objetos_atendimento o where oficina_id=p_oficina and (not arquivado or id=p_id)
     and (p_id is null or id=p_id) and (p_cliente is null or cliente_id=p_cliente)
     and (busca='' or position(busca in private.texto_busca(nome||' '||dados::text))>0) order by nome,id limit 30
   ) x;
 else
   select coalesce(jsonb_agg(to_jsonb(x) order by x.criado_em desc,x.id desc),'[]') into r from (
     select a.*,c.nome as cliente_nome from public.atendimentos_servicos a join public.clientes c on c.oficina_id=a.oficina_id and c.id=a.cliente_id
     where a.oficina_id=p_oficina and (a.situacao<>'cancelado' or a.id=p_id) and (p_id is null or a.id=p_id)
     and (busca='' or position(busca in private.texto_busca(a.titulo||' '||c.nome||' '||a.numero::text))>0)
     order by a.criado_em desc,a.id desc limit 30
   ) x;
 end if;
 return r;
end $$;
revoke all on function private.operacao_servico(public.atendimentos_servicos,date) from public,anon,authenticated;
revoke all on function public.resumo_operacao_servicos(uuid,text),public.pagina_servicos(uuid,jsonb,jsonb),public.buscar_selecao_servicos(uuid,text,text,uuid,uuid) from public,anon;
grant execute on function public.resumo_operacao_servicos(uuid,text),public.pagina_servicos(uuid,jsonb,jsonb),public.buscar_selecao_servicos(uuid,text,text,uuid,uuid) to authenticated;
