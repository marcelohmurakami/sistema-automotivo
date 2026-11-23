begin;

-- Os itens executáveis continuam no atendimento. A proposta original e a decisão
-- ficam em uma fotografia independente, inclusive quando a aprovação é parcial.
alter table public.itens_atendimento_servico
 add column grupo_servico text not null default '' check(length(grupo_servico)<=100),
 add column depende_grupo text not null default '' check(length(depende_grupo)<=100);

alter function public.salvar_itens_atendimento(uuid,uuid,integer,jsonb,bigint,bigint,text) rename to salvar_itens_atendimento_sem_grupos;
revoke all on function public.salvar_itens_atendimento_sem_grupos(uuid,uuid,integer,jsonb,bigint,bigint,text) from public,anon,authenticated;
create function public.salvar_itens_atendimento(p_oficina uuid,p_atendimento uuid,p_revisao integer,p_itens jsonb,p_desconto bigint default 0,p_custo_extra bigint default 0,p_motivo text default '') returns void
language plpgsql security definer set search_path='' as $$
begin
 perform public.salvar_itens_atendimento_sem_grupos(p_oficina,p_atendimento,p_revisao,p_itens,p_desconto,p_custo_extra,p_motivo);
 update public.itens_atendimento_servico i set grupo_servico=trim(coalesce(x->>'grupo_servico','')),depende_grupo=trim(coalesce(x->>'depende_grupo',''))
 from jsonb_array_elements(p_itens) x where i.oficina_id=p_oficina and i.atendimento_id=p_atendimento and i.id=(x->>'id')::uuid;
 if exists(select 1 from public.itens_atendimento_servico i where i.atendimento_id=p_atendimento and i.depende_grupo<>'' and
   (i.depende_grupo=coalesce(nullif(i.grupo_servico,''),'Atendimento') or not exists(select 1 from public.itens_atendimento_servico j where j.atendimento_id=p_atendimento and coalesce(nullif(j.grupo_servico,''),'Atendimento')=i.depende_grupo)))
 then raise exception 'Confira os grupos: a dependência deve ser outro grupo deste orçamento.' using errcode='22023'; end if;
end $$;

create table public.propostas_atendimento (
 id uuid primary key default gen_random_uuid(), oficina_id uuid not null, atendimento_id uuid not null,
 revisao integer not null, documento jsonb not null, criado_em timestamptz not null default now(),
 decisao text check(decisao in ('aprovado','recusado')), nome_informado text, confirmado_em timestamptz,
 grupos_aprovados text[], total_aprovado_centavos bigint, desconto_aprovado_centavos bigint,
 origem text check(origem in ('equipe','link','portal')), autor uuid references auth.users(id),
 unique(oficina_id,atendimento_id,revisao), unique(oficina_id,id),
 foreign key(oficina_id,atendimento_id) references public.atendimentos_servicos(oficina_id,id)
);
create index propostas_atendimento_historico on public.propostas_atendimento(oficina_id,atendimento_id,criado_em desc);
create table public.links_proposta_atendimento (
 id uuid primary key default gen_random_uuid(), oficina_id uuid not null, proposta_id uuid not null,
 hash_token text not null unique check(hash_token ~ '^[0-9a-f]{64}$'),
 expira_em timestamptz not null, revogado_em timestamptz,
 foreign key(oficina_id,proposta_id) references public.propostas_atendimento(oficina_id,id)
);
create index links_proposta_atendimento_pai on public.links_proposta_atendimento(proposta_id);
alter table public.propostas_atendimento enable row level security;
alter table public.links_proposta_atendimento enable row level security;
revoke all on public.propostas_atendimento,public.links_proposta_atendimento from public,anon,authenticated;

create function private.preservar_proposta_atendimento() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' or old.decisao is not null or new.id<>old.id or new.oficina_id<>old.oficina_id or new.atendimento_id<>old.atendimento_id or new.revisao<>old.revisao or new.documento<>old.documento or new.criado_em<>old.criado_em then
 raise exception 'A proposta e a resposta devem ser preservadas no histórico.' using errcode='22023'; end if;
 return new;
