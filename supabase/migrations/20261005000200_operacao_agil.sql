begin;
create table public.acompanhamentos_comerciais(
 oficina_id uuid not null references public.oficinas(id), origem text not null check(origem in ('orcamento','adiados','manutencao')), origem_id uuid not null,
 situacao text not null default 'aberto' check(situacao in ('aberto','contatado','adiado','descartado')), proximo_contato date, anotacao text not null default '' check(length(anotacao)<=2000),
 contatado_em timestamptz, orcamento_id uuid, revisao integer not null default 1,
 primary key(oficina_id,origem,origem_id),foreign key(oficina_id,orcamento_id) references public.orcamentos(oficina_id,id)
);
create unique index uma_origem_por_retorno on public.acompanhamentos_comerciais(oficina_id,orcamento_id) where orcamento_id is not null;
create table public.etapas_execucao_os(
 id uuid primary key,oficina_id uuid not null,ordem_servico_id uuid not null,nome text not null check(length(trim(nome)) between 2 and 120),posicao integer not null default 0,
 situacao text not null default 'pendente' check(situacao in ('pendente','em_andamento','aguardando_terceiro','concluida','cancelada')),
 responsavel text not null default '' check(length(responsavel)<=120),fornecedor_id uuid,prazo timestamptz,custo_centavos bigint not null default 0 check(custo_centavos between 0 and 100000000),
 observacoes text not null default '' check(length(observacoes)<=2000),titulo_financeiro_id uuid,concluida_em timestamptz,revisao integer not null default 1,
 foreign key(oficina_id,ordem_servico_id) references public.ordens_servico(oficina_id,id),foreign key(oficina_id,fornecedor_id) references public.fornecedores(oficina_id,id),foreign key(oficina_id,titulo_financeiro_id) references public.titulos_financeiros(oficina_id,id)
);
create index etapas_execucao_por_os on public.etapas_execucao_os(oficina_id,ordem_servico_id,posicao);
create table public.importacoes_oficina(
 id uuid primary key,oficina_id uuid not null references public.oficinas(id),tipo text not null check(tipo in ('clientes','catalogo','nfe')),identificador text not null check(length(identificador) between 1 and 100),resultado jsonb not null,criado_em timestamptz not null default now(),criado_por uuid not null references auth.users(id),unique(oficina_id,tipo,identificador)
);
do $$declare t text;begin foreach t in array array['acompanhamentos_comerciais','etapas_execucao_os','importacoes_oficina'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);end loop;end $$;

create function private.candidatos_retorno(p_oficina uuid) returns table(origem text,origem_id uuid,cliente_id uuid,veiculo_id uuid,descricao text,valor_centavos bigint,data_referencia date) language sql stable security definer set search_path='' as $$
 select 'orcamento',q.id,q.cliente_id,q.veiculo_id,'Orçamento #'||q.numero,v.total_centavos,coalesce(v.expira_em,v.publicado_em)::date from public.orcamentos q join public.versoes_orcamento v on v.oficina_id=q.oficina_id and v.id=q.versao_atual_id where q.oficina_id=p_oficina and (q.situacao in ('declined','expired') or (q.situacao='awaiting_approval' and v.publicado_em<now()-interval '1 day'))
 union all
 select 'adiados',q.id,q.cliente_id,q.veiculo_id,'Serviços adiados · orçamento #'||q.numero,v.total_centavos-a.total_aprovado_centavos,a.confirmado_em::date from public.orcamentos q join public.versoes_orcamento v on v.id=q.versao_atual_id and v.oficina_id=q.oficina_id join public.aprovacoes_orcamento a on a.oficina_id=q.oficina_id and a.versao_orcamento_id=v.id where q.oficina_id=p_oficina and q.situacao='approved' and a.grupos_aprovados is not null and exists(select 1 from public.itens_orcamento i where i.oficina_id=q.oficina_id and i.versao_orcamento_id=v.id and not i.grupo_servico=any(a.grupos_aprovados))
 union all
 select 'manutencao',m.id,o.cliente_id,o.veiculo_id,m.descricao,0::bigint,m.data_prevista from public.manutencoes_programadas m join public.ordens_servico o on o.oficina_id=m.oficina_id and o.id=m.ordem_servico_id where m.oficina_id=p_oficina and m.concluida_em is null and (m.data_prevista<=current_date+30 or m.data_prevista is null)
