import assert from 'node:assert/strict';import {readFile,writeFile,mkdir,cp,readdir} from 'node:fs/promises';import {resolve,relative} from 'node:path';import {createHash} from 'node:crypto';
const out=resolve('output/processos-agilidade-20261112'),ler=async f=>JSON.parse(await readFile(f,'utf8'));
for(const f of ['depois-final.json','depois-mouse.json']){const r=await ler(resolve(out,f));assert(r.ok&&r.resultados.length===52&&r.resultados.every(x=>x.ok),f)}
assert((await ler(resolve(out,'atalhos-interface.json'))).resultados.every(r=>r.ok));
const r=await ler(resolve(out,'regressao/resultado.json'));let retestes=[];try{retestes=(await ler(resolve(out,'regressao-retestes.json'))).resultados}catch{}
assert(r.resultados.length>=227);assert(r.resultados.every(x=>x.sucesso||retestes.some(t=>t.arquivo===x.arquivo&&t.sucesso)));
const suites=new Map();for(const d of await readdir(out,{withFileTypes:true})){if(!d.isDirectory()||!/^(bancadas|retestes)/.test(d.name))continue;try{for(const t of(await ler(resolve(out,d.name,'resultados.json'))).resultados)suites.set(t.nome,t)}catch{}}
assert(suites.size>=30);for(const [nome,t]of suites)assert(t.ok,nome);
assert((await readFile(resolve(out,'build-final.log'),'utf8')).includes('built in'));
// A segunda rodada acrescentou custos avulsos, seleção de equipamento e lista
// memorizada. Só empacotar depois de validar também esses cenários finais.
const jornadas=resolve('output/jornadas-completas-20261112');
for(const [arquivo,quantidade] of [['atalhos-finais/depois-simples.json',52],['documentos-final/depois-completo.json',52],['documentos-limite/depois-100-itens.json',8]]){
 const j=await ler(resolve(jornadas,arquivo));assert(j.ok&&j.resultados.length===quantidade&&j.resultados.every(x=>x.ok),arquivo);
 if(!arquivo.includes('simples'))assert(j.resultados.every(x=>x.custoAvulso===2500),'Custo persistido: '+arquivo);
}
const final=await ler(resolve(jornadas,'regressao/resultado.json'));assert.equal(final.resultados.length,228);assert(final.resultados.every(x=>x.sucesso));
assert.equal((await ler(resolve(out,'atalhos-interface.json'))).resultados.length,43);
const editor=await ler(resolve(jornadas,'editor-grande/resultado.json'));assert.equal(editor.resultados.length,12);assert(editor.resultados.every(x=>x.ok));
for(const pasta of ['', 'gestao', 'agenda-impressao', 'reteste-final', 'medicao-final', 'calendario-final', 'equipe-final']){
 const j=await ler(resolve(jornadas,pasta,'execucoes.json'));const ultimas=new Map(j.resultados.map(x=>[x.arquivo,x]));assert(ultimas.size>0);for(const x of ultimas.values())assert(x.ok,pasta+': '+x.arquivo);
}
const medicao=await ler(resolve(jornadas,'resumo.json'));assert(medicao.medidos.length>=2125);assert(medicao.medidos.every(x=>x.ok),'Medições incompletas ou falhas');
const health=await ler('dist/health.json'),destino=resolve(out,'deploy','patio-gestao-'+health.build);
const projeto=await ler('output/conferencia-final-20261111/deploy/patio-gestao--1837916753/.vercel/project.json');assert.equal(projeto.projectId,'prj_AXSmqeI5GqSk4xt8P67S4BqSK35v');assert.equal(projeto.orgId,'team_oN63S4DIgIX5oqq4avVbfx1R');
await mkdir(destino,{recursive:true});await cp('dist',destino,{recursive:true});await mkdir(resolve(destino,'.vercel'),{recursive:true});await writeFile(resolve(destino,'.vercel/project.json'),JSON.stringify(projeto,null,2));
const config=await ler('vercel.json');await writeFile(resolve(destino,'vercel.json'),JSON.stringify({framework:null,buildCommand:'',installCommand:'',outputDirectory:'.',rewrites:config.rewrites,headers:config.headers},null,2));
const arquivos=[];async function conferir(dir){for(const item of await readdir(dir,{withFileTypes:true})){assert(!item.isSymbolicLink());const path=resolve(dir,item.name);if(item.isDirectory())await conferir(path);else{const arquivo=relative(destino,path).replaceAll('\\','/');assert(!/(^|\/)(\.env|credenciais|admin\.env|node_modules|supabase|src|acessos)([./]|$)/.test(arquivo));const bytes=await readFile(path),texto=bytes.toString('utf8');assert(!/(?:sb_secret_|sk-proj-)[A-Za-z0-9_-]{20,}/.test(texto),'Credencial privada: '+arquivo);for(const m of texto.matchAll(/eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)){let payload;try{payload=JSON.parse(Buffer.from(m[1],'base64url').toString())}catch{continue}assert.notEqual(payload.role,'service_role','Token administrativo: '+arquivo)}arquivos.push({arquivo,sha256:createHash('sha256').update(bytes).digest('hex')})}}}
await conferir(destino);await writeFile(resolve(out,'pacote-publicacao.json'),JSON.stringify({destino,build:health.build,arquivos},null,2));console.log(JSON.stringify({destino,build:health.build,arquivos:arquivos.length}));
