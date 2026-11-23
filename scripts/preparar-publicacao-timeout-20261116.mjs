import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,cp,readdir} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve('output/timeouts-concorrencia-26-20261116'),ler=async p=>JSON.parse(await readFile(p,'utf8'));
const ui=await ler(resolve(root,'acesso-timeout-local-final/resultados.json'));assert(ui.ok);assert.equal(ui.resultados.length,24);
assert((await readFile(resolve(root,'repeticao-timeout-depois.txt'),'utf8')).includes('# fail 0'));
assert.equal((await readFile(resolve(root,'typescript-final.txt'),'utf8')).trim(),'');
assert((await readFile(resolve(root,'build-final.txt'),'utf8')).includes('built in'));
const origem=resolve(root,'build-timeout'),health=await ler(resolve(origem,'health.json')),destino=resolve(root,'deploy','patio-gestao-'+health.build);
const projeto=await ler('output/processos-agilidade-20261112/deploy/patio-gestao-569643293/.vercel/project.json');
assert.equal(projeto.projectId,'prj_AXSmqeI5GqSk4xt8P67S4BqSK35v');assert.equal(projeto.orgId,'team_oN63S4DIgIX5oqq4avVbfx1R');
await mkdir(destino,{recursive:true});await cp(origem,destino,{recursive:true});await mkdir(resolve(destino,'.vercel'),{recursive:true});await writeFile(resolve(destino,'.vercel/project.json'),JSON.stringify(projeto));
const config=await ler('vercel.json');await writeFile(resolve(destino,'vercel.json'),JSON.stringify({framework:null,buildCommand:'',installCommand:'',outputDirectory:'.',rewrites:config.rewrites,headers:config.headers}));
const arquivos=[];
async function conferir(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=resolve(dir,e.name);assert(!e.isSymbolicLink());if(e.isDirectory())await conferir(p);else{const arquivo=relative(destino,p).replaceAll('\\','/'),bytes=await readFile(p),texto=bytes.toString('utf8');assert(!/(^|\/)(\.env|credenciais|admin\.env|node_modules|supabase|src|acessos)([./]|$)/.test(arquivo));assert(!/(?:sb_secret_|sk-proj-)[A-Za-z0-9_-]{20,}/.test(texto));for(const m of texto.matchAll(/eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)){let payload;try{payload=JSON.parse(Buffer.from(m[1],'base64url').toString())}catch{continue}assert.notEqual(payload.role,'service_role')}arquivos.push({arquivo,sha256:createHash('sha256').update(bytes).digest('hex')})}}}
await conferir(destino);await writeFile(resolve(root,'pacote-timeout.json'),JSON.stringify({destino,build:health.build,arquivos},null,2));console.log(JSON.stringify({destino,build:health.build,arquivos:arquivos.length}));
