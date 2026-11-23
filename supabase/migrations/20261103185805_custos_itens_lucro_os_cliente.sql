begin;

alter table public.itens_catalogo add column custo_centavos bigint check(custo_centavos between 0 and 100000000);
alter table public.itens_ordem_servico add column custo_unitario_previsto_centavos bigint check(custo_unitario_previsto_centavos between 0 and 100000000);
alter table public.itens_ordem_servico add column custo_ajustado boolean not null default false;
alter table public.itens_atendimento_servico add column custo_informado boolean not null default false;
alter table public.itens_atendimento_servico add column custo_ajustado boolean not null default false;
update public.itens_atendimento_servico set custo_informado=true where custo_centavos>0;

create function private.gerente_custos(w uuid) returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from public.membros_oficina where oficina_id=w and usuario_id=auth.uid() and ativo and perfil in ('owner','manager'));
$$;
create function private.custo_item_inicial() returns trigger language plpgsql set search_path='' as $$
begin
 if new.custo_unitario_previsto_centavos is null then
   if new.item_orcamento_origem_id is not null then
     select custo_unitario_previsto_centavos into new.custo_unitario_previsto_centavos from public.itens_orcamento where oficina_id=new.oficina_id and id=new.item_orcamento_origem_id;
   else
     select coalesce(e.custo_centavos,c.custo_centavos) into new.custo_unitario_previsto_centavos
     from public.itens_catalogo c left join public.estoque_produtos e on e.oficina_id=c.oficina_id and e.item_catalogo_id=c.id where c.oficina_id=new.oficina_id and c.id=new.item_catalogo_id;
   end if;
 end if;
 return new;
end $$;
create trigger custo_item_inicial before insert on public.itens_ordem_servico for each row execute function private.custo_item_inicial();

-- Alterações pequenas nas funções existentes preservam revisões, bloqueios,
-- idempotência e toda a gravação dentro da mesma transação.
do $patch$
declare s text; novo text;
begin
 s:=pg_get_functiondef('public.salvar_item_catalogo(uuid,uuid,jsonb,integer)'::regprocedure);
 novo:=replace(s,'perform private.require_staff(p_oficina);', $x$perform private.require_staff(p_oficina);
 if p_dados ? 'custo_centavos' and (p_dados->>'custo_centavos')::bigint is distinct from (select custo_centavos from public.itens_catalogo where oficina_id=p_oficina and id=p_id) and not private.gerente_custos(p_oficina) then raise exception 'Somente a gerência pode alterar custos.' using errcode='42501';end if;$x$);
 novo:=replace(novo,'set descricao=v_descricao,unidade=v_unidade,', 'set custo_centavos=case when p_dados ? ''custo_centavos'' then (p_dados->>''custo_centavos'')::bigint else c.custo_centavos end,descricao=v_descricao,unidade=v_unidade,');
 novo:=replace(novo,'preco_padrao_centavos,favorito) values(p_id,p_oficina,v_tipo,v_descricao,v_unidade,preco,fav)', 'preco_padrao_centavos,favorito,custo_centavos) values(p_id,p_oficina,v_tipo,v_descricao,v_unidade,preco,fav,(p_dados->>''custo_centavos'')::bigint)');
 if novo=s or position('custo_centavos=case' in novo)=0 then raise exception 'Contrato de catálogo mudou';end if;execute novo;
 s:=pg_get_functiondef('public.listar_catalogo_paginado(uuid,text,boolean,boolean,jsonb)'::regprocedure);
 novo:=replace(s,'select id,tipo,descricao,unidade,preco_padrao_centavos,favorito,arquivado_em,revisao','select id,tipo,descricao,unidade,preco_padrao_centavos,favorito,arquivado_em,revisao,case when private.gerente_custos(p_oficina) then custo_centavos end custo_centavos');
 if novo=s then raise exception 'Contrato da listagem mudou';end if;execute novo;
 s:=pg_get_functiondef('public.buscar_cadastros_operacao(uuid,text,text,uuid,uuid,text)'::regprocedure);
 novo:=replace(s,'c.revisao,e.custo_centavos', 'c.revisao,case when private.gerente_custos(p_oficina) then coalesce(e.custo_centavos,c.custo_centavos) end custo_centavos');
 if novo=s then raise exception 'Contrato da busca mudou';end if;execute novo;
 s:=pg_get_functiondef('public.adicionar_servico_catalogo_os(uuid,uuid,integer,uuid)'::regprocedure);
 novo:=replace(s,'set item_catalogo_id=c.id,unidade=c.unidade','set item_catalogo_id=c.id,unidade=c.unidade,custo_unitario_previsto_centavos=c.custo_centavos');
 if novo=s then raise exception 'Contrato do atalho de catálogo mudou';end if;execute novo;
 s:=pg_get_functiondef('public.salvar_os_com_itens(uuid,jsonb,uuid,uuid,integer)'::regprocedure);
 novo:=replace(s,'  end loop;', $x$
    if d ? 'custo_unitario_previsto_centavos' and private.gerente_custos(p_oficina) then
      update public.itens_ordem_servico set custo_unitario_previsto_centavos=(d->>'custo_unitario_previsto_centavos')::bigint,
        custo_ajustado=coalesce((d->>'custo_ajustado')::boolean,custo_ajustado)
      where oficina_id=p_oficina and ordem_servico_id=id_os and id=id_item;
    elsif d ? 'custo_unitario_previsto_centavos' and (d->>'custo_unitario_previsto_centavos') is not null then
      raise exception 'Somente a gerência pode alterar custos.' using errcode='42501';
    end if;
  end loop;$x$);
 if novo=s then raise exception 'Contrato dos itens mudou';end if;execute novo;
 s:=pg_get_functiondef('public.salvar_itens_atendimento(uuid,uuid,integer,jsonb,bigint,bigint,text)'::regprocedure);
 novo:=replace(s,'set grupo_servico=', 'set custo_informado=coalesce((x->>''custo_informado'')::boolean,i.custo_centavos>0),custo_ajustado=coalesce((x->>''custo_ajustado'')::boolean,i.custo_ajustado),grupo_servico=');
 if novo=s then raise exception 'Contrato dos itens do atendimento mudou';end if;execute novo;
