begin;
create table public.configuracao_dados_empresa (
 oficina_id uuid primary key references public.oficinas(id), dados jsonb not null default '{}',
 revisao integer not null default 1, atualizado_em timestamptz not null default now()
);
create table public.solicitacoes_privacidade (
 id uuid primary key, oficina_id uuid not null references public.oficinas(id),
 cliente_id uuid, tipo text not null check(tipo in ('acesso','correcao','exportacao','exclusao','revogacao')),
 solicitante text not null check(length(solicitante) between 2 and 200),
 situacao text not null default 'recebida' check(situacao in ('recebida','identificada','em_analise','concluida','negada')),
 prazo date not null, identidade text not null default '', decisao text not null default '',
 criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
 revisao integer not null default 1,autor uuid not null references auth.users(id),
 foreign key(oficina_id,cliente_id) references public.clientes(oficina_id,id)
);
create index privacidade_pendentes on public.solicitacoes_privacidade(oficina_id,prazo,id) where situacao not in ('concluida','negada');
create table public.lotes_portabilidade (
 id uuid primary key, oficina_id uuid not null references public.oficinas(id),origem text not null,
 assinatura text not null, resumo jsonb not null,criado_em timestamptz not null default now(),autor uuid not null references auth.users(id)
);
create table public.vinculos_portabilidade (
 oficina_id uuid not null references public.oficinas(id),origem text not null,tipo text not null,id_externo text not null,
 id_interno uuid,assinatura text not null,lote_id uuid not null references public.lotes_portabilidade(id),
 primary key(oficina_id,origem,tipo,id_externo)
);
create table public.anexos_portabilidade (
 id uuid primary key,oficina_id uuid not null references public.oficinas(id),
 origem text not null,id_externo text not null,nome text not null,caminho text not null unique,
 tamanho bigint not null check(tamanho between 1 and 26214400),sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 tipo text not null,criado_em timestamptz not null default now(),autor uuid not null references auth.users(id),situacao text not null default 'pendente' check(situacao in ('pendente','pronto'))
);
do $$declare t text;begin foreach t in array array['configuracao_dados_empresa','solicitacoes_privacidade','lotes_portabilidade','vinculos_portabilidade','anexos_portabilidade'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);
end loop;end $$;

create function private.auditar_dados(w uuid,acao text,id uuid) returns void language sql set search_path='' as $$
 insert into public.registros_auditoria(oficina_id,usuario_autor_id,tipo_autor,acao,tipo_entidade,entidade_id,correlacao_id) values(w,auth.uid(),'user',acao,'dados_empresa',id,gen_random_uuid());
