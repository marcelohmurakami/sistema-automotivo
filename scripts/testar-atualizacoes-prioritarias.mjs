import assert from 'node:assert/strict';
import {QueryClient,QueryObserver} from '@tanstack/react-query';
import {atualizarIntegracoes} from '../src/lib/atualizarIntegracoes.ts';
const qc=new QueryClient({defaultOptions:{queries:{retry:false}}});
let liberar,liberarFalha;const n={os:0,alertas:0,relatorios:0};
const fila=new Promise(ok=>liberar=ok),falha=new Promise((_,nok)=>liberarFalha=nok);
const observadores=['os','alertas','relatorios'].map(chave=>{
 qc.setQueryData([chave,'qa'],0);
 const o=new QueryObserver(qc,{queryKey:[chave,'qa'],staleTime:Infinity,queryFn:async()=>{n[chave]++;if(chave==='alertas')await fila;if(chave==='relatorios')await falha;return 42;}});
 const stop=o.subscribe(()=>{});return {o,stop};
});
qc.setQueryData(['estoque','qa','inativa'],0);qc.setQueryData(['nao-relacionado'],0);
try{
 const resultado=await Promise.race([atualizarIntegracoes(qc,['os']).then(()=>true),new Promise(ok=>setTimeout(()=>ok(false),500))]);
 assert.equal(resultado,true,'A ação espera os dados principais, sem aguardar os alertas');
 assert.deepEqual(n,{os:1,alertas:1,relatorios:1},'Nenhuma consulta repetida');
 assert.equal(qc.getQueryData(['os','qa']),42);
 assert.equal(qc.getQueryState(['alertas','qa']).fetchStatus,'fetching');
 assert.equal(qc.getQueryState(['estoque','qa','inativa']).isInvalidated,true);
 assert.equal(qc.getQueryState(['nao-relacionado']).isInvalidated,false);
 liberar();liberarFalha(new Error('Falha secundária simulada'));
 await new Promise(ok=>setTimeout(ok,10));
 assert.equal(qc.getQueryData(['alertas','qa']),42);
 assert.equal(qc.getQueryState(['relatorios','qa']).status,'error');
 assert.equal(qc.getQueryData(['os','qa']),42,'Falha secundária não reverte a operação confirmada');
 console.log('PASS: atualização principal aguardada; secundárias independentes; sem repetição; inativas invalidadas; erros preservados.');
}finally{for(const {stop,o} of observadores){stop();o.destroy();}qc.clear();}