$$;
create function public.consultar_oportunidades(p_oficina uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform private.exigir_orcamentos(p_oficina);
 return jsonb_build_object('itens',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from (
 select k.*,c.nome cliente,c.telefone_e164 telefone,v.modelo veiculo,v.placa,coalesce(a.situacao,'aberto') situacao,a.proximo_contato,a.anotacao,a.contatado_em,a.orcamento_id,a.revisao,o.id ordem_servico_id,
 coalesce((select sum(b.valor_centavos*(case when b.estorno_de is null then 1 else -1 end)) from public.titulos_financeiros t join public.baixas_financeiras b on b.oficina_id=t.oficina_id and b.titulo_id=t.id where t.oficina_id=p_oficina and t.ordem_servico_id=o.id and a.contatado_em is not null and b.criado_em>=a.contatado_em),0) recebido_centavos
 from (select * from private.candidatos_retorno(p_oficina) union all select a0.origem,a0.origem_id,q.cliente_id,q.veiculo_id,'Retorno acompanhado',0::bigint,a0.contatado_em::date from public.acompanhamentos_comerciais a0 join public.orcamentos q on q.oficina_id=a0.oficina_id and q.id=a0.orcamento_id where a0.oficina_id=p_oficina and not exists(select 1 from private.candidatos_retorno(p_oficina) k0 where k0.origem=a0.origem and k0.origem_id=a0.origem_id)) k
 join public.clientes c on c.oficina_id=p_oficina and c.id=k.cliente_id and c.arquivado_em is null join public.veiculos v on v.oficina_id=p_oficina and v.id=k.veiculo_id
 left join public.acompanhamentos_comerciais a on a.oficina_id=p_oficina and a.origem=k.origem and a.origem_id=k.origem_id
 left join public.ordens_servico o on o.oficina_id=p_oficina and o.orcamento_origem_id=a.orcamento_id and o.situacao<>'cancelled'
 order by coalesce(a.proximo_contato,k.data_referencia) nulls last,k.origem_id limit 500)x));
end $$;
create function public.acompanhar_oportunidade(p_oficina uuid,p_origem text,p_origem_id uuid,p_dados jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare k record;a public.acompanhamentos_comerciais;q public.orcamentos;r jsonb;itens jsonb;
begin perform private.exigir_orcamentos(p_oficina);perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_origem||p_origem_id::text,0));
 select * into a from public.acompanhamentos_comerciais where oficina_id=p_oficina and origem=p_origem and origem_id=p_origem_id for update;
 select * into k from private.candidatos_retorno(p_oficina) where origem=p_origem and origem_id=p_origem_id;
 if not found and a.oficina_id is null then raise exception 'Oportunidade indisponível.' using errcode='P0002';end if;
 if a.oficina_id is not null and a.revisao is distinct from (p_dados->>'revisao')::integer then raise exception 'Acompanhamento alterado. Atualize a tela.' using errcode='PT409';end if;
 if p_dados->>'acao'='orcamento' then
  if a.orcamento_id is not null then return jsonb_build_object('orcamento',a.orcamento_id);end if;
  if p_origem in ('orcamento','adiados') then
   select * into q from public.orcamentos where oficina_id=p_oficina and id=p_origem_id;
   if q.situacao='awaiting_approval' and exists(select 1 from public.versoes_orcamento where id=q.versao_atual_id and expira_em>now()) then r:=jsonb_build_object('id',q.id);
   else
    select coalesce(jsonb_agg(to_jsonb(i)||jsonb_build_object('depende_grupo','') order by posicao),'[]') into itens from public.itens_orcamento i where i.oficina_id=p_oficina and i.versao_orcamento_id=q.versao_atual_id and (p_origem<>'adiados' or not private.grupo_autorizado(q.versao_atual_id,i.grupo_servico));
   end if;
  end if;
  if r is null then r:=public.salvar_orcamento(p_oficina,jsonb_build_object('cliente_id',k.cliente_id,'veiculo_id',k.veiculo_id,'itens',coalesce(itens,'[]'),'observacoes','Retorno: '||k.descricao||'. Revise os preços e as dependências antes de enviar.','condicoes','Execução após aprovação.','desconto_centavos',0),gen_random_uuid());end if;
 end if;
 insert into public.acompanhamentos_comerciais(oficina_id,origem,origem_id,situacao,proximo_contato,anotacao,contatado_em,orcamento_id) values(p_oficina,p_origem,p_origem_id,coalesce(p_dados->>'situacao',a.situacao,'aberto'),nullif(p_dados->>'proximo_contato','')::date,coalesce(p_dados->>'anotacao',a.anotacao,''),case when p_dados->>'situacao'='contatado' then coalesce(a.contatado_em,now()) else a.contatado_em end,coalesce((r->>'id')::uuid,a.orcamento_id))
 on conflict(oficina_id,origem,origem_id) do update set situacao=excluded.situacao,proximo_contato=excluded.proximo_contato,anotacao=excluded.anotacao,contatado_em=excluded.contatado_em,orcamento_id=excluded.orcamento_id,revisao=acompanhamentos_comerciais.revisao+1;
 return jsonb_build_object('orcamento',coalesce((r->>'id')::uuid,a.orcamento_id));
