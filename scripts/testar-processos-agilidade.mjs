import {test} from 'node:test';
import assert from 'node:assert/strict';
import {QueryClient,QueryObserver} from '@tanstack/react-query';
import {chaveRascunho,gravarRascunho,lerRascunho,limparRascunho} from '../src/lib/rascunhos.ts';
import {atualizarIntegracoes} from '../src/lib/atualizarIntegracoes.ts';
test('Atalho de cliente preserva rascunho geral, outro cliente, empresa e usuário',()=>{
 const mapa=new Map(),storage={getItem:k=>mapa.get(k)||null,setItem:(k,v)=>mapa.set(k,v),removeItem:k=>mapa.delete(k)};
 const dados={versao:1,chave:'id',atualizado:Date.now(),dados:{cliente_id:'c1',veiculo_id:'v1',itens:[],observacoes:'',condicoes:'',desconto_centavos:0}};
 const chaves=[chaveRascunho('u','w'),chaveRascunho('u','w',undefined,'c1'),chaveRascunho('u','w',undefined,'c2'),chaveRascunho('u','outra',undefined,'c1'),chaveRascunho('outro','w',undefined,'c1')];
 assert.equal(new Set(chaves).size,5);for(const c of chaves)assert(gravarRascunho(c,dados,storage));
 limparRascunho(chaves[1],storage);assert.equal(lerRascunho(chaves[1],storage),null);
 for(const c of chaves.filter(x=>x!==chaves[1]))assert(lerRascunho(c,storage));
 assert.equal(chaveRascunho('u','w','documento','c1'),chaveRascunho('u','w','documento'));
});
test('Conclusão financeira aguarda seus valores, sem esperar relatório lento ou repetir consulta',async()=>{
 const cache=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}});
 let liberarFinanceiro,liberarRelatorio;
 const financeiro=new Promise(ok=>liberarFinanceiro=ok),relatorio=new Promise(ok=>liberarRelatorio=ok),chamadas={},parar=[];
 const observar=(chave,espera)=>{cache.setQueryData([chave],1);const o=new QueryObserver(cache,{queryKey:[chave],staleTime:Infinity,queryFn:async()=>{chamadas[chave]=(chamadas[chave]||0)+1;await espera;return 2}});parar.push(o.subscribe(()=>{}))};
 observar('financeiro',financeiro);observar('relatorios',relatorio);observar('recorrencias',Promise.resolve());observar('fora-do-escopo',Promise.resolve());
 try{
  let terminou=false;const tarefa=atualizarIntegracoes(cache,['financeiro','recorrencias']).then(()=>terminou=true);
  await new Promise(ok=>setTimeout(ok,10));assert.equal(terminou,false);assert.equal(cache.getQueryData(['financeiro']),1);
  liberarFinanceiro();await tarefa;assert.equal(cache.getQueryData(['financeiro']),2);assert.equal(cache.getQueryState(['relatorios']).fetchStatus,'fetching');
  assert.equal(chamadas.financeiro,1);assert.equal(chamadas.recorrencias,1);assert.equal(chamadas['fora-do-escopo'],undefined);
  liberarRelatorio();await new Promise(ok=>setTimeout(ok,10));assert.equal(cache.getQueryData(['relatorios']),2);
 }finally{liberarFinanceiro();liberarRelatorio();for(const p of parar)p();cache.clear()}
});
