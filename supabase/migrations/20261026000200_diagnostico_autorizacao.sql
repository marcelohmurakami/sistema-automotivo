begin;

-- Uma taxa por atendimento/orçamento, independente das revisões da proposta.
create table public.taxas_diagnostico (
 id uuid primary key default gen_random_uuid(), oficina_id uuid not null references public.oficinas(id),
 orcamento_id uuid, atendimento_id uuid, titulo_id uuid not null,
 valor_centavos bigint not null check(valor_centavos between 1 and 100000000),
 abater_na_aprovacao boolean not null default true,
 criado_em timestamptz not null default now(), criado_por uuid not null references auth.users(id),
 check(num_nonnulls(orcamento_id,atendimento_id)=1),
 foreign key(oficina_id,orcamento_id) references public.orcamentos(oficina_id,id),
 foreign key(oficina_id,atendimento_id) references public.atendimentos_servicos(oficina_id,id),
 foreign key(oficina_id,titulo_id) references public.titulos_financeiros(oficina_id,id),
 unique(oficina_id,orcamento_id), unique(oficina_id,atendimento_id), unique(titulo_id)
);
alter table public.taxas_diagnostico enable row level security;
revoke all on public.taxas_diagnostico from public,anon,authenticated;
alter table public.versoes_orcamento add column taxa_diagnostico jsonb not null default '{}';
alter table public.aprovacoes_orcamento add column comprovante jsonb;
alter table public.propostas_atendimento add column comprovante jsonb;
alter table public.comercial_atendimento add column abatimento_diagnostico_centavos bigint not null default 0 check(abatimento_diagnostico_centavos>=0);