end $$;
create trigger preservar_proposta_atendimento before update or delete on public.propostas_atendimento for each row execute function private.preservar_proposta_atendimento();

create function private.fotografar_proposta_atendimento(p_oficina uuid,p_atendimento uuid,p_revisao integer) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.atendimentos_servicos; proposta uuid; itens jsonb; desconto bigint;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_atendimento::text,0));
 select * into a from public.atendimentos_servicos where oficina_id=p_oficina and id=p_atendimento for update;
 if not found then raise exception 'Orçamento indisponível.' using errcode='42501'; end if;
 if a.revisao is distinct from p_revisao then raise exception 'O orçamento mudou. Atualize os valores antes de continuar.' using errcode='PT409'; end if;
 if a.situacao<>'orcamento' then
 raise exception 'Este atendimento não aguarda aprovação de orçamento.' using errcode='22023'; end if;
 if exists(select 1 from public.cobrancas_atendimento c join public.titulos_financeiros t on t.id=c.titulo_id where c.atendimento_id=a.id and t.cancelado_em is null) then
 raise exception 'Cancele a cobrança antes de alterar a autorização.' using errcode='22023'; end if;
 select id into proposta from public.propostas_atendimento where oficina_id=p_oficina and atendimento_id=a.id and revisao=a.revisao;
 if proposta is not null then return proposta; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'tipo',i.tipo,'descricao',i.descricao,'quantidade',i.quantidade,'unidade',i.unidade,'preco_centavos',i.preco_centavos,'grupo_servico',coalesce(nullif(i.grupo_servico,''),'Atendimento'),'depende_grupo',i.depende_grupo) order by i.tipo,i.descricao,i.id),'[]') into itens from public.itens_atendimento_servico i where i.atendimento_id=a.id;
 desconto:=coalesce((select desconto_centavos from public.comercial_atendimento where atendimento_id=a.id),0);
 if jsonb_array_length(itens)=0 then
   itens:=jsonb_build_array(jsonb_build_object('id',a.id,'tipo','servico','descricao',a.titulo,'quantidade',1,'unidade','serv','preco_centavos',a.valor_centavos,'grupo_servico','Atendimento','depende_grupo','')); desconto:=0;
 end if;
 insert into public.propostas_atendimento(oficina_id,atendimento_id,revisao,documento) values(p_oficina,a.id,a.revisao,jsonb_build_object(
 'numero',a.numero,'titulo',a.titulo,'data_servico',a.data_servico,'cliente',(select nome from public.clientes where id=a.cliente_id),
 'objeto',(select nome from public.objetos_atendimento where id=a.objeto_id),'empresa',(select jsonb_build_object('nome',nome,'ramo',ramo) from public.oficinas where id=p_oficina),
 'resumo',a.resumo_cliente,'itens',itens,'desconto_centavos',desconto,'total_centavos',a.valor_centavos)) returning id into proposta;
 return proposta;
end $$;

