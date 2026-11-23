import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {criarBancoLocal} from '../supabase/tests/banco-local.mjs';
process.env.DB_VALIDATION_RUNTIME=resolve('node_modules/@electric-sql/pglite/dist/index.js');
const db=await criarBancoLocal('20261030000600');
try {
 const rows=(await db.query(`select table_name,string_agg(column_name||' '||data_type,', ' order by ordinal_position) colunas from information_schema.columns where table_schema='public' and table_name in ('ordens_servico','agenda_atendimentos','agenda_servicos','atendimentos_servicos','eventos_ordem_servico','eventos_os','historico_ordem_servico','eventos_atendimento','veiculos','perfis_distribuicao','perfis_tecnicos','configuracoes_distribuicao','recursos_agenda','titulos_financeiros','consumos_contrato') group by table_name order by table_name`)).rows;
 const funcoes=(await db.query(`select proname,pg_get_functiondef(p.oid) definicao from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and proname in ('exigir_produtividade_equipe','exigir_distribuicao','inicio_visita','fim_visita','gerencia_planejamento')`)).rows;
 await mkdir('output/relatorios-avancados-20261102',{recursive:true});await writeFile('output/relatorios-avancados-20261102/schema.json',JSON.stringify({rows,funcoes},null,2));
 console.log(rows);
}finally{await db.close()}
