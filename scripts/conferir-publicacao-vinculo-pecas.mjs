import{readFile,writeFile}from'node:fs/promises';import assert from'node:assert/strict';import{createHash}from'node:crypto';import{resolve}from'node:path';
const pasta='output/vinculo-pecas-20261105',ler=async f=>JSON.parse(await readFile(pasta+'/'+f,'utf8'));
const pacote=await ler('pacote-publicacao.json');
const log=await readFile(pasta+'/deploy.log','utf8'),d=JSON.parse(log.slice(log.indexOf('{'))).deployment;assert.equal(d.readyState,'READY');assert.equal(d.productionUrl,'https://patio-gestao-peach.vercel.app');
const sha=b=>createHash('sha256').update(b).digest('hex');
async function get(path){const r=await fetch(d.productionUrl+path,{cache:'no-store',signal:AbortSignal.timeout(30000)});assert.equal(r.status,200,path);return r;}
const health=await(await get('/health.json?verificacao='+Date.now())).json();assert.equal(health.build,pacote.build);
const arquivos=['index.html','sw.js',...pacote.arquivos.filter(x=>/\.(js|css)$/.test(x.arquivo)).map(x=>x.arquivo)];
for(let i=0;i<arquivos.length;i+=6)await Promise.all(arquivos.slice(i,i+6).map(async f=>{assert.equal(sha(Buffer.from(await(await get('/'+f)).arrayBuffer())),sha(await readFile(resolve(pacote.destino,f))),f+' diverge');}));
const p={publicado:true,data:new Date().toISOString(),url:d.productionUrl,build:health.build,deployment:d.id,arquivosConferidos:arquivos.length,migracao:'20261105170157'};await writeFile(pasta+'/publicacao.json',JSON.stringify(p,null,2));console.log(JSON.stringify({publicado:p.publicado,build:p.build,arquivos:p.arquivosConferidos}));