create function private.responder_proposta_atendimento(p_proposta uuid,p_nome text,p_decisao text,p_grupos text[],p_confirmo boolean,p_origem text) returns void
language plpgsql security definer set search_path='' as $$
declare p public.propostas_atendimento; a public.atendimentos_servicos; grupos text[]; subtotal numeric; selecionado numeric; desconto bigint; total bigint;
begin
 if p_confirmo is distinct from true or p_decisao is null or p_decisao not in ('aprovado','recusado') or length(trim(coalesce(p_nome,''))) not between 2 and 160 then
 raise exception 'Informe seu nome e confirme sua decisão.' using errcode='22023'; end if;
 select * into p from public.propostas_atendimento where id=p_proposta;
 perform pg_advisory_xact_lock(hashtextextended(p.oficina_id::text||p.atendimento_id::text,0));
 select * into a from public.atendimentos_servicos where oficina_id=p.oficina_id and id=p.atendimento_id for update;
 select * into p from public.propostas_atendimento where id=p_proposta for update;
 select coalesce(array_agg(distinct g order by g),'{}') into grupos from unnest(case when p_decisao='recusado' then '{}'::text[] else p_grupos end) g;
 if p.decisao is not null then
   if p.decisao=p_decisao and p.nome_informado=trim(p_nome) and p.grupos_aprovados=grupos and p.origem=p_origem and (p_origem='link' or p.autor=auth.uid()) then return; end if;
   raise exception 'Este orçamento já recebeu uma resposta. Atualize a tela.' using errcode='PT409';
 end if;
 if a.revisao is distinct from p.revisao then raise exception 'O orçamento mudou. Peça a versão atualizada antes de aprovar.' using errcode='PT409'; end if;
 perform private.fotografar_proposta_atendimento(p.oficina_id,p.atendimento_id,p.revisao);
 if p_decisao='aprovado' and (cardinality(grupos)=0 or exists(select 1 from unnest(grupos) g where g is null or not exists(select 1 from jsonb_array_elements(p.documento->'itens') i where i->>'grupo_servico'=g))) then
 raise exception 'Selecione ao menos um grupo válido do orçamento.' using errcode='22023'; end if;
 if p_decisao='aprovado' and exists(select 1 from jsonb_array_elements(p.documento->'itens') i where i->>'grupo_servico'=any(grupos) and coalesce(i->>'depende_grupo','')<>'' and not (i->>'depende_grupo'=any(grupos))) then
 raise exception 'Inclua também os grupos necessários aos serviços selecionados.' using errcode='22023'; end if;
 select sum(round((i->>'quantidade')::numeric*(i->>'preco_centavos')::numeric)),coalesce(sum(round((i->>'quantidade')::numeric*(i->>'preco_centavos')::numeric)) filter(where i->>'grupo_servico'=any(grupos)),0)
 into subtotal,selecionado from jsonb_array_elements(p.documento->'itens') i;
 desconto:=case when subtotal>0 then round((p.documento->>'desconto_centavos')::numeric*selecionado/subtotal) else 0 end;
 total:=selecionado-desconto;
 update public.propostas_atendimento set decisao=p_decisao,nome_informado=trim(p_nome),confirmado_em=now(),grupos_aprovados=grupos,total_aprovado_centavos=total,desconto_aprovado_centavos=desconto,origem=p_origem,autor=case when p_origem='link' then null else auth.uid() end where id=p.id;
 if p_decisao='aprovado' then
   delete from public.itens_atendimento_servico where atendimento_id=a.id and not(coalesce(nullif(grupo_servico,''),'Atendimento')=any(grupos));
   insert into public.comercial_atendimento(oficina_id,atendimento_id,desconto_centavos,orcado_centavos) values(p.oficina_id,a.id,desconto,(p.documento->>'total_centavos')::bigint)
   on conflict(atendimento_id) do update set desconto_centavos=excluded.desconto_centavos,orcado_centavos=excluded.orcado_centavos;
   update public.atendimentos_servicos set situacao='aprovado',valor_centavos=total,revisao=revisao+1,
    dados=dados||jsonb_build_object('documento','ordem','orcamento_enviado','sim','orcamento_aprovado_em',now()::text) where id=a.id;
 else
   update public.atendimentos_servicos set revisao=revisao+1,dados=dados||jsonb_build_object('orcamento_recusado_em',now()::text,'orcamento_recusado_revisao',(revisao+1)::text) where id=a.id;
 end if;
 insert into public.eventos_atendimento(oficina_id,atendimento_id,tipo,depois,autor) values(p.oficina_id,a.id,'resposta_orcamento',
 case when p_decisao='aprovado' then 'Orçamento autorizado por '||trim(p_nome)||' ('||case p_origem when 'link' then 'link do cliente' when 'portal' then 'área do cliente' else 'registrado pela equipe' end||'): '||array_to_string(grupos,', ')||'. Total autorizado: R$ '||replace(to_char(total/100.0,'FM999999999999990.00'),'.',',')||'.' else 'Orçamento recusado por '||trim(p_nome)||' ('||p_origem||').' end,case when p_origem='link' then null else auth.uid() end);
end $$;

