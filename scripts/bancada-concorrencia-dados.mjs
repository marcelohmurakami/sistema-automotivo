import assert from 'node:assert/strict';import{mkdir,writeFile}from'node:fs/promises';import{randomUUID}from'node:crypto';import{conectarPostgresLocal}from'../supabase/tests/postgres-local.mjs';
process.env.DB_VALIDATION_PG_DATABASE='patio_qa_dados3';const db=await conectarPostgresLocal();const resultados=[],tempos=[];const clientes=[];
try{const empresas=(await db.query("select o.id w,o.especialidade perfil,m.usuario_id u from public.oficinas o join public.membros_oficina m on m.oficina_id=o.id and m.perfil='owner' order by o.especialidade")).rows;assert.equal(empresas.length,26);
 for(let i=0;i<12;i++)clientes.push(await conectarPostgresLocal());
 for(const e of empresas){
  const revisao=(await db.query('select revisao from public.configuracao_dados_empresa where oficina_id=$1',[e.w])).rows[0].revisao;
  await Promise.all(clientes.map(async c=>{await c.exec('set role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,false)",[e.u]);}));
  const tentativas=await Promise.allSettled(clientes.map(async(c,i)=>{const inicio=performance.now();try{await c.query('select public.salvar_configuracao_dados($1,$2,$3)',[e.w,{suporte_responsavel:'Concorrente '+i},revisao]);}finally{tempos.push(performance.now()-inicio);}}));
  assert.equal(tentativas.filter(r=>r.status==='fulfilled').length,1);assert(tentativas.filter(r=>r.status==='rejected').every(r=>r.reason.code==='PT409'));
  const id=randomUUID(),pacote={formato:'patio.migracao.v1',origem:'QA Concorrencia',registros:[{tipo:'cliente',id:'concorrente',dados:{nome:'Cliente concorrente '+e.perfil}}]};
  const repetidas=await Promise.all(clientes.map(c=>c.query('select public.importar_pacote_empresa($1,$2,$3,true)',[e.w,id,pacote])));
  assert.equal(repetidas.length,12);assert.equal(Number((await db.query("select count(*) n from public.clientes where oficina_id=$1 and nome=$2",[e.w,'Cliente concorrente '+e.perfil])).rows[0].n),1);
  resultados.push({perfil:e.perfil,gravacoesSimultaneas:12,umaEdicaoAceita:true,onzeConflitosPreservados:true,reenviosImportacao:12,duplicados:0});console.log('PASS concorrencia',e.perfil);
 }
 const e=empresas[0];const ini=performance.now();await db.exec(`insert into public.clientes(oficina_id,nome) select '${e.w}'::uuid,'Carga local QA '||lpad(g::text,7,'0') from generate_series(1,100000)g; analyze public.clientes`);const cargaMs=Math.round(performance.now()-ini);
 const c=clientes[0];await c.query("select set_config('request.jwt.claim.sub',$1,false)",[e.u]);const buscas=[];
 for(let i=0;i<20;i++){const t=performance.now();const r=await c.query("select public.listar_clientes($1,'Carga local QA',false,$2)",[e.w,i]);assert(r.rows[0].listar_clientes.itens.length<=50);buscas.push(performance.now()-t);}
 const t=performance.now();const r=await c.query('select public.exportar_dados_empresa($1)',[e.w]);const exportMs=Math.round(performance.now()-t);assert(r.rows[0].exportar_dados_empresa.tabelas.find(t=>t.tabela==='clientes').quantidade>=100000);
 const med=v=>({p50:Math.round([...v].sort((a,b)=>a-b)[Math.floor(v.length*.5)]),p95:Math.round([...v].sort((a,b)=>a-b)[Math.min(v.length-1,Math.floor(v.length*.95))]),max:Math.round(Math.max(...v))});
 await mkdir('output/dados-seguranca-20261104',{recursive:true});await writeFile('output/dados-seguranca-20261104/concorrencia.json',JSON.stringify({ok:true,ambiente:'PostgreSQL 17 local, 12 conexões independentes; não mede infraestrutura de produção',resultados,clientesCarga:100000,cargaMs,edicaoMs:med(tempos),buscaMs:med(buscas),manifestoExportacaoMs:exportMs},null,2));
}catch(e){console.error(e.message,e.code);process.exitCode=1;}finally{await Promise.all(clientes.map(c=>c.close()));await db.close();}