end $$;

create function public.consultar_etapas_execucao(p_oficina uuid,p_os uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin perform private.exigir_os(p_oficina);if not exists(select 1 from public.ordens_servico where oficina_id=p_oficina and id=p_os) then raise exception 'OS não encontrada.' using errcode='P0002';end if;
 return coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('fornecedor',f.nome) order by e.posicao,e.id) from public.etapas_execucao_os e left join public.fornecedores f on f.oficina_id=e.oficina_id and f.id=e.fornecedor_id where e.oficina_id=p_oficina and e.ordem_servico_id=p_os),'[]');end $$;
create function public.salvar_etapa_execucao(p_oficina uuid,p_os uuid,p_id uuid,p_dados jsonb,p_revisao integer default null) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid;w public.ordens_servico;e public.etapas_execucao_os;t uuid;f public.fornecedores;
begin u:=private.exigir_os(p_oficina);select * into w from public.ordens_servico where oficina_id=p_oficina and id=p_os for update;
 if not found or w.situacao in ('delivered','cancelled') then raise exception 'OS encerrada ou indisponível.' using errcode='22023';end if;
 select * into e from public.etapas_execucao_os where oficina_id=p_oficina and id=p_id for update;
 if e.id is not null and e.ordem_servico_id<>p_os then raise exception 'Etapa de outra OS.' using errcode='22023';end if;
 if e.id is not null and e.revisao is distinct from p_revisao then raise exception 'Etapa alterada. Atualize.' using errcode='PT409';end if;
 if e.titulo_financeiro_id is not null and ((p_dados->>'custo_centavos')::bigint is distinct from e.custo_centavos or nullif(p_dados->>'fornecedor_id','')::uuid is distinct from e.fornecedor_id or p_dados->>'situacao'='cancelada') then raise exception 'O serviço já gerou uma conta. Corrija o lançamento no financeiro antes de alterar custo ou cancelar.' using errcode='22023';end if;
 if nullif(p_dados->>'fornecedor_id','') is not null then
  select * into f from public.fornecedores where oficina_id=p_oficina and id=(p_dados->>'fornecedor_id')::uuid and arquivado_em is null;
  if not found then raise exception 'Fornecedor indisponível.' using errcode='22023';end if;
 end if;
 t:=e.titulo_financeiro_id;
 if coalesce((p_dados->>'gerar_conta')::boolean,false) and t is null then
  if f.id is null or p_dados->>'situacao'<>'concluida' or coalesce((p_dados->>'custo_centavos')::bigint,0)<=0 or nullif(p_dados->>'vencimento','') is null then raise exception 'Conclua o serviço e informe fornecedor, custo e vencimento.' using errcode='22023';end if;
  t:=gen_random_uuid();perform public.salvar_titulo_financeiro(p_oficina,t,jsonb_build_object('natureza','pagar','categoria','terceiros','valor_centavos',(p_dados->>'custo_centavos')::bigint,'competencia',current_date,'vencimento',p_dados->>'vencimento','descricao','Terceiro · '||(p_dados->>'nome'),'pessoa',f.nome,'ordem_servico_id',p_os),null);
 end if;
 insert into public.etapas_execucao_os(id,oficina_id,ordem_servico_id,nome,posicao,situacao,responsavel,fornecedor_id,prazo,custo_centavos,observacoes,titulo_financeiro_id,concluida_em)
 values(p_id,p_oficina,p_os,trim(p_dados->>'nome'),coalesce((p_dados->>'posicao')::integer,0),coalesce(p_dados->>'situacao','pendente'),coalesce(p_dados->>'responsavel',''),f.id,nullif(p_dados->>'prazo','')::timestamptz,coalesce((p_dados->>'custo_centavos')::bigint,0),coalesce(p_dados->>'observacoes',''),t,case when p_dados->>'situacao'='concluida' then coalesce(e.concluida_em,now()) end)
 on conflict(id) do update set nome=excluded.nome,posicao=excluded.posicao,situacao=excluded.situacao,responsavel=excluded.responsavel,fornecedor_id=excluded.fornecedor_id,prazo=excluded.prazo,custo_centavos=excluded.custo_centavos,observacoes=excluded.observacoes,titulo_financeiro_id=excluded.titulo_financeiro_id,concluida_em=excluded.concluida_em,revisao=etapas_execucao_os.revisao+1 where etapas_execucao_os.oficina_id=p_oficina and etapas_execucao_os.ordem_servico_id=p_os;
 if not found then raise exception 'Identificador de etapa indisponível.' using errcode='22023';end if;
 perform private.evento_os(p_oficina,p_os,'Etapa: '||(p_dados->>'nome')||' · '||coalesce(p_dados->>'situacao','pendente'));return p_id;
