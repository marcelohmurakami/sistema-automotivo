import assert from "node:assert/strict";
import {readFile,writeFile,mkdir,cp,readdir} from "node:fs/promises";
import {resolve,relative} from "node:path";
import {createHash} from "node:crypto";
const out=resolve("output/conferencia-final-20261111"),ler=async p=>JSON.parse(await readFile(p,"utf8"));
for(const f of ["interface/resultados.json","interface-automotivo-reteste/resultados.json","controles/resultado.json","atualizacao-cache.json"]){assert((await ler(resolve(out,f))).ok,f)}
const r=await ler(resolve(out,"regressao/resultado.json"));assert.equal(r.resultados.length,226);assert(r.resultados.every(x=>x.sucesso||x.arquivo?.includes("desempenho-recorrencias")),"Conferir falhas de regressão");
assert((await ler(resolve(out,"regressao-reteste/banco-recorrencias.json"))).ok);
const suites=new Map();for(const sub of ["bancadas","retestes","retestes-2","complementares","offline-final","retestes-3","retestes-4","retestes-5"]){const r=await ler(resolve(out,sub,"resultados.json"));for(const t of r.resultados)suites.set(t.nome,t)}
for(const [nome,t] of suites)if(nome!=="conferir-rastreabilidade-desempenho")assert(t.ok,nome);
assert(suites.size>=31,"Ainda faltam baterias de interface");
assert((await readFile(resolve(out,"build-final.log"),"utf8")).includes("built in"));
const health=await ler('dist/health.json');assert.equal((await ler(resolve(out,'atualizacao-cache.json'))).cache,'patio-static-'+health.build);
const destino=resolve(out,'deploy','patio-gestao-'+health.build);
const projeto=await ler('output/sites-demonstracao-20261110/deploy/patio-gestao-1275801211/.vercel/project.json');
assert.equal(projeto.projectId,'prj_AXSmqeI5GqSk4xt8P67S4BqSK35v');assert.equal(projeto.orgId,'team_oN63S4DIgIX5oqq4avVbfx1R');
await mkdir(destino,{recursive:true});await cp('dist',destino,{recursive:true});await mkdir(resolve(destino,'.vercel'),{recursive:true});await writeFile(resolve(destino,'.vercel/project.json'),JSON.stringify(projeto,null,2));
const config=await ler('vercel.json');await writeFile(resolve(destino,'vercel.json'),JSON.stringify({framework:null,buildCommand:'',installCommand:'',outputDirectory:'.',rewrites:config.rewrites,headers:config.headers},null,2));
const arquivos=[];
async function conferir(dir){for(const item of await readdir(dir,{withFileTypes:true})){assert(!item.isSymbolicLink());const path=resolve(dir,item.name);if(item.isDirectory())await conferir(path);else{const arquivo=relative(destino,path).replaceAll('\\','/');assert(!/(^|\/)(\.env|credenciais|admin\.env|node_modules|supabase|src|acessos)([./]|$)/.test(arquivo));const bytes=await readFile(path),texto=bytes.toString('utf8');assert(!/(?:sb_secret_|sk-proj-)[A-Za-z0-9_-]{20,}/.test(texto),'Credencial privada no pacote: '+arquivo);for(const m of texto.matchAll(/eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)){let payload;try{payload=JSON.parse(Buffer.from(m[1],'base64url').toString())}catch{continue}assert.notEqual(payload.role,'service_role','Token administrativo no pacote: '+arquivo);}arquivos.push({arquivo,sha256:createHash('sha256').update(bytes).digest('hex')});}}}
await conferir(destino);await writeFile(resolve(out,'pacote-publicacao.json'),JSON.stringify({destino,build:health.build,arquivos},null,2));console.log(JSON.stringify({destino,build:health.build,arquivos:arquivos.length}));
