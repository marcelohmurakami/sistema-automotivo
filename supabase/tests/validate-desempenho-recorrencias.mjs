import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {criarCenarioSubsistemas} from './subsistemas-fixture.mjs';
process.env.DB_VALIDATION_RUNTIME=resolve('node_modules/@electric-sql/pglite/dist/index.js');
process.env.DB_VALIDATION_MIGRATION_LIMIT='99999999999999';
const out=resolve(process.env.QA_OUTPUT||'output/desempenho-20261111'),resultados=[];let db;
try{
 const c=await criarCenarioSubsistemas();db=c.db;
 const arquivo=await readFile('supabase/migrations/20261106190351_contas_mensais_e_ficha_servico.sql','utf8');
 const antigo=arquivo.match(/create or replace function private\.gerar_contas_recorrentes[\s\S]*?end \$\$;/)[0];
 const novo=(await readFile('supabase/migrations/20261111111300_desempenho_recorrencias.sql','utf8')).replace(/^begin;[\s\S]*?(?=CREATE)/,'').replace(/commit;\s*$/,'');
 await db.exec('reset role; create table public.qa_atualizacoes_recorrentes(id uuid); create function public.qa_contar_recorrencia() returns trigger language plpgsql as $$ begin insert into public.qa_atualizacoes_recorrentes values(new.id); return new; end $$; create trigger qa_contar after update on public.contas_recorrentes for each row execute function public.qa_contar_recorrencia();');
 for(const [perfil,r] of Object.entries(c.registros)){
  await c.login(c.ids[perfil]);
  const ids=[];
  for(const [i,dia] of [1,15,28,29,30,31].entries()){
   const id=randomUUID();ids.push(id);
   await db.query('select public.salvar_conta_recorrente($1,$2,$3,0)',[r.w,id,{descricao:'QA desempenho '+i,natureza:'pagar',categoria:'aluguel',valor_centavos:i%2?10000:0,valor_variavel:i%2===0,dia,inicio:'2024-02-01',fim:i===1?'2024-03-31':null,ativa:true}]);
  }
  await db.exec('reset role');
  // Reconstitui pendências históricas, futuras e desativadas somente no banco local.
  await db.query('delete from public.titulos_financeiros where recorrencia_id=any($1::uuid[])',[ids]);
  await db.query('delete from public.contas_mensais_pendentes where recorrencia_id=any($1::uuid[])',[ids]);
  await db.query("update public.contas_recorrentes set proximo_mes='2024-02-01' where id=any($1::uuid[])",[ids]);
  await db.query("update public.contas_recorrentes set proximo_mes=(date_trunc('month',now())+interval '1 month')::date where id=$1",[ids[4]]);
  await db.query('update public.contas_recorrentes set ativa=false where id=$1',[ids[5]]);
  const executar=async(sql)=>{
   await db.exec('begin');await db.exec(sql);await db.exec('truncate public.qa_atualizacoes_recorrentes');
   const t=performance.now();await db.query('select private.gerar_contas_recorrentes($1)',[r.w]);
   const ms=performance.now()-t;
   const normalizar=async(tabela,campos)=> (await db.query(`select ${campos} from public.${tabela} where recorrencia_id=any($1::uuid[]) order by recorrencia_id,competencia`,[ids])).rows;
   const titulos=await normalizar('titulos_financeiros','recorrencia_id,competencia,vencimento,valor_centavos,natureza,categoria');
   const pendencias=await normalizar('contas_mensais_pendentes','recorrencia_id,competencia,vencimento,natureza,categoria');
   const regras=(await db.query('select id,proximo_mes from public.contas_recorrentes where id=any($1::uuid[]) order by id',[ids])).rows;
   const atualizacoes=(await db.query('select count(*)::int n from public.qa_atualizacoes_recorrentes')).rows[0].n;
   await db.exec('truncate public.qa_atualizacoes_recorrentes');
   await db.query('select private.gerar_contas_recorrentes($1)',[r.w]);
   assert.deepEqual(await normalizar('titulos_financeiros','recorrencia_id,competencia,vencimento,valor_centavos,natureza,categoria'),titulos);
   assert.deepEqual(await normalizar('contas_mensais_pendentes','recorrencia_id,competencia,vencimento,natureza,categoria'),pendencias);
   const repeticao=(await db.query('select count(*)::int n from public.qa_atualizacoes_recorrentes')).rows[0].n;
   await db.exec('rollback');return {titulos,pendencias,regras,atualizacoes,repeticao,ms};
  };
  const antes=await executar(antigo),depois=await executar(novo);
  for(const chave of ['titulos','pendencias','regras'])assert.deepEqual(depois[chave],antes[chave]);
  assert.equal(depois.repeticao,0);assert(antes.repeticao>0);assert(depois.atualizacoes<antes.atualizacoes);
  resultados.push({perfil,ok:true,titulos:depois.titulos.length,pendencias:depois.pendencias.length,antesAtualizacoes:antes.atualizacoes,depoisAtualizacoes:depois.atualizacoes,antesRepeticao:antes.repeticao,depoisRepeticao:depois.repeticao,checks:['Mesmos valores, competências, vencimentos e próximo mês','Fevereiro bissexto e dias 28–31','Fixa e variável sem valor','Futuras, encerradas e pausadas preservadas','Repetição idempotente sem regravar regras']});
  console.log('PASS',perfil);
 }
}catch(e){console.error(e.stack,e.code,e.where);process.exitCode=1;}finally{await db?.close();await mkdir(out,{recursive:true});await writeFile(resolve(out,'banco-recorrencias.json'),JSON.stringify({ok:!process.exitCode,resultados},null,2));}
