begin;
create table public.parametros_custeio (
 oficina_id uuid not null references public.oficinas(id), mes date not null check(extract(day from mes)=1),
 dados jsonb not null check(jsonb_typeof(dados)='object'), revisao integer not null default 1,
 atualizado_em timestamptz not null default now(), primary key(oficina_id,mes)
);
create table public.apropriacoes_custo (
 id uuid primary key, oficina_id uuid not null, titulo_id uuid not null, documento_id uuid not null,
 categoria text not null check(categoria in ('materiais','mao_obra','terceiros','deslocamento','impostos','comissoes','garantia','outros')),
 cancelado_em timestamptz,motivo_cancelamento text,fonte_origem text,
 valor bigint not null check(valor between 1 and 10000000000), criado_em timestamptz not null default now(),
 foreign key(oficina_id,titulo_id) references public.titulos_financeiros(oficina_id,id), unique(oficina_id,id)
);
create index apropriacoes_documento on public.apropriacoes_custo(oficina_id,documento_id);
create unique index apropriacoes_fonte on public.apropriacoes_custo(oficina_id,documento_id,fonte_origem) where cancelado_em is null and fonte_origem is not null;
create index apropriacoes_titulo on public.apropriacoes_custo(oficina_id,titulo_id);
create table public.conferencias_custeio (
 oficina_id uuid not null references public.oficinas(id),documento_id uuid not null,
 dados jsonb not null, assinatura text not null, revisao integer not null default 1,
 conferido_por uuid not null references auth.users(id),conferido_em timestamptz not null default now(),primary key(oficina_id,documento_id)
);
create view private.documentos_custeio as
 select o.oficina_id,o.id,o.cliente_id,coalesce(nullif(o.dados_cliente->>'nome',''),'Cliente') cliente,
 'OS #'||o.numero titulo,o.data_servico data,o.total_centavos receita,o.situacao,true automotivo,o.revisao
 from public.ordens_servico o where o.situacao<>'cancelled'
 union all select a.oficina_id,a.id,a.cliente_id,c.nome,'OS #'||a.numero||' · '||a.titulo,a.data_servico,a.valor_centavos,a.situacao,false,a.revisao
 from public.atendimentos_servicos a join public.clientes c on c.oficina_id=a.oficina_id and c.id=a.cliente_id where a.situacao not in ('cancelado','orcamento');
create function private.exigir_documento_custeio(w uuid,d uuid) returns void language plpgsql set search_path='' as $$begin
 if not exists(select 1 from private.documentos_custeio where oficina_id=w and id=d) then raise exception 'Serviço não encontrado nesta empresa.' using errcode='42501';end if;
end $$;
create function public.salvar_parametros_custeio(p_oficina uuid,p_mes date,p_dados jsonb,p_revisao integer default null) returns void language plpgsql security definer set search_path='' as $$
declare k text;v numeric;r integer;begin
 perform private.exigir_financeiro(p_oficina);
 if p_mes is null or not isfinite(p_mes) or extract(day from p_mes)<>1 or jsonb_typeof(p_dados)<>'object' then raise exception 'Informe o mês e os parâmetros.' using errcode='22023';end if;
 foreach k in array array['salarios','encargos','beneficios','prolabore','indiretos','depreciacao','profissionais','dias','horas','ocupacao','margem','impostos','taxas'] loop
 v:=(p_dados->>k)::numeric;
 if v is null or v<0 or v>10000000000 then raise exception 'Confira o parâmetro %.',k using errcode='22023';end if;
 if k in ('salarios','beneficios','prolabore','indiretos','depreciacao') and v<>trunc(v) then raise exception 'Valores monetários devem ser informados em centavos.' using errcode='22023';end if;
 end loop;
 if (p_dados->>'profissionais')::numeric not between 1 and 10000 or (p_dados->>'dias')::numeric not between 1 and 31 or (p_dados->>'horas')::numeric not between 0.01 and 24 or (p_dados->>'ocupacao')::numeric not between 0.01 and 100 or (p_dados->>'encargos')::numeric>300 or (p_dados->>'margem')::numeric+(p_dados->>'impostos')::numeric+(p_dados->>'taxas')::numeric>=100 or coalesce(p_dados->>'rateio','') not in ('horas','receita','nenhum') then raise exception 'Confira capacidade, ocupação e percentuais. Margem, impostos e taxas devem somar menos de 100%%.' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('parametros:'||p_oficina::text||p_mes::text,0));
 select revisao into r from public.parametros_custeio where oficina_id=p_oficina and mes=p_mes;
 if r is distinct from p_revisao then raise exception 'Parâmetros alterados. Atualize a tela.' using errcode='PT409';end if;
 insert into public.parametros_custeio values(p_oficina,p_mes,p_dados,1,now()) on conflict(oficina_id,mes) do update set dados=excluded.dados,revisao=parametros_custeio.revisao+1,atualizado_em=now();
 perform private.evento_financeiro(p_oficina,gen_random_uuid(),'cost_parameters');