$$;
create function public.consultar_dados_empresa(p_oficina uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform private.exigir_proprietario(p_oficina);perform private.exigir_segundo_fator();
 return jsonb_build_object('configuracao',(select to_jsonb(c) from public.configuracao_dados_empresa c where oficina_id=p_oficina),
 'solicitacoes',(select coalesce(jsonb_agg(to_jsonb(s) order by prazo,id),'[]') from (select * from public.solicitacoes_privacidade where oficina_id=p_oficina order by criado_em desc limit 100)s),
 'importacoes',(select coalesce(jsonb_agg(to_jsonb(l) order by criado_em desc),'[]') from (select * from public.lotes_portabilidade where oficina_id=p_oficina order by criado_em desc limit 30)l));
end $$;
create function public.salvar_configuracao_dados(p_oficina uuid,p_dados jsonb,p_revisao integer) returns void language plpgsql security definer set search_path='' as $$
declare r integer;
begin perform private.exigir_proprietario(p_oficina);perform private.exigir_segundo_fator();
 perform 1 from public.oficinas where id=p_oficina for update;
 select revisao into r from public.configuracao_dados_empresa where oficina_id=p_oficina;
 if coalesce(r,0) is distinct from p_revisao then raise exception 'A configuração mudou. Atualize.' using errcode='PT409';end if;
 if p_dados is null or jsonb_typeof(p_dados)<>'object' or length(p_dados::text)>12000 then raise exception 'Confira a configuração.' using errcode='22023';end if;
 if exists(select 1 from jsonb_each(p_dados) x where x.key not in ('suporte_url','suporte_responsavel','suporte_horarios','resposta_horas','privacidade_responsavel','retencao','retencao_revisao') or jsonb_typeof(x.value)<>'string') then raise exception 'A configuração contém campos não reconhecidos.' using errcode='22023';end if;
 if nullif(p_dados->>'suporte_url','') is not null and (p_dados->>'suporte_url' !~ '^https://[^/@[:space:]]+([/?#]|$)' or p_dados->>'suporte_url' ~ '@') then raise exception 'Use um endereço HTTPS de suporte.' using errcode='22023';end if;
 if nullif(p_dados->>'resposta_horas','') is not null and (p_dados->>'resposta_horas')::int not between 1 and 720 then raise exception 'Informe um prazo de 1 a 720 horas úteis.' using errcode='22023';end if;
 insert into public.configuracao_dados_empresa values(p_oficina,p_dados,1,now()) on conflict(oficina_id) do update set dados=excluded.dados,revisao=configuracao_dados_empresa.revisao+1,atualizado_em=now();
 perform private.auditar_dados(p_oficina,'dados.configuracao_atualizada',p_oficina);
end $$;
create function public.consultar_suporte_empresa(p_oficina uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin perform private.require_staff(p_oficina);perform private.exigir_segundo_fator();
 return (select jsonb_build_object('url',dados->>'suporte_url','horarios',dados->>'suporte_horarios','prazo_horas',dados->>'resposta_horas','responsavel',dados->>'suporte_responsavel') from public.configuracao_dados_empresa where oficina_id=p_oficina);
end $$;
create function public.salvar_solicitacao_privacidade(p_oficina uuid,p_id uuid,p_dados jsonb,p_revisao integer default null) returns void language plpgsql security definer set search_path='' as $$
declare s public.solicitacoes_privacidade;st text:=coalesce(p_dados->>'situacao','recebida');
begin perform private.exigir_proprietario(p_oficina);perform private.exigir_segundo_fator();
 select * into s from public.solicitacoes_privacidade where id=p_id for update;
 if found and (s.oficina_id<>p_oficina or s.revisao is distinct from p_revisao) then raise exception 'Solicitação indisponível ou alterada.' using errcode='PT409';end if;
 if st<>'recebida' and length(trim(coalesce(p_dados->>'identidade','')))<5 then raise exception 'Registre como a identidade foi verificada, sem copiar documentos pessoais.' using errcode='22023';end if;
 if st in ('concluida','negada') and length(trim(coalesce(p_dados->>'decisao','')))<10 then raise exception 'Registre a resposta, o que foi atendido e eventuais dados retidos.' using errcode='22023';end if;
 if s.id is null then
  insert into public.solicitacoes_privacidade(id,oficina_id,cliente_id,tipo,solicitante,situacao,prazo,identidade,decisao,autor)
  values(p_id,p_oficina,nullif(p_dados->>'cliente_id','')::uuid,p_dados->>'tipo',p_dados->>'solicitante',st,(p_dados->>'prazo')::date,coalesce(p_dados->>'identidade',''),coalesce(p_dados->>'decisao',''),auth.uid());
 else update public.solicitacoes_privacidade set cliente_id=coalesce(nullif(p_dados->>'cliente_id','')::uuid,cliente_id),situacao=st,prazo=(p_dados->>'prazo')::date,identidade=p_dados->>'identidade',decisao=coalesce(p_dados->>'decisao',''),revisao=revisao+1,atualizado_em=now(),autor=auth.uid() where id=p_id;end if;
 insert into public.registros_auditoria(oficina_id,usuario_autor_id,tipo_autor,acao,tipo_entidade,entidade_id,correlacao_id,metadados)
 values(p_oficina,auth.uid(),'user','privacidade.'||st,'solicitacao_privacidade',p_id,gen_random_uuid(),jsonb_build_object('antes',to_jsonb(s),'depois',(select to_jsonb(x) from public.solicitacoes_privacidade x where id=p_id)));
end $$;

-- Catálogo fechado no momento da migração. Tabelas futuras exigem inclusão deliberada.
create table private.tabelas_portabilidade(nome text primary key,esquema text not null);
insert into private.tabelas_portabilidade select c.table_name,'public' from information_schema.columns c join information_schema.tables t using(table_schema,table_name)
 where c.table_schema='public' and c.column_name='oficina_id' and t.table_type='BASE TABLE'
 and c.table_name not in ('chaves_api_integracao','tokens_acesso_orcamento','tokens_vistoria','links_aprovacao_servico','conexoes_integracao','conexoes_whatsapp','assinaturas_calendario','convites_equipe');
insert into private.tabelas_portabilidade values('saldos_importados','private');
revoke all on private.tabelas_portabilidade from public,anon,authenticated;
create function private.dados_sem_credenciais(d jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare r jsonb;
begin
 if jsonb_typeof(d)='object' then select coalesce(jsonb_object_agg(key,private.dados_sem_credenciais(value)),'{}') into r from jsonb_each(d) where key !~* '(senha|password|token|secret|segredo|chave_api|api_key|authorization|credencial)';return r;
 elsif jsonb_typeof(d)='array' then select coalesce(jsonb_agg(private.dados_sem_credenciais(value)),'[]') into r from jsonb_array_elements(d);return r;end if;
 return d;
end $$;
create function public.exportar_dados_empresa(p_oficina uuid,p_tabela text default null,p_cursor text default null,p_conferir boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare t record;r jsonb;linhas jsonb;fim text;contagem bigint;assinatura text;grupos jsonb:='[]';
begin perform private.exigir_proprietario(p_oficina);perform private.exigir_segundo_fator();
 if p_tabela is null then
  for t in select * from private.tabelas_portabilidade order by nome loop
   execute format('select count(*),coalesce(sum((''x''||substr(md5(to_jsonb(x)::text),1,16))::bit(64)::bigint),0)::text||'':''||coalesce(sum((''x''||substr(md5(to_jsonb(x)::text),17,16))::bit(64)::bigint),0)::text from %I.%I x where oficina_id=$1',t.esquema,t.nome) into contagem,assinatura using p_oficina;
   grupos:=grupos||jsonb_build_array(jsonb_build_object('tabela',t.nome,'quantidade',contagem,'assinatura',assinatura));
  end loop;
  return jsonb_build_object('formato','patio.exportacao.v1','empresa',(select private.dados_sem_credenciais(to_jsonb(o)) from public.oficinas o where id=p_oficina),'gerado_em',now(),'tabelas',grupos,'conferencia',p_conferir);
 end if;
 select * into t from private.tabelas_portabilidade where nome=p_tabela;
 if not found then raise exception 'Tabela não disponível para exportação.' using errcode='22023';end if;
 if p_cursor is not null and p_cursor !~ '^\([0-9]+,[0-9]+\)$' then raise exception 'Cursor inválido.' using errcode='22023';end if;
 execute format('select coalesce(jsonb_agg(private.dados_sem_credenciais(dado) order by pos),''[]''),max(pos)::text from (select ctid pos,to_jsonb(x) dado from %I.%I x where oficina_id=$1 and ($2::tid is null or ctid>$2::tid) order by ctid limit 500) pagina',t.esquema,t.nome) into linhas,fim using p_oficina,p_cursor;
 r:=jsonb_build_object('linhas',linhas,'cursor',fim);return r;
end $$;

-- Modelo comum preserva o legado; cadastros e saldos podem entrar na operação.
-- Documentos/históricos antigos não disparam produção, cobrança ou mensagens.
create function public.importar_pacote_empresa(p_oficina uuid,p_id uuid,p_pacote jsonb,p_confirmar boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare x jsonb;d jsonb;origem_externa text:=trim(p_pacote->>'origem');tip text;eid text;sig text;anterior text;interno uuid;resumo jsonb;novos int:=0;repetidos int:=0;valor bigint;pago bigint;
begin perform private.exigir_proprietario(p_oficina);perform private.exigir_segundo_fator();
 if p_pacote->>'formato' is distinct from 'patio.migracao.v1' or length(coalesce(origem_externa,'')) not between 2 and 100 or jsonb_typeof(p_pacote->'registros') is distinct from 'array' or jsonb_array_length(p_pacote->'registros') not between 1 and 500 or length(p_pacote::text)>4000000 then raise exception 'Use o modelo padrão, com até 500 registros e 4 MB por lote.' using errcode='22023';end if;
 sig:=md5(p_pacote::text);
 perform pg_advisory_xact_lock(hashtextextended('portabilidade:'||p_oficina||':'||origem_externa,0));
 if exists(select 1 from public.lotes_portabilidade where id=p_id and (oficina_id<>p_oficina or assinatura<>sig)) then raise exception 'Este lote já foi usado com outro conteúdo.' using errcode='PT409';end if;
 if exists(select 1 from public.lotes_portabilidade where id=p_id) then return (select l.resumo from public.lotes_portabilidade l where id=p_id);end if;
 if exists(select 1 from jsonb_array_elements(p_pacote->'registros') a group by a->>'tipo',a->>'id' having count(*)>1) then raise exception 'Há identificadores repetidos no arquivo.' using errcode='22023';end if;
 for x in select value from jsonb_array_elements(p_pacote->'registros') loop
  tip:=x->>'tipo';eid:=x->>'id';d:=x->'dados';
  if tip is null or tip not in ('cliente','catalogo','ordem_servico','financeiro','historico') or length(coalesce(eid,'')) not between 1 and 120 or jsonb_typeof(d) is distinct from 'object' or private.dados_sem_credenciais(d)<>d then raise exception 'Confira tipo, identificador e dados. Não importe senhas ou credenciais.' using errcode='22023';end if;
  if tip='cliente' and length(trim(coalesce(d->>'nome',''))) not between 2 and 160 then raise exception 'Informe o nome de cada cliente.' using errcode='22023';end if;
  if tip='catalogo' and (length(trim(coalesce(d->>'descricao','')))<2 or coalesce(d->>'tipo','') not in ('service','part') or d->>'preco_padrao_centavos' is null or (d->>'preco_padrao_centavos')::numeric not between 0 and 100000000 or (d->>'preco_padrao_centavos')::numeric<>trunc((d->>'preco_padrao_centavos')::numeric)) then raise exception 'Confira os itens do catálogo.' using errcode='22023';end if;
  if tip='financeiro' then
   valor:=(d->>'valor_centavos')::bigint;pago:=coalesce((d->>'pago_centavos')::bigint,0);
   if valor is null or valor not between 1 and 100000000000 or pago not between 0 and valor or valor::numeric<>(d->>'valor_centavos')::numeric or pago::numeric<>coalesce((d->>'pago_centavos')::numeric,0) or coalesce(d->>'natureza','') not in ('pagar','receber') or length(coalesce(d->>'descricao',''))<2 or nullif(d->>'vencimento','') is null or not isfinite((d->>'vencimento')::date) then raise exception 'Confira valor, saldo e vencimento financeiro.' using errcode='22023';end if;
  end if;
  select assinatura into anterior from public.vinculos_portabilidade where oficina_id=p_oficina and origem=origem_externa and tipo=tip and id_externo=eid;
  if anterior is not null and anterior<>md5(d::text) then raise exception 'O registro % já foi importado com outros dados. Corrija o arquivo ou use a edição no sistema.',eid using errcode='PT409';end if;
  if anterior is null then novos:=novos+1;else repetidos:=repetidos+1;end if;
 end loop;
 resumo:=jsonb_build_object('novos',novos,'repetidos',repetidos,'total',jsonb_array_length(p_pacote->'registros'),'confirmado',p_confirmar);
 if not p_confirmar then return resumo;end if;
 insert into public.lotes_portabilidade values(p_id,p_oficina,origem_externa,sig,resumo,now(),auth.uid());
 for x in select value from jsonb_array_elements(p_pacote->'registros') loop
  tip:=x->>'tipo';eid:=x->>'id';d:=x->'dados';interno:=null;
  if exists(select 1 from public.vinculos_portabilidade v where v.oficina_id=p_oficina and v.origem=origem_externa and v.tipo=tip and v.id_externo=eid) then continue;end if;
  if tip='cliente' then interno:=(public.salvar_cliente(p_oficina,d,null,null)->>'id')::uuid;
  elsif tip='catalogo' then interno:=gen_random_uuid();perform public.salvar_item_catalogo(p_oficina,interno,d,null);
  elsif tip='financeiro' then
   interno:=gen_random_uuid();perform public.salvar_titulo_financeiro(p_oficina,interno,d||jsonb_build_object('categoria','saldo_inicial','competencia',coalesce(d->>'competencia',d->>'vencimento'),'observacoes','Importado de '||origem_externa||' · '||eid),null);
   pago:=coalesce((d->>'pago_centavos')::bigint,0);if pago>0 then insert into private.saldos_importados values(p_oficina,interno,pago);end if;
  end if;
  insert into public.registros_importados(oficina_id,origem,tabela,id_legado,dados) values(p_oficina,origem_externa,tip,eid,d);
  insert into public.vinculos_portabilidade values(p_oficina,origem_externa,tip,eid,interno,md5(d::text),p_id);
 end loop;
 perform private.auditar_dados(p_oficina,'dados.importados',p_id);return resumo;
end $$;

insert into storage.buckets(id,name,public,file_size_limit) values('company-portability','company-portability',false,26214400);
create function public.reservar_anexo_portabilidade(p_oficina uuid,p_id uuid,p_dados jsonb) returns text language plpgsql security definer set search_path='' as $$
declare a public.anexos_portabilidade;c text:=p_oficina::text||'/'||p_id::text;
begin perform private.exigir_proprietario(p_oficina);perform private.exigir_segundo_fator();
 if length(coalesce(p_dados->>'nome','')) not between 1 and 200 or length(coalesce(p_dados->>'origem','')) not between 2 and 100 or length(coalesce(p_dados->>'id_externo','')) not between 1 and 120 or p_dados->>'tipo' not in ('application/pdf','image/jpeg','image/png','image/webp','text/plain') then raise exception 'Use PDF, imagem ou texto, com nome e referência de origem.' using errcode='22023';end if;
 select * into a from public.anexos_portabilidade where id=p_id;
 if found then if a.oficina_id<>p_oficina or a.sha256<>p_dados->>'sha256' then raise exception 'Anexo já reservado com outro conteúdo.' using errcode='PT409';end if;return a.caminho;end if;
 insert into public.anexos_portabilidade(id,oficina_id,origem,id_externo,nome,caminho,tamanho,sha256,tipo,autor) values(p_id,p_oficina,p_dados->>'origem',p_dados->>'id_externo',p_dados->>'nome',c,(p_dados->>'tamanho')::bigint,p_dados->>'sha256',p_dados->>'tipo',auth.uid());return c;
end $$;
create function public.confirmar_anexo_portabilidade(p_oficina uuid,p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin perform private.exigir_proprietario(p_oficina);perform private.exigir_segundo_fator();
 update public.anexos_portabilidade a set situacao='pronto' where a.oficina_id=p_oficina and a.id=p_id and exists(select 1 from storage.objects o where o.bucket_id='company-portability' and o.name=a.caminho);
 if not found then raise exception 'O arquivo ainda não foi recebido. Envie novamente.' using errcode='22023';end if;
end $$;
create function public.listar_anexos_portabilidade(p_oficina uuid,p_busca text default '',p_pagina integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin perform private.exigir_proprietario(p_oficina);perform private.exigir_segundo_fator();
 return (select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (select * from public.anexos_portabilidade where oficina_id=p_oficina and situacao='pronto' and concat(nome,' ',id_externo,' ',origem) ilike '%'||left(p_busca,100)||'%' order by criado_em desc,id limit 50 offset greatest(0,least(p_pagina,100000))*50)x);
end $$;
create function private.arquivo_exportavel(bucket text,caminho text) returns boolean language sql stable security definer set search_path='' as $$
 select private.segundo_fator_ok() and exists(select 1 from public.arquivos f join public.membros_oficina m on m.oficina_id=f.oficina_id where f.recipiente=bucket and f.caminho_arquivo=caminho and f.situacao='ready' and m.usuario_id=auth.uid() and m.ativo and m.perfil='owner');
$$;
create policy arquivo_portabilidade on storage.objects for select to authenticated using(private.arquivo_exportavel(bucket_id,name));
revoke all on function public.confirmar_anexo_portabilidade(uuid,uuid),public.listar_anexos_portabilidade(uuid,text,integer),private.arquivo_exportavel(text,text) from public,anon,authenticated;
grant execute on function public.confirmar_anexo_portabilidade(uuid,uuid),public.listar_anexos_portabilidade(uuid,text,integer),private.arquivo_exportavel(text,text) to authenticated;
create function private.acesso_anexo_portabilidade(p text) returns boolean language sql stable security definer set search_path='' as $$
 select private.segundo_fator_ok() and exists(select 1 from public.anexos_portabilidade a join public.membros_oficina m on m.oficina_id=a.oficina_id where a.caminho=p and m.usuario_id=auth.uid() and m.ativo and m.perfil='owner');
$$;
create policy portabilidade_ler on storage.objects for select to authenticated using(bucket_id='company-portability' and private.acesso_anexo_portabilidade(name));
create policy portabilidade_gravar on storage.objects for insert to authenticated with check(bucket_id='company-portability' and private.acesso_anexo_portabilidade(name));

revoke all on function private.auditar_dados(uuid,text,uuid),private.dados_sem_credenciais(jsonb),private.acesso_anexo_portabilidade(text),
 public.consultar_dados_empresa(uuid),public.salvar_configuracao_dados(uuid,jsonb,integer),public.consultar_suporte_empresa(uuid),public.salvar_solicitacao_privacidade(uuid,uuid,jsonb,integer),public.exportar_dados_empresa(uuid,text,text,boolean),public.importar_pacote_empresa(uuid,uuid,jsonb,boolean),public.reservar_anexo_portabilidade(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function private.acesso_anexo_portabilidade(text),public.consultar_dados_empresa(uuid),public.salvar_configuracao_dados(uuid,jsonb,integer),public.consultar_suporte_empresa(uuid),public.salvar_solicitacao_privacidade(uuid,uuid,jsonb,integer),public.exportar_dados_empresa(uuid,text,text,boolean),public.importar_pacote_empresa(uuid,uuid,jsonb,boolean),public.reservar_anexo_portabilidade(uuid,uuid,jsonb) to authenticated;
create function public.criar_rascunho_servico_offline(p_oficina uuid,p_id uuid,p_objeto uuid,p_dados jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.atendimentos_servicos;dia date:=(p_dados->>'data_servico')::date;
begin
 perform private.conferir_operacao(p_oficina,'criar_atendimento_com_itens');
 perform private.exigir_servicos(p_oficina,'work_orders');
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_id::text,0));
 select * into a from public.atendimentos_servicos where id=p_id;
 if found then
  if a.oficina_id<>p_oficina then raise exception 'Atendimento indisponível.' using errcode='42501';end if;
  return p_id;
 end if;
 if p_id is null or p_objeto is null or dia is null or not isfinite(dia) or length(trim(coalesce(p_dados->>'nome',''))) not between 2 and 160 or length(coalesce(p_dados->>'relato',''))>4000 then raise exception 'Confira o equipamento ou local, a data e o relato.' using errcode='22023';end if;
 perform public.salvar_objeto_atendimento(p_oficina,p_objeto,jsonb_build_object('cliente_id',p_dados->>'cliente_id','nome',p_dados->>'nome','dados','{}'::jsonb),null);
 return public.criar_atendimento_com_itens(p_oficina,p_id,jsonb_build_object('cliente_id',p_dados->>'cliente_id','objeto_id',p_objeto,'titulo','Atendimento · '||left(p_dados->>'nome',150),'data_servico',dia,'vencimento',dia,'situacao','orcamento','dados',jsonb_build_object('documento','ordem','orcamento_enviado','nao','relato',coalesce(p_dados->>'relato',''))),'[]'::jsonb,0,null);
end $$;
revoke all on function public.criar_rascunho_servico_offline(uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.criar_rascunho_servico_offline(uuid,uuid,uuid,jsonb) to authenticated;
-- Cópia individual: seleção fechada de assuntos ligados ao cliente identificado.
create function private.filtro_dados_titular(t text) returns text language plpgsql stable set search_path='' as $$
declare colunas text[];f text:='';
begin
 if t not in ('clientes','clientes_veiculos','objetos_atendimento','ordens_servico','orcamentos','itens_ordem_servico','itens_orcamento','historico_ordem_servico','atendimentos_servicos','itens_atendimento_servico','eventos_atendimento','agenda_servicos','titulos_financeiros','arquivos','fotos_atendimento','anexos_ordem_servico','qualidade_atendimento','retornos_garantia') then return null;end if;
 if t='clientes' then return 'x.id=$2';end if;
 if t='arquivos' then return 'x.id in (select f.arquivo_id from public.fotos_atendimento f join public.atendimentos_servicos a on a.id=f.atendimento_id and a.oficina_id=f.oficina_id where a.oficina_id=$1 and a.cliente_id=$2 union all select f.arquivo_id from public.anexos_ordem_servico f join public.ordens_servico a on a.id=f.ordem_servico_id and a.oficina_id=f.oficina_id where a.oficina_id=$1 and a.cliente_id=$2)';end if;
 select array_agg(column_name::text) into colunas from information_schema.columns where table_schema='public' and table_name=t;
 if 'cliente_id'=any(colunas) then return 'x.cliente_id=$2';end if;
 if 'ordem_servico_id'=any(colunas) then f:='x.ordem_servico_id in (select id from public.ordens_servico where oficina_id=$1 and cliente_id=$2)';end if;
 if 'os_id'=any(colunas) then f:=concat_ws(' or ',nullif(f,''),'x.os_id in (select id from public.ordens_servico where oficina_id=$1 and cliente_id=$2)');end if;
 if 'atendimento_id'=any(colunas) then f:=concat_ws(' or ',nullif(f,''),'x.atendimento_id in (select id from public.atendimentos_servicos where oficina_id=$1 and cliente_id=$2)');end if;
 if 'orcamento_id'=any(colunas) then f:=concat_ws(' or ',nullif(f,''),'x.orcamento_id in (select id from public.orcamentos where oficina_id=$1 and cliente_id=$2)');end if;
 return nullif(f,'');
end $$;
create function public.exportar_dados_titular(p_oficina uuid,p_solicitacao uuid,p_tabela text default null,p_cursor text default null,p_conferir boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.solicitacoes_privacidade;t record;f text;n bigint;assinatura text;grupos jsonb:='[]';linhas jsonb;fim text;
begin
 perform private.exigir_proprietario(p_oficina);perform private.exigir_segundo_fator();
 select * into s from public.solicitacoes_privacidade where oficina_id=p_oficina and id=p_solicitacao;
 if s.id is null or s.cliente_id is null or s.situacao='recebida' or length(trim(s.identidade))<5 then raise exception 'Vincule o cliente e confira a identidade antes de preparar a cópia.' using errcode='22023';end if;
 if p_tabela is null then
  for t in select nome from private.tabelas_portabilidade where esquema='public' order by nome loop
   f:=private.filtro_dados_titular(t.nome);if f is null then continue;end if;
   execute format('select count(*),coalesce(sum((''x''||substr(md5(to_jsonb(x)::text),1,16))::bit(64)::bigint),0)::text||'':''||coalesce(sum((''x''||substr(md5(to_jsonb(x)::text),17,16))::bit(64)::bigint),0)::text from public.%I x where x.oficina_id=$1 and (%s)',t.nome,f) into n,assinatura using p_oficina,s.cliente_id;
   grupos:=grupos||jsonb_build_array(jsonb_build_object('tabela',t.nome,'quantidade',n,'assinatura',assinatura));
  end loop;
  return jsonb_build_object('formato','patio.titular.v1','empresa',jsonb_build_object('id',p_oficina),'cliente_id',s.cliente_id,'solicitacao',s.id,'gerado_em',now(),'tabelas',grupos,'conferencia',p_conferir,'revisao_necessaria','Conferir anexos e textos livres antes de entregar; dados de terceiros e registros legados sem vínculo exigem revisão.');
 end if;
 f:=private.filtro_dados_titular(p_tabela);
 if f is null or p_cursor is not null and p_cursor !~ '^\([0-9]+,[0-9]+\)$' then raise exception 'Assunto ou cursor inválido.' using errcode='22023';end if;
 execute format('select coalesce(jsonb_agg(private.dados_sem_credenciais(dado) order by pos),''[]''),max(pos)::text from (select ctid pos,to_jsonb(x) dado from public.%I x where x.oficina_id=$1 and (%s) and ($3::tid is null or ctid>$3::tid) order by ctid limit 500) pagina',p_tabela,f) into linhas,fim using p_oficina,s.cliente_id,p_cursor;
 return jsonb_build_object('linhas',linhas,'cursor',fim);
end $$;
revoke all on function private.filtro_dados_titular(text),public.exportar_dados_titular(uuid,uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.exportar_dados_titular(uuid,uuid,text,text,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
