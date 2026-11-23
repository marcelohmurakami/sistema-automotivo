begin;
create table public.laudos_tecnicos (
 id uuid primary key, oficina_id uuid not null references public.oficinas(id),
 numero bigint not null, origem_tipo text check(origem_tipo in ('os','atendimento')), origem_id uuid,
 origem_rotulo text not null default '', dados jsonb not null,
 situacao text not null default 'rascunho' check(situacao in ('rascunho','emitido','cancelado')),
 versao integer not null default 0, revisao integer not null default 1,
 criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
 criado_por uuid not null references auth.users(id), motivo_cancelamento text not null default '',
 unique(oficina_id,id),unique(oficina_id,numero),
 check((origem_tipo is null)=(origem_id is null)),check(jsonb_typeof(dados)='object' and octet_length(dados::text)<=120000)
);
create table public.laudos_versoes (
 oficina_id uuid not null,laudo_id uuid not null,versao integer not null,
 conteudo jsonb not null,hash text not null,emitido_em timestamptz not null default now(),autor uuid not null references auth.users(id),
 primary key(oficina_id,laudo_id,versao), foreign key(oficina_id,laudo_id) references public.laudos_tecnicos(oficina_id,id),check(length(hash)=64)
);
create table public.laudos_eventos (
 id bigint generated always as identity primary key,oficina_id uuid not null,laudo_id uuid not null,
 acao text not null,motivo text not null default '',versao integer not null,criado_em timestamptz not null default now(),
 autor uuid not null references auth.users(id),chave uuid not null,assinatura text not null,
 foreign key(oficina_id,laudo_id) references public.laudos_tecnicos(oficina_id,id),unique(oficina_id,chave)
);
create index laudos_lista on public.laudos_tecnicos(oficina_id,atualizado_em desc,id);
create index laudos_origem on public.laudos_tecnicos(oficina_id,origem_tipo,origem_id);
create index laudos_historico on public.laudos_eventos(oficina_id,laudo_id,id desc);
-- Dados acessados apenas pelas funções autenticadas e pelo exportador da empresa.
do $$declare t text;begin foreach t in array array['laudos_tecnicos','laudos_versoes','laudos_eventos'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated',t);
 insert into private.tabelas_portabilidade(nome,esquema) values(t,'public');
end loop;end $$;
create function private.exigir_laudos(w uuid,escrita boolean default false) returns void language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_staff(w);perform private.exigir_segundo_fator();
 if not private.has_feature(w,'work_orders') or not private.acesso_area(w,'atendimentos',escrita) then
 raise exception 'Seu acesso não permite esta operação nos laudos.' using errcode='42501';end if;
end $$;
create function private.validar_laudo(d jsonb,emitir boolean default false) returns void language plpgsql immutable set search_path='' as $$
declare k text;lim integer;v jsonb;begin
 if d is null or jsonb_typeof(d)<>'object' or octet_length(d::text)>120000 then raise exception 'Conteúdo do laudo inválido ou muito extenso.' using errcode='22023';end if;
 for k,v in select * from jsonb_each(d) loop
 lim:=case when k in ('titulo','cliente','contato_cliente','responsavel','qualificacao') then 180
 when k in ('bem','identificacao') then 240 when k='data_avaliacao' then 10 when k='documento_cliente' then 60
 when k='local_avaliacao' then 300 when k in ('registro_profissional','numero_art') then 120
 when k in ('constatacoes','procedimentos','servicos','conclusao') then 12000
 when k in ('solicitacao','condicoes','recomendacoes','limitacoes','referencias','observacoes') then 8000 else null end;
 if lim is null or jsonb_typeof(v)<>'string' or length(d->>k)>lim then raise exception 'Campo inválido ou muito extenso: %.',k using errcode='22023';end if;
 end loop;
 if length(trim(coalesce(d->>'titulo','')))<3 then raise exception 'Informe um título para o laudo.' using errcode='22023';end if;
 if coalesce(d->>'data_avaliacao','')<>'' then
  if d->>'data_avaliacao' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Informe uma data de avaliação válida.' using errcode='22023';end if;
  perform (d->>'data_avaliacao')::date;
 end if;
 if emitir then foreach k in array array['cliente','bem','data_avaliacao','constatacoes','conclusao','responsavel'] loop
  if nullif(trim(d->>k),'') is null then raise exception 'Preencha % antes de emitir o laudo.',k using errcode='22023';end if;
 end loop;end if;
end $$;
create function private.ler_laudo(w uuid,i uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb;begin perform private.exigir_laudos(w);
 select to_jsonb(l)||jsonb_build_object(
 'versoes',coalesce((select jsonb_agg(jsonb_build_object('versao',v.versao,'hash',v.hash,'emitido_em',v.emitido_em,'autor',v.autor) order by v.versao desc) from public.laudos_versoes v where v.oficina_id=w and v.laudo_id=i),'[]'),
 'historico',coalesce((select jsonb_agg(to_jsonb(e) order by e.id desc) from (select acao,motivo,versao,criado_em,id from public.laudos_eventos where oficina_id=w and laudo_id=i order by id desc limit 100) e),'[]')
 ) into r from public.laudos_tecnicos l where l.oficina_id=w and l.id=i;
 if r is null then raise exception 'Laudo não encontrado nesta empresa.' using errcode='P0002';end if;return r;end $$;
create function private.listar_laudos(w uuid,b text,s text,p integer,origem uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb;begin perform private.exigir_laudos(w);
 if p is null or p<0 or p>1000000 or length(coalesce(b,''))>160 or coalesce(s,'') not in ('','rascunho','emitido','cancelado') then raise exception 'Filtro inválido.' using errcode='22023';end if;
 with f as materialized(select l.id,l.numero,l.situacao,l.versao,l.atualizado_em,l.dados->>'titulo' titulo,l.dados->>'cliente' cliente,l.dados->>'bem' bem
 from public.laudos_tecnicos l where l.oficina_id=w and (coalesce(s,'')='' or l.situacao=s) and (origem is null or l.origem_id=origem)
 and (coalesce(b,'')='' or concat_ws(' ',l.numero::text,l.dados->>'titulo',l.dados->>'cliente',l.dados->>'bem') ilike '%'||b||'%'))
 select jsonb_build_object('total',(select count(*) from f),'itens',coalesce((select jsonb_agg(to_jsonb(x)) from(select * from f order by atualizado_em desc,id limit 24 offset p*24)x),'[]')) into r;return r;end $$;
create function private.origem_laudo(w uuid,t text,i uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o jsonb;d jsonb;rot text;serv text;begin perform private.exigir_laudos(w);
 if t='os' then
 o:=public.consultar_ordem_servico(w,i);rot:='OS #'||(o->>'numero');
 d:=jsonb_build_object('cliente',coalesce(o#>>'{dados_cliente,nome}',''),'contato_cliente',coalesce(o#>>'{dados_cliente,telefone_e164}',''),
 'bem',coalesce(o#>>'{dados_veiculo,modelo}',''),'identificacao',concat_ws(' · ',nullif(o#>>'{dados_veiculo,placa}',''),nullif(o#>>'{dados_veiculo,motor}','')),
 'solicitacao',coalesce(o->>'queixa_cliente',''),'constatacoes',coalesce(o->>'diagnostico',''),'observacoes',coalesce(o->>'resumo_cliente',''));
 else
 if t is distinct from 'atendimento' then raise exception 'Escolha uma origem válida.' using errcode='22023';end if;
 o:=public.consultar_detalhes_atendimento(w,i);rot:='Atendimento #'||coalesce(o#>>'{atendimento,numero}','');
 d:=jsonb_build_object('cliente',coalesce(o#>>'{cliente,nome}',''),'contato_cliente',coalesce(o#>>'{cliente,telefone}',''),
 'bem',coalesce(o#>>'{objeto,nome}',''),'identificacao',concat_ws(' · ',nullif(o#>>'{objeto,dados,marca}',''),nullif(o#>>'{objeto,dados,modelo}',''),nullif(o#>>'{objeto,dados,serie}',''),nullif(o#>>'{objeto,dados,imei}','')),
 'local_avaliacao',coalesce(o#>>'{objeto,dados,endereco}',''),'solicitacao',coalesce(o#>>'{atendimento,titulo}',''));
 end if;
 -- Apenas itens efetivamente concluídos; não apresenta serviços pendentes como realizados.
 select string_agg(concat_ws(' ',x->>'quantidade','×',x->>'descricao'),E'\n') into serv from jsonb_array_elements(coalesce(o->'itens','[]'))x where x->>'situacao' in ('done','concluido') or (t='atendimento' and o#>>'{atendimento,situacao}'='concluido');
 return jsonb_build_object('rotulo',rot,'dados',d||jsonb_build_object('servicos',coalesce(serv,'')));
end $$;
create function private.buscar_origens_laudo(w uuid,b text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb;begin perform private.exigir_laudos(w);
 if length(coalesce(b,''))>160 then raise exception 'Busca muito extensa.' using errcode='22023';end if;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into r from (
 select * from (
 select o.id,'os'::text tipo,o.numero,o.dados_cliente->>'nome' cliente,o.dados_veiculo->>'modelo' bem,o.criado_em
 from public.ordens_servico o where o.oficina_id=w and o.arquivado_em is null
 and (coalesce(b,'')='' or concat_ws(' ',o.numero::text,o.dados_cliente->>'nome',o.dados_veiculo->>'modelo') ilike '%'||b||'%')
 union all
 select a.id,'atendimento',a.numero,c.nome,obj.nome,a.criado_em from public.atendimentos_servicos a join public.clientes c on c.oficina_id=w and c.id=a.cliente_id
 join public.objetos_atendimento obj on obj.oficina_id=w and obj.id=a.objeto_id where a.oficina_id=w
 and (coalesce(b,'')='' or concat_ws(' ',a.numero::text,c.nome,obj.nome) ilike '%'||b||'%')
 ) q order by criado_em desc,id limit 30)x;return r;end $$;
create function private.operar_laudo(w uuid,i uuid,r integer,acao text,d jsonb,t text,origem uuid,motivo text,chave uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.laudos_tecnicos;e public.laudos_eventos;assinatura text;numero_novo bigint;v jsonb;orip jsonb;empresa jsonb;begin
 perform private.exigir_laudos(w,true);
 if i is null or chave is null or acao is null or acao not in ('salvar','emitir','revisar','cancelar') or length(coalesce(motivo,''))>2000 then raise exception 'Operação inválida.' using errcode='22023';end if;
 assinatura:=encode(sha256(convert_to(jsonb_build_array(i,r,acao,d,t,origem,motivo)::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended('laudo-id:'||i::text,0));
 select * into e from public.laudos_eventos where oficina_id=w and laudos_eventos.chave=operar_laudo.chave;
 if found then if e.assinatura<>assinatura then raise exception 'Esta solicitação já foi usada com outros dados.' using errcode='PT409';end if;return private.ler_laudo(w,i);end if;
 select * into l from public.laudos_tecnicos where id=i for update;
 if found then
  if l.oficina_id<>w then raise exception 'Laudo indisponível.' using errcode='42501';end if;
  if l.revisao is distinct from r then raise exception 'Este laudo foi alterado. Atualize antes de continuar.' using errcode='PT409';end if;
 else
  if acao<>'salvar' or r is not null then raise exception 'Salve o rascunho antes de continuar.' using errcode='22023';end if;
  if (origem is null)<>(t is null) then raise exception 'Origem incompleta.' using errcode='22023';end if;
  if origem is not null then orip:=private.origem_laudo(w,t,origem);end if;
  perform private.validar_laudo(d);
  perform pg_advisory_xact_lock(hashtextextended('laudo-numero:'||w::text,0));
  select coalesce(max(numero),0)+1 into numero_novo from public.laudos_tecnicos where oficina_id=w;
  insert into public.laudos_tecnicos(id,oficina_id,numero,origem_tipo,origem_id,origem_rotulo,dados,criado_por)
  values(i,w,numero_novo,t,origem,coalesce(orip->>'rotulo',''),d,auth.uid()) returning * into l;
 end if;
 if l.situacao='cancelado' then raise exception 'Este laudo está cancelado. O histórico permanece disponível.' using errcode='22023';end if;
 if acao='salvar' then
  if l.situacao<>'rascunho' then raise exception 'Crie uma nova revisão para alterar um laudo emitido.' using errcode='22023';end if;
  perform private.validar_laudo(d);
  update public.laudos_tecnicos set dados=d,revisao=revisao+1,atualizado_em=now() where id=i returning * into l;
 elsif acao='emitir' then
  if l.situacao<>'rascunho' then raise exception 'Este laudo já foi emitido.' using errcode='22023';end if;
  perform private.validar_laudo(l.dados,true);
  empresa:=public.consultar_identidade(w);
  v:=jsonb_build_object('dados',l.dados,'empresa',empresa,'origem',l.origem_rotulo,'numero',l.numero,'versao',l.versao+1,'emitido_em',now(),'autor',auth.uid());
  insert into public.laudos_versoes(oficina_id,laudo_id,versao,conteudo,hash,autor) values(w,i,l.versao+1,v,encode(sha256(convert_to(v::text,'UTF8')),'hex'),auth.uid());
  update public.laudos_tecnicos set situacao='emitido',versao=versao+1,revisao=revisao+1,atualizado_em=now() where id=i returning * into l;
 elsif acao='revisar' then
  if l.situacao<>'emitido' or length(trim(coalesce(motivo,'')))<3 then raise exception 'Informe o motivo da revisão de um laudo emitido.' using errcode='22023';end if;
  update public.laudos_tecnicos set situacao='rascunho',revisao=revisao+1,atualizado_em=now() where id=i returning * into l;
 else
  perform private.exigir_gestao(w,'work_orders');
  if length(trim(coalesce(motivo,'')))<3 then raise exception 'Informe o motivo do cancelamento.' using errcode='22023';end if;
  update public.laudos_tecnicos set situacao='cancelado',motivo_cancelamento=motivo,revisao=revisao+1,atualizado_em=now() where id=i returning * into l;
 end if;
 insert into public.laudos_eventos(oficina_id,laudo_id,acao,motivo,versao,autor,chave,assinatura) values(w,i,acao,coalesce(motivo,''),l.versao,auth.uid(),chave,assinatura);
 insert into public.registros_auditoria(oficina_id,usuario_autor_id,tipo_autor,acao,tipo_entidade,entidade_id,correlacao_id)
 values(w,auth.uid(),'user','laudo.'||acao,'laudo',i,chave);
 return private.ler_laudo(w,i);
end $$;
create function private.versao_laudo(w uuid,i uuid,n integer) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb;begin perform private.exigir_laudos(w);select to_jsonb(v) into r from public.laudos_versoes v where oficina_id=w and laudo_id=i and versao=n;
if r is null then raise exception 'Versão não encontrada.' using errcode='P0002';end if;return r;end $$;
create function public.consultar_versao_laudo(p_oficina uuid,p_id uuid,p_versao integer) returns jsonb language sql stable security invoker set search_path='' as $$select private.versao_laudo(p_oficina,p_id,p_versao)$$;
create function public.listar_laudos(p_oficina uuid,p_busca text default '',p_situacao text default '',p_pagina integer default 0,p_origem uuid default null) returns jsonb language sql stable security invoker set search_path='' as $$select private.listar_laudos(p_oficina,p_busca,p_situacao,p_pagina,p_origem)$$;
create function public.consultar_laudo(p_oficina uuid,p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.ler_laudo(p_oficina,p_id)$$;
create function public.consultar_origem_laudo(p_oficina uuid,p_tipo text,p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.origem_laudo(p_oficina,p_tipo,p_id)$$;
create function public.buscar_origens_laudo(p_oficina uuid,p_busca text default '') returns jsonb language sql stable security invoker set search_path='' as $$select private.buscar_origens_laudo(p_oficina,p_busca)$$;
create function public.operar_laudo(p_oficina uuid,p_id uuid,p_revisao integer,p_acao text,p_dados jsonb default null,p_tipo text default null,p_origem uuid default null,p_motivo text default '',p_chave uuid default null) returns jsonb language sql security invoker set search_path='' as $$select private.operar_laudo(p_oficina,p_id,p_revisao,p_acao,p_dados,p_tipo,p_origem,p_motivo,p_chave)$$;
do $$declare f record;begin for f in select p.oid::regprocedure assinatura,p.proname,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in ('exigir_laudos','validar_laudo','ler_laudo','listar_laudos','origem_laudo','buscar_origens_laudo','operar_laudo','consultar_laudo','consultar_origem_laudo','versao_laudo','consultar_versao_laudo') and n.nspname in ('public','private') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.assinatura);
 if f.proname not in ('exigir_laudos','validar_laudo') then execute format('grant execute on function %s to authenticated',f.assinatura);end if;
end loop;end $$;
create function private.proteger_versoes_laudo() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Versões emitidas e eventos de laudos são preservados. Crie uma revisão ou cancele o laudo.' using errcode='22023';end $$;
revoke all on function private.proteger_versoes_laudo() from public,anon,authenticated;
create trigger preservar_versao_laudo before update or delete on public.laudos_versoes for each row execute function private.proteger_versoes_laudo();
create trigger preservar_evento_laudo before update or delete on public.laudos_eventos for each row execute function private.proteger_versoes_laudo();
commit;