end $$;
create function public.consultar_parametros_custeio(p_oficina uuid,p_mes date) returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform private.exigir_financeiro(p_oficina);return (select to_jsonb(x) from public.parametros_custeio x where oficina_id=p_oficina and mes=p_mes);
end $$;
-- Fontes mantêm a identificação original: valores apropriados não são novas despesas.
create function private.fontes_brutas_custeio(w uuid,d uuid) returns table(chave text,categoria text,descricao text,valor bigint,financeiro boolean,pendente boolean) language sql stable set search_path='' as $$
 select 'estoque:'||m.id,'materiais','Consumo/devolução de estoque',round(-m.quantidade*m.custo_centavos)::bigint,false,m.custo_centavos=0
 from public.movimentacoes_estoque m where m.oficina_id=w and (m.ordem_servico_id=d or m.atendimento_id=d)
 union all select 'item:'||i.id,'materiais',i.descricao,0::bigint,false,true from public.itens_ordem_servico i where i.oficina_id=w and i.ordem_servico_id=d and i.tipo='part' and i.situacao<>'cancelled' and i.removido_em is null and coalesce(i.origem_peca,'externa')='externa'
 union all select 'titulo:'||t.id,case when t.comissao_id is not null then 'comissoes' when t.categoria='pessoal' then 'mao_obra' when t.categoria='pecas_externas' then 'materiais' when t.categoria='terceiros' then 'terceiros' when t.categoria='impostos' then 'impostos' else 'outros' end,t.descricao,t.valor_centavos-coalesce((select sum(a.valor) from public.apropriacoes_custo a where a.oficina_id=w and a.titulo_id=t.id and a.cancelado_em is null),0),true,t.valor_variavel and t.valor_confirmado_em is null
 from public.titulos_financeiros t where t.oficina_id=w and t.ordem_servico_id=d and t.natureza='pagar' and t.cancelado_em is null and t.categoria not in ('compra_estoque','retirada','saldo_inicial','transferencia') and t.valor_centavos>coalesce((select sum(a.valor) from public.apropriacoes_custo a where a.oficina_id=w and a.cancelado_em is null and a.titulo_id=t.id),0)
 union all select 'apropriacao:'||a.id,a.categoria,t.descricao,a.valor,true,t.valor_variavel and t.valor_confirmado_em is null from public.apropriacoes_custo a join public.titulos_financeiros t on t.oficina_id=a.oficina_id and t.id=a.titulo_id where a.oficina_id=w and a.cancelado_em is null and a.documento_id=d and t.cancelado_em is null
 union all select 'hora:'||h.id,'mao_obra','Tempo registrado na OS',round(extract(epoch from(h.encerrado_em-h.iniciado_em))/3600*h.custo_hora_centavos)::bigint,false,h.encerrado_em is null or h.custo_hora_centavos=0 from public.apontamentos_tempo h where h.oficina_id=w and h.ordem_servico_id=d
 union all select 'hora:'||h.id,'mao_obra','Tempo registrado no atendimento',round(extract(epoch from(h.fim-h.inicio))/3600*coalesce(e.custo_hora_centavos,0))::bigint,false,h.fim is null or coalesce(e.custo_hora_centavos,0)=0 from public.horas_atendimento h left join public.equipe_atendimento e on e.oficina_id=w and e.atendimento_id=d and e.funcionario_id=h.funcionario_id where h.oficina_id=w and h.atendimento_id=d
 union all select 'item:'||i.id,case when i.tipo='material' then 'materiais' else 'outros' end,i.descricao,round(i.quantidade*i.custo_centavos)::bigint,false,i.custo_centavos=0 from public.itens_atendimento_servico i where i.oficina_id=w and i.atendimento_id=d and i.origem='externa'
 union all select 'extra:'||c.atendimento_id,'outros',coalesce(nullif(c.motivo_custo,''),'Custo complementar'),c.custo_extra_centavos,false,false from public.comercial_atendimento c where c.oficina_id=w and c.atendimento_id=d and c.custo_extra_centavos>0
 union all select 'comissao:'||c.id,'comissoes',c.descricao_servico,c.total_centavos,false,c.total_centavos is null from public.comissoes_servico c where c.oficina_id=w and c.ordem_servico_id=d and not exists(select 1 from public.titulos_financeiros t where t.oficina_id=w and t.comissao_id=c.id and t.cancelado_em is null)
 union all select 'comissao:'||e.id,'comissoes','Comissão do atendimento',e.comissao_centavos,false,false from public.equipe_atendimento e where e.oficina_id=w and e.atendimento_id=d and e.comissao_centavos>0
 union all select 'garantia:'||q.id,'garantia',q.motivo,round(q.horas_retrabalho*q.custo_hora_centavos)+q.custo_pecas_centavos+q.outros_custos_centavos+q.reembolso_centavos-q.recuperado_centavos,false,not q.custos_conferidos from public.ocorrencias_qualidade q where q.oficina_id=w and q.ordem_original_id=d and q.situacao<>'cancelada'
 union all select 'garantia:'||q.id,'garantia',q.motivo,q.custo_centavos,false,q.custo_centavos=0 from public.qualidade_atendimento q where q.oficina_id=w and q.atendimento_id=d
 union all select 'taxa:'||b.id,'impostos','Taxa de recebimento',case when b.estorno_de is null then b.taxa_centavos else -b.taxa_centavos end,true,false from public.baixas_financeiras b join public.titulos_financeiros t on t.oficina_id=b.oficina_id and t.id=b.titulo_id where b.oficina_id=w and b.taxa_centavos>0 and (t.ordem_servico_id=d or exists(select 1 from public.cobrancas_atendimento c where c.oficina_id=w and c.atendimento_id=d and c.titulo_id=t.id));
