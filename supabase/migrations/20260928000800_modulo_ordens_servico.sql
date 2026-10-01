begin;
alter table public.ordens_servico add column chave_criacao uuid, add column responsavel text, add column checklist jsonb not null default '{}'::jsonb check(jsonb_typeof(checklist)='object');
create unique index os_chave_criacao on public.ordens_servico(oficina_id,chave_criacao);
alter table public.anexos_ordem_servico add column arquivado_em timestamptz;
create function private.exigir_os(p_oficina uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid; begin u:=private.require_staff(p_oficina); if not private.has_feature(p_oficina,'work_orders') then raise exception 'Ordens de serviço indisponíveis' using errcode='42501'; end if; return u; end $$;
create function private.evento_os(p_oficina uuid,p_os uuid,p_texto text,p_dados jsonb default '{}') returns void language plpgsql security definer set search_path='' as $$
declare r integer; begin
 update public.ordens_servico set revisao=revisao+1 where oficina_id=p_oficina and id=p_os returning revisao into r;
 insert into public.historico_ordem_servico(oficina_id,ordem_servico_id,tipo_evento,usuario_autor_id,descricao,metadados) values(p_oficina,p_os,'updated',auth.uid(),p_texto,p_dados);
 insert into public.eventos_negocio(oficina_id,tipo_evento,tipo_agregado,agregado_id,versao_agregado,chave_deduplicacao,dados) values(p_oficina,'work_order.updated','work_order',p_os,r,'os:'||p_os||':'||r,p_dados);
end $$;
create function public.consultar_ordem_servico(p_oficina uuid,p_os uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.ordens_servico%rowtype; begin
 perform private.exigir_os(p_oficina); select * into w from public.ordens_servico where oficina_id=p_oficina and id=p_os;
 if not found then raise exception 'OS não encontrada' using errcode='P0002'; end if;
 return to_jsonb(w)||jsonb_build_object(
 'itens',coalesce((select jsonb_agg(to_jsonb(i) order by posicao) from public.itens_ordem_servico i where oficina_id=p_oficina and ordem_servico_id=p_os),'[]'),
 'historico',coalesce((select jsonb_agg(to_jsonb(h) order by ocorrido_em desc,id) from public.historico_ordem_servico h where oficina_id=p_oficina and ordem_servico_id=p_os),'[]'),
 'paradas',coalesce((select jsonb_agg(to_jsonb(b) order by iniciado_em desc) from public.paradas_ordem_servico b where oficina_id=p_oficina and ordem_servico_id=p_os),'[]'),
 'fotos',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('caminho_arquivo',f.caminho_arquivo) order by a.capturado_em desc) from public.anexos_ordem_servico a join public.arquivos f on f.id=a.arquivo_id and f.oficina_id=a.oficina_id where a.oficina_id=p_oficina and a.ordem_servico_id=p_os and a.arquivado_em is null and f.situacao='ready'),'[]'));
