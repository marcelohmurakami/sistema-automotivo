import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';
const p='output/conclusao-prontas-20261105';
const antes=JSON.parse(await readFile(p+'/antes.local.json','utf8')).rows[0].dados;
assert.equal(antes.empresa,'e898f8dc-5e29-50d5-a746-7929f8cef4ab');assert.equal(antes.ordens.length,96);assert(!antes.mfa_ativo);
const ids=antes.ordens.map(o=>{assert(/^[0-9a-f-]{36}$/.test(o.id));return "'"+o.id+"'";}).join(',');
const mig=await readFile('supabase/migrations/20261105122543_entrega_pronta_com_pendencias.sql','utf8');
const corpo=mig.replace(/^begin;\s*/,'').replace(/commit;\s*$/,'');assert(!corpo.includes('$mig_prontas$'));
await writeFile(p+'/aplicar-migracao.sql',mig.replace(/commit;\s*$/,`insert into supabase_migrations.schema_migrations(version,name,statements) values('20261105122543','entrega_pronta_com_pendencias',array[$mig_prontas$${corpo}$mig_prontas$]);\ncommit;\n`));
function gerar(simular){return `do $batch$
declare w uuid:='${antes.empresa}';u uuid:='ef17b401-a899-4a48-9452-99b34f53bf6b';alvos uuid[]:=array[${ids}]::uuid[];
 o record;pendentes uuid[];r jsonb;resultados jsonb:='[]';erro text;codigo text;pagos_antes text;pagos_depois text;
 os_antes jsonb;os_depois jsonb;estoque_antes jsonb;estoque_depois jsonb;resumo jsonb;
begin
 perform set_config('request.jwt.claim.sub',u::text,true);
 if not exists(select 1 from public.oficinas where id=w and nome='Retífica Estação' and especialidade='retifica') then raise exception 'Empresa divergente';end if;
 if cardinality(alvos)<>96 or (select count(*) from public.ordens_servico where oficina_id=w and id=any(alvos))<>96 then raise exception 'Escopo divergente';end if;
 perform 1 from public.ordens_servico where oficina_id=w and id=any(alvos) order by id for update;
 select md5(coalesce(jsonb_agg(to_jsonb(b) order by id),'[]')::text) into pagos_antes from public.baixas_financeiras b where oficina_id=w;
 select jsonb_agg(jsonb_build_object('id',id,'total',total_centavos,'cliente',cliente_id,'dados_cliente',dados_cliente,'dados_veiculo',dados_veiculo,'entrada',recebido_em,'conclusao',concluido_em,'data',data_servico) order by id) into os_antes from public.ordens_servico where oficina_id=w and id=any(alvos);
 select jsonb_agg(jsonb_build_object('produto',item_catalogo_id,'saldo',saldo) order by item_catalogo_id) into estoque_antes from public.estoque_produtos where oficina_id=w;
 begin
  for o in select * from public.ordens_servico where oficina_id=w and id=any(alvos) order by numero loop
   if o.situacao<>'ready' or o.arquivado_em is not null then
    resultados:=resultados||jsonb_build_array(jsonb_build_object('numero',o.numero,'id',o.id,'acao','preservada','situacao',o.situacao));continue;
   end if;
   begin
    select coalesce(array_agg(i.id order by i.id),'{}') into pendentes from public.itens_ordem_servico i
    where i.oficina_id=w and i.ordem_servico_id=o.id and i.tipo='part' and i.situacao='done' and i.removido_em is null
    and i.origem_peca is null and i.produto_estoque_id is null
    and not exists(select 1 from public.estoque_produtos e where e.oficina_id=w and e.item_catalogo_id=i.item_catalogo_id);
    if o.recebido_em is null or cardinality(pendentes)>0 then
     r:=public.entregar_ordem_servico_com_pendencias(w,o.id,o.revisao,pendentes,o.recebido_em is null,
      'Conclusão em lote solicitada pelo gerente em 05/11/2026. Autorizado manter origem de peças e data de entrada não informadas como pendentes, sem inventar dados ou baixar peças sem vínculo.');
    else r:=public.mover_ordem_no_mapa(w,o.id,o.revisao,'avancar');end if;
    insert into public.historico_ordem_servico(oficina_id,ordem_servico_id,tipo_evento,usuario_autor_id,descricao,metadados)
    values(w,o.id,'bulk_delivery',u,'Entrega registrada na conclusão em lote das OS prontas, solicitada pelo gerente. Pagamentos preservados.',jsonb_build_object('lote','conclusao-prontas-20261105','revisao_anterior',o.revisao,'resultado',r));
    resultados:=resultados||jsonb_build_array(jsonb_build_object('numero',o.numero,'id',o.id,'acao','entregue','entrada_pendente',o.recebido_em is null,'pecas_pendentes',cardinality(pendentes),'revisao',r->'revisao'));
   exception when others then get stacked diagnostics erro=message_text,codigo=returned_sqlstate;
    resultados:=resultados||jsonb_build_array(jsonb_build_object('numero',o.numero,'id',o.id,'acao','erro','codigo',codigo,'erro',erro));
   end;
  end loop;
  select md5(coalesce(jsonb_agg(to_jsonb(b) order by id),'[]')::text) into pagos_depois from public.baixas_financeiras b where oficina_id=w;
  if pagos_antes is distinct from pagos_depois then raise exception 'Pagamentos divergentes; lote revertido.';end if;
  select jsonb_agg(jsonb_build_object('id',id,'total',total_centavos,'cliente',cliente_id,'dados_cliente',dados_cliente,'dados_veiculo',dados_veiculo,'entrada',recebido_em,'conclusao',concluido_em,'data',data_servico) order by id) into os_depois from public.ordens_servico where oficina_id=w and id=any(alvos);
  if os_antes is distinct from os_depois then raise exception 'Dados comerciais ou datas anteriores divergentes; lote revertido.';end if;
  select jsonb_agg(jsonb_build_object('produto',item_catalogo_id,'saldo',saldo) order by item_catalogo_id) into estoque_depois from public.estoque_produtos where oficina_id=w;
  resumo:=jsonb_build_object('simulacao',${simular},'momento',now(),'empresa',w,'resultados',resultados,'pagamentos_preservados',pagos_antes=pagos_depois,'dados_preservados',os_antes=os_depois,'estoque_antes',estoque_antes,'estoque_depois',estoque_depois);
  ${simular?"raise exception 'Simulação encerrada; reverter alterações.' using errcode='PZ001';":''}
 exception when sqlstate 'PZ001' then null;
 end;
 perform set_config('qa.conclusao_prontas',resumo::text,true);
end $batch$;
select current_setting('qa.conclusao_prontas')::jsonb resultado;`}
await writeFile(p+'/simular-lote.sql',gerar(true));await writeFile(p+'/concluir-lote.sql',gerar(false));
console.log('Scripts preparados para 96 OS, com conservação de pagamentos, dados e auditoria.');