end $patch$;

create view private.itens_custos_documento as
 select i.oficina_id,i.ordem_servico_id documento_id,i.id,i.descricao,i.tipo,i.quantidade,i.preco_unitario_centavos preco,
   coalesce(i.origem_peca,'externa') origem,i.custo_unitario_previsto_centavos custo_unitario,i.custo_ajustado,
   true automotivo,i.produto_estoque_id produto_id
 from public.itens_ordem_servico i where i.removido_em is null and i.situacao<>'cancelled'
 union all select i.oficina_id,i.atendimento_id,i.id,i.descricao,case when i.tipo='material' then 'part' else 'service' end,
   i.quantidade,i.preco_centavos,i.origem,case when i.custo_informado or i.custo_centavos>0 then i.custo_centavos end,i.custo_ajustado,false,i.produto_id
 from public.itens_atendimento_servico i;
revoke all on private.itens_custos_documento from public,anon,authenticated;

-- Rateio acumulado conserva centavos quando o atendimento agrupa o mesmo produto.
create function private.custo_estoque_item(w uuid,d uuid,item uuid) returns jsonb language sql stable set search_path='' as $$
 with i as (select * from private.itens_custos_documento where oficina_id=w and documento_id=d and id=item),
 mov as (
 select m.* from public.movimentacoes_estoque m,i where m.oficina_id=w and
   (m.item_os_id=i.id or (not i.automotivo and m.atendimento_id=d and m.item_catalogo_id=i.produto_id))
 ), proporcao as (
 select x.id,x.quantidade,sum(x.quantidade) over(order by x.id) acumulada,sum(x.quantidade) over() total
 from private.itens_custos_documento x,i where x.oficina_id=w and x.documento_id=d and x.origem='estoque' and x.produto_id=i.produto_id
 )
 select jsonb_build_object('total',case when i.automotivo then (select sum(round(-quantidade*custo_centavos)) from mov)
   else (select round(sum(round(-m.quantidade*m.custo_centavos))*p.acumulada/p.total)-round(sum(round(-m.quantidade*m.custo_centavos))*(p.acumulada-p.quantidade)/p.total) from mov m) end,
   'quantidade',case when i.automotivo then (select sum(-quantidade) from mov) else (select sum(-quantidade)*i.quantidade/p.total from mov) end)
 from i left join proporcao p on p.id=i.id;
