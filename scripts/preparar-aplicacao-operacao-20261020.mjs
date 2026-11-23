import {readFile,readdir,writeFile} from 'node:fs/promises';
const files=(await readdir('supabase/migrations')).filter(f=>/^20261020000[1-5]00_.*\.sql$/.test(f)).sort();
if(files.length!==5)throw Error('Esperadas exatamente cinco migrações autorizadas.');
let sql="begin;\nset local lock_timeout='5s';\nset local statement_timeout='90s';\ndo $$begin if to_regprocedure('public.criar_atendimento_com_itens(uuid,uuid,jsonb,jsonb,bigint,integer)') is not null or to_regclass('public.fotos_atendimento') is not null or to_regclass('public.recontatos_oleo') is not null then raise exception 'Parte deste lote já existe; conferir antes de repetir.';end if;end $$;\n";
for(const f of files){const raw=await readFile('supabase/migrations/'+f,'utf8');const body=raw.replace(/^\s*begin;\s*/i,'').replace(/commit;\s*$/i,'');sql+='\n-- '+f+'\n'+body+'\n';}
sql+="commit;\nselect '20261020000100 a 20261020000500' lote, to_regprocedure('public.criar_atendimento_com_itens(uuid,uuid,jsonb,jsonb,bigint,integer)') is not null criacao_atomica, to_regclass('public.recontatos_oleo') is not null recontatos, (select exists(select 1 from information_schema.columns where table_schema='public' and table_name='agenda_servicos' and column_name='deslocamento_minutos')) visitas;\n";
await writeFile('output/revisao-operacao-20261020/aplicar-cinco-migracoes.sql',sql);
console.log('Lote autorizado preparado em uma transação, com timeout de bloqueio e conferência dos contratos.');
