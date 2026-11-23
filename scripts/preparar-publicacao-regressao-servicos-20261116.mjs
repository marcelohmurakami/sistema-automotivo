import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,cp,readdir} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
const out=resolve('output/regressao-assistencia-manutencao-limpeza-20261116'),ler=async p=>JSON.parse(await readFile(p,'utf8'));
const suite=await ler(resolve(out,'regressao/resultado.json'));assert(suite.resultados.length>=231&&suite.resultados.every(r=>r.sucesso));
const login=await ler(resolve(out,'login/resultados.json'));assert(login.ok&&login.resultados.length===15);
const busca=await ler(resolve(out,'recuperacao-busca/resultados.json'));assert(busca.ok&&busca.resultados.length>=2);
const matriz=await ler(resolve(out,'sumario.json'));assert.equal(matriz.documentos.length,128);
assert((await readFile(resolve(out,'build-final.log'),'utf8')).includes('built in'));
assert((await readFile(resolve(out,'typescript-final.log'),'utf8')).trim()==='');
assert((await readFile(resolve(out,'eslint-final.log'),'utf8')).trim()==='');
assert((await readFile(resolve(out,'formatacao-final.log'),'utf8')).includes('All matched files'));
const origem=resolve(out,'build-correcao'),health=await ler(resolve(origem,'health.json'));
const destino=resolve(out,'deploy','patio-gestao-'+health.build),project=await ler('output/processos-agilidade-20261112/deploy/patio-gestao-569643293/.vercel/project.json');
assert.equal(project.projectId,'prj_AXSmqeI5GqSk4xt8P67S4BqSK35v');assert.equal(project.orgId,'team_oN63S4DIgIX5oqq4avVbfx1R');
await mkdir(destino,{recursive:true});await cp(origem,destino,{recursive:true});
await mkdir(resolve(destino,'.vercel'),{recursive:true});await writeFile(resolve(destino,'.vercel/project.json'),JSON.stringify(project));
const config=await ler('vercel.json');await writeFile(resolve(destino,'vercel.json'),JSON.stringify({framework:null,buildCommand:'',installCommand:'',outputDirectory:'.',rewrites:config.rewrites,headers:config.headers}));
const arquivos=[];
async function conferir(dir){for(const x of await readdir(dir,{withFileTypes:true})){
 assert(!x.isSymbolicLink());const f=resolve(dir,x.name);if(x.isDirectory())await conferir(f);else{
 const arquivo=relative(destino,f).replaceAll('\\','/'),bytes=await readFile(f),texto=bytes.toString('utf8');
 assert(!/(^|\/)(\.env|credenciais|admin\.env|node_modules|supabase|src|acessos)([./]|$)/.test(arquivo));assert(!/(?:sb_secret_|sk-proj-)[A-Za-z0-9_-]{20,}/.test(texto));
 for(const m of texto.matchAll(/eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)){let p;try{p=JSON.parse(Buffer.from(m[1],'base64url').toString());}catch{continue;}assert.notEqual(p.role,'service_role');}
 arquivos.push({arquivo,sha256:createHash('sha256').update(bytes).digest('hex')});
 }}}
await conferir(destino);await writeFile(resolve(out,'pacote.json'),JSON.stringify({build:health.build,destino,arquivos},null,2));
console.log(JSON.stringify({build:health.build,destino,arquivos:arquivos.length}));
