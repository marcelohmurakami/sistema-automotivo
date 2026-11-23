begin;
create function private.etapa_painel_assistencia(situacao text,dados jsonb,ficha jsonb) returns text
language sql immutable set search_path='' as $$
select case situacao
 when 'cancelado' then null
 when 'concluido' then case when coalesce(ficha->>'etapa','') in ('Entregue','Aceite registrado') then null else 'prontos' end
 when 'aguardando' then 'parados' when 'em_execucao' then 'producao' when 'aprovado' then 'aprovados'
 else case when dados->>'orcamento_enviado'='nao' then 'recebidos' else 'aprovacao' end end;
$$;
revoke all on function private.etapa_painel_assistencia(text,jsonb,jsonb) from public,anon,authenticated;
create index atendimentos_fluxo_assistencia on public.atendimentos_servicos(oficina_id,private.etapa_painel_assistencia(situacao,dados,ficha_especialidade),criado_em desc,id desc);
create or replace function public.pagina_servicos(p_oficina uuid,p_filtros jsonb default '{}',p_apos jsonb default null) returns jsonb
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
       and (coalesce(p_filtros->>'documento','')='' or a.dados->>'documento'=p_filtros->>'documento' or (not a.dados ? 'documento' and a.situacao='orcamento'))
       and (coalesce(p_filtros->>'fluxo','')='' or private.etapa_painel_assistencia(a.situacao,a.dados,a.ficha_especialidade)=p_filtros->>'fluxo')
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

-- Criação e itens são uma única transação. A mesma chave nunca gera duas ordens.
create function public.criar_atendimento_com_itens(p_oficina uuid,p_id uuid,p_dados jsonb,p_itens jsonb,p_desconto bigint default 0,p_revisao integer default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare revisao_atual integer; situacao_final text := coalesce(p_dados->>'situacao','orcamento');
begin
 perform private.exigir_servicos(p_oficina,'work_orders');
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_id::text,0));
 if exists(select 1 from public.atendimentos_servicos where oficina_id=p_oficina and id=p_id) then return p_id; end if;
 if p_revisao is not null or p_id is null or situacao_final not in ('orcamento','aprovado','em_execucao','aguardando') then raise exception 'Salve a ordem antes de concluir ou cancelar o serviço.' using errcode='22023'; end if;
 if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens)>100 then raise exception 'Lista de itens inválida.' using errcode='22023';end if;
 perform public.salvar_atendimento_servico(p_oficina,p_id,p_dados||'{"situacao":"orcamento","valor_centavos":0}'::jsonb,null);
 select revisao into revisao_atual from public.atendimentos_servicos where oficina_id=p_oficina and id=p_id;
 perform public.salvar_itens_atendimento(p_oficina,p_id,revisao_atual,p_itens,p_desconto,0,'');
 if situacao_final<>'orcamento' then
   select revisao into revisao_atual from public.atendimentos_servicos where oficina_id=p_oficina and id=p_id;
   perform public.salvar_atendimento_servico(p_oficina,p_id,(select to_jsonb(a)||jsonb_build_object('situacao',situacao_final) from public.atendimentos_servicos a where oficina_id=p_oficina and id=p_id),revisao_atual);
 end if;
 return p_id;
end $$;
revoke all on function public.criar_atendimento_com_itens(uuid,uuid,jsonb,jsonb,bigint,integer) from public,anon;
grant execute on function public.criar_atendimento_com_itens(uuid,uuid,jsonb,jsonb,bigint,integer) to authenticated;
commit;
