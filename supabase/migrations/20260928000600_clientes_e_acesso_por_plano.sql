begin;

alter table public.clientes
  add column tipo text not null default 'pessoa_fisica' check (tipo in ('pessoa_fisica','pessoa_juridica')),
  add column endereco text not null default '' check (length(endereco)<=1000),
  add column observacoes text not null default '' check (length(observacoes)<=2000),
  add column revisao integer not null default 1 check (revisao>0);
comment on column public.clientes.revisao is 'Controle de concorrência: impede sobrescrever uma edição mais recente.';
comment on column public.clientes.arquivado_em is 'Exclusão reversível. Preserva os vínculos com serviços e orçamentos.';
create index clientes_lista_ativos on public.clientes(oficina_id,nome,id) where arquivado_em is null;
create policy clientes_lixeira_gerencia on public.clientes as restrictive for select to authenticated using (
  arquivado_em is null or exists(select 1 from public.membros_oficina m where m.oficina_id=clientes.oficina_id
    and m.usuario_id=(select auth.uid()) and m.ativo and m.perfil in ('owner','manager'))
);

create or replace function private.has_feature(p_workshop_id uuid,p_feature text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.assinaturas_oficina s
    join public.recursos_plano f on f.codigo_plano=s.codigo_plano
    join public.planos p on p.codigo=s.codigo_plano
    join public.oficinas o on o.id=s.oficina_id and o.arquivado_em is null
    where s.oficina_id=p_workshop_id and s.situacao in ('active','trialing')
      and (s.valido_ate is null or s.valido_ate>now()) and p.ativo
      and f.codigo_recurso=p_feature and f.habilitado);
$$;
create or replace function private.can_read_workshop_object(p_bucket text,p_path text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.arquivos f where f.recipiente=p_bucket and f.caminho_arquivo=p_path and f.situacao='ready'
    and private.is_workshop_member(f.oficina_id)
    and (private.has_feature(f.oficina_id,'quotes') or private.has_feature(f.oficina_id,'service_media')));
$$;

-- Políticas restritivas somam a exigência do plano à política de isolamento da oficina.
do $$
declare r record;
begin
  for r in select * from (values
    ('clientes','customers'),('veiculos','customers'),('clientes_veiculos','customers'),
    ('itens_catalogo','catalog'),('notas_atendimento','simple_notes'),('itens_nota_atendimento','simple_notes'),
    ('orcamentos','quotes'),('versoes_orcamento','quotes'),('itens_orcamento','quotes'),
    ('anexos_orcamento','quotes'),('documentos_orcamento','quotes'),('tokens_acesso_orcamento','quotes'),('aprovacoes_orcamento','quotes'),
    ('ordens_servico','work_orders'),('itens_ordem_servico','work_orders'),('responsaveis_ordem_servico','work_orders'),('historico_ordem_servico','work_orders'),
    ('etapas_producao','production_board'),('locais_oficina','production_board'),('paradas_ordem_servico','production_board'),
    ('anexos_ordem_servico','service_media'),('verificacoes_ordem_servico','service_media'),
    ('sites_oficina','website'),('produtos_site','website'),('acessos_portal_cliente','customer_portal'),
    ('pedidos_pecas','parts_requests'),('itens_pedido_pecas','parts_requests'),
    ('conexoes_integracao','automations'),('execucoes_automacao','automations'),('assinaturas_eventos','automations'),
    ('chaves_api_integracao','automations'),('entregas_evento','automations'),('acoes_agendadas','automations'),
    ('execucoes_ia','ai'),('conexoes_whatsapp','quotes'),('fila_mensagens','quotes'),('eventos_mensagem','quotes')
  ) as mapa(tabela,recurso) loop
    execute format('create policy acesso_plano on public.%I as restrictive for select to authenticated using (private.has_feature(oficina_id,%L))',r.tabela,r.recurso);
  end loop;
end $$;

create function private.registrar_evento_cliente()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_evento text;
begin
  if tg_op='INSERT' then v_evento:='cliente.cadastrado';
  elsif new.arquivado_em is distinct from old.arquivado_em then v_evento:=case when new.arquivado_em is null then 'cliente.restaurado' else 'cliente.arquivado' end;
  else v_evento:='cliente.editado'; end if;
  insert into public.eventos_negocio(oficina_id,tipo_evento,tipo_agregado,agregado_id,versao_agregado,chave_deduplicacao,dados)
  values(new.oficina_id,v_evento,'cliente',new.id,new.revisao,
    'cliente:'||new.id||':'||gen_random_uuid(),jsonb_build_object('cliente_id',new.id,'revisao',new.revisao));
  return new;