end $$;
create function public.listar_ordens_servico(p_oficina uuid,p_busca text default '',p_situacao text default '',p_pagina integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare resultado jsonb; total bigint; begin
 perform private.exigir_os(p_oficina);
 select count(*) into total from public.ordens_servico w where oficina_id=p_oficina and (p_situacao='' or situacao=p_situacao) and concat(numero,' ',dados_cliente->>'nome',' ',dados_veiculo->>'modelo',' ',dados_veiculo->>'placa') ilike '%'||left(p_busca,120)||'%';
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into resultado from (select w.*, (select count(*) from public.paradas_ordem_servico b where b.oficina_id=p_oficina and b.ordem_servico_id=w.id and b.encerrado_em is null) as paradas_abertas from public.ordens_servico w where oficina_id=p_oficina and (p_situacao='' or situacao=p_situacao) and concat(numero,' ',dados_cliente->>'nome',' ',dados_veiculo->>'modelo',' ',dados_veiculo->>'placa') ilike '%'||left(p_busca,120)||'%' order by criado_em desc,id limit 24 offset greatest(0,p_pagina)*24) x;
 return jsonb_build_object('itens',resultado,'total',total);
end $$;
create function public.salvar_ordem_servico(p_oficina uuid,p_dados jsonb,p_chave uuid,p_os uuid default null,p_revisao integer default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid; w public.ordens_servico%rowtype; c public.clientes%rowtype; v public.veiculos%rowtype; n bigint; id_os uuid; campo text; begin
 u:=private.exigir_os(p_oficina);
 foreach campo in array array['queixa_cliente','diagnostico','observacoes_internas','resumo_cliente','pertences','condicoes_garantia'] loop if length(p_dados->>campo)>5000 then raise exception 'Texto muito longo' using errcode='22023'; end if; end loop;
 if length(p_dados->>'responsavel')>160 or length((p_dados->'checklist')::text)>2000 then raise exception 'Dados inválidos' using errcode='22023'; end if;
 if p_os is null then
  if p_chave is null then raise exception 'Chave obrigatória' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_chave::text,0));
  select id into id_os from public.ordens_servico where oficina_id=p_oficina and chave_criacao=p_chave; if found then return public.consultar_ordem_servico(p_oficina,id_os); end if;
  select * into c from public.clientes where oficina_id=p_oficina and id=(p_dados->>'cliente_id')::uuid and arquivado_em is null;
  select * into v from public.veiculos where oficina_id=p_oficina and id=(p_dados->>'veiculo_id')::uuid and arquivado_em is null;
  if c.id is null or v.id is null or not exists(select 1 from public.clientes_veiculos where oficina_id=p_oficina and cliente_id=c.id and veiculo_id=v.id and encerrado_em is null) then raise exception 'Selecione cliente e veículo vinculados' using errcode='22023'; end if;
  update public.oficinas set proximo_numero_os=proximo_numero_os+1 where id=p_oficina returning proximo_numero_os-1 into n;
  insert into public.ordens_servico(oficina_id,numero,cliente_id,veiculo_id,dados_cliente,dados_veiculo,criado_por,chave_criacao,recebido_em) values(p_oficina,n,c.id,v.id,jsonb_build_object('nome',c.nome,'telefone_e164',c.telefone_e164),jsonb_build_object('modelo',v.modelo,'marca',v.marca,'placa',v.placa),u,p_chave,now()) returning * into w;
 else
  select * into w from public.ordens_servico where oficina_id=p_oficina and id=p_os for update;
  if not found then raise exception 'OS não encontrada' using errcode='P0002'; end if;
  if p_revisao is distinct from w.revisao then raise exception 'OS alterada. Reabra antes de salvar.' using errcode='40001'; end if;
 end if;
 if w.situacao in ('delivered','cancelled') then raise exception 'OS encerrada: histórico preservado' using errcode='22023'; end if;
 update public.ordens_servico set queixa_cliente=p_dados->>'queixa_cliente',diagnostico=p_dados->>'diagnostico',observacoes_internas=p_dados->>'observacoes_internas',resumo_cliente=p_dados->>'resumo_cliente',responsavel=p_dados->>'responsavel',prioridade=coalesce(p_dados->>'prioridade','normal'),quilometragem_entrada=nullif(p_dados->>'quilometragem_entrada','')::integer,quilometragem_saida=nullif(p_dados->>'quilometragem_saida','')::integer,combustivel_percentual=nullif(p_dados->>'combustivel_percentual','')::smallint,pertences=p_dados->>'pertences',entrega_prevista_em=nullif(p_dados->>'entrega_prevista_em','')::timestamptz,condicoes_garantia=p_dados->>'condicoes_garantia',garantia_ate=nullif(p_dados->>'garantia_ate','')::date,checklist=coalesce(p_dados->'checklist','{}') where id=w.id;
 perform private.evento_os(p_oficina,w.id,case when p_os is null then 'Ordem de serviço aberta.' else 'Dados do atendimento atualizados.' end,jsonb_build_object('antes',to_jsonb(w),'depois',p_dados));
 return public.consultar_ordem_servico(p_oficina,w.id);
end $$;
create function public.registrar_anotacao_os(p_oficina uuid,p_os uuid,p_texto text) returns void language plpgsql security definer set search_path='' as $$
begin perform private.exigir_os(p_oficina); perform 1 from public.ordens_servico where oficina_id=p_oficina and id=p_os for update; if not found then raise exception 'OS não encontrada' using errcode='P0002'; end if;
 if length(trim(p_texto)) not between 1 and 3000 or p_texto is null then raise exception 'Informe a anotação' using errcode='22023'; end if;
 perform private.evento_os(p_oficina,p_os,trim(p_texto)); end $$;
