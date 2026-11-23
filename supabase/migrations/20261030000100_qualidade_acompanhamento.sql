begin;

create index if not exists qualidade_os_entregues_periodo on public.ordens_servico(oficina_id,entregue_em desc,id) where situacao='delivered';
create index if not exists qualidade_os_retirada_periodo on public.ordens_servico(oficina_id,concluido_em,id) where situacao='ready';
create index if not exists qualidade_atendimentos_concluidos on public.atendimentos_servicos(oficina_id,concluido_em desc,id) where situacao='concluido';

-- Contexto comum aos 26 perfis. Filtros de empresa são obrigatórios nas RPCs.
create view private.documentos_qualidade as
 select o.oficina_id, o.id, 'os'::text origem, o.numero, o.cliente_id,
 c.nome cliente, c.telefone_e164 telefone, coalesce(v.modelo,'Não informado') objeto,
 o.situacao::text situacao, o.criado_em, o.concluido_em pronto_em, o.entregue_em finalizado_em,
 o.situacao='ready' aguarda_retirada, o.situacao='delivered' finalizado
 from public.ordens_servico o join public.clientes c on c.oficina_id=o.oficina_id and c.id=o.cliente_id
 left join public.veiculos v on v.oficina_id=o.oficina_id and v.id=o.veiculo_id
 union all
 select a.oficina_id,a.id,'atendimento',a.numero,a.cliente_id,c.nome,c.telefone_e164,b.nome,a.situacao,a.criado_em,a.concluido_em,
 case when a.situacao='concluido' and (w.ramo<>'assistencia_tecnica' or a.ficha_especialidade->>'etapa' in ('Entregue','Aceite registrado')) then a.concluido_em end,
 a.situacao='concluido' and w.ramo='assistencia_tecnica' and coalesce(a.ficha_especialidade->>'etapa','') not in ('Entregue','Aceite registrado') and not coalesce(w.especialidade='assistencia_eletrodomesticos' and a.ficha_especialidade#>>'{campos,modalidade}'='Domicílio',false),
 a.situacao='concluido' and (w.ramo<>'assistencia_tecnica' or a.ficha_especialidade->>'etapa' in ('Entregue','Aceite registrado'))
 from public.atendimentos_servicos a join public.clientes c on c.oficina_id=a.oficina_id and c.id=a.cliente_id
 join public.objetos_atendimento b on b.oficina_id=a.oficina_id and b.id=a.objeto_id join public.oficinas w on w.id=a.oficina_id;

create table public.acompanhamentos_qualidade (
 id uuid primary key, oficina_id uuid not null references public.oficinas(id),
 ordem_servico_id uuid, atendimento_id uuid,
 tipo text not null check(tipo in ('analise','fabricante','custodia','assinatura')),
 situacao text not null, dados jsonb not null check(jsonb_typeof(dados)='object' and octet_length(dados::text)<=32000),
 documento jsonb not null, documento_canonico text generated always as (documento::text) stored, hash_documento text not null, revisao integer not null default 1,
 criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(), autor uuid not null references auth.users(id),
 unique(oficina_id,id), check(num_nonnulls(ordem_servico_id,atendimento_id)=1),
 foreign key(oficina_id,ordem_servico_id) references public.ordens_servico(oficina_id,id),
 foreign key(oficina_id,atendimento_id) references public.atendimentos_servicos(oficina_id,id)
);
create index acompanhamentos_qualidade_lista on public.acompanhamentos_qualidade(oficina_id,tipo,criado_em desc,id);
create index acompanhamentos_qualidade_os on public.acompanhamentos_qualidade(oficina_id,ordem_servico_id);
create index acompanhamentos_qualidade_atendimento on public.acompanhamentos_qualidade(oficina_id,atendimento_id);
create table public.historico_acompanhamento_qualidade (
 id bigint generated always as identity primary key, oficina_id uuid not null, acompanhamento_id uuid not null,
 revisao integer not null, antes jsonb, depois jsonb not null, autor uuid references auth.users(id), ocorrido_em timestamptz not null default now(),
 unique(acompanhamento_id,revisao), foreign key(oficina_id,acompanhamento_id) references public.acompanhamentos_qualidade(oficina_id,id)
);
create index historico_acompanhamento_empresa on public.historico_acompanhamento_qualidade(oficina_id,acompanhamento_id,revisao desc);
create trigger historico_acompanhamento_imutavel before update or delete on public.historico_acompanhamento_qualidade for each row execute function private.reject_mutation();
alter table public.acompanhamentos_qualidade enable row level security;
alter table public.historico_acompanhamento_qualidade enable row level security;
revoke all on public.acompanhamentos_qualidade,public.historico_acompanhamento_qualidade from public,anon,authenticated;

create function public.buscar_documentos_qualidade(p_oficina uuid,p_busca text default '',p_retirada boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform private.exigir_gestao(p_oficina,'work_orders');
 return (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from (
 select * from private.documentos_qualidade where oficina_id=p_oficina and (not p_retirada or aguarda_retirada)
 and (length(trim(p_busca))=0 or cliente ilike '%'||left(trim(p_busca),100)||'%' or objeto ilike '%'||left(trim(p_busca),100)||'%' or numero::text=trim(p_busca))
 order by criado_em desc,id limit 30) d);
end $$;

create function public.salvar_acompanhamento_qualidade(p_oficina uuid,p_id uuid,p_origem text,p_documento uuid,p_tipo text,p_situacao text,p_dados jsonb,p_revisao integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.acompanhamentos_qualidade; antigo jsonb; d jsonb; solicitado bigint; autorizado bigint; recebido bigint;
begin
 perform private.exigir_gestao(p_oficina,'work_orders');
 if p_id is null or p_documento is null or p_origem not in ('os','atendimento') or p_tipo not in ('analise','fabricante','custodia','assinatura') or p_situacao is null or p_dados is null or jsonb_typeof(p_dados)<>'object' or octet_length(p_dados::text)>32000 then raise exception 'Dados do acompanhamento inválidos.' using errcode='22023';end if;
 select to_jsonb(v) into d from private.documentos_qualidade v where oficina_id=p_oficina and id=p_documento and origem=p_origem;
 if d is null then raise exception 'Atendimento indisponível nesta empresa.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into a from public.acompanhamentos_qualidade where id=p_id;
 if found then
  if a.oficina_id<>p_oficina then raise exception 'Registro indisponível.' using errcode='42501';end if;
  if a.tipo<>p_tipo or coalesce(a.ordem_servico_id,a.atendimento_id)<>p_documento or (a.ordem_servico_id is not null)<>(p_origem='os') then raise exception 'Não é possível trocar o vínculo deste registro.' using errcode='22023';end if;
  if a.dados=p_dados and a.situacao=p_situacao then return to_jsonb(a);end if;
  if p_revisao is distinct from a.revisao then raise exception 'Este registro mudou. Atualize e confira antes de salvar.' using errcode='PT409';end if;
  if a.tipo='assinatura' and p_dados<>a.dados then raise exception 'O documento preparado é imutável. Cancele e prepare uma nova versão.' using errcode='22023';end if;
  antigo:=to_jsonb(a);
 elsif p_revisao is not null then raise exception 'Registro não encontrado.' using errcode='PT409';end if;
 if length(trim(coalesce(p_dados->>'descricao',''))) not between 5 and 3000 then raise exception 'Descreva o acompanhamento em 5 a 3.000 caracteres.' using errcode='22023';end if;
 if exists(select 1 from jsonb_each(p_dados) where length(value::text)>10000) then raise exception 'Um dos campos excede o limite de tamanho.' using errcode='22023';end if;
 if p_tipo='analise' then
  if p_situacao not in ('aberta','em_analise','confirmada','encerrada','cancelada') then raise exception 'Etapa da análise inválida.' using errcode='22023';end if;
  if p_situacao in ('confirmada','encerrada') and (length(trim(coalesce(p_dados->>'evidencias','')))<10 or length(trim(coalesce(p_dados->>'conclusao','')))<10 or length(trim(coalesce(p_dados->>'teste','')))<5 or length(trim(coalesce(p_dados->>'acao','')))<5) then raise exception 'Para confirmar, registre evidências, teste, conclusão e ação corretiva.' using errcode='22023';end if;
  if p_situacao='encerrada' and length(trim(coalesce(p_dados->>'validacao','')))<5 then raise exception 'Registre a verificação da solução antes de encerrar.' using errcode='22023';end if;
 elsif p_tipo='fabricante' then
  if p_situacao not in ('aberta','solicitada','autorizada','negada','enviada','recebida','ressarcida','encerrada','cancelada') or length(trim(coalesce(p_dados->>'fabricante','')))<2 or length(trim(coalesce(p_dados->>'pecas','')))<2 then raise exception 'Informe fabricante, peças e uma etapa válida.' using errcode='22023';end if;
  if p_situacao not in ('aberta','cancelada') and length(trim(coalesce(p_dados->>'protocolo','')))<2 then raise exception 'Informe o protocolo do fabricante.' using errcode='22023';end if;
  solicitado:=coalesce((p_dados->>'solicitado_centavos')::bigint,0);autorizado:=coalesce((p_dados->>'autorizado_centavos')::bigint,0);recebido:=coalesce((p_dados->>'recebido_centavos')::bigint,0);
  if least(solicitado,autorizado,recebido)<0 or greatest(solicitado,autorizado,recebido)>10000000000 or recebido>autorizado or autorizado>solicitado then raise exception 'Confira os valores solicitado, autorizado e recebido.' using errcode='22023';end if;
  if p_situacao in ('autorizada','enviada','recebida','ressarcida') and length(trim(coalesce(p_dados->>'autorizacao','')))<3 then raise exception 'Registre a autorização do fabricante.' using errcode='22023';end if;
  if p_situacao='enviada' and length(trim(coalesce(p_dados->>'rastreio','')))<3 then raise exception 'Registre o envio das peças.' using errcode='22023';end if;
  if recebido>0 and length(trim(coalesce(p_dados->>'comprovante','')))<3 then raise exception 'Informe a referência do comprovante de ressarcimento.' using errcode='22023';end if;
  if p_situacao='ressarcida' and (recebido=0 or recebido<>autorizado) then raise exception 'Registre o recebimento integral autorizado antes de marcar como ressarcida.' using errcode='22023';end if;
  if p_situacao in ('negada','encerrada') and length(trim(coalesce(p_dados->>'conclusao','')))<5 then raise exception 'Registre o motivo ou resultado do fabricante.' using errcode='22023';end if;
 elsif p_tipo='custodia' then
  if p_situacao not in ('aberta','notificada','combinada','retirada','cancelada') then raise exception 'Etapa de retirada inválida.' using errcode='22023';end if;
  if a.id is null and not coalesce((d->>'aguarda_retirada')::boolean,false) then raise exception 'Este atendimento não aguarda retirada.' using errcode='22023';end if;
  if p_situacao in ('notificada','combinada') and (length(trim(coalesce(p_dados->>'contato','')))<5 or nullif(p_dados->>'contato_em','') is null) then raise exception 'Registre data, canal e resultado do contato realizado.' using errcode='22023';end if;
  if p_situacao='combinada' and nullif(p_dados->>'retirada_prevista','') is null then raise exception 'Informe a data combinada.' using errcode='22023';end if;
  if p_situacao='retirada' and (not coalesce((d->>'finalizado')::boolean,false) or length(trim(coalesce(p_dados->>'recebedor','')))<3) then raise exception 'Registre a entrega e o pagamento no atendimento antes de encerrar a custódia. Informe também quem recebeu.' using errcode='22023';end if;
 elsif p_tipo='assinatura' then
  if p_situacao not in ('preparada','cancelada') then raise exception 'A confirmação de assinatura depende do provedor integrado.' using errcode='22023';end if;
  if length(trim(coalesce(p_dados->>'signatario','')))<3 or coalesce(p_dados->>'email','') !~ '^[^ @]+@[^ @]+\.[^ @]+$' or length(trim(coalesce(p_dados->>'conteudo','')))<20 then raise exception 'Informe signatário, e-mail e o documento a preparar.' using errcode='22023';end if;
 end if;
 -- Datas são validadas no servidor, mesmo em clientes alterados.
 perform (nullif(p_dados->>'prazo',''))::date,(nullif(p_dados->>'retirada_prevista',''))::date,(nullif(p_dados->>'contato_em',''))::timestamptz;
 if a.id is null then
  d:=d||jsonb_build_object('empresa',(select nome from public.oficinas where id=p_oficina),'conteudo',p_dados,'tipo',p_tipo,'preparado_em',now());
  insert into public.acompanhamentos_qualidade(id,oficina_id,ordem_servico_id,atendimento_id,tipo,situacao,dados,documento,hash_documento,autor)
  values(p_id,p_oficina,case when p_origem='os' then p_documento end,case when p_origem='atendimento' then p_documento end,p_tipo,p_situacao,p_dados,d,encode(sha256(convert_to(d::text,'UTF8')),'hex'),auth.uid()) returning * into a;
 else
  update public.acompanhamentos_qualidade set situacao=p_situacao,dados=p_dados,revisao=revisao+1,atualizado_em=now(),autor=auth.uid() where id=p_id returning * into a;
 end if;
 insert into public.historico_acompanhamento_qualidade(oficina_id,acompanhamento_id,revisao,antes,depois,autor) values(p_oficina,p_id,a.revisao,antigo,to_jsonb(a),auth.uid());
 return to_jsonb(a);
end $$;

create function public.listar_acompanhamentos_qualidade(p_oficina uuid,p_tipo text,p_inicio date,p_fim date,p_busca text default '',p_pagina integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb;
begin
 perform private.exigir_gestao(p_oficina,'work_orders');
 if p_inicio is null or p_fim is null or p_fim<p_inicio or p_fim-p_inicio>366 or p_pagina not between 0 and 100000 then raise exception 'Selecione até 12 meses e uma página válida.' using errcode='22023';end if;
 select coalesce(jsonb_agg(to_jsonb(t)),'[]') into r from (
 select a.*,v.numero,v.cliente,v.objeto,v.origem,coalesce(a.ordem_servico_id,a.atendimento_id) documento_id from public.acompanhamentos_qualidade a
 join private.documentos_qualidade v on v.oficina_id=a.oficina_id and v.id=coalesce(a.ordem_servico_id,a.atendimento_id) and v.origem=case when a.ordem_servico_id is not null then 'os' else 'atendimento' end
 where a.oficina_id=p_oficina and a.tipo=p_tipo and a.criado_em>=p_inicio::timestamp at time zone 'America/Sao_Paulo' and a.criado_em<(p_fim+1)::timestamp at time zone 'America/Sao_Paulo'
 and (v.cliente||' '||v.numero||' '||v.objeto||' '||(a.dados->>'descricao')) ilike '%'||left(coalesce(p_busca,''),100)||'%'
 order by a.criado_em desc,a.id limit 51 offset p_pagina*50) t;
 return r;
end $$;

create function public.consultar_acompanhamento_qualidade(p_oficina uuid,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;begin perform private.exigir_gestao(p_oficina,'work_orders');select to_jsonb(a) into r from public.acompanhamentos_qualidade a where oficina_id=p_oficina and id=p_id;if r is null then raise exception 'Acompanhamento indisponível.' using errcode='42501';end if;return r;end $$;

create function public.historico_acompanhamento_qualidade(p_oficina uuid,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform private.exigir_gestao(p_oficina,'work_orders');return (select coalesce(jsonb_agg(to_jsonb(h) order by revisao desc),'[]') from (select * from public.historico_acompanhamento_qualidade where oficina_id=p_oficina and acompanhamento_id=p_id order by revisao desc limit 100) h);end $$;

-- A fila usa o estado atual da OS; reaberturas e entregas deixam de aparecer.
create function public.consultar_retiradas_qualidade(p_oficina uuid,p_dias integer default 7,p_pagina integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.exigir_gestao(p_oficina,'work_orders');
 if p_dias not between 0 and 3650 or p_pagina not between 0 and 100000 then raise exception 'Filtro inválido.' using errcode='22023';end if;
 return (select coalesce(jsonb_agg(to_jsonb(d)),'[]') from (
 select v.*,greatest(0,(now() at time zone 'America/Sao_Paulo')::date-(v.pronto_em at time zone 'America/Sao_Paulo')::date) dias,
 (select jsonb_build_object('id',a.id,'situacao',a.situacao,'dados',a.dados) from public.acompanhamentos_qualidade a where a.oficina_id=v.oficina_id and coalesce(a.ordem_servico_id,a.atendimento_id)=v.id and a.tipo='custodia' and a.situacao not in ('cancelada','retirada') order by atualizado_em desc limit 1) acompanhamento,
 (select coalesce(jsonb_agg(jsonb_build_object('codigo',i.codigo,'descricao',i.descricao,'situacao',i.situacao,'local',l.nome)),'[]') from public.itens_fisicos i left join public.locais_fisicos l on l.oficina_id=i.oficina_id and l.id=i.local_id where i.oficina_id=v.oficina_id and (i.ordem_servico_id=v.id or i.atendimento_id=v.id)) itens
 from private.documentos_qualidade v where v.oficina_id=p_oficina and v.aguarda_retirada and v.pronto_em<=now()-make_interval(days=>p_dias)
 order by v.pronto_em,v.id limit 51 offset p_pagina*50) d);
end $$;

do $$declare r record;begin for r in select p.oid::regprocedure assinatura from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('buscar_documentos_qualidade','salvar_acompanhamento_qualidade','listar_acompanhamentos_qualidade','consultar_acompanhamento_qualidade','historico_acompanhamento_qualidade','consultar_retiradas_qualidade') loop execute format('revoke all on function %s from public,anon',r.assinatura);execute format('grant execute on function %s to authenticated',r.assinatura);end loop;end $$;
notify pgrst,'reload schema';
commit;
