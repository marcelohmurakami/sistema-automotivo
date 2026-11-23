import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {enviarFilaOffline} from '../src/lib/filaOffline.ts';
import {guardarBase,basesDoUsuario,novoRascunhoOffline,guardarRascunhoOffline,rascunhosDoUsuario,limparOfflineUsuario} from '../src/lib/atendimentoOffline.ts';

const chamadas=[], progresso=[];
const resultado=await enviarFilaOffline(['primeiro','falha','ultimo'],async item=>{
  chamadas.push(item); if(item==='falha')throw Error('Sem conexão');
},(n,total)=>progresso.push([n,total]));
assert.deepEqual(chamadas,['primeiro','falha','ultimo']);
assert.equal(resultado.enviados,2);assert.equal(resultado.falhas[0].item,'falha');
assert.deepEqual(progresso,[[1,3],[1,3],[2,3]]);
assert.deepEqual(await enviarFilaOffline([],async()=>{throw Error('Não executar');}),{enviados:0,falhas:[]});
const base={id:'u:a',usuario:'u',oficina:'a',nome:'Antiga',atualizado:Date.now()-9*86400000,aux:{clientes:[],veiculos:[],vinculos:[],catalogo:[]}};
await guardarBase(base);await guardarBase({...base,id:'outro:a',usuario:'outro'});
assert.equal((await basesDoUsuario('u')).length,0);
assert.equal((await basesDoUsuario('u',true)).length,1);
const a=novoRascunhoOffline('u','a'),b=novoRascunhoOffline('u','b'),outro=novoRascunhoOffline('outro','a');
for(const r of [a,b,outro])await guardarRascunhoOffline(r);
assert.equal((await rascunhosDoUsuario('u')).length,2);
assert.equal((await rascunhosDoUsuario('u','a')).length,1);
assert.equal((await rascunhosDoUsuario('u','b'))[0].id,b.id);
await limparOfflineUsuario('u');
assert.equal((await rascunhosDoUsuario('u')).length,0);
assert.equal((await rascunhosDoUsuario('outro')).length,1);
console.log('PASS: envio em lote com falhas independentes, progresso, lista vazia, base vencida, isolamento por usuário/empresa e limpeza');