create function public.aprovar_grupos_atendimento(p_oficina uuid,p_atendimento uuid,p_revisao integer,p_grupos text[],p_nome text,p_confirmo boolean) returns void
language plpgsql security definer set search_path='' as $$
declare proposta uuid;
begin
 perform private.gerencia_servicos(p_oficina); perform private.exigir_servicos(p_oficina,'quotes');
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_atendimento::text,0));
 select id into proposta from public.propostas_atendimento where oficina_id=p_oficina and atendimento_id=p_atendimento and revisao=p_revisao and decisao is not null;
 if proposta is null then proposta:=private.fotografar_proposta_atendimento(p_oficina,p_atendimento,p_revisao); end if;
 perform private.responder_proposta_atendimento(proposta,p_nome,'aprovado',p_grupos,p_confirmo,'equipe');
end $$;

create function public.gerar_link_proposta_atendimento(p_oficina uuid,p_atendimento uuid,p_revisao integer,p_hash_token text,p_validade_dias integer default 7) returns jsonb
language plpgsql security definer set search_path='' as $$
declare proposta uuid; validade timestamptz;
begin
 perform private.gerencia_servicos(p_oficina); perform private.exigir_servicos(p_oficina,'quotes');
 if p_hash_token is null or p_hash_token !~ '^[0-9a-f]{64}$' or p_validade_dias is null or p_validade_dias not between 1 and 90 then raise exception 'Confira a validade e o link.' using errcode='22023'; end if;
 proposta:=private.fotografar_proposta_atendimento(p_oficina,p_atendimento,p_revisao);
 update public.links_proposta_atendimento l set revogado_em=now() from public.propostas_atendimento p where l.proposta_id=p.id and p.atendimento_id=p_atendimento and l.revogado_em is null;
 validade:=now()+make_interval(days=>p_validade_dias);
 insert into public.links_proposta_atendimento(oficina_id,proposta_id,hash_token,expira_em) values(p_oficina,proposta,p_hash_token,validade);
 -- O reenvio inicia uma nova solicitação; a recusa anterior permanece na fotografia.
 update public.atendimentos_servicos set dados=(dados-'orcamento_recusado_em'-'orcamento_recusado_revisao')||'{"orcamento_enviado":"sim"}'::jsonb where id=p_atendimento;
 insert into public.eventos_atendimento(oficina_id,atendimento_id,tipo,depois,autor) values(p_oficina,p_atendimento,'link_orcamento','Link de aprovação gerado, válido por '||p_validade_dias||' dias.',auth.uid());
 return jsonb_build_object('proposta_id',proposta,'expira_em',validade);
end $$;

create function public.revogar_links_proposta_atendimento(p_oficina uuid,p_atendimento uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.gerencia_servicos(p_oficina);
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_atendimento::text,0));
 update public.links_proposta_atendimento l set revogado_em=now() from public.propostas_atendimento p where l.oficina_id=p_oficina and l.proposta_id=p.id and p.atendimento_id=p_atendimento and l.revogado_em is null;
 insert into public.eventos_atendimento(oficina_id,atendimento_id,tipo,depois,autor) values(p_oficina,p_atendimento,'link_orcamento','Links de aprovação revogados.',auth.uid());
end $$;

