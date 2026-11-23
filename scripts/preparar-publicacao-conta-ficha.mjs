import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,cp,readdir} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {createHash} from 'node:crypto';

const pasta=resolve('output/conta-cliente-ficha-20261105');
const ler=async p=>JSON.parse(await readFile(p,'utf8'));
const health=await ler('dist/health.json');
const destino=resolve(pasta,'deploy','patio-gestao-'+health.build);
const projeto=await ler('output/auditoria-numeros-20261102/deploy/patio-gestao-1598606539/.vercel/project.json');
assert.equal(projeto.projectId,'prj_AXSmqeI5GqSk4xt8P67S4BqSK35v');
assert.equal(projeto.orgId,'team_oN63S4DIgIX5oqq4avVbfx1R');
const banco=await ler(resolve(pasta,'banco.json')),ui=await ler(resolve(pasta,'interface.json'));
assert(banco.ok&&ui.ok);assert.equal(banco.resultados.length,26);assert(ui.total>=96);
await mkdir(destino,{recursive:true});
await cp('dist',destino,{recursive:true});
await mkdir(resolve(destino,'.vercel'),{recursive:true});
await writeFile(resolve(destino,'.vercel/project.json'),JSON.stringify(projeto,null,2));
const config=await ler('vercel.json');
await writeFile(resolve(destino,'vercel.json'),JSON.stringify({framework:null,buildCommand:'',installCommand:'',outputDirectory:'.',rewrites:config.rewrites,headers:config.headers},null,2));
const arquivos=[];
async function percorrer(dir){for(const e of await readdir(dir,{withFileTypes:true})){
 const p=resolve(dir,e.name);assert(!e.isSymbolicLink(),'Link inesperado');
 if(e.isDirectory())await percorrer(p);else{
  const arquivo=relative(destino,p).replaceAll('\\','/');
  assert(!/(^|\/)(\.env|credenciais|admin\.env|node_modules|supabase|src)([./]|$)/.test(arquivo),'Arquivo privado no pacote');
  arquivos.push({arquivo,sha256:createHash('sha256').update(await readFile(p)).digest('hex')});
 }
}}
await percorrer(destino);
await writeFile(resolve(pasta,'pacote-publicacao.json'),JSON.stringify({preparadoEm:new Date().toISOString(),build:health.build,destino,projeto:projeto.projectId,arquivos},null,2));
console.log(JSON.stringify({destino,build:health.build,arquivos:arquivos.length}));