end $$;
create function public.modelo_funilaria(p_oficina uuid,p_os uuid) returns void language plpgsql security definer set search_path='' as $$
declare nome text;n integer:=0;begin perform private.exigir_os(p_oficina);perform 1 from public.ordens_servico where oficina_id=p_oficina and id=p_os for update;
 if exists(select 1 from public.etapas_execucao_os where oficina_id=p_oficina and ordem_servico_id=p_os) then raise exception 'Esta OS já tem etapas. Acrescente ou edite individualmente.' using errcode='22023';end if;
 foreach nome in array array['Desmontagem','Preparação','Pintura','Montagem','Polimento','Conferência final'] loop perform public.salvar_etapa_execucao(p_oficina,p_os,gen_random_uuid(),jsonb_build_object('nome',nome,'posicao',n));n:=n+1;end loop;end $$;

create function public.importar_cadastros(p_oficina uuid,p_chave uuid,p_tipo text,p_linhas jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid;i jsonb;r jsonb;id uuid;n integer:=0;ignorados integer:=0;v_identificador text;
begin u:=private.require_staff(p_oficina);if not exists(select 1 from public.membros_oficina where oficina_id=p_oficina and usuario_id=u and ativo and perfil in ('owner','manager')) then raise exception 'Somente gestores importam cadastros.' using errcode='42501';end if;
 if p_tipo not in ('clientes','catalogo') or p_tipo is null or p_chave is null or jsonb_typeof(p_linhas) is distinct from 'array' or jsonb_array_length(p_linhas) not between 1 and 500 then raise exception 'Importe de 1 a 500 linhas por arquivo.' using errcode='22023';end if;
 v_identificador:=encode(sha256(convert_to(p_linhas::text,'UTF8')),'hex');perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_tipo||v_identificador,0));
 select resultado into r from public.importacoes_oficina where oficina_id=p_oficina and tipo=p_tipo and importacoes_oficina.identificador=v_identificador;if found then return r||jsonb_build_object('repetida',true);end if;
 for i in select value from jsonb_array_elements(p_linhas) loop
  if p_tipo='clientes' then
   perform private.exigir_clientes(p_oficina);
   if exists(select 1 from public.clientes where oficina_id=p_oficina and arquivado_em is null and ((nullif(i->>'telefone_e164','') is not null and telefone_e164=i->>'telefone_e164') or (nullif(i->>'email','') is not null and lower(email)=lower(i->>'email')) or (lower(trim(nome))=lower(trim(i->>'nome')) and coalesce(telefone_e164,'')=coalesce(i->>'telefone_e164','') and coalesce(email,'')=coalesce(i->>'email','')))) then ignorados:=ignorados+1;continue;end if;
   perform public.salvar_cliente(p_oficina,i);
  else
   if exists(select 1 from public.itens_catalogo where oficina_id=p_oficina and arquivado_em is null and lower(trim(descricao))=lower(trim(i->>'descricao')) and tipo=i->>'tipo' and unidade=i->>'unidade') then ignorados:=ignorados+1;continue;end if;
   id:=gen_random_uuid();perform public.salvar_item_catalogo(p_oficina,id,i,null);
  end if;n:=n+1;
 end loop;
 r:=jsonb_build_object('importados',n,'ignorados',ignorados);
 insert into public.importacoes_oficina(id,oficina_id,tipo,identificador,resultado,criado_por) values(p_chave,p_oficina,p_tipo,v_identificador,r,u);return r;
