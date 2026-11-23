import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import ts from 'typescript';
import {assinarFotos} from '../supabase/functions/fotos-proposta/assinar-fotos.mjs';
const resultados=[];
async function caso(nome,executar){await executar();resultados.push({nome,ok:true});}
const fotos=Array.from({length:20},(_,i)=>({caminho:`empresa/foto-${i}.jpg`,legenda:`Foto ${i}`}));
const chamadas=[];
const bucket={async createSignedUrls(paths,ttl){chamadas.push({paths,ttl});return {data:paths.toReversed().map(path=>({path,signedUrl:'https://storage.test/'+path,error:null})),error:null}}};
await caso('20 fotos: uma chamada, validade de 60s, legendas e ordem preservadas',async()=>{
 const r=await assinarFotos(fotos,bucket);assert.equal(chamadas.length,1);assert.equal(chamadas[0].ttl,60);assert.deepEqual(r,fotos.map(f=>({legenda:f.legenda,url:'https://storage.test/'+f.caminho})));
});
await caso('Galeria vazia não chama Storage',async()=>{chamadas.length=0;assert.deepEqual(await assinarFotos([],bucket),[]);assert.equal(chamadas.length,0)});
await caso('Caminho repetido assina uma vez e preserva duas legendas',async()=>{
 chamadas.length=0;const r=await assinarFotos([fotos[0],{...fotos[0],legenda:'Outra legenda'}],bucket);assert.equal(chamadas[0].paths.length,1);assert.equal(r.length,2);assert.equal(r[1].legenda,'Outra legenda');
});
await caso('251 fotos usam lotes limitados de 100, 100 e 51',async()=>{
 chamadas.length=0;await assinarFotos(Array.from({length:251},(_,i)=>({caminho:`f${i}`,legenda:null})),bucket);assert.deepEqual(chamadas.map(c=>c.paths.length),[100,100,51]);
});
for(const [nome,resposta] of [
 ['Falha geral',{data:null,error:Error('Storage indisponível')}],
 ['Erro em uma foto',{data:[{path:fotos[0].caminho,error:'not found',signedUrl:null}],error:null}],
 ['Resposta incompleta',{data:[],error:null}],
 ['Caminho ausente',{data:[{path:null,signedUrl:'https://storage.test/a',error:null}],error:null}],
 ['URL ausente',{data:[{path:fotos[0].caminho,signedUrl:null,error:null}],error:null}],
])await caso(nome+' rejeita a galeria inteira',()=>assert.rejects(assinarFotos([fotos[0]],{createSignedUrls:async()=>resposta})));
const texto=await readFile('supabase/functions/fotos-proposta/index.ts','utf8');
const compilado=ts.transpileModule(texto.replace(/^import .*;\r?\n/gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
let handler,acessos=0,rpcs=0,storage=0,negado=false,storageFalha=false;
new Function('Deno','createClient','assinarFotos',compilado)(
 {serve:fn=>{handler=fn},env:{get:()=>''}},
 ()=>{acessos++;return {rpc:async(nome,args)=>{rpcs++;assert.equal(nome,'fotos_proposta_publica');assert.equal(args.p_token,'a'.repeat(64));return {data:fotos,error:negado?Error('Sem acesso'):null}},storage:{from:nome=>{storage++;assert.equal(nome,'workshop-files');return storageFalha?{createSignedUrls:async()=>({error:Error('Falha'),data:null})}:bucket}}}},assinarFotos);
const pedido=token=>new Request('https://edge.test/fotos-proposta',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token})});
await caso('Token inválido: 404 sem consultar banco ou Storage',async()=>{const r=await handler(pedido('invalid'));assert.equal(r.status,404);assert.equal(acessos,0);assert.equal(storage,0)});
await caso('Token sem autorização: 404 sem assinar fotos',async()=>{negado=true;const r=await handler(pedido('a'.repeat(64)));assert.equal(r.status,404);assert.equal(rpcs,1);assert.equal(storage,0)});
await caso('Endpoint autorizado mantém contrato da galeria e no-store',async()=>{negado=false;chamadas.length=0;const r=await handler(pedido('a'.repeat(64)));assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal((await r.json()).fotos.length,20);assert.equal(chamadas.length,1)});
await caso('Erro de assinatura devolve 503 sem resultado parcial',async()=>{storageFalha=true;const r=await handler(pedido('a'.repeat(64)));assert.equal(r.status,503);assert.deepEqual(Object.keys(await r.json()),['erro'])});
await caso('GET continua bloqueado e OPTIONS não consulta banco',async()=>{const n=acessos;assert.equal((await handler(new Request('https://edge.test/'))).status,405);assert.equal((await handler(new Request('https://edge.test/',{method:'OPTIONS'}))).status,200);assert.equal(acessos,n)});
const saida={ambiente:'Node + handler real transpileado; Storage/RPC simulados. Sem chamada a provedor, dados reais ou publicação.',fonte:'https://supabase.com/docs/reference/javascript/storage-from-createsignedurls',resultados};
await writeFile('output/revisao-integral-20261119/servidor/fotos-lote.json',JSON.stringify(saida,null,2));console.log(JSON.stringify({casos:resultados.length,ok:true}));
