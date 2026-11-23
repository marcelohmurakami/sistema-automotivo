import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import ts from 'typescript';
const root='output/revisao-integral-20261119/integridade-demo',resultados=[];
for(const [fase,path] of [['antes',root+'/transacao-antes-cota.ts'],['depois','src/lib/transacaoDemo.ts']]){
 const js=ts.transpileModule(await readFile(path,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext}}).outputText;
 const {transacaoDemo}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
 for(const chaves of [['a','b','c'],['a','c','b'],['b','a','c'],['b','c','a'],['c','a','b'],['c','b','a']]){
  const memoria=new Map([['a','AAAA'],['b','b'],['c','c'],['fora','xx']]),original=new Map(memoria);
  globalThis.localStorage={getItem:k=>memoria.get(k)??null,removeItem:k=>memoria.delete(k),setItem(k,v){const novo=new Map(memoria);novo.set(k,String(v));if([...novo.values()].reduce((s,v)=>s+v.length,0)>8)throw Error('Cota simulada excedida');memoria.set(k,String(v))}};
  assert.throws(()=>transacaoDemo(chaves,()=>{localStorage.setItem('a','a');localStorage.setItem('b','BBBB');localStorage.setItem('c','CCC')}),/Cota simulada/);
  let restaurou=true;try{assert.deepEqual(memoria,original)}catch{restaurou=false}
  resultados.push({fase,ordem:chaves.join(','),restaurou,foraPreservado:memoria.get('fora')==='xx'});if(fase==='depois')assert(restaurou);
 }
}
assert(resultados.some(x=>x.fase==='antes'&&!x.restaurou));
await writeFile(root+'/cota.json',JSON.stringify({metodo:'Código real; cota de armazenamento simulada. Uma chave cresce usando o espaço liberado por outra; a terceira falha. Seis ordens de restauração e chave alheia preservada.',resultados},null,2));console.log(JSON.stringify(resultados));
