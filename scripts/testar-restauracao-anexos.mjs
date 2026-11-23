import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {copiarStorage,restaurarStorage} from './lib/portabilidade-storage.mjs';
import {verificarBackupStorage} from './lib/backup-storage.mjs';
import {especialidades} from '../src/lib/especialidades.ts';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
function servidor(){const buckets=new Map(),files=new Map();return {buckets,files,storage:{listBuckets:async()=>({data:[...buckets.values()]}),createBucket:async(id,o)=>{buckets.set(id,{id,public:o.public});return{};},from:b=>({
 list:async(prefix,{limit,offset})=>({data:[...(files.get(b)||new Map()).keys()].filter(n=>!prefix||n.startsWith(prefix+'/')).map(n=>{const rest=prefix?n.slice(prefix.length+1):n;return rest.includes('/')?{name:rest.split('/')[0]}:{name:rest,id:n,updated_at:'2026-11-04',metadata:{size:files.get(b).get(n).length}};}).filter((v,i,a)=>a.findIndex(x=>x.name===v.name)===i).sort((a,b)=>a.name.localeCompare(b.name)).slice(offset,offset+limit)}),
 download:async n=>files.get(b)?.has(n)?{data:new Blob([files.get(b).get(n)],{type:'image/png'})}:{error:{statusCode:404}},
 upload:async(n,bytes)=>{if(!buckets.has(b))return {error:{statusCode:404}};if(!files.has(b))files.set(b,new Map());if(files.get(b).has(n))return{error:{statusCode:409}};files.get(b).set(n,Buffer.from(bytes));return{};}
 })}};}
await mkdir('tmp',{recursive:true});const pasta=await mkdtemp('tmp/restore-anexos-'),origem=servidor(),destino=servidor();
for(const bucket of ['workshop-files','company-portability']){origem.buckets.set(bucket,{id:bucket,public:false});origem.files.set(bucket,new Map(Object.keys(especialidades).map(p=>[p+'/foto.png',png])));}
const m=await copiarStorage(origem,pasta,'projeto-ficticio');assert.equal(m.itens.length,52);const r=await restaurarStorage(destino,pasta);assert.equal(r.copiados,52);
assert.equal((await restaurarStorage(destino,pasta)).copiados,52); // Retomar sem duplicar.
for(const[b,fs]of origem.files)for(const[n,bytes]of fs)assert.deepEqual(destino.files.get(b).get(n),bytes);
destino.files.get('workshop-files').set('mecanica/foto.png',Buffer.from('corrompido'));await assert.rejects(()=>restaurarStorage(destino,pasta),/diverge/);
await writeFile(join(pasta,'objetos',m.itens[0].arquivo),'corrompido');await assert.rejects(()=>verificarBackupStorage(pasta),/corrompido/);
const resultado={ok:true,subsistemas:26,arquivosRestaurados:52,recipientes:2,retomada:true,divergenciasBloqueadas:true,ambiente:'Storage simulado local; não constitui restauração em infraestrutura Supabase'};
await mkdir('output/dados-seguranca-20261104',{recursive:true});await writeFile('output/dados-seguranca-20261104/restauracao-anexos.json',JSON.stringify(resultado,null,2));console.log(resultado);