$$;
alter function private.fontes_brutas_custeio(uuid,uuid) rename to fontes_brutas_antes_custo_item;
create function private.fontes_brutas_custeio(w uuid,d uuid)
returns table(chave text,categoria text,descricao text,valor bigint,financeiro boolean,pendente boolean)
language sql stable set search_path='' as $$
 select f.* from private.fontes_brutas_antes_custo_item(w,d) f where f.chave not like 'item:%'
 union all select 'item:'||i.id,case when i.tipo='part' then 'materiais' else 'outros' end,i.descricao,
   case when i.origem='cliente' then 0 else round(i.quantidade*i.custo_unitario)::bigint end,false,
   i.origem<>'cliente' and (i.custo_unitario is null or (i.origem='estoque' and not i.custo_ajustado))
 from private.itens_custos_documento i where i.oficina_id=w and i.documento_id=d and
   (i.origem<>'estoque' or private.custo_estoque_item(w,d,i.id)->>'total' is null)
 union all select 'ajuste-item:'||i.id,'materiais','Ajuste de custo: '||i.descricao,
   round((private.custo_estoque_item(w,d,i.id)->>'quantidade')::numeric*i.custo_unitario)::bigint-(private.custo_estoque_item(w,d,i.id)->>'total')::bigint,false,false
 from private.itens_custos_documento i where i.oficina_id=w and i.documento_id=d and i.origem='estoque' and i.custo_ajustado
   and private.custo_estoque_item(w,d,i.id)->>'total' is not null;
$$;

create function public.salvar_custo_item_documento(p_oficina uuid,p_documento uuid,p_item uuid,p_revisao integer,p_custo bigint)
returns void language plpgsql security definer set search_path='' as $$
declare i record;r integer;anterior bigint;
begin
 perform private.exigir_financeiro(p_oficina);perform private.exigir_documento_custeio(p_oficina,p_documento);
 if p_custo is not null and p_custo not between 0 and 100000000 then raise exception 'Confira o custo unitário.' using errcode='22023';end if;
 select * into i from private.itens_custos_documento where oficina_id=p_oficina and documento_id=p_documento and id=p_item;
 if not found then raise exception 'Item não encontrado nesta OS.' using errcode='42501';end if;
 if i.origem='cliente' then raise exception 'O item fornecido pelo cliente não gera custo. Registre os insumos da execução em um serviço separado.' using errcode='22023';end if;
 if i.automotivo then
   select revisao into r from public.ordens_servico where oficina_id=p_oficina and id=p_documento for update;
 else
   select revisao into r from public.atendimentos_servicos where oficina_id=p_oficina and id=p_documento for update;
 end if;
 if r is distinct from p_revisao then raise exception 'A OS mudou. Atualize os custos antes de salvar.' using errcode='PT409';end if;
 anterior:=i.custo_unitario;
 if i.automotivo then
   update public.itens_ordem_servico set custo_unitario_previsto_centavos=p_custo,custo_ajustado=p_custo is not null where oficina_id=p_oficina and id=p_item;
   perform private.evento_os(p_oficina,p_documento,'Custo interno do item atualizado.',jsonb_build_object('item',p_item,'custo_anterior',anterior,'custo_atual',p_custo));
 else
   update public.itens_atendimento_servico set custo_centavos=coalesce(p_custo,0),custo_informado=p_custo is not null,custo_ajustado=p_custo is not null where oficina_id=p_oficina and id=p_item;
   update public.atendimentos_servicos set revisao=revisao+1 where oficina_id=p_oficina and id=p_documento;
   insert into public.eventos_atendimento(oficina_id,atendimento_id,tipo,antes,depois,autor)
     values(p_oficina,p_documento,'custo_item',jsonb_build_object('item',p_item,'custo',anterior)::text,jsonb_build_object('item',p_item,'custo',p_custo)::text,auth.uid());
   insert into public.registros_auditoria(oficina_id,usuario_autor_id,tipo_autor,acao,tipo_entidade,entidade_id,correlacao_id)
     values(p_oficina,auth.uid(),'user','custo_item_atualizado','atendimento',p_documento,gen_random_uuid());
 end if;
 perform private.evento_financeiro(p_oficina,p_documento,'item_cost_changed');
end $$;

