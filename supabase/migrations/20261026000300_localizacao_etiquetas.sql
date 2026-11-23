begin;

-- Custódia física: não altera saldos, pagamentos ou etapas do serviço.
create table public.locais_fisicos (
 id uuid primary key, oficina_id uuid not null references public.oficinas(id),
 codigo text not null unique default ('PTL-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16))),
 nome text not null check(length(trim(nome)) between 2 and 100),
 descricao text not null default '' check(length(descricao)<=500),
 ativo boolean not null default true, revisao integer not null default 1,
 criado_em timestamptz not null default now(), unique(oficina_id,id)
);
create unique index locais_fisicos_nome on public.locais_fisicos(oficina_id,lower(trim(nome))) where ativo;
create index locais_fisicos_lista on public.locais_fisicos(oficina_id,ativo,nome,id);

create table public.itens_fisicos (
 id uuid primary key, oficina_id uuid not null references public.oficinas(id),
 codigo text not null unique default ('PTI-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16))),
 descricao text not null check(length(trim(descricao)) between 2 and 180),
 categoria text not null check(categoria in ('equipamento','veiculo','acessorio','chave','peca','outro')),
 codigo_externo text not null default '' check(length(codigo_externo)<=100),
 observacoes text not null default '' check(length(observacoes)<=2000),
 local_id uuid, principal_id uuid, cliente_id uuid, ordem_servico_id uuid, orcamento_id uuid,
 atendimento_id uuid, objeto_id uuid, produto_id uuid,
 situacao text not null default 'na_empresa' check(situacao in ('na_empresa','externo','entregue','nao_localizado')),
 com_quem text not null default '' check(length(com_quem)<=160),
 revisao integer not null default 1, criado_por uuid not null references auth.users(id),
 criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
 unique(oficina_id,id), check(principal_id is distinct from id),
 check(num_nonnulls(ordem_servico_id,orcamento_id,atendimento_id,produto_id)<=1),
 check(situacao='na_empresa' or local_id is null),
 foreign key(oficina_id,local_id) references public.locais_fisicos(oficina_id,id),
 foreign key(oficina_id,principal_id) references public.itens_fisicos(oficina_id,id),
 foreign key(oficina_id,cliente_id) references public.clientes(oficina_id,id),
 foreign key(oficina_id,ordem_servico_id) references public.ordens_servico(oficina_id,id),
 foreign key(oficina_id,orcamento_id) references public.orcamentos(oficina_id,id),
 foreign key(oficina_id,atendimento_id) references public.atendimentos_servicos(oficina_id,id),
 foreign key(oficina_id,objeto_id) references public.objetos_atendimento(oficina_id,id),
 foreign key(oficina_id,produto_id) references public.estoque_produtos(oficina_id,item_catalogo_id)
);
create index itens_fisicos_lista on public.itens_fisicos(oficina_id,criado_em desc,id desc);
create index itens_fisicos_local on public.itens_fisicos(oficina_id,local_id,criado_em desc,id desc);
create index itens_fisicos_estado on public.itens_fisicos(oficina_id,situacao,criado_em desc,id desc);
create index itens_fisicos_os on public.itens_fisicos(oficina_id,ordem_servico_id);
create index itens_fisicos_orcamento on public.itens_fisicos(oficina_id,orcamento_id);
create index itens_fisicos_atendimento on public.itens_fisicos(oficina_id,atendimento_id);
create index itens_fisicos_objeto on public.itens_fisicos(oficina_id,objeto_id);
create index itens_fisicos_produto on public.itens_fisicos(oficina_id,produto_id);
create index itens_fisicos_principal on public.itens_fisicos(oficina_id,principal_id);
do $$ declare ns text; begin
 select n.nspname into ns from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pg_trgm';
 execute format('create index itens_fisicos_busca on public.itens_fisicos using gin ((lower(descricao||'' ''||codigo_externo||'' ''||codigo)) %I.gin_trgm_ops)',ns);
end $$;

create table public.operacoes_localizacao (
 oficina_id uuid not null references public.oficinas(id), chave uuid not null,
 pedido jsonb not null, resultado jsonb not null, criado_em timestamptz not null default now(),
 primary key(oficina_id,chave)
);
create table public.historico_localizacao (
 id bigint generated always as identity primary key, oficina_id uuid not null, item_id uuid not null,
 acao text not null, antes jsonb, depois jsonb not null, observacoes text not null default '',
 autor_id uuid not null references auth.users(id), autor_nome text not null,
 criado_em timestamptz not null default now(),
 foreign key(oficina_id,item_id) references public.itens_fisicos(oficina_id,id)
);
create index historico_localizacao_item on public.historico_localizacao(oficina_id,item_id,id desc);
alter table public.locais_fisicos enable row level security;
alter table public.itens_fisicos enable row level security;
alter table public.operacoes_localizacao enable row level security;
alter table public.historico_localizacao enable row level security;
revoke all on public.locais_fisicos,public.itens_fisicos,public.operacoes_localizacao,public.historico_localizacao from public,anon,authenticated;
create trigger historico_localizacao_imutavel before update or delete on public.historico_localizacao for each row execute function private.reject_mutation();
create trigger operacoes_localizacao_imutaveis before update or delete on public.operacoes_localizacao for each row execute function private.reject_mutation();

create function private.exigir_localizacao(p_oficina uuid,p_gerencia boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid;begin
 u:=private.exigir_os(p_oficina);
 if p_gerencia and not exists(select 1 from public.membros_oficina where oficina_id=p_oficina and usuario_id=u and ativo and perfil in ('owner','manager')) then
  raise exception 'Somente a gerência pode alterar os locais.' using errcode='42501';
 end if;
 return u;
end $$;

create function public.consultar_vinculo_localizacao(p_oficina uuid,p_tipo text,p_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r jsonb;begin
 perform private.exigir_localizacao(p_oficina);
 if p_tipo='os' then
  select jsonb_build_object('tipo','os','id',o.id,'titulo','OS #'||o.numero,'descricao',coalesce(nullif(o.dados_veiculo->>'modelo',''),v.modelo,''),'cliente_id',o.cliente_id,'cliente',coalesce(c.nome,o.dados_cliente->>'nome',''),'ordem_servico_id',o.id)
   into r from public.ordens_servico o left join public.veiculos v on v.id=o.veiculo_id and v.oficina_id=o.oficina_id left join public.clientes c on c.id=o.cliente_id and c.oficina_id=o.oficina_id where o.oficina_id=p_oficina and o.id=p_id;
 elsif p_tipo='orcamento' then
  select jsonb_build_object('tipo','orcamento','id',o.id,'titulo','Orçamento #'||o.numero,'descricao',coalesce(nullif(ver.dados_veiculo->>'modelo',''),v.modelo,''),'cliente_id',o.cliente_id,'cliente',coalesce(c.nome,ver.dados_cliente->>'nome',''),'orcamento_id',o.id)
   into r from public.orcamentos o left join public.versoes_orcamento ver on ver.id=o.versao_atual_id and ver.oficina_id=o.oficina_id left join public.veiculos v on v.id=o.veiculo_id and v.oficina_id=o.oficina_id left join public.clientes c on c.id=o.cliente_id and c.oficina_id=o.oficina_id where o.oficina_id=p_oficina and o.id=p_id and o.arquivado_em is null;
 elsif p_tipo='atendimento' then
  select jsonb_build_object('tipo','atendimento','id',a.id,'titulo',case when a.situacao='orcamento' and coalesce(a.dados->>'documento','')<>'ordem' then 'Orçamento #' else 'OS #' end||a.numero,'descricao',coalesce(o.nome,a.titulo),'cliente_id',a.cliente_id,'cliente',coalesce(c.nome,''),'atendimento_id',a.id,'objeto_id',a.objeto_id)
   into r from public.atendimentos_servicos a left join public.objetos_atendimento o on o.id=a.objeto_id and o.oficina_id=a.oficina_id left join public.clientes c on c.id=a.cliente_id and c.oficina_id=a.oficina_id where a.oficina_id=p_oficina and a.id=p_id;
 elsif p_tipo='objeto' then
  select jsonb_build_object('tipo','objeto','id',o.id,'titulo',o.nome,'descricao',o.nome,'cliente_id',o.cliente_id,'cliente',coalesce(c.nome,''),'objeto_id',o.id)
   into r from public.objetos_atendimento o left join public.clientes c on c.id=o.cliente_id and c.oficina_id=o.oficina_id where o.oficina_id=p_oficina and o.id=p_id;
 elsif p_tipo='estoque' then
  perform private.exigir_estoque(p_oficina);
  select jsonb_build_object('tipo','estoque','id',p.item_catalogo_id,'titulo',c.descricao,'descricao',c.descricao,'produto_id',p.item_catalogo_id,'local_sugerido',p.localizacao)
   into r from public.estoque_produtos p join public.itens_catalogo c on c.id=p.item_catalogo_id and c.oficina_id=p.oficina_id where p.oficina_id=p_oficina and p.item_catalogo_id=p_id;
 else raise exception 'Vínculo inválido.' using errcode='22023';
 end if;
 if r is null then raise exception 'Registro indisponível nesta empresa.' using errcode='42501';end if;
 return r;
end $$;

create function public.salvar_local_fisico(p_oficina uuid,p_id uuid,p_nome text,p_descricao text default '',p_ativo boolean default true,p_revisao integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l public.locais_fisicos;begin
 perform private.exigir_localizacao(p_oficina,true);
 if p_id is null or length(trim(coalesce(p_nome,''))) not between 2 and 100 or length(coalesce(p_descricao,''))>500 or p_ativo is null then raise exception 'Confira o nome e os detalhes do local.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_id::text,0));
 select * into l from public.locais_fisicos where oficina_id=p_oficina and id=p_id for update;
 if found then
  if p_revisao is null then
   if l.nome<>trim(p_nome) or l.descricao<>trim(coalesce(p_descricao,'')) or l.ativo<>p_ativo then raise exception 'Este local já foi salvo. Abra o cadastro para editá-lo.' using errcode='22023';end if;
   return to_jsonb(l);
  end if;
  if l.revisao<>p_revisao then raise exception 'O local mudou. Atualize a tela.' using errcode='PT409';end if;
  if not p_ativo and exists(select 1 from public.itens_fisicos where oficina_id=p_oficina and local_id=p_id) then raise exception 'Mova os itens deste local antes de desativá-lo.' using errcode='22023';end if;
  update public.locais_fisicos set nome=trim(p_nome),descricao=trim(coalesce(p_descricao,'')),ativo=p_ativo,revisao=revisao+1 where id=p_id returning * into l;
 else
  if p_revisao is not null then raise exception 'Local indisponível.' using errcode='42501';end if;
  insert into public.locais_fisicos(id,oficina_id,nome,descricao,ativo) values(p_id,p_oficina,trim(p_nome),trim(coalesce(p_descricao,'')),p_ativo) returning * into l;
 end if;
 return to_jsonb(l);
exception when unique_violation then raise exception 'Já existe um local com esse nome.' using errcode='22023';
end $$;

create function public.listar_locais_fisicos(p_oficina uuid,p_busca text default '',p_inativos boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.exigir_localizacao(p_oficina);
 return (select coalesce(jsonb_agg(to_jsonb(l) order by nome,id),'[]') from (select * from public.locais_fisicos where oficina_id=p_oficina and (ativo or p_inativos) and (nome ilike '%'||left(trim(coalesce(p_busca,'')),100)||'%' or codigo=upper(trim(p_busca))) order by nome,id limit 100) l);
end $$;

create function private.dados_item_fisico(p_item public.itens_fisicos) returns jsonb
language sql stable security definer set search_path='' as $$
 select to_jsonb(p_item)||jsonb_build_object('local_nome',l.nome,'cliente_nome',coalesce(c.nome,o.dados_cliente->>'nome',ver.dados_cliente->>'nome'),'principal_descricao',pai.descricao,
  'documento_rotulo',case when o.id is not null then 'OS' when q.id is not null then 'Orçamento' when a.id is not null then case when a.situacao='orcamento' and coalesce(a.dados->>'documento','')<>'ordem' then 'Orçamento' else 'OS' end end,
  'os_vinculada',o.id,'numero',coalesce(o.numero,q.numero,a.numero),
  'vinculo_tipo',case when p_item.atendimento_id is not null then 'atendimento' when o.id is not null then 'os' when p_item.orcamento_id is not null then 'orcamento' when p_item.produto_id is not null then 'estoque' when p_item.objeto_id is not null then 'objeto' end)
 from (select 1) s left join public.locais_fisicos l on l.id=p_item.local_id and l.oficina_id=p_item.oficina_id
 left join public.clientes c on c.id=p_item.cliente_id and c.oficina_id=p_item.oficina_id
 left join public.itens_fisicos pai on pai.id=p_item.principal_id and pai.oficina_id=p_item.oficina_id
 left join public.orcamentos q on q.id=p_item.orcamento_id and q.oficina_id=p_item.oficina_id
 left join public.versoes_orcamento ver on ver.id=q.versao_atual_id and ver.oficina_id=p_item.oficina_id
 left join public.ordens_servico o on (o.id=p_item.ordem_servico_id or o.orcamento_origem_id=q.id or (o.orcamento_aguardando_id=q.id and o.situacao<>'cancelled')) and o.oficina_id=p_item.oficina_id
 left join public.atendimentos_servicos a on a.id=p_item.atendimento_id and a.oficina_id=p_item.oficina_id
$$;
create function private.registrar_historico_localizacao(p_antes public.itens_fisicos,p_depois public.itens_fisicos,p_acao text,p_observacoes text default '') returns void
language plpgsql security definer set search_path='' as $$ begin
 insert into public.historico_localizacao(oficina_id,item_id,acao,antes,depois,observacoes,autor_id,autor_nome)
 values(p_depois.oficina_id,p_depois.id,p_acao,case when p_antes.id is null then null else private.dados_item_fisico(p_antes) end,private.dados_item_fisico(p_depois),coalesce(p_observacoes,''),auth.uid(),coalesce((select email from auth.users where id=auth.uid()),'Membro da equipe')); end
$$;

create function public.salvar_item_fisico(p_oficina uuid,p_id uuid,p_dados jsonb,p_revisao integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid; i public.itens_fisicos; anterior public.itens_fisicos; pai public.itens_fisicos; v jsonb; local uuid; principal uuid;begin
 u:=private.exigir_localizacao(p_oficina);
 if p_id is null or jsonb_typeof(p_dados) is distinct from 'object' or length(p_dados::text)>16000 or length(trim(coalesce(p_dados->>'descricao',''))) not between 2 and 180
  or coalesce(p_dados->>'categoria','') not in ('equipamento','veiculo','acessorio','chave','peca','outro') or length(coalesce(p_dados->>'codigo_externo',''))>100 or length(coalesce(p_dados->>'observacoes',''))>2000 then raise exception 'Confira a descrição, categoria e identificação do item.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_id::text,0));
 select * into i from public.itens_fisicos where oficina_id=p_oficina and id=p_id for update;
 if found then
  if p_revisao is null then return private.dados_item_fisico(i);end if;
  if i.revisao<>p_revisao then raise exception 'O item mudou. Atualize antes de salvar.' using errcode='PT409';end if;
  anterior:=i;
  -- O vínculo e a custódia são preservados durante uma correção da identificação.
  update public.itens_fisicos set descricao=trim(p_dados->>'descricao'),categoria=p_dados->>'categoria',codigo_externo=trim(coalesce(p_dados->>'codigo_externo','')),observacoes=trim(coalesce(p_dados->>'observacoes','')),revisao=revisao+1,atualizado_em=now() where id=p_id returning * into i;
  perform private.registrar_historico_localizacao(anterior,i,'identificacao');
 else
  if p_revisao is not null then raise exception 'Item indisponível.' using errcode='42501';end if;
  local:=nullif(p_dados->>'local_id','')::uuid;principal:=nullif(p_dados->>'principal_id','')::uuid;
  if local is not null then
   perform 1 from public.locais_fisicos where oficina_id=p_oficina and id=local and ativo for share;
   if not found then raise exception 'Selecione um local ativo desta empresa.' using errcode='42501';end if;
  end if;
  if principal is not null then
   select * into pai from public.itens_fisicos where oficina_id=p_oficina and id=principal for share;
   if not found or pai.principal_id is not null or pai.situacao='entregue' then raise exception 'O item principal não está disponível para receber acessórios.' using errcode='22023';end if;
   v:=jsonb_build_object('cliente_id',pai.cliente_id,'ordem_servico_id',pai.ordem_servico_id,'orcamento_id',pai.orcamento_id,'atendimento_id',pai.atendimento_id,'objeto_id',pai.objeto_id,'produto_id',pai.produto_id);
  elsif nullif(p_dados->'vinculo'->>'id','') is not null then
   v:=public.consultar_vinculo_localizacao(p_oficina,p_dados->'vinculo'->>'tipo',(p_dados->'vinculo'->>'id')::uuid);
  end if;
  insert into public.itens_fisicos(id,oficina_id,descricao,categoria,codigo_externo,observacoes,local_id,principal_id,cliente_id,ordem_servico_id,orcamento_id,atendimento_id,objeto_id,produto_id,criado_por)
   values(p_id,p_oficina,trim(p_dados->>'descricao'),p_dados->>'categoria',trim(coalesce(p_dados->>'codigo_externo','')),trim(coalesce(p_dados->>'observacoes','')),local,principal,(v->>'cliente_id')::uuid,(v->>'ordem_servico_id')::uuid,(v->>'orcamento_id')::uuid,(v->>'atendimento_id')::uuid,(v->>'objeto_id')::uuid,(v->>'produto_id')::uuid,u) returning * into i;
  perform private.registrar_historico_localizacao(anterior,i,'entrada');
 end if;
 return private.dados_item_fisico(i);
end $$;

create function public.registrar_conjunto_fisico(p_oficina uuid,p_id uuid,p_dados jsonb,p_acessorios jsonb default '[]') returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb; a jsonb; lista jsonb:='[]'; pedido jsonb; repetida public.operacoes_localizacao;begin
 perform private.exigir_localizacao(p_oficina);
 if jsonb_typeof(p_acessorios) is distinct from 'array' or jsonb_array_length(p_acessorios)>20 then raise exception 'Registre até 20 acessórios por vez.' using errcode='22023';end if;
 if (select count(distinct (value->>'id')::uuid) from jsonb_array_elements(p_acessorios))<>jsonb_array_length(p_acessorios) then raise exception 'Identificações repetidas ou ausentes.' using errcode='22023';end if;
 pedido:=jsonb_build_object('acao','entrada','dados',p_dados,'acessorios',p_acessorios);
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_id::text,0));
 select * into repetida from public.operacoes_localizacao where oficina_id=p_oficina and chave=p_id;
 if found then
  if repetida.pedido is distinct from pedido then raise exception 'Este cadastro já foi salvo. Localize o item para corrigir sua identificação.' using errcode='22023';end if;
  return repetida.resultado;
 end if;
 r:=public.salvar_item_fisico(p_oficina,p_id,p_dados);lista:=lista||jsonb_build_array(r);
 for a in select value from jsonb_array_elements(p_acessorios) loop
  if (a->>'id')::uuid=p_id then raise exception 'Identificações repetidas.' using errcode='22023';end if;
  r:=public.salvar_item_fisico(p_oficina,(a->>'id')::uuid,a||jsonb_build_object('principal_id',p_id,'local_id',p_dados->>'local_id'));
  lista:=lista||jsonb_build_array(r);
 end loop;
 insert into public.operacoes_localizacao(oficina_id,chave,pedido,resultado) values(p_oficina,p_id,pedido,lista);
 return lista;
end $$;

create function public.listar_itens_fisicos(p_oficina uuid,p_busca text default '',p_situacao text default '',p_local uuid default null,p_vinculo jsonb default '{}',p_antes timestamptz default null,p_id_antes uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare lista jsonb; vinculo jsonb;begin
 perform private.exigir_localizacao(p_oficina);
 if coalesce(p_situacao,'') not in ('','na_empresa','externo','entregue','nao_localizado','sem_local') or (p_antes is null)<>(p_id_antes is null) then raise exception 'Filtro inválido.' using errcode='22023';end if;
 if nullif(p_vinculo->>'id','') is not null then vinculo:=public.consultar_vinculo_localizacao(p_oficina,p_vinculo->>'tipo',(p_vinculo->>'id')::uuid);end if;
 select coalesce(jsonb_agg(private.dados_item_fisico(i) order by i.criado_em desc,i.id desc),'[]') into lista from (
  select f.* from public.itens_fisicos f where f.oficina_id=p_oficina
   and (coalesce(p_situacao,'')='' or f.situacao=p_situacao or (p_situacao='sem_local' and f.situacao='na_empresa' and f.local_id is null))
   and (p_local is null or f.local_id=p_local)
   and (nullif(trim(p_busca),'') is null or lower(f.descricao||' '||f.codigo_externo||' '||f.codigo) like '%'||lower(left(trim(p_busca),100))||'%')
   and (vinculo is null or
    case vinculo->>'tipo'
     when 'os' then f.ordem_servico_id=(vinculo->>'id')::uuid or f.orcamento_id in(select coalesce(orcamento_origem_id,orcamento_aguardando_id) from public.ordens_servico where oficina_id=p_oficina and id=(vinculo->>'id')::uuid)
     when 'orcamento' then f.orcamento_id=(vinculo->>'id')::uuid
     when 'atendimento' then f.atendimento_id=(vinculo->>'id')::uuid
     when 'objeto' then f.objeto_id=(vinculo->>'id')::uuid
     when 'estoque' then f.produto_id=(vinculo->>'id')::uuid else false end)
   and (p_antes is null or (f.criado_em,f.id)<(p_antes,p_id_antes))
  order by f.criado_em desc,f.id desc limit 51
 ) i;
 return jsonb_build_object('itens',case when jsonb_array_length(lista)>50 then lista-50 else lista end,'tem_mais',jsonb_array_length(lista)>50,'vinculo',vinculo);
end $$;

create function public.consultar_item_fisico(p_oficina uuid,p_codigo text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare i public.itens_fisicos; relacionados jsonb;begin
 perform private.exigir_localizacao(p_oficina);
 select * into i from public.itens_fisicos where oficina_id=p_oficina and codigo=upper(trim(p_codigo));
 if not found then raise exception 'Etiqueta não encontrada nesta empresa. Confira a empresa selecionada.' using errcode='P0002';end if;
 select coalesce(jsonb_agg(private.dados_item_fisico(f) order by f.descricao,f.id),'[]') into relacionados from (select * from public.itens_fisicos where oficina_id=p_oficina and id<>i.id and (principal_id=coalesce(i.principal_id,i.id) or id=i.principal_id) order by descricao,id limit 50) f;
 return private.dados_item_fisico(i)||jsonb_build_object('relacionados',relacionados);
end $$;

create function public.historico_item_fisico(p_oficina uuid,p_item uuid,p_antes bigint default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare lista jsonb;begin
 perform private.exigir_localizacao(p_oficina);
 if not exists(select 1 from public.itens_fisicos where oficina_id=p_oficina and id=p_item) then raise exception 'Item indisponível nesta empresa.' using errcode='42501';end if;
 select coalesce(jsonb_agg(to_jsonb(h) order by id desc),'[]') into lista from (select * from public.historico_localizacao where oficina_id=p_oficina and item_id=p_item and (p_antes is null or id<p_antes) order by id desc limit 51) h;
 return jsonb_build_object('eventos',case when jsonb_array_length(lista)>50 then lista-50 else lista end,'tem_mais',jsonb_array_length(lista)>50);
end $$;

create function public.movimentar_itens_fisicos(p_oficina uuid,p_itens jsonb,p_acao text,p_local uuid,p_com_quem text,p_observacoes text,p_chave uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare pedido jsonb; anterior public.itens_fisicos; novo public.itens_fisicos; registro jsonb; resultado jsonb:='[]'; repetida public.operacoes_localizacao; destino text; n integer;begin
 perform private.exigir_localizacao(p_oficina);
 if p_chave is null or jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) not between 1 and 50
  or coalesce(p_acao,'') not in ('mover','externo','entregar','retorno','nao_localizado') or length(coalesce(p_com_quem,''))>160 or length(coalesce(p_observacoes,''))>1000 then raise exception 'Confira os itens e o destino da movimentação.' using errcode='22023';end if;
 select count(distinct (value->>'id')::uuid) into n from jsonb_array_elements(p_itens);
 if n<>jsonb_array_length(p_itens) then raise exception 'Selecione cada item somente uma vez.' using errcode='22023';end if;
 if p_acao in ('externo','entregar') and length(trim(coalesce(p_com_quem,'')))<2 then raise exception 'Informe com quem os itens ficaram.' using errcode='22023';end if;
 if p_acao in ('retorno','nao_localizado') and length(trim(coalesce(p_observacoes,'')))<3 then raise exception 'Registre o motivo desta movimentação.' using errcode='22023';end if;
 if (p_acao in ('mover','retorno'))<>(p_local is not null) then raise exception 'Selecione um local para guardar os itens.' using errcode='22023';end if;
 pedido:=jsonb_build_object('itens',(select jsonb_agg(value order by value->>'id') from jsonb_array_elements(p_itens)),'acao',p_acao,'local',p_local,'com_quem',trim(coalesce(p_com_quem,'')),'observacoes',trim(coalesce(p_observacoes,'')));
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_chave::text,0));
 select * into repetida from public.operacoes_localizacao where oficina_id=p_oficina and chave=p_chave;
 if found then
  if repetida.pedido is distinct from pedido then raise exception 'Esta operação já foi usada para outra movimentação.' using errcode='22023';end if;
  return repetida.resultado;
 end if;
 if p_local is not null then
  perform 1 from public.locais_fisicos where oficina_id=p_oficina and id=p_local and ativo for share;
  if not found then raise exception 'Local indisponível nesta empresa.' using errcode='42501';end if;
 end if;
 destino:=case p_acao when 'mover' then 'na_empresa' when 'retorno' then 'na_empresa' when 'entregar' then 'entregue' else p_acao end;
 for registro in select value from jsonb_array_elements(p_itens) order by value->>'id' loop
  select * into anterior from public.itens_fisicos where oficina_id=p_oficina and id=(registro->>'id')::uuid for update;
  if not found then raise exception 'Item indisponível nesta empresa.' using errcode='42501';end if;
  if anterior.revisao is distinct from (registro->>'revisao')::integer then raise exception 'Um item mudou. Atualize a seleção antes de movimentar.' using errcode='PT409';end if;
  if anterior.situacao='entregue' and p_acao<>'retorno' then raise exception 'Registre o retorno do item entregue antes de movimentá-lo.' using errcode='22023';end if;
  if p_acao='retorno' and anterior.situacao<>'entregue' then raise exception 'Retorno é usado para itens já entregues.' using errcode='22023';end if;
  update public.itens_fisicos set situacao=destino,local_id=p_local,com_quem=trim(coalesce(p_com_quem,'')),revisao=revisao+1,atualizado_em=now() where id=anterior.id returning * into novo;
  perform private.registrar_historico_localizacao(anterior,novo,p_acao,trim(coalesce(p_observacoes,'')));
  resultado:=resultado||jsonb_build_array(private.dados_item_fisico(novo));
 end loop;
 insert into public.operacoes_localizacao(oficina_id,chave,pedido,resultado) values(p_oficina,p_chave,pedido,resultado);
 return resultado;
end $$;

create function public.vincular_itens_fisicos(p_oficina uuid,p_itens jsonb,p_vinculo jsonb,p_chave uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v jsonb; pedido jsonb; repetida public.operacoes_localizacao; registro jsonb; anterior public.itens_fisicos; novo public.itens_fisicos; resultado jsonb:='[]';begin
 perform private.exigir_localizacao(p_oficina);
 if p_chave is null or jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) not between 1 and 50 then raise exception 'Selecione até 50 itens.' using errcode='22023';end if;
 if (select count(distinct (value->>'id')::uuid) from jsonb_array_elements(p_itens))<>jsonb_array_length(p_itens) then raise exception 'Selecione cada item somente uma vez.' using errcode='22023';end if;
 v:=public.consultar_vinculo_localizacao(p_oficina,p_vinculo->>'tipo',(p_vinculo->>'id')::uuid);
 pedido:=jsonb_build_object('acao','vinculo','itens',(select jsonb_agg(value order by value->>'id') from jsonb_array_elements(p_itens)),'vinculo',p_vinculo);
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_chave::text,0));
 select * into repetida from public.operacoes_localizacao where oficina_id=p_oficina and chave=p_chave;
 if found then
  if repetida.pedido is distinct from pedido then raise exception 'Esta operação já foi usada para outro vínculo.' using errcode='22023';end if;
  return repetida.resultado;
 end if;
 for registro in select value from jsonb_array_elements(p_itens) order by value->>'id' loop
  select * into anterior from public.itens_fisicos where oficina_id=p_oficina and id=(registro->>'id')::uuid for update;
  if not found then raise exception 'Item indisponível nesta empresa.' using errcode='42501';end if;
  if anterior.revisao is distinct from (registro->>'revisao')::integer then raise exception 'Um item mudou. Atualize antes de vincular.' using errcode='PT409';end if;
  if anterior.situacao='entregue' then raise exception 'Registre o retorno do item entregue antes de vinculá-lo a outro atendimento.' using errcode='22023';end if;
  update public.itens_fisicos set cliente_id=(v->>'cliente_id')::uuid,ordem_servico_id=(v->>'ordem_servico_id')::uuid,orcamento_id=(v->>'orcamento_id')::uuid,atendimento_id=(v->>'atendimento_id')::uuid,objeto_id=(v->>'objeto_id')::uuid,produto_id=(v->>'produto_id')::uuid,revisao=revisao+1,atualizado_em=now() where id=anterior.id returning * into novo;
  perform private.registrar_historico_localizacao(anterior,novo,'vinculo','Vinculado a '||(v->>'titulo'));
  resultado:=resultado||jsonb_build_array(private.dados_item_fisico(novo));
 end loop;
 insert into public.operacoes_localizacao(oficina_id,chave,pedido,resultado) values(p_oficina,p_chave,pedido,resultado);
 return resultado;
end $$;
revoke all on function public.vincular_itens_fisicos(uuid,jsonb,jsonb,uuid) from public,anon;
grant execute on function public.vincular_itens_fisicos(uuid,jsonb,jsonb,uuid) to authenticated;

revoke all on function private.exigir_localizacao(uuid,boolean),private.dados_item_fisico(public.itens_fisicos),private.registrar_historico_localizacao(public.itens_fisicos,public.itens_fisicos,text,text) from public,anon,authenticated;
revoke all on function public.consultar_vinculo_localizacao(uuid,text,uuid),public.salvar_local_fisico(uuid,uuid,text,text,boolean,integer),public.listar_locais_fisicos(uuid,text,boolean),public.salvar_item_fisico(uuid,uuid,jsonb,integer),public.registrar_conjunto_fisico(uuid,uuid,jsonb,jsonb),public.listar_itens_fisicos(uuid,text,text,uuid,jsonb,timestamptz,uuid),public.consultar_item_fisico(uuid,text),public.historico_item_fisico(uuid,uuid,bigint),public.movimentar_itens_fisicos(uuid,jsonb,text,uuid,text,text,uuid) from public,anon;
grant execute on function public.consultar_vinculo_localizacao(uuid,text,uuid),public.salvar_local_fisico(uuid,uuid,text,text,boolean,integer),public.listar_locais_fisicos(uuid,text,boolean),public.salvar_item_fisico(uuid,uuid,jsonb,integer),public.registrar_conjunto_fisico(uuid,uuid,jsonb,jsonb),public.listar_itens_fisicos(uuid,text,text,uuid,jsonb,timestamptz,uuid),public.consultar_item_fisico(uuid,text),public.historico_item_fisico(uuid,uuid,bigint),public.movimentar_itens_fisicos(uuid,jsonb,text,uuid,text,text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