create function public.consultar_proposta_atendimento(p_token text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare l public.links_proposta_atendimento; p public.propostas_atendimento; a public.atendimentos_servicos;
begin
 if p_token is null or p_token !~ '^[0-9a-f]{64}$' then raise exception 'Link inválido ou indisponível.' using errcode='P0002'; end if;
 select * into l from public.links_proposta_atendimento where hash_token=encode(sha256(convert_to(p_token,'UTF8')),'hex') and revogado_em is null and expira_em>now();
 select * into p from public.propostas_atendimento where id=l.proposta_id;
 select * into a from public.atendimentos_servicos where oficina_id=p.oficina_id and id=p.atendimento_id;
 if p.id is null or not private.has_feature(p.oficina_id,'quotes') or not exists(select 1 from public.oficinas where id=p.oficina_id and arquivado_em is null) or a.situacao='cancelado' or (p.decisao is null and a.revisao<>p.revisao) then
 raise exception 'Link vencido, substituído ou indisponível. Peça a versão atualizada à empresa.' using errcode='P0002'; end if;
 return jsonb_build_object('id',p.id,'revisao',p.revisao,'documento',p.documento,'expira_em',l.expira_em,'decisao',p.decisao,'nome_informado',p.nome_informado,'confirmado_em',p.confirmado_em,'grupos_aprovados',p.grupos_aprovados,'total_aprovado_centavos',p.total_aprovado_centavos);
end $$;

create function public.responder_link_proposta_atendimento(p_token text,p_nome text,p_decisao text,p_grupos text[],p_confirmo boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l public.links_proposta_atendimento; p public.propostas_atendimento;
begin
 perform public.consultar_proposta_atendimento(p_token);
 select * into l from public.links_proposta_atendimento where hash_token=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 select * into p from public.propostas_atendimento where id=l.proposta_id;
 perform pg_advisory_xact_lock(hashtextextended(p.oficina_id::text||p.atendimento_id::text,0));
 select * into l from public.links_proposta_atendimento where id=l.id and revogado_em is null and expira_em>clock_timestamp() for update;
 if not found then raise exception 'Link vencido ou revogado.' using errcode='P0002'; end if;
 perform public.consultar_proposta_atendimento(p_token);
 perform private.responder_proposta_atendimento(p.id,p_nome,p_decisao,p_grupos,p_confirmo,'link');
 return public.consultar_proposta_atendimento(p_token);
end $$;

create function public.responder_meu_orcamento_servico(p_oficina uuid,p_atendimento uuid,p_revisao integer,p_grupos text[],p_nome text,p_decisao text,p_confirmo boolean) returns void
language plpgsql security definer set search_path='' as $$
declare a public.atendimentos_servicos; proposta uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_atendimento::text,0));
 select * into a from public.atendimentos_servicos where oficina_id=p_oficina and id=p_atendimento for update;
 if not found or not a.compartilhado_cliente or not private.has_portal_access(p_oficina,a.cliente_id) or not private.has_feature(p_oficina,'quotes') then raise exception 'Orçamento indisponível.' using errcode='42501'; end if;
 select id into proposta from public.propostas_atendimento where oficina_id=p_oficina and atendimento_id=p_atendimento and revisao=p_revisao and decisao is not null;
 if proposta is null then proposta:=private.fotografar_proposta_atendimento(p_oficina,p_atendimento,p_revisao); end if;
 perform private.responder_proposta_atendimento(proposta,p_nome,p_decisao,p_grupos,p_confirmo,'portal');
end $$;

-- Clientes antigos continuam podendo aprovar tudo; o novo portal permite escolher.
create or replace function public.aprovar_meu_atendimento(p_oficina uuid,p_atendimento uuid,p_revisao integer) returns void
language plpgsql security definer set search_path='' as $$
declare grupos text[]; nome text;
begin
 select c.nome into nome from public.atendimentos_servicos a join public.clientes c on c.id=a.cliente_id where a.id=p_atendimento and a.oficina_id=p_oficina;
 select array_agg(distinct coalesce(nullif(grupo_servico,''),'Atendimento')) into grupos from public.itens_atendimento_servico where atendimento_id=p_atendimento and oficina_id=p_oficina;
 perform public.responder_meu_orcamento_servico(p_oficina,p_atendimento,p_revisao,coalesce(grupos,array['Atendimento']),nome,'aprovado',true);
end $$;