create function public.consultar_lucro_documento(p_oficina uuid,p_documento uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare c jsonb; bruto bigint; pago bigint; itens jsonb; total bigint;
begin
 perform private.exigir_financeiro(p_oficina);perform private.exigir_documento_custeio(p_oficina,p_documento);
 c:=private.detalhe_custeio(p_oficina,p_documento);total:=(c->>'receita')::bigint;
 select coalesce(sum(round(quantidade*preco)),0) into bruto from private.itens_custos_documento where oficina_id=p_oficina and documento_id=p_documento;
 bruto:=greatest(bruto,total);
 select coalesce(sum(t.baixado_centavos),0) into pago from private.financeiro_saldos t where t.oficina_id=p_oficina and t.natureza='receber' and t.cancelado_em is null and t.transferencia_id is null and
 (t.ordem_servico_id=p_documento or exists(select 1 from public.cobrancas_atendimento a where a.oficina_id=p_oficina and a.atendimento_id=p_documento and a.titulo_id=t.id));
 with valores as (
   select i.*,round(i.quantidade*i.preco)::bigint venda,
     case when i.origem='cliente' then 0
     when i.origem='estoque' and private.custo_estoque_item(p_oficina,p_documento,i.id)->>'total' is not null then
       case when i.custo_ajustado then round((private.custo_estoque_item(p_oficina,p_documento,i.id)->>'quantidade')::numeric*i.custo_unitario)::bigint
       else (private.custo_estoque_item(p_oficina,p_documento,i.id)->>'total')::bigint end
     else round(i.quantidade*i.custo_unitario)::bigint end custo
   from private.itens_custos_documento i where i.oficina_id=p_oficina and i.documento_id=p_documento
 ), rateados as (
   select v.*,round(sum(venda) over(order by id)*total/nullif(bruto,0))-round((sum(venda) over(order by id)-venda)*total/nullif(bruto,0)) receita_item from valores v
 ) select coalesce(jsonb_agg(jsonb_build_object('id',id,'descricao',descricao,'quantidade',quantidade,'preco',preco,'origem',origem,'custo_unitario',custo_unitario,'custo_ajustado',custo_ajustado,'custo',custo,'receita',coalesce(receita_item,0),'margem',coalesce(receita_item,0)-custo) order by id),'[]') into itens from rateados;
 return c||jsonb_build_object('bruto',bruto,'desconto',bruto-total,'pago',pago,'aberto',greatest(total-pago,0),'itens',itens);
end $$;

create function public.consultar_lucro_cliente(p_oficina uuid,p_cliente uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r jsonb;
begin
 perform private.exigir_financeiro(p_oficina);
 if not exists(select 1 from public.clientes where oficina_id=p_oficina and id=p_cliente) then raise exception 'Cliente não encontrado nesta empresa.' using errcode='42501';end if;
 with documentos as materialized (
   select d.id,private.detalhe_custeio(p_oficina,d.id) c from private.documentos_custeio d
   where d.oficina_id=p_oficina and d.cliente_id=p_cliente and d.situacao in ('delivered','concluido')
   and (not d.automotivo or exists(select 1 from public.ordens_servico o where o.oficina_id=p_oficina and o.id=d.id and o.arquivado_em is null))
 ) select jsonb_build_object('quantidade',count(*),'receita',coalesce(sum((c->>'receita')::bigint),0),'ticket_medio',round(avg((c->>'receita')::bigint)),
   'lucro',coalesce(sum((c->>'margem')::bigint),0),'lucro_medio',round(avg((c->>'margem')::bigint)),
   'pendentes',count(*) filter(where not (c->>'conferido')::boolean)) into r from documentos;
 return r;
end $$;

create function private.ficha_cliente_servicos(w uuid,cid uuid,pagina integer,filtro text) returns jsonb
language plpgsql stable set search_path='' as $$
declare c public.clientes; resumo jsonb; historico jsonb; total bigint; fin jsonb;
begin
 perform private.exigir_clientes(w);
 if pagina is null or pagina not between 0 and 100000 or filtro is null or filtro not in ('todos','concluidos','andamento','cancelados') then raise exception 'Filtro inválido.' using errcode='22023';end if;
 select * into c from public.clientes where oficina_id=w and id=cid and (arquivado_em is null or private.gerente_custos(w));
 if not found then raise exception 'Cliente não encontrado nesta empresa.' using errcode='P0002';end if;
 select jsonb_build_object('atendimentos_concluidos',count(*) filter(where situacao='concluido'),
 'total_servicos_centavos',coalesce(sum(valor_centavos) filter(where situacao='concluido'),0),'ticket_medio_centavos',round(avg(valor_centavos) filter(where situacao='concluido')),
 'em_andamento',count(*) filter(where situacao not in ('concluido','cancelado','orcamento')),'ultimo_atendimento_em',max(concluido_em) filter(where situacao='concluido')) into resumo
 from public.atendimentos_servicos where oficina_id=w and cliente_id=cid;
 with filtrados as (select a.* from public.atendimentos_servicos a where oficina_id=w and cliente_id=cid
   and (filtro='todos' or (filtro='concluidos' and situacao='concluido') or (filtro='andamento' and situacao not in ('concluido','cancelado')) or (filtro='cancelados' and situacao='cancelado'))),
 p as (select * from filtrados order by data_servico desc,id desc limit 20 offset pagina*20)
 select (select count(*) from filtrados),coalesce(jsonb_agg(jsonb_build_object('id',a.id,'tipo','atendimento','numero',a.numero,'situacao',a.situacao,'data',a.data_servico,
 'total_centavos',a.valor_centavos,'resumo',a.titulo,'veiculo',jsonb_build_object('modelo',o.nome),
 'itens',(select coalesce(jsonb_agg(jsonb_build_object('descricao',i.descricao,'tipo',case when i.tipo='servico' then 'service' else 'part' end,'quantidade',i.quantidade,'unidade',i.unidade,'total_centavos',round(i.quantidade*i.preco_centavos),'situacao',a.situacao) order by i.id),'[]') from public.itens_atendimento_servico i where i.oficina_id=w and i.atendimento_id=a.id)) order by a.data_servico desc,a.id desc),'[]') into total,historico
 from p a left join public.objetos_atendimento o on o.oficina_id=w and o.id=a.objeto_id;
 if private.gerente_custos(w) and private.has_feature(w,'finance') then
 select jsonb_build_object('pago_centavos',coalesce(sum(t.baixado_centavos),0),'aberto_centavos',coalesce(sum(t.aberto_centavos),0)) into fin
 from private.financeiro_saldos t where t.oficina_id=w and t.natureza='receber' and t.cancelado_em is null and exists(select 1 from public.cobrancas_atendimento ca join public.atendimentos_servicos a on a.oficina_id=w and a.id=ca.atendimento_id where ca.oficina_id=w and ca.titulo_id=t.id and a.cliente_id=cid and a.situacao<>'cancelado');
 end if;
 return jsonb_build_object('cliente',to_jsonb(c),'resumo',resumo,'financeiro',fin,'veiculos','[]'::jsonb,'historico',jsonb_build_object('total',total,'itens',historico),'recursos',jsonb_build_object('ordens',true,'notinhas',false));
end $$;
do $$ declare s text;novo text;begin
 s:=pg_get_functiondef('public.consultar_ficha_cliente(uuid,uuid,integer,text)'::regprocedure);
 novo:=replace(s,'  u:=private.exigir_clientes(p_oficina);', $x$  u:=private.exigir_clientes(p_oficina);
 if exists(select 1 from public.oficinas where id=p_oficina and ramo<>'automotivo') then return private.ficha_cliente_servicos(p_oficina,p_cliente,p_pagina,p_filtro);end if;$x$);
 if novo=s then raise exception 'Contrato da ficha mudou';end if;execute novo;
end $$;

revoke all on function private.ficha_cliente_servicos(uuid,uuid,integer,text),private.custo_estoque_item(uuid,uuid,uuid),private.gerente_custos(uuid),private.custo_item_inicial(),private.fontes_brutas_antes_custo_item(uuid,uuid),private.fontes_brutas_custeio(uuid,uuid),
 public.salvar_custo_item_documento(uuid,uuid,uuid,integer,bigint),public.consultar_lucro_documento(uuid,uuid),public.consultar_lucro_cliente(uuid,uuid) from public,anon,authenticated;
grant execute on function public.salvar_custo_item_documento(uuid,uuid,uuid,integer,bigint),public.consultar_lucro_documento(uuid,uuid),public.consultar_lucro_cliente(uuid,uuid) to authenticated;
commit;
