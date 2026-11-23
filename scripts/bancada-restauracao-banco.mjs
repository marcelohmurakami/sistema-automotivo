import assert from 'node:assert/strict';import{mkdir,writeFile,stat}from'node:fs/promises';import{resolve}from'node:path';import{spawn}from'node:child_process';import{conectarPostgresLocal}from'../supabase/tests/postgres-local.mjs';
const origem='patio_qa_dados3',destino='patio_qa_recuperacao_'+Date.now(),pasta=resolve('output/dados-seguranca-20261104'),dump=resolve(pasta,'recuperacao-ficticia-'+Date.now()+'.dump');await mkdir(pasta,{recursive:true});
async function cli(nome,args){return new Promise((ok,no)=>{const p=spawn('C:/Program Files/PostgreSQL/17/bin/'+nome+'.exe',args,{windowsHide:true});let erro='';p.stderr.on('data',b=>erro+=b.toString());p.on('error',no);p.on('exit',c=>c===0?ok():no(Error(nome+' falhou: '+erro.slice(-500))));});}
const comuns=['-h','127.0.0.1','-p','55434','-U','patio_qa'];const inicio=Date.now();let a,b;
try{
 await cli('pg_dump',[...comuns,'-Fc','--no-owner','--file',dump,origem]);
 await cli('createdb',[...comuns,destino]);await cli('pg_restore',[...comuns,'--no-owner','--exit-on-error','-d',destino,dump]);
 a=await conectarPostgresLocal(origem);b=await conectarPostgresLocal(destino);
 const tabelas=(await a.query("select schemaname s,tablename t from pg_tables where schemaname in ('public','private','auth','storage') order by 1,2")).rows;
 let registros=0;const divergencias=[];
 for(const {s,t}of tabelas){const sql=`select count(*)::text n,coalesce(sum(('x'||substr(md5(to_jsonb(x)::text),1,16))::bit(64)::bigint),0)::text h1,coalesce(sum(('x'||substr(md5(to_jsonb(x)::text),17,16))::bit(64)::bigint),0)::text h2 from "${s}"."${t}" x`;
  const [r1,r2]=await Promise.all([a.query(sql),b.query(sql)]);if(JSON.stringify(r1.rows)!==JSON.stringify(r2.rows))divergencias.push(s+'.'+t);registros+=Number(r1.rows[0].n);
 }
 assert.deepEqual(divergencias,[]);
 const estruturas="select n.nspname s,p.proname n,pg_get_function_identity_arguments(p.oid) a,md5(pg_get_functiondef(p.oid)) h from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private','auth') and p.prokind in ('f','p') order by 1,2,3";
 const [f1,f2]=await Promise.all([a.query(estruturas),b.query(estruturas)]);assert.deepEqual(f1.rows,f2.rows);
 const [p1,p2]=await Promise.all([a.query('select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies order by 1,2,3'),b.query('select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies order by 1,2,3')]);assert.deepEqual(p1.rows,p2.rows);
 const r={ok:true,ambiente:'PostgreSQL 17 local isolado; dados fictícios',tabelas:tabelas.length,registros,funcoes:f1.rows.length,politicas:p1.rows.length,divergencias,tempoTotalSegundos:Math.round((Date.now()-inicio)/1000),dumpBytes:(await stat(dump)).size,destino,limite:'Não substitui ensaio de indisponibilidade ou failover da infraestrutura Supabase. Arquivos conferidos em bancada separada.'};await writeFile(resolve(pasta,'restauracao-banco.json'),JSON.stringify(r,null,2));console.log(r);
}catch(e){console.error(e.message);process.exitCode=1;}finally{await a?.close();await b?.close();}
