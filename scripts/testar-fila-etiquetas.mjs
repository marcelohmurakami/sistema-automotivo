import {test} from 'node:test';
import assert from 'node:assert/strict';
import {incluirEtiqueta,assinaturaMovimento} from '../src/lib/filaEtiquetas.ts';
const item=(n,situacao='na_empresa')=>({id:String(n),codigo:'PTI-'+String(n).padStart(16,'0'),revisao:1,situacao});
test('leitura repetida não duplica item nem ocupa o limite',()=>{
 const fila=Array.from({length:50},(_,i)=>item(i));
 assert.equal(incluirEtiqueta(fila,item(0)),fila);
 assert.throws(()=>incluirEtiqueta(fila,item(51)),/50/);
});
test('entrega não pode ser desfeita pelo atalho de movimentação',()=>{
 assert.throws(()=>incluirEtiqueta([],item(1,'entregue')),/retorno/);
 for(const s of ['na_empresa','externo','nao_localizado'])assert.equal(incluirEtiqueta([],item(1,s)).length,1);
});
test('reordenar leituras preserva chave de repetição; revisão ou destino mudado exige nova operação',()=>{
 const a=[item(1),item(2)],s=assinaturaMovimento(a,'local-a');
 assert.equal(assinaturaMovimento([...a].reverse(),'local-a'),s);
 assert.notEqual(assinaturaMovimento(a,'local-b'),s);
 assert.notEqual(assinaturaMovimento([{...a[0],revisao:2},a[1]],'local-a'),s);
 assert.notEqual(assinaturaMovimento([a[0]],'local-a'),s);
});
