begin;

-- Custos adicionais informados nos relatórios antigos continuam sendo custos
-- da OS. A chave permite conferir/apropriar a fonte sem duplicar uma despesa.
alter function private.fontes_brutas_custeio(uuid,uuid) rename to fontes_brutas_antes_reconciliacao;
create function private.fontes_brutas_custeio(w uuid,d uuid)
returns table(chave text,categoria text,descricao text,valor bigint,financeiro boolean,pendente boolean)
language sql stable set search_path='' as $$
 select * from private.fontes_brutas_antes_reconciliacao(w,d)
 union all select 'complemento:'||g.registro_id,'outros','Custos adicionais informados nos relatórios',
   (g.dados->>'custo_externo_centavos')::bigint,false,false
 from public.complementos_gestao g where g.oficina_id=w and g.entidade='os' and g.registro_id=d
   and coalesce((g.dados->>'custo_externo_centavos')::bigint,0)>0;
$$;
revoke all on function private.fontes_brutas_custeio(uuid,uuid),private.fontes_brutas_antes_reconciliacao(uuid,uuid) from public,anon,authenticated;

-- A mesma fonte de custeio da OS e da contribuição individual alimenta os
-- relatórios legados. O resumo não expõe fontes, assinaturas ou dados pessoais.
create function private.resumo_custeio_relatorio(w uuid, d uuid, equipe boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb; a jsonb;
begin
 if equipe then
   a:=public.consultar_contribuicao_equipe(w,d); c:=a->'documento';
 else
   c:=private.detalhe_custeio(w,d);
 end if;
 return jsonb_build_object('custo',c->'custo','conferido',c->'conferido',
   'minutos',c->'minutos','fontes_pendentes',c->'fontes_pendentes',
   'participantes',coalesce(a->'participantes','[]'::jsonb),
   'atribuicao_revisar',coalesce(a->'revisar','true'::jsonb));
end $$;
revoke all on function private.resumo_custeio_relatorio(uuid,uuid,boolean) from public,anon,authenticated;

alter function public.consultar_relatorios_gestao(uuid,date,date) set schema private;
revoke all on function private.consultar_relatorios_gestao(uuid,date,date) from public,anon,authenticated;
create function public.consultar_relatorios_gestao(p_oficina uuid,p_inicio date,p_fim date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb; custos jsonb;
begin
 -- A implementação original conserva as validações de acesso, plano e período.
 r:=private.consultar_relatorios_gestao(p_oficina,p_inicio,p_fim);
 select coalesce(jsonb_object_agg(o->>'id',private.resumo_custeio_relatorio(
   p_oficina,(o->>'id')::uuid,(r->>'equipe_permitida')::boolean)),'{}') into custos
 from jsonb_array_elements(r->'ordens')o
 where o->>'situacao'='delivered' and
   ((o->>'entrega')::timestamptz at time zone 'America/Sao_Paulo')::date between p_inicio and p_fim;
 return r||jsonb_build_object('custeios',custos);
end $$;

alter function public.consultar_relatorios_servicos(uuid,date,date) set schema private;
revoke all on function private.consultar_relatorios_servicos(uuid,date,date) from public,anon,authenticated;
create function public.consultar_relatorios_servicos(p_oficina uuid,p_inicio date,p_fim date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb; custos jsonb; estoque jsonb;
begin
 r:=private.consultar_relatorios_servicos(p_oficina,p_inicio,p_fim);
 select coalesce(jsonb_object_agg(o#>>'{atendimento,id}',private.resumo_custeio_relatorio(
   p_oficina,(o#>>'{atendimento,id}')::uuid,private.has_feature(p_oficina,'employee_reports'))),'{}') into custos
 from jsonb_array_elements(r->'detalhes')o where o#>>'{atendimento,situacao}'='concluido';
 -- Consumo líquido na data do movimento. Uma devolução posterior não reescreve
 -- o consumo de um mês encerrado; o sinal positivo repõe o estoque no mês atual.
 with movimentos as materialized (
   select m.item_catalogo_id, -sum(m.quantidade) consumido
   from public.movimentacoes_estoque m
   where m.oficina_id=p_oficina and m.atendimento_id is not null
     and m.criado_em>=p_inicio::timestamp at time zone 'America/Sao_Paulo'
     and m.criado_em<(p_fim+1)::timestamp at time zone 'America/Sao_Paulo'
     and (m.tipo='saida' or (m.tipo='estorno' and exists(
       select 1 from public.movimentacoes_estoque x where x.oficina_id=p_oficina and x.id=m.estorno_de and x.tipo='saida')))
   group by m.item_catalogo_id
 ) select coalesce(jsonb_agg(p||jsonb_build_object('consumido',coalesce(m.consumido,0))),'[]') into estoque
 from jsonb_array_elements(r->'estoque')p left join movimentos m on m.item_catalogo_id=(p->>'id')::uuid;
 return r||jsonb_build_object('custeios',custos,'estoque',estoque);
end $$;
revoke all on function public.consultar_relatorios_gestao(uuid,date,date),public.consultar_relatorios_servicos(uuid,date,date) from public,anon;
grant execute on function public.consultar_relatorios_gestao(uuid,date,date),public.consultar_relatorios_servicos(uuid,date,date) to authenticated;

commit;