end $$;
revoke all on function private.registrar_evento_cliente() from public,anon,authenticated;
create trigger evento_cliente after insert or update on public.clientes for each row execute function private.registrar_evento_cliente();

create or replace function public.consultar_meu_acesso()
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',o.id,'nome',o.nome,'perfil',m.perfil,'codigo_plano',s.codigo_plano,
    'nome_plano',p.nome,'situacao',s.situacao,'valido_ate',s.valido_ate,
    'recursos',(select coalesce(jsonb_agg(r.codigo order by r.codigo),'[]'::jsonb)
      from public.recursos r where private.has_feature(o.id,r.codigo))
  ) order by o.nome,o.id),'[]'::jsonb)
  from public.membros_oficina m join public.oficinas o on o.id=m.oficina_id
  left join public.assinaturas_oficina s on s.oficina_id=o.id
  left join public.planos p on p.codigo=s.codigo_plano
  where m.usuario_id=(select auth.uid()) and m.ativo and o.arquivado_em is null;
$$;

create or replace function private.exigir_clientes(p_oficina uuid,p_administrador boolean default false)
returns uuid language plpgsql stable security definer set search_path='' as $$
declare v_usuario uuid;
begin
  v_usuario:=private.require_staff(p_oficina);
  if not private.has_feature(p_oficina,'customers') or not exists(select 1 from public.oficinas where id=p_oficina and arquivado_em is null) then
    raise exception 'Seu plano não permite acessar clientes. Verifique a assinatura.' using errcode='42501';
  end if;
  if p_administrador and not exists(select 1 from public.membros_oficina where oficina_id=p_oficina and usuario_id=v_usuario and ativo and perfil in ('owner','manager')) then
    raise exception 'Somente o proprietário ou gerente pode excluir e restaurar clientes.' using errcode='42501';
  end if;
  return v_usuario;
end $$;