end $$;

create function public.importar_compra_nfe(p_oficina uuid,p_chave uuid,p_dados jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid;f uuid;r jsonb;i jsonb;produto uuid;itens jsonb:='[]';chave text:=p_dados->>'chave_nfe';total bigint;emitente jsonb:=p_dados->'emitente';
begin u:=private.exigir_financeiro(p_oficina);perform private.exigir_estoque(p_oficina);
 if coalesce(chave,'') !~ '^[0-9]{44}$' or jsonb_typeof(p_dados->'itens') is distinct from 'array' or jsonb_array_length(p_dados->'itens') not between 1 and 100 then raise exception 'Confira a chave de acesso e os itens da NF-e.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||chave,0));
 select resultado into r from public.importacoes_oficina where oficina_id=p_oficina and tipo='nfe' and identificador=chave;if found then return r||jsonb_build_object('repetida',true);end if;
 f:=nullif(p_dados->>'fornecedor_id','')::uuid;
 if f is null then
  select id into f from public.fornecedores where oficina_id=p_oficina and documento=regexp_replace(emitente->>'documento','[^0-9]','','g') and arquivado_em is null;
  if f is null then f:=gen_random_uuid();perform public.salvar_fornecedor(p_oficina,f,emitente,null);end if;
 end if;
 for i in select value from jsonb_array_elements(p_dados->'itens') loop
  produto:=nullif(i->>'produto_id','')::uuid;
  if produto is null then
   produto:=gen_random_uuid();perform public.salvar_item_catalogo(p_oficina,produto,jsonb_build_object('tipo','part','descricao',i->>'descricao','unidade',i->>'unidade','preco_padrao_centavos',coalesce((i->>'preco_venda_centavos')::bigint,0)),null);
   insert into public.estoque_produtos(oficina_id,item_catalogo_id) values(p_oficina,produto);
  else
   if not exists(select 1 from public.itens_catalogo where oficina_id=p_oficina and id=produto and tipo='part' and arquivado_em is null and unidade=i->>'unidade') then raise exception 'Vincule uma peça ativa com a mesma unidade da nota.' using errcode='22023';end if;
   insert into public.estoque_produtos(oficina_id,item_catalogo_id) values(p_oficina,produto) on conflict do nothing;
  end if;
  itens:=itens||jsonb_build_array(jsonb_build_object('produto_id',produto,'quantidade',(i->>'quantidade')::numeric,'custo_centavos',(i->>'custo_centavos')::bigint));
 end loop;
 select sum(round((x->>'quantidade')::numeric*(x->>'custo_centavos')::bigint)) into total from jsonb_array_elements(itens)x;
 if total is distinct from (p_dados->>'total_conferido_centavos')::bigint then raise exception 'O total da conferência mudou. Revise a compra.' using errcode='22023';end if;
 perform public.registrar_compra_estoque(p_oficina,p_chave,f,(p_dados->>'data')::date,(p_dados->>'vencimento')::date,chave,'Importação NF-e conferida. Total XML: '||coalesce(p_dados->>'total_xml_centavos','não informado')||' centavos. '||coalesce(p_dados->>'observacoes',''),itens,0);
 r:=jsonb_build_object('compra',p_chave,'total_centavos',total);insert into public.importacoes_oficina(id,oficina_id,tipo,identificador,resultado,criado_por) values(p_chave,p_oficina,'nfe',chave,r,u);return r;
end $$;
do $$declare p record;begin for p in select oid::regprocedure assinatura,pronamespace from pg_proc where proname in ('candidatos_retorno','consultar_oportunidades','acompanhar_oportunidade','consultar_etapas_execucao','salvar_etapa_execucao','modelo_funilaria','importar_cadastros','importar_compra_nfe') and pronamespace in ('public'::regnamespace,'private'::regnamespace) loop execute format('revoke all on function %s from public,anon,authenticated',p.assinatura);if p.pronamespace='public'::regnamespace then execute format('grant execute on function %s to authenticated',p.assinatura);end if;end loop;end $$;
notify pgrst,'reload schema';commit;