$$;
create function private.fontes_custeio(w uuid,d uuid) returns table(chave text,categoria text,descricao text,valor bigint,financeiro boolean,pendente boolean) language sql stable set search_path='' as $$
 select f.* from private.fontes_brutas_custeio(w,d) f where not exists(select 1 from public.apropriacoes_custo a join public.titulos_financeiros t on t.oficina_id=a.oficina_id and t.id=a.titulo_id where a.oficina_id=w and a.documento_id=d and a.fonte_origem=f.chave and a.cancelado_em is null and t.cancelado_em is null);
$$;
revoke all on function private.fontes_brutas_custeio(uuid,uuid) from public,anon,authenticated;
create function private.detalhe_custeio(w uuid,d uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare doc record;c public.conferencias_custeio;p public.parametros_custeio;f jsonb;assinatura text;minutos numeric;cap numeric;mao numeric;ind numeric;rateio bigint:=0;direto bigint;pendentes integer;horas_custo bigint:=0;
begin
 select * into doc from private.documentos_custeio where oficina_id=w and id=d;
 if not found then return null;end if;
 select * into c from public.conferencias_custeio where oficina_id=w and documento_id=d;
 select * into p from public.parametros_custeio where oficina_id=w and mes=date_trunc('month',doc.data)::date;
 select coalesce(jsonb_agg(to_jsonb(s) order by s.chave),'[]') into f from private.fontes_custeio(w,d)s;
 select coalesce(sum(extract(epoch from(encerrado_em-iniciado_em))/60),0) into minutos from public.apontamentos_tempo where oficina_id=w and ordem_servico_id=d;
 minutos:=minutos+coalesce((select sum(extract(epoch from(fim-inicio))/60) from public.horas_atendimento where oficina_id=w and atendimento_id=d),0);
 minutos:=coalesce(nullif(minutos,0),(c.dados->>'minutos')::numeric,0);
 if p.dados is not null then
 cap:=(p.dados->>'profissionais')::numeric*(p.dados->>'dias')::numeric*(p.dados->>'horas')::numeric*(p.dados->>'ocupacao')::numeric/100;
 mao:=(p.dados->>'salarios')::numeric*(1+(p.dados->>'encargos')::numeric/100)+(p.dados->>'beneficios')::numeric+(p.dados->>'prolabore')::numeric;
 ind:=(p.dados->>'indiretos')::numeric+(p.dados->>'depreciacao')::numeric;
 if p.dados->>'rateio'='horas' then rateio:=round(ind/cap*minutos/60);
 elsif p.dados->>'rateio'='receita' then rateio:=round(ind*doc.receita/nullif((select sum(receita) from private.documentos_custeio where oficina_id=w and data>=p.mes and data<(p.mes+interval '1 month')),0));end if;
 if not exists(select 1 from private.fontes_custeio(w,d) s where s.categoria='mao_obra' and s.valor>0 and not coalesce(c.dados->'desconsideradas','{}')?s.chave) then horas_custo:=round(mao/cap*minutos/60);end if;
 end if;
 select coalesce(sum(coalesce(s.valor,0)),0),count(*) filter(where s.pendente) into direto,pendentes from private.fontes_custeio(w,d)s where not coalesce(c.dados->'desconsideradas','{}')?s.chave;
 assinatura:=md5(jsonb_build_object('fontes',f,'receita',doc.receita,'revisao',doc.revisao,'parametros',p.dados,'minutos',minutos,'rateio',rateio)::text);
 return to_jsonb(doc)||jsonb_build_object('fontes',f,'minutos',minutos,'direto',direto,'mao_obra_apropriada',horas_custo,'indiretos',coalesce(rateio,0),'custo',direto+horas_custo+coalesce(rateio,0),'margem',doc.receita-direto-horas_custo-coalesce(rateio,0),'assinatura',assinatura,'conferencia',to_jsonb(c),'conferido',coalesce(c.assinatura=assinatura,false) and pendentes=0 and p.dados is not null,'fontes_pendentes',pendentes,'parametros',p.dados);
end $$;
create function public.consultar_custeio_servico(p_oficina uuid,p_documento uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform private.exigir_financeiro(p_oficina);perform private.exigir_documento_custeio(p_oficina,p_documento);return private.detalhe_custeio(p_oficina,p_documento);
end $$;
create function public.registrar_custo_servico(p_oficina uuid,p_documento uuid,p_chave uuid,p_dados jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare t public.titulos_financeiros;v bigint;tid uuid;c text;origem text;a public.apropriacoes_custo;begin
 perform private.exigir_financeiro(p_oficina);perform private.exigir_documento_custeio(p_oficina,p_documento);
 perform pg_advisory_xact_lock(hashtextextended('custo:'||p_oficina::text||p_chave::text,0));
 select * into a from public.apropriacoes_custo where oficina_id=p_oficina and id=p_chave;
 v:=(p_dados->>'valor')::bigint;c:=p_dados->>'categoria';origem:=nullif(p_dados->>'fonte_origem','');tid:=nullif(p_dados->>'titulo_id','')::uuid;
 if a.id is not null then
 if a.documento_id<>p_documento or a.valor is distinct from v or a.categoria is distinct from c or a.fonte_origem is distinct from origem or (tid is not null and tid<>a.titulo_id) then raise exception 'Registro já utilizado com outros dados.' using errcode='PT409';end if;return a.titulo_id;end if;
 if v is null or v not between 1 and 10000000000 or p_chave is null then raise exception 'Informe o custo.' using errcode='22023';end if;
 if origem is not null and not exists(select 1 from private.fontes_custeio(p_oficina,p_documento) f where f.chave=origem and not f.financeiro and not f.pendente and f.valor=v) then raise exception 'O custo de origem mudou. Atualize a ficha antes de vincular.' using errcode='PT409';end if;
 if tid is null then
 tid:=p_chave;perform public.salvar_titulo_financeiro(p_oficina,tid,jsonb_build_object('natureza','pagar','categoria',case c when 'materiais' then 'pecas_externas' when 'mao_obra' then 'pessoal' when 'terceiros' then 'terceiros' when 'impostos' then 'impostos' when 'comissoes' then 'pessoal' else 'outras_despesas' end,'descricao',p_dados->>'descricao','valor_centavos',v,'competencia',p_dados->>'data','vencimento',p_dados->>'vencimento','observacoes','Custo vinculado ao atendimento'),null);
 end if;
 select * into t from public.titulos_financeiros where oficina_id=p_oficina and id=tid for update;
 if not found or t.cancelado_em is not null or t.natureza<>'pagar' or t.categoria in ('compra_estoque','retirada','saldo_inicial','transferencia') then raise exception 'Escolha uma despesa ativa desta empresa.' using errcode='22023';end if;
 if t.ordem_servico_id is not null and t.ordem_servico_id<>p_documento then raise exception 'Esta despesa já pertence a outra OS.' using errcode='22023';end if;
 if v+coalesce((select sum(valor) from public.apropriacoes_custo where oficina_id=p_oficina and cancelado_em is null and titulo_id=tid),0)>t.valor_centavos then raise exception 'A soma apropriada não pode superar a despesa.' using errcode='22023';end if;
 insert into public.apropriacoes_custo(id,oficina_id,titulo_id,documento_id,categoria,valor,fonte_origem) values(p_chave,p_oficina,tid,p_documento,c,v,origem);
 perform private.evento_financeiro(p_oficina,tid,'cost_allocated');return tid;
end $$;
create function public.conferir_custeio_servico(p_oficina uuid,p_documento uuid,p_assinatura text,p_dados jsonb,p_revisao integer default null) returns void language plpgsql security definer set search_path='' as $$
declare atual jsonb;c public.conferencias_custeio;k text;v text;begin
 perform private.exigir_financeiro(p_oficina);perform private.exigir_documento_custeio(p_oficina,p_documento);
 perform pg_advisory_xact_lock(hashtextextended('conferencia:'||p_oficina::text||p_documento::text,0));
 select * into c from public.conferencias_custeio where oficina_id=p_oficina and documento_id=p_documento for update;
 if c.revisao is distinct from p_revisao then raise exception 'Conferência alterada. Atualize a tela.' using errcode='PT409';end if;
 atual:=private.detalhe_custeio(p_oficina,p_documento);
 if atual->>'assinatura' is distinct from p_assinatura then raise exception 'Os custos mudaram. Confira os valores atuais.' using errcode='PT409';end if;
 if jsonb_typeof(p_dados)<>'object' or octet_length(p_dados::text)>20000 or coalesce((p_dados->>'minutos')::numeric,-1) not between 0 and 1000000 then raise exception 'Confira os dados da revisão.' using errcode='22023';end if;
 foreach k in array array['materiais','mao_obra','terceiros','deslocamento','impostos','comissoes','garantia','outros'] loop
 v:=p_dados->'categorias'->>k;if v is null or length(trim(v)) not between 3 and 500 then raise exception 'Confira % e justifique quando não houver custo.',k using errcode='22023';end if;end loop;
 for k,v in select * from jsonb_each_text(coalesce(p_dados->'desconsideradas','{}')) loop
 if length(trim(v)) not between 3 and 500 or not exists(select 1 from private.fontes_custeio(p_oficina,p_documento)f where f.chave=k) then raise exception 'Justifique cada fonte desconsiderada.' using errcode='22023';end if;end loop;
 insert into public.conferencias_custeio values(p_oficina,p_documento,p_dados,'',1,auth.uid(),now()) on conflict(oficina_id,documento_id) do update set dados=excluded.dados,revisao=conferencias_custeio.revisao+1,conferido_por=auth.uid(),conferido_em=now();
 atual:=private.detalhe_custeio(p_oficina,p_documento);
 if (atual->>'fontes_pendentes')::int>0 then raise exception 'Há fontes sem custo ou sem término. Corrija a origem ou justifique por que não entram nesta apuração.' using errcode='22023';end if;
 update public.conferencias_custeio set assinatura=atual->>'assinatura' where oficina_id=p_oficina and documento_id=p_documento;
 perform private.evento_financeiro(p_oficina,p_documento,'costs_checked');
end $$;
create function public.listar_custeio_servicos(p_oficina uuid,p_inicio date,p_fim date,p_busca text default '',p_pagina integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare total bigint;lista jsonb;begin
 perform private.exigir_financeiro(p_oficina);
 if p_inicio is null or p_fim is null or not isfinite(p_inicio) or not isfinite(p_fim) or p_fim<p_inicio or p_fim-p_inicio>366 or p_pagina not between 0 and 100000 then raise exception 'Escolha até 367 dias.' using errcode='22023';end if;
 select count(*) into total from private.documentos_custeio where oficina_id=p_oficina and data between p_inicio and p_fim and concat(titulo,' ',cliente) ilike '%'||left(p_busca,120)||'%';
 select coalesce(jsonb_agg(private.detalhe_custeio(p_oficina,x.id)),'[]') into lista from(select id from private.documentos_custeio where oficina_id=p_oficina and data between p_inicio and p_fim and concat(titulo,' ',cliente) ilike '%'||left(p_busca,120)||'%' order by data desc,id limit 30 offset p_pagina*30)x;
 return jsonb_build_object('total',total,'itens',lista);
end $$;
do $$declare t text;f regprocedure;begin
 foreach t in array array['parametros_custeio','apropriacoes_custo','conferencias_custeio'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);end loop;
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('salvar_parametros_custeio','consultar_parametros_custeio','consultar_custeio_servico','registrar_custo_servico','conferir_custeio_servico','listar_custeio_servicos') loop execute format('revoke all on function %s from public,anon,authenticated',f);execute format('grant execute on function %s to authenticated',f);end loop;
end $$;
revoke all on function private.exigir_documento_custeio(uuid,uuid),private.fontes_custeio(uuid,uuid),private.detalhe_custeio(uuid,uuid) from public,anon,authenticated;
create function public.buscar_despesas_custeio(p_oficina uuid,p_busca text default '') returns jsonb language plpgsql security definer set search_path='' as $$begin
 perform private.exigir_financeiro(p_oficina);
 return coalesce((select jsonb_agg(to_jsonb(x)) from(select t.id,t.descricao,t.valor_centavos,t.competencia,t.ordem_servico_id,t.valor_centavos-coalesce((select sum(a.valor) from public.apropriacoes_custo a where a.oficina_id=p_oficina and a.cancelado_em is null and a.titulo_id=t.id),0) disponivel
 from public.titulos_financeiros t where t.oficina_id=p_oficina and t.natureza='pagar' and t.cancelado_em is null and t.categoria not in ('compra_estoque','retirada','saldo_inicial','transferencia') and concat(t.descricao,' ',t.pessoa) ilike '%'||left(coalesce(p_busca,''),120)||'%' order by t.competencia desc,t.id limit 40)x),'[]');
end $$;
create function private.proteger_despesa_apropriada() returns trigger language plpgsql set search_path='' as $$begin
 if new.cancelado_em is null and new.valor_centavos<coalesce((select sum(a.valor) from public.apropriacoes_custo a where a.oficina_id=new.oficina_id and a.cancelado_em is null and a.titulo_id=new.id),0) then raise exception 'O valor não pode ser menor que os custos já atribuídos aos serviços.' using errcode='22023';end if;
 return new;
end $$;
create trigger proteger_despesa_apropriada before update of valor_centavos on public.titulos_financeiros for each row execute function private.proteger_despesa_apropriada();
revoke all on function private.proteger_despesa_apropriada(),public.buscar_despesas_custeio(uuid,text) from public,anon,authenticated;
grant execute on function public.buscar_despesas_custeio(uuid,text) to authenticated;
create function public.desvincular_custo_servico(p_oficina uuid,p_id uuid,p_motivo text) returns void language plpgsql security definer set search_path='' as $$begin
 perform private.exigir_financeiro(p_oficina);
 if length(trim(coalesce(p_motivo,''))) not between 3 and 1000 then raise exception 'Informe o motivo.' using errcode='22023';end if;
 update public.apropriacoes_custo set cancelado_em=now(),motivo_cancelamento=p_motivo where oficina_id=p_oficina and id=p_id and cancelado_em is null;
 if not found and not exists(select 1 from public.apropriacoes_custo where oficina_id=p_oficina and id=p_id) then raise exception 'Custo indisponível.' using errcode='42501';end if;
 perform private.evento_financeiro(p_oficina,p_id,'cost_unlinked');
end $$;
revoke all on function public.desvincular_custo_servico(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.desvincular_custo_servico(uuid,uuid,text) to authenticated;
notify pgrst,'reload schema';commit;
