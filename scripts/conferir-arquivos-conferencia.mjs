import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const pasta=process.env.QA_OUTPUT||'output/conferencia-final-20261111';
const pacote=JSON.parse(await readFile(pasta+'/pacote-publicacao.json','utf8'));
const arquivos=pacote.arquivos.filter(a=>!a.arquivo.startsWith('.vercel/')&&a.arquivo!=='vercel.json');
const resultados=[];let indice=0;
await Promise.all(Array.from({length:6},async()=>{
 while(indice<arquivos.length){const a=arquivos[indice++];try{const r=await fetch('https://patio-gestao-peach.vercel.app/'+encodeURI(a.arquivo),{cache:'no-store',signal:AbortSignal.timeout(30000)});assert(r.ok,'HTTP '+r.status);const sha256=createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex');assert.equal(sha256,a.sha256);resultados.push({arquivo:a.arquivo,ok:true,sha256})}catch(e){resultados.push({arquivo:a.arquivo,ok:false,erro:e.message})}}
}));
await writeFile(pasta+'/arquivos-publicados.json',JSON.stringify({ok:resultados.every(r=>r.ok),build:pacote.build,resultados},null,2));
console.log(JSON.stringify({arquivos:resultados.length,falhas:resultados.filter(r=>!r.ok)}));
assert(resultados.every(r=>r.ok));
