-- Escopo aprovado por grupo; custos internos nunca entram na resposta pública.
begin;
alter table public.itens_orcamento
 add column grupo_servico text not null default 'Atendimento' check(length(grupo_servico) between 1 and 80),
 add column explicacao_cliente text not null default '' check(length(explicacao_cliente)<=1000),
 add column prioridade_servico text not null default 'recomendado' check(prioridade_servico in ('urgente','recomendado','preventivo')),
 add column depende_grupo text not null default '' check(length(depende_grupo)<=80),
 add column custo_unitario_previsto_centavos bigint check(custo_unitario_previsto_centavos between 0 and 100000000),
 add column minutos_previstos integer not null default 0 check(minutos_previstos between 0 and 100000),
 add column custo_hora_centavos bigint not null default 0 check(custo_hora_centavos between 0 and 100000000);
alter table public.versoes_orcamento add column outros_custos_centavos bigint not null default 0 check(outros_custos_centavos between 0 and 100000000);
alter table public.aprovacoes_orcamento
 add column grupos_aprovados text[],
 add column subtotal_aprovado_centavos bigint,
 add column desconto_aprovado_centavos bigint,
 add column total_aprovado_centavos bigint;

alter function public.salvar_orcamento(uuid,jsonb,uuid,uuid,integer) set schema private;
alter function private.salvar_orcamento(uuid,jsonb,uuid,uuid,integer) rename to salvar_orcamento_base;
revoke all on function private.salvar_orcamento_base(uuid,jsonb,uuid,uuid,integer) from public,anon,authenticated;
create function public.salvar_orcamento(p_oficina uuid,p_dados jsonb,p_chave uuid,p_orcamento uuid default null,p_revisao integer default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb; i jsonb; n integer:=0; repetido boolean;
begin
 perform private.exigir_orcamentos(p_oficina);
 select exists(select 1 from public.orcamentos where oficina_id=p_oficina and chave_criacao=p_chave) and p_orcamento is null into repetido;
 r:=private.salvar_orcamento_base(p_oficina,p_dados,p_chave,p_orcamento,p_revisao);
 if repetido then return r;end if;
 for i in select value from jsonb_array_elements(p_dados->'itens') loop
  update public.itens_orcamento set grupo_servico=coalesce(nullif(trim(i->>'grupo_servico'),''),'Atendimento'),
    explicacao_cliente=coalesce(trim(i->>'explicacao_cliente'),''),prioridade_servico=coalesce(i->>'prioridade_servico','recomendado'),
    depende_grupo=coalesce(trim(i->>'depende_grupo'),''),custo_unitario_previsto_centavos=nullif(i->>'custo_unitario_previsto_centavos','')::bigint,
    minutos_previstos=coalesce((i->>'minutos_previstos')::integer,0),custo_hora_centavos=coalesce((i->>'custo_hora_centavos')::bigint,0)
  where oficina_id=p_oficina and versao_orcamento_id=(r->>'versao_atual_id')::uuid and posicao=n;
  n:=n+1;
 end loop;
 if exists(select 1 from public.itens_orcamento i where i.oficina_id=p_oficina and i.versao_orcamento_id=(r->>'versao_atual_id')::uuid and i.depende_grupo<>'' and
   (i.depende_grupo=i.grupo_servico or not exists(select 1 from public.itens_orcamento j where j.oficina_id=i.oficina_id and j.versao_orcamento_id=i.versao_orcamento_id and j.grupo_servico=i.depende_grupo))) then
  raise exception 'A dependência precisa ser outro grupo deste orçamento.' using errcode='22023';end if;
 update public.versoes_orcamento set outros_custos_centavos=coalesce((p_dados->>'outros_custos_centavos')::bigint,0) where oficina_id=p_oficina and id=(r->>'versao_atual_id')::uuid;
 return private.dados_orcamento(p_oficina,(r->>'id')::uuid);
end $$;

-- Patches assertivos preservam as proteções e integrações das migrações anteriores.
do $$declare s text; novo text;begin
 s:=pg_get_functiondef('public.revisar_orcamento(uuid,uuid,integer)'::regprocedure);
 novo:=replace(s,'posicao,tipo,descricao,unidade,quantidade,preco_unitario_centavos)', 'posicao,tipo,descricao,unidade,quantidade,preco_unitario_centavos,grupo_servico,explicacao_cliente,prioridade_servico,depende_grupo,custo_unitario_previsto_centavos,minutos_previstos,custo_hora_centavos)');
 novo:=replace(novo,'select oficina_id,nova,item_catalogo_id,posicao,tipo,descricao,unidade,quantidade,preco_unitario_centavos from', 'select oficina_id,nova,item_catalogo_id,posicao,tipo,descricao,unidade,quantidade,preco_unitario_centavos,grupo_servico,explicacao_cliente,prioridade_servico,depende_grupo,custo_unitario_previsto_centavos,minutos_previstos,custo_hora_centavos from');
 novo:=replace(novo,'perform private.evento_orcamento(p_oficina,q.id,q.revisao,''orcamento.revisado'',u);','update public.versoes_orcamento set outros_custos_centavos=v.outros_custos_centavos where id=nova; perform private.evento_orcamento(p_oficina,q.id,q.revisao,''orcamento.revisado'',u);');
 if novo=s then raise exception 'Revisão do orçamento incompatível';end if;execute novo;
 s:=pg_get_functiondef('public.consultar_orcamento_publico(text)'::regprocedure);
 novo:=replace(s,'''descricao'',descricao,''tipo'',tipo', '''grupo_servico'',grupo_servico,''explicacao_cliente'',explicacao_cliente,''prioridade_servico'',prioridade_servico,''depende_grupo'',depende_grupo,''descricao'',descricao,''tipo'',tipo');
 novo:=replace(novo,'''confirmado_em'',confirmado_em)', '''confirmado_em'',confirmado_em,''grupos_aprovados'',grupos_aprovados,''subtotal_aprovado_centavos'',subtotal_aprovado_centavos,''desconto_aprovado_centavos'',desconto_aprovado_centavos,''total_aprovado_centavos'',total_aprovado_centavos)');
 if novo=s then raise exception 'Consulta pública incompatível';end if;execute novo;
 s:=pg_get_functiondef('private.dados_orcamento(uuid,uuid,uuid)'::regprocedure);
 novo:=replace(s,'''confirmado_em'',a.confirmado_em)', '''confirmado_em'',a.confirmado_em,''grupos_aprovados'',a.grupos_aprovados,''subtotal_aprovado_centavos'',a.subtotal_aprovado_centavos,''desconto_aprovado_centavos'',a.desconto_aprovado_centavos,''total_aprovado_centavos'',a.total_aprovado_centavos)');
 if novo=s then raise exception 'Consulta interna incompatível';end if;execute novo;
end $$;

create function public.responder_grupos_orcamento(p_token text,p_nome text,p_decisao text,p_confirmo boolean,p_grupos text[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.tokens_acesso_orcamento; q public.orcamentos; v public.versoes_orcamento; a public.aprovacoes_orcamento; grupos text[]; sub bigint; desconto bigint;
begin
 if p_confirmo is distinct from true or p_decisao is null or p_decisao not in ('approved','declined') or length(trim(coalesce(p_nome,''))) not between 2 and 160 then raise exception 'Informe seu nome, decisão e confirmação.' using errcode='22023';end if;
 perform public.consultar_orcamento_publico(p_token);
 select * into t from public.tokens_acesso_orcamento where hash_token=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 select * into v from public.versoes_orcamento where oficina_id=t.oficina_id and id=t.versao_orcamento_id;
 select * into q from public.orcamentos where oficina_id=t.oficina_id and id=v.orcamento_id for update;
 select * into t from public.tokens_acesso_orcamento where id=t.id and revogado_em is null and expira_em>clock_timestamp() for share;
 if not found or q.versao_atual_id<>v.id then raise exception 'Link vencido ou substituído.' using errcode='P0002';end if;
 perform public.consultar_orcamento_publico(p_token);
 select coalesce(array_agg(distinct g order by g),'{}') into grupos from unnest(case when p_decisao='approved' then p_grupos else '{}' end) g;
 if p_decisao='approved' and (cardinality(grupos)=0 or cardinality(grupos)>100 or exists(select 1 from unnest(grupos) g where not exists(select 1 from public.itens_orcamento i where i.oficina_id=q.oficina_id and i.versao_orcamento_id=v.id and i.grupo_servico=g))) then raise exception 'Escolha ao menos um grupo válido.' using errcode='22023';end if;
 if exists(select 1 from public.itens_orcamento i where i.oficina_id=q.oficina_id and i.versao_orcamento_id=v.id and i.grupo_servico=any(grupos) and i.depende_grupo<>'' and not i.depende_grupo=any(grupos)) then raise exception 'Inclua os grupos necessários para executar os serviços escolhidos.' using errcode='22023';end if;
 select * into a from public.aprovacoes_orcamento where oficina_id=q.oficina_id and versao_orcamento_id=v.id;
 if found then
  if a.decisao=p_decisao and a.nome_informado=trim(p_nome) and a.grupos_aprovados is not distinct from grupos then return public.consultar_orcamento_publico(p_token);end if;
  raise exception 'Esta proposta já recebeu uma resposta.' using errcode='22023';
 end if;
 if q.situacao<>'awaiting_approval' then raise exception 'Esta proposta não aguarda resposta.' using errcode='22023';end if;
 select coalesce(sum(total_item_centavos),0) into sub from public.itens_orcamento where oficina_id=q.oficina_id and versao_orcamento_id=v.id and grupo_servico=any(grupos);
 desconto:=case when v.subtotal_centavos>0 then round(v.desconto_centavos::numeric*sub/v.subtotal_centavos) else 0 end;
 insert into public.aprovacoes_orcamento(oficina_id,versao_orcamento_id,token_acesso_id,decisao,nome_informado,texto_confirmacao,grupos_aprovados,subtotal_aprovado_centavos,desconto_aprovado_centavos,total_aprovado_centavos)
 values(q.oficina_id,v.id,t.id,p_decisao,trim(p_nome),'Confirmo a versão '||v.numero_versao||' do orçamento '||q.numero||'. Grupos: '||array_to_string(grupos,', ')||'. Valor autorizado: '||(sub-desconto)||' centavos.',grupos,sub,desconto,sub-desconto);
 update public.orcamentos set situacao=p_decisao,revisao=revisao+1,atualizado_em=now() where id=q.id returning * into q;
 perform private.evento_orcamento(q.oficina_id,q.id,q.revisao,'orcamento.'||p_decisao,null);
 return public.consultar_orcamento_publico(p_token);
end $$;
create function private.grupo_autorizado(p_versao uuid,p_grupo text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.aprovacoes_orcamento where versao_orcamento_id=p_versao and decisao='approved' and (grupos_aprovados is null or p_grupo=any(grupos_aprovados)))
$$;
create function private.valor_autorizado(p_versao uuid,p_desconto boolean default false) returns bigint language sql stable security definer set search_path='' as $$
 select case when p_desconto then coalesce(a.desconto_aprovado_centavos,v.desconto_centavos) else coalesce(a.subtotal_aprovado_centavos,v.subtotal_centavos) end from public.versoes_orcamento v join public.aprovacoes_orcamento a on a.versao_orcamento_id=v.id and a.oficina_id=v.oficina_id where v.id=p_versao and a.decisao='approved'
$$;
do $$declare s text;novo text;begin
 s:=pg_get_functiondef('public.converter_orcamento_em_os(uuid,uuid)'::regprocedure);
 novo:=replace(s,'versao_orcamento_id=v.id;', 'versao_orcamento_id=v.id and private.grupo_autorizado(v.id,grupo_servico);');
 novo:=replace(novo,'copied_total<>v.subtotal_centavos','copied_total<>private.valor_autorizado(v.id)');
 novo:=replace(novo,'v.dados_cliente,v.dados_veiculo,v.subtotal_centavos,v.desconto_centavos,u','v.dados_cliente,v.dados_veiculo,private.valor_autorizado(v.id),private.valor_autorizado(v.id,true),u');
 if novo=s then raise exception 'Conversão incompatível';end if;execute novo;
 s:=pg_get_functiondef('public.operar_produtividade(uuid,text,jsonb)'::regprocedure);
 novo:=replace(s,'from public.itens_orcamento where oficina_id=p_oficina and versao_orcamento_id=v.id;', 'from public.itens_orcamento where oficina_id=p_oficina and versao_orcamento_id=v.id and private.grupo_autorizado(v.id,grupo_servico);');
 novo:=replace(novo,'subtotal_centavos=subtotal_centavos+v.subtotal_centavos,desconto_centavos=desconto_centavos+v.desconto_centavos','subtotal_centavos=subtotal_centavos+private.valor_autorizado(v.id),desconto_centavos=desconto_centavos+private.valor_autorizado(v.id,true)');
 if novo=s then raise exception 'Adicionais incompatíveis';end if;execute novo;
end $$;
revoke all on function public.salvar_orcamento(uuid,jsonb,uuid,uuid,integer),public.responder_grupos_orcamento(text,text,text,boolean,text[]),private.grupo_autorizado(uuid,text),private.valor_autorizado(uuid,boolean) from public,anon,authenticated;
grant execute on function public.salvar_orcamento(uuid,jsonb,uuid,uuid,integer) to authenticated;
grant execute on function public.responder_grupos_orcamento(text,text,text,boolean,text[]) to anon,authenticated;
notify pgrst,'reload schema';
commit;
