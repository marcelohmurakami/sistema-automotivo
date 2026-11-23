import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,cp,readdir} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve('output/jornada-assistencia-campo-20261110'),ler=async p=>JSON.parse(await readFile(p,'utf8'));
for(const f of ['banco','isolamento'])assert((await ler(resolve(root,f+'.json'))).ok);
for(const f of ['interface','visitas/jornada10']){const r=await ler(resolve(root,f+'.json'));assert.equal(r.resultados.length,10);assert(r.resultados.every(x=>x.ok));}
assert((await readFile(resolve(root,'build.log'),'utf8')).includes('built in'));
assert((await readFile(resolve(root,'lint.log'),'utf8')).includes('eslint .'));
assert(!/error|warning|problem/i.test(await readFile(resolve(root,'lint.log'),'utf8')));
assert((await readFile(resolve(root,'vocabulario.log'),'utf8')).includes('PASS'));
const health=await ler('dist/health.json'),destino=resolve(root,'deploy','patio-gestao-'+health.build);
const projeto=await ler('output/sites-demonstracao-20261110/deploy/patio-gestao-1275801211/.vercel/project.json');
assert.equal(projeto.projectId,'prj_AXSmqeI5GqSk4xt8P67S4BqSK35v');assert.equal(projeto.orgId,'team_oN63S4DIgIX5oqq4avVbfx1R');
await mkdir(destino,{recursive:true});await cp('dist',destino,{recursive:true});await mkdir(resolve(destino,'.vercel'),{recursive:true});await writeFile(resolve(destino,'.vercel/project.json'),JSON.stringify(projeto,null,2));
const config=await ler('vercel.json');await writeFile(resolve(destino,'vercel.json'),JSON.stringify({framework:null,buildCommand:'',installCommand:'',outputDirectory:'.',rewrites:config.rewrites,headers:config.headers},null,2));
const arquivos=[];
async function percorrer(dir){for(const e of await readdir(dir,{withFileTypes:true})){const p=resolve(dir,e.name);assert(!e.isSymbolicLink());if(e.isDirectory())await percorrer(p);else{const arquivo=relative(destino,p).replaceAll('\\','/');assert(!/(^|\/)(\.env|credenciais|admin\.env|node_modules|supabase|src|acessos)([./]|$)/.test(arquivo));arquivos.push({arquivo,sha256:createHash('sha256').update(await readFile(p)).digest('hex')});}}}
await percorrer(destino);await writeFile(resolve(root,'pacote-publicacao.json'),JSON.stringify({destino,build:health.build,arquivos},null,2));console.log(JSON.stringify({destino,build:health.build,arquivos:arquivos.length}));