create function private.dados_taxa_diagnostico(p_oficina uuid,p_documento uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce((select jsonb_build_object('valor_centavos',d.valor_centavos,'abater_na_aprovacao',d.abater_na_aprovacao,'vencimento',t.vencimento)
 from public.taxas_diagnostico d join public.titulos_financeiros t on t.id=d.titulo_id
 where d.oficina_id=p_oficina and (d.orcamento_id=p_documento or d.atendimento_id=p_documento) and t.cancelado_em is null),'{}'::jsonb)
$$;
create function private.abatimento_diagnostico(p_taxa jsonb,p_total bigint) returns bigint
language sql immutable set search_path='' as $$
 select case when coalesce((p_taxa->>'abater_na_aprovacao')::boolean,false) then least(greatest(p_total,0),coalesce((p_taxa->>'valor_centavos')::bigint,0)) else 0 end
$$;

create function public.configurar_taxa_diagnostico(p_oficina uuid,p_documento uuid,p_tipo text,p_revisao integer,p_valor bigint,p_abater boolean,p_vencimento date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid; d public.taxas_diagnostico; t public.titulos_financeiros; q public.orcamentos; a public.atendimentos_servicos; nome text; numero bigint; documento uuid; estado text;
begin
 u:=private.exigir_financeiro(p_oficina);
 if p_tipo not in ('automotivo','servico') or p_tipo is null or p_valor is null or p_valor not between 0 and 100000000 or p_abater is null or p_vencimento is null then raise exception 'Confira valor, vencimento e abatimento da taxa.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_documento::text,0));
 if p_tipo='automotivo' then
  perform private.exigir_orcamentos(p_oficina);
  select * into q from public.orcamentos where oficina_id=p_oficina and id=p_documento for update;
  if not found or q.arquivado_em is not null then raise exception 'Orçamento indisponível.' using errcode='42501';end if;
  if q.revisao is distinct from p_revisao then raise exception 'O orçamento mudou. Atualize a tela.' using errcode='PT409';end if;
  select dados_cliente->>'nome' into nome from public.versoes_orcamento where id=q.versao_atual_id;
  numero:=q.numero;
 else
  perform private.gerencia_servicos(p_oficina); perform private.exigir_servicos(p_oficina,'quotes');
  select * into a from public.atendimentos_servicos where oficina_id=p_oficina and id=p_documento for update;
  if not found then raise exception 'Atendimento indisponível.' using errcode='42501';end if;
  if a.revisao is distinct from p_revisao then raise exception 'O orçamento mudou. Atualize a tela.' using errcode='PT409';end if;
  select c.nome into nome from public.clientes c where c.id=a.cliente_id and c.oficina_id=p_oficina;numero:=a.numero;
 end if;
 select * into d from public.taxas_diagnostico where oficina_id=p_oficina and (orcamento_id=p_documento or atendimento_id=p_documento) for update;
 if d.id is null and p_valor=0 then return jsonb_build_object('titulo_id',null,'taxa','{}'::jsonb);end if;
 if p_tipo='automotivo' and q.situacao<>'draft' then raise exception 'Crie uma nova versão para alterar a taxa da proposta enviada.' using errcode='22023';end if;
 if p_tipo='servico' and a.situacao<>'orcamento' then raise exception 'Configure a taxa antes de aprovar o orçamento.' using errcode='22023';end if;
 if d.id is not null then
  select * into t from public.titulos_financeiros where id=d.titulo_id for update;
  if t.cancelado_em is null and d.valor_centavos=p_valor and d.abater_na_aprovacao=p_abater and t.vencimento=p_vencimento then return jsonb_build_object('titulo_id',t.id,'taxa',private.dados_taxa_diagnostico(p_oficina,p_documento));end if;
  if exists(select 1 from public.aprovacoes_orcamento ap join public.versoes_orcamento v on v.id=ap.versao_orcamento_id where v.orcamento_id=q.id and ap.decisao='approved')
   or exists(select 1 from public.propostas_atendimento where atendimento_id=a.id and decisao='aprovado') then raise exception 'A taxa já integra uma autorização. Preserve a cobrança e o histórico.' using errcode='22023';end if;
  if exists(select 1 from public.baixas_financeiras where titulo_id=t.id) then raise exception 'A taxa tem recebimentos registrados. Preserve os valores e use o financeiro para estornos.' using errcode='22023';end if;
 end if;
 if p_valor=0 then
  if d.id is not null then
   update public.titulos_financeiros set cancelado_em=coalesce(cancelado_em,now()),motivo_cancelamento='Taxa removida do orçamento',revisao=revisao+1 where id=d.titulo_id;
  end if;
 else
  documento:=coalesce(d.titulo_id,gen_random_uuid());
  insert into public.titulos_financeiros(id,oficina_id,natureza,descricao,categoria,valor_centavos,competencia,vencimento,pessoa,criado_por)
  values(documento,p_oficina,'receber','Diagnóstico · orçamento #'||numero,'servicos',p_valor,(now() at time zone 'America/Sao_Paulo')::date,p_vencimento,coalesce(nome,'Cliente'),u)
  on conflict(id) do update set valor_centavos=excluded.valor_centavos,vencimento=excluded.vencimento,pessoa=excluded.pessoa,cancelado_em=null,motivo_cancelamento=null,revisao=titulos_financeiros.revisao+1;
  if d.id is null then
   insert into public.taxas_diagnostico(oficina_id,orcamento_id,atendimento_id,titulo_id,valor_centavos,abater_na_aprovacao,criado_por) values(p_oficina,q.id,a.id,documento,p_valor,p_abater,u);
  else update public.taxas_diagnostico set valor_centavos=p_valor,abater_na_aprovacao=p_abater where id=d.id;end if;
  perform private.evento_financeiro(p_oficina,documento,'diagnostico_gerado');
 end if;
 if p_tipo='automotivo' then
  update public.versoes_orcamento set taxa_diagnostico=private.dados_taxa_diagnostico(p_oficina,q.id) where id=q.versao_atual_id;
  update public.orcamentos set revisao=revisao+1 where id=q.id;
 else
  update public.atendimentos_servicos set revisao=revisao+1 where id=a.id;
  insert into public.eventos_atendimento(oficina_id,atendimento_id,tipo,depois,autor) values(p_oficina,a.id,'diagnostico','Taxa de diagnóstico configurada; cobrança a receber, sem presumir pagamento.',u);
 end if;
 return jsonb_build_object('titulo_id',documento,'taxa',private.dados_taxa_diagnostico(p_oficina,p_documento));
end $$;

create function public.consultar_taxa_diagnostico(p_oficina uuid,p_documento uuid,p_tipo text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare resultado jsonb;
begin
 perform private.exigir_financeiro(p_oficina);
 if p_tipo='automotivo' then perform public.consultar_orcamento(p_oficina,p_documento);
 elsif p_tipo='servico' then perform public.consultar_detalhes_atendimento(p_oficina,p_documento);
 else raise exception 'Documento inválido.' using errcode='22023';end if;
 select jsonb_build_object('titulo_id',d.titulo_id,'valor_centavos',d.valor_centavos,'abater_na_aprovacao',d.abater_na_aprovacao,'vencimento',t.vencimento,'recebido_centavos',t.baixado_centavos,'aberto_centavos',t.aberto_centavos,'cancelado',t.cancelado_em is not null)
 into resultado from public.taxas_diagnostico d join private.financeiro_saldos t on t.id=d.titulo_id where d.oficina_id=p_oficina and (d.orcamento_id=p_documento or d.atendimento_id=p_documento);
 return resultado;
end $$;

-- A edição/cancelamento da taxa passa pelo orçamento para invalidar links antigos.
create function private.proteger_titulo_diagnostico() returns trigger language plpgsql security definer set search_path='' as $$
declare d public.taxas_diagnostico;
begin
 select * into d from public.taxas_diagnostico where titulo_id=old.id;
 if d.id is null then return new;end if;
 if (new.valor_centavos,new.vencimento,new.cancelado_em,new.natureza,new.categoria,new.ordem_servico_id) is distinct from (old.valor_centavos,old.vencimento,old.cancelado_em,old.natureza,old.categoria,old.ordem_servico_id) then
  if current_setting('patio.configurando_diagnostico',true) is distinct from d.oficina_id::text||':'||coalesce(d.orcamento_id,d.atendimento_id)::text then raise exception 'Altere a taxa no orçamento para manter a cobrança e o abatimento consistentes.' using errcode='22023';end if;
 end if;
 return new;
end $$;
create trigger proteger_titulo_diagnostico before update on public.titulos_financeiros for each row execute function private.proteger_titulo_diagnostico();

-- Conteúdo imutável e público: não inclui custos, tokens, IPs ou notas internas.
create function private.normalizar_json_comprovante(j jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
begin
 case jsonb_typeof(j)
 when 'number' then return to_jsonb(trim_scale((j#>>'{}')::numeric));
 when 'array' then return coalesce((select jsonb_agg(private.normalizar_json_comprovante(value) order by n) from jsonb_array_elements(j) with ordinality a(value,n)),'[]');
 when 'object' then return coalesce((select jsonb_object_agg(key,private.normalizar_json_comprovante(value)) from jsonb_each(j)),'{}');
 else return j;
 end case;
end $$;
create function private.comprovante_orcamento(p_versao uuid,p_nome text,p_decisao text,p_grupos text[],p_total bigint,p_desconto bigint,p_origem text,p_data timestamptz,p_taxa jsonb,p_documento jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare prova jsonb; texto text;
begin
 texto:=case when p_decisao in ('approved','aprovado') then 'Autorizo somente os grupos selecionados e os valores deste orçamento. Serviços adicionais dependem de nova autorização.' else 'Não autorizo a execução dos serviços desta versão do orçamento.' end;
 prova:=jsonb_build_object('versao_id',p_versao,'nome',p_nome,'decisao',p_decisao,'grupos',coalesce(p_grupos,'{}'),'total_centavos',p_total,'desconto_centavos',p_desconto,'origem',p_origem,'confirmado_em',p_data,'declaracao',texto,'taxa_diagnostico',p_taxa,'documento',p_documento);
 prova:=private.normalizar_json_comprovante(prova);
 return prova||jsonb_build_object('hash_sha256',encode(sha256(convert_to(prova::text,'UTF8')),'hex'));
end $$;

create function private.manifestacao_automotiva() returns trigger language plpgsql security definer set search_path='' as $$
declare v public.versoes_orcamento; q public.orcamentos; taxa jsonb; abatimento bigint; documento jsonb; grupos text[];
begin
 select * into v from public.versoes_orcamento where oficina_id=new.oficina_id and id=new.versao_orcamento_id;
 if new.metodo_verificacao='oficina' and nullif(current_setting('patio.nome_autorizacao',true),'') is not null then
  new.nome_informado:=current_setting('patio.nome_autorizacao',true);
  new.texto_confirmacao:='Autorização informada pela equipe via '||current_setting('patio.canal_autorizacao',true)||'.';
 end if;
 select * into q from public.orcamentos where id=v.orcamento_id;
 taxa:=v.taxa_diagnostico;
 if taxa<>'{}' and taxa is distinct from private.dados_taxa_diagnostico(new.oficina_id,q.id) then raise exception 'A taxa mudou. Solicite uma nova versão do orçamento.' using errcode='PT409';end if;
 select coalesce(array_agg(distinct grupo_servico order by grupo_servico),'{}') into grupos from public.itens_orcamento where versao_orcamento_id=v.id;
 new.grupos_aprovados:=case when new.decisao='approved' then coalesce(new.grupos_aprovados,grupos) else '{}' end;
 new.subtotal_aprovado_centavos:=case when new.decisao='approved' then coalesce(new.subtotal_aprovado_centavos,v.subtotal_centavos) else 0 end;
 new.desconto_aprovado_centavos:=case when new.decisao='approved' then coalesce(new.desconto_aprovado_centavos,v.desconto_centavos) else 0 end;
 abatimento:=private.abatimento_diagnostico(taxa,new.subtotal_aprovado_centavos-new.desconto_aprovado_centavos);
 new.desconto_aprovado_centavos:=new.desconto_aprovado_centavos+abatimento;
 new.total_aprovado_centavos:=new.subtotal_aprovado_centavos-new.desconto_aprovado_centavos;
 select jsonb_build_object('numero',q.numero,'versao',v.numero_versao,'empresa',v.dados_oficina->>'nome','cliente',v.dados_cliente->>'nome','objeto',concat_ws(' ',v.dados_veiculo->>'marca',v.dados_veiculo->>'modelo'),'data_servico',v.data_servico,'condicoes',v.condicoes,'observacoes',v.observacoes,'total_centavos',v.total_centavos,'itens',(select jsonb_agg(jsonb_build_object('descricao',i.descricao,'tipo',i.tipo,'quantidade',i.quantidade,'preco_centavos',i.preco_unitario_centavos,'grupo_servico',i.grupo_servico,'unidade',i.unidade) order by i.posicao) from public.itens_orcamento i where i.versao_orcamento_id=v.id)) into documento;
 new.comprovante:=private.comprovante_orcamento(v.id,new.nome_informado,new.decisao,new.grupos_aprovados,new.total_aprovado_centavos,new.desconto_aprovado_centavos,case when new.metodo_verificacao='oficina' then 'equipe' else 'link' end,new.confirmado_em,taxa||jsonb_build_object('abatimento_centavos',abatimento),documento);
 if new.metodo_verificacao='oficina' then
  new.comprovante:=(new.comprovante-'hash_sha256')||jsonb_build_object('registro_equipe',new.texto_confirmacao);
  new.comprovante:=new.comprovante||jsonb_build_object('hash_sha256',encode(sha256(convert_to(new.comprovante::text,'UTF8')),'hex'));
 end if;
 new.texto_confirmacao:=new.comprovante->>'declaracao';
 return new;
end $$;
create trigger manifestacao_automotiva before insert on public.aprovacoes_orcamento for each row execute function private.manifestacao_automotiva();

create function private.manifestacao_servico() returns trigger language plpgsql security definer set search_path='' as $$
declare subtotal numeric; selecionado numeric; desconto_base bigint;
begin
 if old.decisao is null and new.decisao is not null then
  select sum(round((i->>'quantidade')::numeric*(i->>'preco_centavos')::numeric)),coalesce(sum(round((i->>'quantidade')::numeric*(i->>'preco_centavos')::numeric)) filter(where i->>'grupo_servico'=any(new.grupos_aprovados)),0) into subtotal,selecionado from jsonb_array_elements(new.documento->'itens') i;
  desconto_base:=case when subtotal>0 then round((new.documento->>'desconto_centavos')::numeric*selecionado/subtotal) else 0 end;
  new.comprovante:=private.comprovante_orcamento(new.id,new.nome_informado,new.decisao,new.grupos_aprovados,new.total_aprovado_centavos,new.desconto_aprovado_centavos,new.origem,new.confirmado_em,
   coalesce(new.documento->'taxa_diagnostico','{}')||jsonb_build_object('abatimento_centavos',new.desconto_aprovado_centavos-desconto_base),new.documento);
  if new.origem='equipe' then
   new.comprovante:=(new.comprovante-'hash_sha256')||jsonb_build_object('registro_equipe','Autorização informada pela equipe via '||coalesce(nullif(current_setting('patio.canal_autorizacao',true),''),'canal não informado')||'.');
   new.comprovante:=new.comprovante||jsonb_build_object('hash_sha256',encode(sha256(convert_to(new.comprovante::text,'UTF8')),'hex'));
  end if;
 end if;
 return new;
end $$;
create trigger manifestacao_servico before update on public.propostas_atendimento for each row execute function private.manifestacao_servico();

-- Patches com verificação explícita das definições existentes.
do $$ declare s text; n text; begin
 s:=pg_get_functiondef('public.configurar_taxa_diagnostico(uuid,uuid,text,integer,bigint,boolean,date)'::regprocedure);
 n:=replace(s,'select * into d from public.taxas_diagnostico','perform set_config(''patio.configurando_diagnostico'',p_oficina::text||'':''||p_documento::text,true); select * into d from public.taxas_diagnostico');execute n;
 s:=pg_get_functiondef('public.revisar_orcamento(uuid,uuid,integer)'::regprocedure);
 n:=replace(s,'data_servico=v.data_servico','taxa_diagnostico=v.taxa_diagnostico,data_servico=v.data_servico');if n=s then raise exception 'Revisão incompatível';end if;execute n;
 s:=pg_get_functiondef('public.consultar_orcamento_publico(text)'::regprocedure);
 n:=replace(s,'''data_servico'',v.data_servico','''taxa_diagnostico'',v.taxa_diagnostico,''data_servico'',v.data_servico');
 n:=replace(n,'''confirmado_em'',confirmado_em','''comprovante'',comprovante,''confirmado_em'',confirmado_em');if n=s then raise exception 'Consulta pública incompatível';end if;execute n;
 s:=pg_get_functiondef('private.dados_orcamento(uuid,uuid,uuid)'::regprocedure);
 n:=replace(s,'''confirmado_em'',a.confirmado_em','''comprovante'',a.comprovante,''confirmado_em'',a.confirmado_em');if n=s then raise exception 'Consulta interna incompatível';end if;execute n;
 s:=pg_get_functiondef('private.fotografar_proposta_atendimento(uuid,uuid,integer)'::regprocedure);
 n:=replace(s,'''numero'',a.numero','''versao'',a.revisao,''taxa_diagnostico'',private.dados_taxa_diagnostico(p_oficina,a.id),''numero'',a.numero');
 n:=replace(n,'''preco_centavos'',a.valor_centavos','''preco_centavos'',a.valor_centavos+coalesce((select abatimento_diagnostico_centavos from public.comercial_atendimento where atendimento_id=a.id),0)');
 n:=replace(n,'''total_centavos'',a.valor_centavos','''total_centavos'',a.valor_centavos+coalesce((select abatimento_diagnostico_centavos from public.comercial_atendimento where atendimento_id=a.id),0)');if n=s then raise exception 'Fotografia incompatível';end if;execute n;
 s:=pg_get_functiondef('private.responder_proposta_atendimento(uuid,text,text,text[],boolean,text)'::regprocedure);
 n:=replace(s,'total bigint;','total bigint; abatimento bigint;');
 n:=replace(n,'total:=selecionado-desconto;','abatimento:=private.abatimento_diagnostico(p.documento->''taxa_diagnostico'',(selecionado-desconto)::bigint); total:=selecionado-desconto-abatimento;');
 n:=replace(n,'desconto_aprovado_centavos=desconto','desconto_aprovado_centavos=desconto+abatimento');
 n:=replace(n,'orcado_centavos=excluded.orcado_centavos;','orcado_centavos=excluded.orcado_centavos; update public.comercial_atendimento set abatimento_diagnostico_centavos=abatimento where atendimento_id=a.id;');if n=s then raise exception 'Resposta incompatível';end if;execute n;
 s:=pg_get_functiondef('public.consultar_proposta_atendimento(text)'::regprocedure);
 n:=replace(s,'''id'',p.id','''comprovante'',p.comprovante,''id'',p.id');if n=s then raise exception 'Proposta pública incompatível';end if;execute n;
 s:=pg_get_functiondef('public.consultar_detalhes_atendimento(uuid,uuid)'::regprocedure);
 n:=replace(s,'select id,revisao,documento','select comprovante,id,revisao,documento');
 n:=replace(n,'''propostas'',','''taxa_diagnostico'',private.dados_taxa_diagnostico(p_oficina,p_atendimento),''propostas'',');if n=s then raise exception 'Detalhes incompatíveis';end if;execute n;
 s:=pg_get_functiondef('public.salvar_itens_atendimento_sem_grupos(uuid,uuid,integer,jsonb,bigint,bigint,text)'::regprocedure);
 n:=replace(s,'update public.atendimentos_servicos set valor_centavos=total-p_desconto',
 'update public.comercial_atendimento set abatimento_diagnostico_centavos=least(abatimento_diagnostico_centavos,total-p_desconto) where atendimento_id=p_atendimento; update public.atendimentos_servicos set valor_centavos=total-p_desconto-coalesce((select abatimento_diagnostico_centavos from public.comercial_atendimento where atendimento_id=p_atendimento),0)');if n=s then raise exception 'Itens incompatíveis';end if;execute n;
 s:=pg_get_functiondef('public.salvar_atendimento_servico(uuid,uuid,jsonb,integer)'::regprocedure);
 n:=replace(s,'select desconto_centavos from public.comercial_atendimento','select desconto_centavos+abatimento_diagnostico_centavos from public.comercial_atendimento');if n=s then raise exception 'Atendimento incompatível';end if;execute n;
end $$;

-- O portal usa os mesmos valores e a mesma manifestação que o link público.
do $$ declare s text; n text; begin
 s:=pg_get_functiondef('public.consultar_meus_atendimentos(uuid)'::regprocedure);
 n:=replace(s,'''resposta'',','''taxa_diagnostico'',private.dados_taxa_diagnostico(p_oficina,(a->>''id'')::uuid),''resposta'',');
 n:=replace(n,'''decisao'',p.decisao','''comprovante'',p.comprovante,''decisao'',p.decisao');
 if n=s then raise exception 'Portal incompatível';end if;execute n;
end $$;

create function public.registrar_autorizacao_atendimento(p_oficina uuid,p_atendimento uuid,p_revisao integer,p_grupos text[],p_nome text,p_confirmo boolean,p_canal text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_canal is null or p_canal not in ('presencial','telefone','whatsapp','email') then raise exception 'Informe como o cliente autorizou.' using errcode='22023';end if;
 perform set_config('patio.canal_autorizacao',p_canal,true);
 perform public.aprovar_grupos_atendimento(p_oficina,p_atendimento,p_revisao,p_grupos,p_nome,p_confirmo);
 perform set_config('patio.canal_autorizacao','',true);
end $$;
revoke all on function public.registrar_autorizacao_atendimento(uuid,uuid,integer,text[],text,boolean,text) from public,anon;
grant execute on function public.registrar_autorizacao_atendimento(uuid,uuid,integer,text[],text,boolean,text) to authenticated;

alter function public.salvar_orcamento(uuid,jsonb,uuid,uuid,integer) rename to salvar_orcamento_sem_diagnostico;
revoke all on function public.salvar_orcamento_sem_diagnostico(uuid,jsonb,uuid,uuid,integer) from public,anon,authenticated;
create function public.salvar_orcamento(p_oficina uuid,p_dados jsonb,p_chave uuid,p_orcamento uuid default null,p_revisao integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb; repetido boolean;
begin
 perform pg_advisory_xact_lock(hashtext(p_oficina::text||p_chave::text));
 select exists(select 1 from public.orcamentos where oficina_id=p_oficina and chave_criacao=p_chave) and p_orcamento is null into repetido;
 r:=public.salvar_orcamento_sem_diagnostico(p_oficina,p_dados,p_chave,p_orcamento,p_revisao);
 if not repetido and p_dados ? 'taxa_diagnostico' then
  perform public.configurar_taxa_diagnostico(p_oficina,(r->>'id')::uuid,'automotivo',(r->>'revisao')::integer,coalesce((p_dados->'taxa_diagnostico'->>'valor_centavos')::bigint,0),coalesce((p_dados->'taxa_diagnostico'->>'abater_na_aprovacao')::boolean,true),coalesce(nullif(p_dados->'taxa_diagnostico'->>'vencimento','')::date,(now() at time zone 'America/Sao_Paulo')::date));
 end if;
 return private.dados_orcamento(p_oficina,(r->>'id')::uuid);
end $$;
grant execute on function public.salvar_orcamento(uuid,jsonb,uuid,uuid,integer) to authenticated;
revoke all on function public.salvar_orcamento(uuid,jsonb,uuid,uuid,integer) from public,anon;

alter function public.salvar_atendimento_servico(uuid,uuid,jsonb,integer) rename to salvar_atendimento_sem_diagnostico;
revoke all on function public.salvar_atendimento_sem_diagnostico(uuid,uuid,jsonb,integer) from public,anon,authenticated;
create function public.salvar_atendimento_servico(p_oficina uuid,p_id uuid,p_dados jsonb,p_revisao integer default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare r uuid; repetido boolean; rev integer;
begin
 perform private.exigir_servicos(p_oficina);
 perform pg_advisory_xact_lock(hashtextextended(p_oficina::text||p_id::text,0));
 select exists(select 1 from public.atendimentos_servicos where oficina_id=p_oficina and id=p_id) and p_revisao is null into repetido;
 if p_dados->>'situacao' not in ('orcamento','cancelado') and exists(select 1 from public.atendimentos_servicos a join public.taxas_diagnostico d on d.atendimento_id=a.id join public.titulos_financeiros t on t.id=d.titulo_id where a.oficina_id=p_oficina and a.id=p_id and a.situacao='orcamento' and t.cancelado_em is null) then
  raise exception 'Use Aprovar orçamento para registrar a autorização do cliente e aplicar o abatimento.' using errcode='22023';
 end if;
 r:=public.salvar_atendimento_sem_diagnostico(p_oficina,p_id,p_dados,p_revisao);
 if not repetido and p_dados ? 'taxa_diagnostico' then
  select revisao into rev from public.atendimentos_servicos where oficina_id=p_oficina and id=r;
  perform public.configurar_taxa_diagnostico(p_oficina,r,'servico',rev,coalesce((p_dados->'taxa_diagnostico'->>'valor_centavos')::bigint,0),coalesce((p_dados->'taxa_diagnostico'->>'abater_na_aprovacao')::boolean,true),coalesce(nullif(p_dados->'taxa_diagnostico'->>'vencimento','')::date,(now() at time zone 'America/Sao_Paulo')::date));
 end if;
 return r;
end $$;
revoke all on function public.salvar_atendimento_servico(uuid,uuid,jsonb,integer) from public,anon;
grant execute on function public.salvar_atendimento_servico(uuid,uuid,jsonb,integer) to authenticated;

-- O canal é uma declaração da equipe, sem se passar por assinatura do cliente.
do $$ declare s text; n text; begin
 s:=pg_get_functiondef('public.aprovar_orcamento_interno(uuid,uuid,integer,uuid)'::regprocedure);
 n:=replace(s,'public.aprovar_orcamento_interno(p_oficina uuid, p_orcamento uuid, p_revisao integer, p_versao uuid)','public.registrar_autorizacao_orcamento(p_oficina uuid, p_orcamento uuid, p_revisao integer, p_versao uuid, p_nome text, p_canal text, p_confirmo boolean)');
 n:=replace(n,'u:=private.exigir_orcamentos(p_oficina);','u:=private.exigir_orcamentos(p_oficina); if p_confirmo is distinct from true or length(trim(coalesce(p_nome,''''))) not between 2 and 160 or p_canal is null or p_canal not in (''presencial'',''telefone'',''whatsapp'',''email'') then raise exception ''Informe quem autorizou, o canal e confirme a autorização.'' using errcode=''22023'';end if;');
 n:=replace(n,'''Responsável da oficina''','trim(p_nome)');
 n:=replace(n,'''Aprovação integral registrada pela oficina na lista. Orçamento #''','''Autorização informada pela equipe via ''||p_canal||''. Orçamento #''');
 if n=s or position('public.registrar_autorizacao_orcamento' in n)=0 then raise exception 'Autorização interna incompatível';end if;execute n;
end $$;
revoke all on function public.registrar_autorizacao_orcamento(uuid,uuid,integer,uuid,text,text,boolean) from public,anon;
grant execute on function public.registrar_autorizacao_orcamento(uuid,uuid,integer,uuid,text,text,boolean) to authenticated;

create function public.registrar_autorizacao_pela_os(p_oficina uuid,p_os uuid,p_revisao integer,p_orcamento uuid,p_revisao_orcamento integer,p_versao uuid,p_nome text,p_canal text,p_confirmo boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb;
begin
 if p_confirmo is distinct from true or length(trim(coalesce(p_nome,''))) not between 2 and 160 or p_canal is null or p_canal not in ('presencial','telefone','whatsapp','email') then raise exception 'Informe quem autorizou, o canal e confirme a autorização.' using errcode='22023';end if;
 perform set_config('patio.nome_autorizacao',trim(p_nome),true);
 perform set_config('patio.canal_autorizacao',p_canal,true);
 r:=public.autorizar_servico_pela_os(p_oficina,p_os,p_revisao,p_orcamento,p_revisao_orcamento,p_versao);
 perform set_config('patio.nome_autorizacao','',true);perform set_config('patio.canal_autorizacao','',true);
 return r;
end $$;
revoke all on function public.registrar_autorizacao_pela_os(uuid,uuid,integer,uuid,integer,uuid,text,text,boolean) from public,anon;
grant execute on function public.registrar_autorizacao_pela_os(uuid,uuid,integer,uuid,integer,uuid,text,text,boolean) to authenticated;

revoke all on function private.normalizar_json_comprovante(jsonb),private.dados_taxa_diagnostico(uuid,uuid),private.abatimento_diagnostico(jsonb,bigint),private.proteger_titulo_diagnostico(),private.comprovante_orcamento(uuid,text,text,text[],bigint,bigint,text,timestamptz,jsonb,jsonb),private.manifestacao_automotiva(),private.manifestacao_servico(),public.configurar_taxa_diagnostico(uuid,uuid,text,integer,bigint,boolean,date),public.consultar_taxa_diagnostico(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.configurar_taxa_diagnostico(uuid,uuid,text,integer,bigint,boolean,date),public.consultar_taxa_diagnostico(uuid,uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
