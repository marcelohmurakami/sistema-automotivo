create table public.execucoes_offline (
 id uuid primary key, oficina_id uuid not null references public.oficinas(id), usuario_id uuid not null,
 agenda_id uuid, documento_id uuid, automotivo boolean not null, pedido jsonb not null, resposta jsonb not null,
 criado_em timestamptz not null default now()
);
create index execucoes_offline_documento on public.execucoes_offline(oficina_id,documento_id,criado_em desc);
alter table public.execucoes_offline enable row level security;
revoke all on public.execucoes_offline from public,anon,authenticated;
create table public.fotos_servico_offline (
 chave uuid primary key, oficina_id uuid not null, atendimento_id uuid not null, usuario_id uuid not null,
 hash text not null, reserva jsonb not null, renovado_em timestamptz not null default now()
);
alter table public.fotos_servico_offline enable row level security;
revoke all on public.fotos_servico_offline from public,anon,authenticated;

create function private.base_execucao_offline(w uuid,auto boolean,gid uuid,did uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare g jsonb;d jsonb;r jsonb;n text;obj text;itens jsonb;esp text;
begin
 select especialidade into esp from public.oficinas where id=w;
 if auto then
 if gid is not null then select to_jsonb(x) into g from public.agenda_atendimentos x where oficina_id=w and id=gid;did:=(g->>'ordem_servico_id')::uuid;end if;
 if did is not null then select to_jsonb(x) into d from public.ordens_servico x where oficina_id=w and id=did;end if;
 if g is null and d is null then raise exception 'Atendimento indisponível.' using errcode='42501';end if;
 n:=coalesce(d->'dados_cliente'->>'nome',(select nome from public.clientes where oficina_id=w and id=(g->>'cliente_id')::uuid),'Cliente');
 obj:=coalesce(d->'dados_veiculo'->>'modelo',g->>'identificacao','Atendimento');
 select coalesce(jsonb_agg(jsonb_build_object('descricao',i.descricao,'quantidade',i.quantidade) order by i.id),'[]') into itens from public.itens_ordem_servico i where i.oficina_id=w and i.ordem_servico_id=did and i.situacao<>'cancelled' and i.removido_em is null;
 else
 if gid is not null then select to_jsonb(x) into g from public.agenda_servicos x where oficina_id=w and id=gid;did:=(g->>'atendimento_id')::uuid;end if;
 if did is not null then select to_jsonb(x) into d from public.atendimentos_servicos x where oficina_id=w and id=did;end if;
 if d is null then raise exception 'Atendimento indisponível.' using errcode='42501';end if;
 select nome into n from public.clientes where oficina_id=w and id=(d->>'cliente_id')::uuid;
 select nome into obj from public.objetos_atendimento where oficina_id=w and id=(d->>'objeto_id')::uuid;
 select coalesce(jsonb_agg(jsonb_build_object('descricao',i.descricao,'quantidade',i.quantidade) order by i.id),'[]') into itens from public.itens_atendimento_servico i where i.oficina_id=w and i.atendimento_id=did;
 end if;
 r:=jsonb_build_object('id',coalesce(gid,did),'agenda_id',gid,'documento_id',did,'automotivo',auto,'agenda_revisao',(g->>'revisao')::int,'documento_revisao',(d->>'revisao')::int,'cliente',n,'objeto',obj,'titulo',coalesce(g->>'servico',d->>'titulo','OS #'||(d->>'numero')),'numero',d->>'numero','inicio',g->>'inicio','fim',g->>'fim','endereco',coalesce(g->'logistica'->>'destino',''),'agenda_situacao',g->>'situacao','situacao',d->>'situacao','ficha',d->'ficha_especialidade','especialidade',esp,'itens',itens);
 return r;
end $$;
create function public.preparar_execucao_offline(p_oficina uuid,p_inicio date default null,p_fim date default null,p_agenda uuid default null,p_documento uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare auto boolean;lista jsonb;nome text;id uuid;
begin
 perform private.exigir_distribuicao(p_oficina);
 select ramo='automotivo',o.nome into auto,nome from public.oficinas o where o.id=p_oficina;
 if p_agenda is not null or p_documento is not null then
 lista:=jsonb_build_array(private.base_execucao_offline(p_oficina,auto,p_agenda,p_documento));
 else
 if p_inicio is null or p_fim is null or p_fim<p_inicio or p_fim-p_inicio>7 then raise exception 'Escolha até oito dias para preparar no aparelho.' using errcode='22023';end if;
 lista:='[]';
 for id in select x.id from public.agenda_atendimentos x where auto and oficina_id=p_oficina and (inicio at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim and situacao<>'cancelado'
 union all select x.id from public.agenda_servicos x where not auto and oficina_id=p_oficina and (inicio at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim and situacao not in ('cancelado','faltou') loop
 if jsonb_array_length(lista)>=100 then raise exception 'Mais de 100 atendimentos. Escolha um intervalo menor.' using errcode='22023';end if;
 lista:=lista||jsonb_build_array(private.base_execucao_offline(p_oficina,auto,id,null));
 end loop;
 end if;
 return jsonb_build_object('empresa',nome,'oficina',p_oficina,'usuario',auth.uid(),'preparado_em',now(),'itens',lista);
end $$;

create function public.sincronizar_execucao_offline(p_oficina uuid,p_chave uuid,p_base jsonb,p_dados jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare auto boolean;u uuid;anterior public.execucoes_offline;g jsonb;d jsonb;rev int;atual text;alvo text;gid uuid;did uuid;nota text;resposta jsonb;inicio timestamptz;fim timestamptz;passo text;f jsonb;
begin
 perform private.exigir_distribuicao(p_oficina);u:=auth.uid();
 if p_chave is null or octet_length(p_dados::text)>50000 or jsonb_typeof(p_dados) is distinct from 'object' then raise exception 'Execução inválida.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline:'||p_chave,0));
 select * into anterior from public.execucoes_offline where id=p_chave;
 if found then
 if anterior.oficina_id<>p_oficina or anterior.usuario_id<>u then raise exception 'Execução indisponível.' using errcode='42501';end if;
 if anterior.pedido<>jsonb_build_object('base',p_base,'dados',p_dados) then raise exception 'Envio já processado com outros dados. Atualize o atendimento.' using errcode='PT409';end if;
 return anterior.resposta;
 end if;
 select ramo='automotivo' into auto from public.oficinas where id=p_oficina;
 if auto is distinct from (p_base->>'automotivo')::boolean then raise exception 'Tipo de atendimento inválido.' using errcode='22023';end if;
 gid:=nullif(p_base->>'agenda_id','')::uuid;did:=nullif(p_base->>'documento_id','')::uuid;
 perform private.travar_reserva_recursos(p_oficina);
 if gid is not null then
 if auto then select to_jsonb(x) into g from public.agenda_atendimentos x where oficina_id=p_oficina and id=gid for update;
 else select to_jsonb(x) into g from public.agenda_servicos x where oficina_id=p_oficina and id=gid for update;end if;
 if g is null then raise exception 'Visita indisponível.' using errcode='42501';end if;
 if (g->>'revisao')::int is distinct from (p_base->>'agenda_revisao')::int or coalesce(g->>'ordem_servico_id',g->>'atendimento_id') is distinct from did::text then raise exception 'A visita mudou desde a preparação. Compare os dados antes de enviar.' using errcode='PT409';end if;
 if g->>'situacao' in ('cancelado','faltou') then raise exception 'Visita cancelada ou não realizada. Confira a agenda.' using errcode='22023';end if;
 end if;
 if gid is null and did is null then raise exception 'Selecione o atendimento.' using errcode='22023';end if;
 nota:=trim(coalesce(p_dados->>'anotacoes',''));inicio:=nullif(p_dados->>'iniciado_em','')::timestamptz;fim:=nullif(p_dados->>'finalizado_em','')::timestamptz;
 if (inicio is not null and not isfinite(inicio)) or (fim is not null and not isfinite(fim)) or length(nota)>5000 or inicio>now()+interval '5 minutes' or fim>now()+interval '5 minutes' or (fim is not null and (inicio is null or fim<inicio or fim-inicio>interval '31 days')) then raise exception 'Confira as anotações e os horários reais da execução.' using errcode='22023';end if;
 alvo:=nullif(p_dados->>'situacao','');
 if did is not null then
 if auto then
 select to_jsonb(x) into d from public.ordens_servico x where oficina_id=p_oficina and id=did for update;
 else
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||did::text,0));
 select to_jsonb(x) into d from public.atendimentos_servicos x where oficina_id=p_oficina and id=did for update;
 end if;
 if d is null then raise exception 'Atendimento indisponível.' using errcode='42501';end if;
 if (d->>'revisao')::int is distinct from (p_base->>'documento_revisao')::int then raise exception 'O atendimento mudou desde a preparação. Compare os dados antes de enviar.' using errcode='PT409';end if;
 atual:=d->>'situacao';alvo:=coalesce(alvo,atual);f:=coalesce(p_dados->'ficha',d->'ficha_especialidade');
 if auto then
 if alvo not in ('open','in_progress','quality_check','ready') then raise exception 'Entrega e cancelamento devem ser feitos no sistema conectado.' using errcode='22023';end if;
 resposta:=public.salvar_ordem_servico(p_oficina,d||jsonb_build_object('ficha_especialidade',f),p_chave,did,(d->>'revisao')::int);
 select revisao into rev from public.ordens_servico where oficina_id=p_oficina and id=did;
 if alvo<>atual then
 if array_position(array['open','in_progress','quality_check','ready'],alvo)<array_position(array['open','in_progress','quality_check','ready'],atual) then raise exception 'Reabertura deve ser feita no sistema conectado.' using errcode='22023';end if;
 foreach passo in array array['in_progress','quality_check','ready'] loop
 if array_position(array['open','in_progress','quality_check','ready'],passo)>array_position(array['open','in_progress','quality_check','ready'],atual) and array_position(array['open','in_progress','quality_check','ready'],passo)<=array_position(array['open','in_progress','quality_check','ready'],alvo) then
 if passo='ready' then
 perform public.operar_mapa_rapido(p_oficina,did,rev,'concluir',null,null);select revisao into rev from public.ordens_servico where oficina_id=p_oficina and id=did;
 else rev:=public.atualizar_mapa_ordem_servico(p_oficina,did,rev,passo,(d->>'etapa_id')::uuid,(d->>'local_id')::uuid,(d->>'entrega_prevista_em')::timestamptz,(d->>'recebido_em')::timestamptz,null);end if;
 end if;end loop;end if;
 perform private.evento_os(p_oficina,did,'Execução registrada no aparelho',jsonb_build_object('anotacoes',nota,'iniciado_em',inicio,'finalizado_em',fim,'chave',p_chave));
 else
 if alvo<>atual and (atual not in ('aprovado','em_execucao','aguardando') or alvo not in ('em_execucao','aguardando','concluido')) then raise exception 'Aprovação, entrega e reabertura exigem o sistema conectado.' using errcode='22023';end if;
 if f->'campos'->>'recebedor' is distinct from d->'ficha_especialidade'->'campos'->>'recebedor' or f->>'etapa' in ('Entregue','Aceite registrado') then raise exception 'Registre a entrega no sistema conectado.' using errcode='22023';end if;
 perform public.salvar_atendimento_servico(p_oficina,did,d||jsonb_build_object('ficha_especialidade',f,'situacao',alvo),(d->>'revisao')::int);
 insert into public.eventos_atendimento(oficina_id,atendimento_id,tipo,depois,autor) values(p_oficina,did,'execucao_offline',left('Execução no aparelho: '||nota,5000),u);
 end if;
 end if;
 resposta:=private.base_execucao_offline(p_oficina,auto,gid,did);
 insert into public.execucoes_offline values(p_chave,p_oficina,u,gid,did,auto,jsonb_build_object('base',p_base,'dados',p_dados),resposta,now());
 return resposta;
end $$;

create function public.reservar_foto_servico_offline(p_oficina uuid,p_atendimento uuid,p_chave uuid,p_hash text,p_fase text,p_tamanho bigint,p_legenda text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.fotos_servico_offline;resposta jsonb;
begin
 perform private.exigir_fotos_atendimento(p_oficina,p_atendimento);
 if p_hash!~'^[0-9a-f]{64}$' or p_hash is null or p_chave is null then raise exception 'Foto inválida.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('offline-foto:'||p_chave,0));select * into r from public.fotos_servico_offline where chave=p_chave;
 if found then
 if r.oficina_id<>p_oficina or r.atendimento_id<>p_atendimento or r.usuario_id<>auth.uid() or r.hash<>p_hash then raise exception 'Foto de outro atendimento ou conteúdo diferente.' using errcode='22023';end if;
 update public.fotos_servico_offline set renovado_em=now() where chave=p_chave;return r.reserva;
 end if;
 resposta:=public.reservar_foto_atendimento(p_oficina,p_atendimento,p_chave::text||'.jpg','image/jpeg',p_tamanho,p_fase,p_legenda);
 insert into public.fotos_servico_offline values(p_chave,p_oficina,p_atendimento,auth.uid(),p_hash,resposta,now());return resposta;
end $$;
do $$declare s text;begin
 s:=pg_get_functiondef('private.pode_enviar_foto_atendimento(text)'::regprocedure);
 if position('f.criado_em>now()-interval ''1 hour''' in s)=0 then raise exception 'Contrato de envio de fotos mudou.';end if;
 s:=replace(s,'f.criado_em>now()-interval ''1 hour''','(f.criado_em>now()-interval ''1 hour'' or exists(select 1 from public.fotos_servico_offline o where o.oficina_id=f.oficina_id and (o.reserva->>''id'')::uuid=f.id and o.usuario_id=auth.uid() and o.renovado_em>now()-interval ''1 hour''))');execute s;
end $$;
revoke all on function private.base_execucao_offline(uuid,boolean,uuid,uuid),public.preparar_execucao_offline(uuid,date,date,uuid,uuid),public.sincronizar_execucao_offline(uuid,uuid,jsonb,jsonb),public.reservar_foto_servico_offline(uuid,uuid,uuid,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.preparar_execucao_offline(uuid,date,date,uuid,uuid),public.sincronizar_execucao_offline(uuid,uuid,jsonb,jsonb),public.reservar_foto_servico_offline(uuid,uuid,uuid,text,text,bigint,text) to authenticated;
create function public.consultar_execucoes_aparelho(p_oficina uuid,p_documento uuid,p_pagina integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.exigir_distribuicao(p_oficina);
 if p_pagina is null or p_pagina<0 or p_pagina>100000 then raise exception 'Página inválida.' using errcode='22023';end if;
 return coalesce((select jsonb_agg(to_jsonb(x)) from (select id, pedido->'dados'->>'anotacoes' as anotacoes, pedido->'dados'->>'iniciado_em' as iniciado_em,pedido->'dados'->>'finalizado_em' as finalizado_em,criado_em from public.execucoes_offline where oficina_id=p_oficina and documento_id=p_documento order by criado_em desc,id limit 30 offset p_pagina*30)x),'[]');
end $$;
revoke all on function public.consultar_execucoes_aparelho(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.consultar_execucoes_aparelho(uuid,uuid,integer) to authenticated;
