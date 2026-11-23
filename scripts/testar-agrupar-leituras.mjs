import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agruparLeituras } from '../src/lib/agruparLeituras.ts';
const adiar=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
test('500 avisos locais no mesmo ciclo geram uma leitura e todos aguardam os dados',async()=>{
 let leituras=0;const aplicados=[];const l=agruparLeituras(async()=>++leituras,v=>aplicados.push(v));
 await Promise.all(Array.from({length:500},()=>l.atualizar()));
 assert.equal(leituras,1);assert.deepEqual(aplicados,[1]);
});
test('alteração durante a leitura descarta resultado antigo e confirma o mais novo',async()=>{
 const a=adiar(),b=adiar(),aplicados=[];let leituras=0;
 const l=agruparLeituras(()=>++leituras===1?a.promise:b.promise,v=>aplicados.push(v));
 const primeira=l.atualizar();await Promise.resolve();const ultima=l.atualizar();a.resolve('antigo');
 await Promise.resolve();assert.deepEqual(aplicados,[]);b.resolve('novo');await Promise.all([primeira,ultima]);
 assert.equal(leituras,2);assert.deepEqual(aplicados,['novo']);
});
test('aviso entre a aplicação e o encerramento não se perde',async()=>{
 let leituras=0;const aplicados=[];const l=agruparLeituras(async()=>++leituras,v=>{aplicados.push(v);if(v===1)queueMicrotask(()=>void l.atualizar())});
 await l.atualizar();assert.deepEqual(aplicados,[1,2]);
});
test('falha é informada e uma nova tentativa funciona',async()=>{
 let falha=true;const aplicados=[];const l=agruparLeituras(async()=>{if(falha)throw Error('leitura falhou');return 'restabelecido'},v=>aplicados.push(v));
 await assert.rejects(l.atualizar(),/leitura falhou/);falha=false;await l.atualizar();assert.deepEqual(aplicados,['restabelecido']);
});
test('fechar ou trocar de usuário impede aplicar dados da sessão anterior',async()=>{
 const a=adiar(),aplicados=[];const l=agruparLeituras(()=>a.promise,v=>aplicados.push(v));const p=l.atualizar();await Promise.resolve();l.encerrar();a.resolve('sessão antiga');await p;await l.atualizar();assert.deepEqual(aplicados,[]);
});