create function public.salvar_item_os(p_oficina uuid,p_os uuid,p_revisao integer,p_dados jsonb,p_item uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare w public.ordens_servico%rowtype; i public.itens_ordem_servico%rowtype; n integer; begin
 perform private.exigir_os(p_oficina); select * into w from public.ordens_servico where oficina_id=p_oficina and id=p_os for update;
 if not found then raise exception 'OS não encontrada' using errcode='P0002'; end if;
 if w.revisao is distinct from p_revisao then raise exception 'Atualize a OS antes de alterar itens' using errcode='40001'; end if;
 if w.situacao in ('ready','delivered','cancelled') then raise exception 'Retorne à execução para alterar itens' using errcode='22023'; end if;
 if p_item is not null then
  select * into i from public.itens_ordem_servico where oficina_id=p_oficina and ordem_servico_id=p_os and id=p_item;
  if not found then raise exception 'Item não encontrado' using errcode='P0002'; end if;
  if p_dados->>'situacao' not in ('pending','in_progress','done') or p_dados->>'situacao' is null then raise exception 'Situação inválida' using errcode='22023'; end if;
  update public.itens_ordem_servico set situacao=p_dados->>'situacao',concluido_em=case when p_dados->>'situacao'='done' then now() else null end where id=p_item;
 else
  if w.orcamento_origem_id is not null then raise exception 'Itens aprovados são preservados. Emita orçamento separado para serviços adicionais.' using errcode='22023'; end if;
  if length(trim(p_dados->>'descricao')) not between 1 and 300 or p_dados->>'descricao' is null or (p_dados->>'quantidade')::numeric not between 0.001 and 100000 or (p_dados->>'preco_unitario_centavos')::bigint not between 0 and 100000000 then raise exception 'Item inválido' using errcode='22023'; end if;
  select count(*) into n from public.itens_ordem_servico where oficina_id=p_oficina and ordem_servico_id=p_os;
  if n>=100 then raise exception 'Limite de 100 itens' using errcode='22023'; end if;
  insert into public.itens_ordem_servico(oficina_id,ordem_servico_id,posicao,tipo,descricao,unidade,quantidade,preco_unitario_centavos) values(p_oficina,p_os,n,p_dados->>'tipo',trim(p_dados->>'descricao'),'un',(p_dados->>'quantidade')::numeric,(p_dados->>'preco_unitario_centavos')::bigint);
  update public.ordens_servico set subtotal_centavos=(select sum(total_item_centavos) from public.itens_ordem_servico where oficina_id=p_oficina and ordem_servico_id=p_os) where id=p_os;
 end if;
 perform private.evento_os(p_oficina,p_os,case when p_item is null then 'Item adicionado à OS.' else 'Execução do item atualizada.' end,jsonb_build_object('item',p_item,'dados',p_dados)); end $$;
-- Reserva autoriza somente um caminho novo para a oficina, autor e OS identificados.
create function public.reservar_foto_os(p_oficina uuid,p_os uuid,p_fase text,p_nome text,p_mime text,p_tamanho bigint,p_legenda text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid; f uuid:=gen_random_uuid(); caminho text; begin
 u:=private.exigir_os(p_oficina); if not private.has_feature(p_oficina,'service_media') then raise exception 'Fotos indisponíveis' using errcode='42501'; end if;
 perform 1 from public.ordens_servico where oficina_id=p_oficina and id=p_os and situacao not in ('delivered','cancelled') for update;
 if not found then raise exception 'OS indisponível para fotos' using errcode='22023'; end if;
 if p_fase is null or p_fase not in ('before','during','after') or p_mime is null or p_mime not in ('image/jpeg','image/png','image/webp') or p_tamanho is null or p_tamanho not between 1 and 10485760 or length(p_legenda)>500 then raise exception 'Use JPG, PNG ou WebP de até 10 MB' using errcode='22023'; end if;
 if (select count(*) from public.anexos_ordem_servico where oficina_id=p_oficina and ordem_servico_id=p_os)>=100 then raise exception 'Limite de 100 fotos por OS' using errcode='22023'; end if;
 caminho:=p_oficina||'/os/'||p_os||'/'||f;
 insert into public.arquivos(id,oficina_id,recipiente,caminho_arquivo,nome_original,tipo_mime,tamanho_bytes,criado_por) values(f,p_oficina,'workshop-files',caminho,left(coalesce(p_nome,'foto'),200),p_mime,p_tamanho,u);
 insert into public.anexos_ordem_servico(oficina_id,ordem_servico_id,arquivo_id,fase,legenda,enviado_por) values(p_oficina,p_os,f,p_fase,p_legenda,u);
 return jsonb_build_object('id',f,'caminho',caminho); end $$;
create function private.pode_enviar_foto_os(p_caminho text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.arquivos f join public.anexos_ordem_servico a on a.arquivo_id=f.id and a.oficina_id=f.oficina_id join public.ordens_servico w on w.id=a.ordem_servico_id and w.oficina_id=a.oficina_id where f.caminho_arquivo=p_caminho and f.recipiente='workshop-files' and f.situacao='pending' and f.criado_por=auth.uid() and f.criado_em>now()-interval '1 hour' and a.arquivado_em is null and w.situacao not in ('delivered','cancelled') and private.is_workshop_member(f.oficina_id) and private.has_feature(f.oficina_id,'service_media'));
$$;
create policy os_foto_insert on storage.objects for insert to authenticated with check(bucket_id='workshop-files' and private.pode_enviar_foto_os(name));
create function public.confirmar_foto_os(p_oficina uuid,p_arquivo uuid) returns void language plpgsql security definer set search_path='' as $$
declare f public.arquivos%rowtype; id_os uuid; begin
 perform private.exigir_os(p_oficina);
 if not private.has_feature(p_oficina,'service_media') then raise exception 'Fotos indisponíveis' using errcode='42501'; end if;
 select ordem_servico_id into id_os from public.anexos_ordem_servico where oficina_id=p_oficina and arquivo_id=p_arquivo and arquivado_em is null;
 perform 1 from public.ordens_servico where oficina_id=p_oficina and id=id_os and situacao not in ('delivered','cancelled') for update;
 if not found then raise exception 'OS indisponível' using errcode='22023'; end if;
 select * into f from public.arquivos where oficina_id=p_oficina and id=p_arquivo and criado_por=auth.uid() for update;
 if not found then raise exception 'Foto não encontrada' using errcode='P0002'; end if;
 if f.situacao='ready' then return; end if;
 if f.situacao<>'pending' or not exists(select 1 from storage.objects where bucket_id=f.recipiente and name=f.caminho_arquivo) then raise exception 'Envio da foto não concluído' using errcode='22023'; end if;
 update public.arquivos set situacao='ready' where id=f.id;
 perform private.evento_os(p_oficina,id_os,'Foto adicionada ao atendimento.',jsonb_build_object('arquivo',f.id)); end $$;
do $$ declare f record; begin for f in select p.oid::regprocedure as assinatura from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='public' and p.proname in ('consultar_ordem_servico','listar_ordens_servico','salvar_ordem_servico','registrar_anotacao_os','salvar_item_os','reservar_foto_os','confirmar_foto_os')) or (n.nspname='private' and p.proname in ('exigir_os','evento_os','pode_enviar_foto_os')) loop execute format('revoke all on function %s from public,anon,authenticated',f.assinatura); end loop; end $$;
grant execute on function private.pode_enviar_foto_os(text) to authenticated;
grant execute on function public.consultar_ordem_servico(uuid,uuid),public.listar_ordens_servico(uuid,text,text,integer),public.salvar_ordem_servico(uuid,jsonb,uuid,uuid,integer),public.registrar_anotacao_os(uuid,uuid,text),public.salvar_item_os(uuid,uuid,integer,jsonb,uuid),public.reservar_foto_os(uuid,uuid,text,text,text,bigint,text),public.confirmar_foto_os(uuid,uuid) to authenticated;
-- Impede concluir serviços ainda pendentes por qualquer RPC de atualização.
create function private.conferir_entrega_os() returns trigger language plpgsql set search_path='' as $$
begin
 if new.situacao in ('ready','delivered') and new.situacao<>old.situacao and exists(select 1 from public.itens_ordem_servico where oficina_id=new.oficina_id and ordem_servico_id=new.id and situacao not in ('done','cancelled')) then
 raise exception 'Conclua os itens pendentes antes de liberar o veículo.' using errcode='22023'; end if;
 return new;
end $$;
revoke all on function private.conferir_entrega_os() from public,anon,authenticated;
create trigger os_conferir_entrega before update on public.ordens_servico for each row execute function private.conferir_entrega_os();
create function private.pode_ler_foto_os(p_bucket text,p_caminho text) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.arquivos f join public.anexos_ordem_servico a on a.arquivo_id=f.id and a.oficina_id=f.oficina_id where f.caminho_arquivo=p_caminho and f.recipiente=p_bucket)
 or exists(select 1 from public.arquivos f join public.anexos_ordem_servico a on a.arquivo_id=f.id and a.oficina_id=f.oficina_id where f.caminho_arquivo=p_caminho and f.recipiente=p_bucket and a.arquivado_em is null and private.is_workshop_member(f.oficina_id) and private.has_feature(f.oficina_id,'service_media'));
$$;
revoke all on function private.pode_ler_foto_os(text,text) from public,anon,authenticated;
grant execute on function private.pode_ler_foto_os(text,text) to authenticated;
create policy os_fotos_plano_leitura on storage.objects as restrictive for select to authenticated using (private.pode_ler_foto_os(bucket_id,name));
notify pgrst,'reload schema';
commit;
