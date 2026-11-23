import { mkdir, writeFile, readFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { verificarBackupStorage } from './backup-storage.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
async function inventario(cliente,bucket,prefixo='',resultado=[]){
 for(let offset=0;;offset+=500){
  const r=await cliente.storage.from(bucket).list(prefixo,{limit:500,offset,sortBy:{column:'name',order:'asc'}});
  if(r.error)throw Error('Não foi possível listar os anexos.');
  for(const o of r.data){const caminho=prefixo?prefixo+'/'+o.name:o.name;
   if(!o.id)await inventario(cliente,bucket,caminho,resultado);
   else resultado.push({bucket,caminho,id:o.id,atualizado:o.updated_at,tamanho:o.metadata?.size});
  }
  if(r.data.length<500)return resultado;
 }
}
export async function copiarStorage(cliente,pasta,projeto){
 await mkdir(join(pasta,'objetos'),{recursive:true});
 const {data:buckets,error}=await cliente.storage.listBuckets();if(error)throw Error('Não foi possível listar os recipientes.');
 const configuracoes=buckets.map(b=>({id:b.id,public:b.public,file_size_limit:b.file_size_limit,allowed_mime_types:b.allowed_mime_types})).sort((a,b)=>a.id.localeCompare(b.id));
 const manifesto={versao:2,completo:false,projeto,buckets:configuracoes,itens:[],criado_em:new Date().toISOString()};
 await writeFile(join(pasta,'manifesto.partial.json'),JSON.stringify(manifesto));
 for(const b of configuracoes){
  const inicio=await inventario(cliente,b.id);
  for(const o of inicio){
   const {data,error}=await cliente.storage.from(b.id).download(o.caminho);if(error)throw Error('Anexo indisponível; cópia incompleta.');
   const bytes=Buffer.from(await data.arrayBuffer()),arquivo=hash(b.id+'\0'+o.caminho);
   await writeFile(join(pasta,'objetos',arquivo),bytes,{flag:'wx'});
   manifesto.itens.push({bucket:b.id,caminho:o.caminho,arquivo,sha256:hash(bytes),tamanho:bytes.length,tipo:data.type||'application/octet-stream'});
  }
  const fim=await inventario(cliente,b.id);
  if(JSON.stringify(inicio)!==JSON.stringify(fim))throw Error('Os anexos mudaram durante a cópia. Repita em uma nova pasta.');
  await writeFile(join(pasta,'manifesto.partial.json'),JSON.stringify(manifesto));
 }
 manifesto.completo=true;
 await writeFile(join(pasta,'manifesto.partial.json'),JSON.stringify(manifesto,null,2));
 await rename(join(pasta,'manifesto.partial.json'),join(pasta,'manifesto.json'));
 await verificarBackupStorage(pasta);return manifesto;
}
export async function restaurarStorage(cliente,pasta){
 const m=await verificarBackupStorage(pasta);
 const buckets=m.versao===2?m.buckets:[{id:m.bucket,public:false}];
 const existentes=await cliente.storage.listBuckets();if(existentes.error)throw Error('Não foi possível conferir o destino.');
 for(const b of buckets){
  const existe=existentes.data.find(x=>x.id===b.id);
  if(existe&&existe.public!==b.public)throw Error('Privacidade do recipiente de destino diverge. Não foi alterada.');
  if(!existe){const r=await cliente.storage.createBucket(b.id,{public:b.public,fileSizeLimit:b.file_size_limit||undefined,allowedMimeTypes:b.allowed_mime_types||undefined});if(r.error)throw Error('Não foi possível preparar o destino.');}
 }
 let copiados=0;
 for(const item of m.itens){
  const bytes=await readFile(join(pasta,'objetos',item.arquivo)),storage=cliente.storage.from(item.bucket||m.bucket);
  const envio=await storage.upload(item.caminho,bytes,{contentType:item.tipo,upsert:false});
  if(envio.error&&String(envio.error.statusCode)!=='409')throw Error('Upload não concluído.');
  // Confere também objetos existentes numa retomada, sem sobrescrever divergências.
  const r=await storage.download(item.caminho);
  if(r.error||hash(Buffer.from(await r.data.arrayBuffer()))!==item.sha256)throw Error('Conteúdo restaurado diverge do manifesto.');
  copiados++;
 }
 return {copiados,buckets:buckets.length,verificado:true};
}