create function public.listar_clientes(p_oficina uuid,p_busca text default '',p_arquivados boolean default false,p_pagina integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_total bigint; v_itens jsonb; v_busca text:=lower(trim(coalesce(p_busca,'')));
begin
  perform private.exigir_clientes(p_oficina,p_arquivados);
  if p_pagina is null or p_pagina<0 or p_pagina>100000 or length(v_busca)>200 or p_arquivados is null then raise exception 'Filtro inválido.' using errcode='22023'; end if;
  select count(*) into v_total from public.clientes c where c.oficina_id=p_oficina
    and (c.arquivado_em is not null)=p_arquivados
    and (v_busca='' or strpos(lower(c.nome||' '||coalesce(c.email,'')||' '||coalesce(c.telefone_e164,'')),v_busca)>0);
  select coalesce(jsonb_agg(to_jsonb(t) order by t.nome,t.id),'[]'::jsonb) into v_itens from (
    select c.* from public.clientes c where c.oficina_id=p_oficina and (c.arquivado_em is not null)=p_arquivados
      and (v_busca='' or strpos(lower(c.nome||' '||coalesce(c.email,'')||' '||coalesce(c.telefone_e164,'')),v_busca)>0)
    order by c.nome,c.id limit 24 offset p_pagina*24
  ) t;
  return jsonb_build_object('itens',v_itens,'total',v_total);
end $$;

-- Um único ponto de validação para cadastro e edição. Nenhum campo de oficina vem do JSON.
create function public.salvar_cliente(p_oficina uuid,p_dados jsonb,p_cliente uuid default null,p_revisao integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_usuario uuid; v_cliente public.clientes; v_nome text:=trim(p_dados->>'nome');
  v_telefone text:=nullif(trim(p_dados->>'telefone_e164'),''); v_email text:=nullif(lower(trim(p_dados->>'email')),'');
  v_tipo text:=coalesce(p_dados->>'tipo','pessoa_fisica'); v_endereco text:=trim(coalesce(p_dados->>'endereco','')); v_obs text:=trim(coalesce(p_dados->>'observacoes',''));
begin
  v_usuario:=private.exigir_clientes(p_oficina);
  if jsonb_typeof(p_dados) is distinct from 'object' or v_nome is null or length(v_nome) not between 2 and 160
    or (v_telefone is not null and v_telefone !~ '^\+[1-9][0-9]{7,14}$')
    or (v_email is not null and (length(v_email)>254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
    or v_tipo not in ('pessoa_fisica','pessoa_juridica') or length(v_endereco)>1000 or length(v_obs)>2000 then
    raise exception 'Confira nome, telefone, e-mail e tamanho dos campos.' using errcode='22023';
  end if;
  if p_cliente is null then
    insert into public.clientes(oficina_id,nome,telefone_e164,email,tipo,endereco,observacoes)
      values(p_oficina,v_nome,v_telefone,v_email,v_tipo,v_endereco,v_obs) returning * into v_cliente;
  else
    select * into v_cliente from public.clientes where oficina_id=p_oficina and id=p_cliente and arquivado_em is null for update;
    if not found then raise exception 'Cliente não encontrado.' using errcode='P0002'; end if;
    if p_revisao is distinct from v_cliente.revisao then raise exception 'Este cliente foi alterado por outra pessoa. Atualize a lista e abra o cadastro novamente.' using errcode='40001'; end if;
    update public.clientes set nome=v_nome,telefone_e164=v_telefone,email=v_email,tipo=v_tipo,endereco=v_endereco,
      observacoes=v_obs,revisao=revisao+1,atualizado_em=now() where id=p_cliente and oficina_id=p_oficina returning * into v_cliente;
  end if;
  insert into public.registros_auditoria(oficina_id,usuario_autor_id,tipo_autor,acao,tipo_entidade,entidade_id,correlacao_id)
    values(p_oficina,v_usuario,'user',case when p_cliente is null then 'cliente.cadastrado' else 'cliente.editado' end,'cliente',v_cliente.id,gen_random_uuid());
  return to_jsonb(v_cliente);
end $$;

create function public.definir_arquivamento_cliente(p_oficina uuid,p_cliente uuid,p_revisao integer,p_arquivar boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_usuario uuid; v_cliente public.clientes;
begin
  v_usuario:=private.exigir_clientes(p_oficina,true);
  if p_arquivar is null then raise exception 'Informe a ação.' using errcode='22023'; end if;
  select * into v_cliente from public.clientes where oficina_id=p_oficina and id=p_cliente for update;
  if not found then raise exception 'Cliente não encontrado.' using errcode='P0002'; end if;
  if p_revisao is distinct from v_cliente.revisao then raise exception 'Este cliente foi alterado. Atualize a lista e tente novamente.' using errcode='40001'; end if;
  update public.clientes set arquivado_em=case when p_arquivar then now() else null end,revisao=revisao+1,atualizado_em=now()
    where oficina_id=p_oficina and id=p_cliente returning * into v_cliente;
  if p_arquivar then
    update public.acessos_portal_cliente set revogado_em=now() where oficina_id=p_oficina and cliente_id=p_cliente and revogado_em is null;
  end if;
  insert into public.registros_auditoria(oficina_id,usuario_autor_id,tipo_autor,acao,tipo_entidade,entidade_id,correlacao_id)
    values(p_oficina,v_usuario,'user',case when p_arquivar then 'cliente.arquivado' else 'cliente.restaurado' end,'cliente',p_cliente,gen_random_uuid());
  return to_jsonb(v_cliente);
end $$;

create or replace function private.has_portal_access(p_workshop uuid,p_customer uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select private.has_feature(p_workshop,'customer_portal') and exists (
    select 1 from public.acessos_portal_cliente a join public.sites_oficina s on s.oficina_id=a.oficina_id
    join public.clientes c on c.oficina_id=a.oficina_id and c.id=a.cliente_id and c.arquivado_em is null
    where a.oficina_id=p_workshop and a.cliente_id=p_customer and a.usuario_id=(select auth.uid())
      and a.revogado_em is null and s.publicado and s.portal_habilitado);
$$;

revoke all on function private.exigir_clientes(uuid,boolean) from public,anon,authenticated;
revoke all on function public.consultar_meu_acesso(),public.listar_clientes(uuid,text,boolean,integer),public.salvar_cliente(uuid,jsonb,uuid,integer),public.definir_arquivamento_cliente(uuid,uuid,integer,boolean) from public,anon;
grant execute on function public.consultar_meu_acesso(),public.listar_clientes(uuid,text,boolean,integer),public.salvar_cliente(uuid,jsonb,uuid,integer),public.definir_arquivamento_cliente(uuid,uuid,integer,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