alter function public.consultar_detalhes_atendimento(uuid,uuid) rename to consultar_detalhes_atendimento_sem_propostas;
revoke all on function public.consultar_detalhes_atendimento_sem_propostas(uuid,uuid) from public,anon,authenticated;
create function public.consultar_detalhes_atendimento(p_oficina uuid,p_atendimento uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare dados jsonb;
begin
 dados:=public.consultar_detalhes_atendimento_sem_propostas(p_oficina,p_atendimento);
 return dados||jsonb_build_object('propostas',(select coalesce(jsonb_agg(to_jsonb(p) order by p.criado_em desc),'[]') from (select id,revisao,documento,criado_em,decisao,nome_informado,confirmado_em,grupos_aprovados,total_aprovado_centavos,origem from public.propostas_atendimento where oficina_id=p_oficina and atendimento_id=p_atendimento order by criado_em desc limit 20) p));
end $$;

-- Acrescenta somente campos públicos de agrupamento à lista do portal.
do $$ declare definicao text; begin
 definicao:=pg_get_functiondef('public.consultar_meus_atendimentos(uuid)'::regprocedure);
 definicao:=replace(definicao,'''descricao'', i.descricao', '''id'', i.id, ''grupo_servico'', i.grupo_servico, ''depende_grupo'', i.depende_grupo, ''descricao'', i.descricao');
 -- pg_get_functiondef preserva o corpo SQL, inclusive a ausência de espaços.
 definicao:=replace(definicao,'''descricao'',i.descricao', '''id'',i.id,''grupo_servico'',i.grupo_servico,''depende_grupo'',i.depende_grupo,''descricao'',i.descricao');
 execute definicao;
end $$;

alter function public.consultar_meus_atendimentos(uuid) rename to consultar_meus_atendimentos_sem_resposta;
revoke all on function public.consultar_meus_atendimentos_sem_resposta(uuid) from public,anon,authenticated;
create function public.consultar_meus_atendimentos(p_oficina uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(a||jsonb_build_object('resposta',(select jsonb_build_object('decisao',p.decisao,'nome_informado',p.nome_informado,'confirmado_em',p.confirmado_em,'total_aprovado_centavos',p.total_aprovado_centavos) from public.propostas_atendimento p where p.oficina_id=p_oficina and p.atendimento_id=(a->>'id')::uuid and p.revisao=(a->>'revisao')::integer-1 and p.decisao is not null and (p.decisao='aprovado' or exists(select 1 from public.atendimentos_servicos atual where atual.id=p.atendimento_id and atual.dados->>'orcamento_recusado_revisao'=a->>'revisao')) order by p.criado_em desc limit 1))),'[]')
 from jsonb_array_elements(public.consultar_meus_atendimentos_sem_resposta(p_oficina)) a;
$$;
revoke all on function public.consultar_meus_atendimentos(uuid) from public,anon;
grant execute on function public.consultar_meus_atendimentos(uuid) to authenticated;

revoke all on function private.preservar_proposta_atendimento(),private.fotografar_proposta_atendimento(uuid,uuid,integer),private.responder_proposta_atendimento(uuid,text,text,text[],boolean,text) from public,anon,authenticated;
revoke all on function public.salvar_itens_atendimento(uuid,uuid,integer,jsonb,bigint,bigint,text),public.aprovar_grupos_atendimento(uuid,uuid,integer,text[],text,boolean),public.gerar_link_proposta_atendimento(uuid,uuid,integer,text,integer),public.revogar_links_proposta_atendimento(uuid,uuid),public.responder_meu_orcamento_servico(uuid,uuid,integer,text[],text,text,boolean),public.consultar_detalhes_atendimento(uuid,uuid) from public,anon,authenticated;
grant execute on function public.salvar_itens_atendimento(uuid,uuid,integer,jsonb,bigint,bigint,text),public.aprovar_grupos_atendimento(uuid,uuid,integer,text[],text,boolean),public.gerar_link_proposta_atendimento(uuid,uuid,integer,text,integer),public.revogar_links_proposta_atendimento(uuid,uuid),public.responder_meu_orcamento_servico(uuid,uuid,integer,text[],text,text,boolean),public.consultar_detalhes_atendimento(uuid,uuid) to authenticated;
revoke all on function public.consultar_proposta_atendimento(text),public.responder_link_proposta_atendimento(text,text,text,text[],boolean) from public,anon,authenticated;
grant execute on function public.consultar_proposta_atendimento(text),public.responder_link_proposta_atendimento(text,text,text,text[],boolean) to anon,authenticated;
notify pgrst,'reload schema';
commit;
