import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {QueryClient, QueryObserver} from '@tanstack/react-query';
import {atualizarIntegracoes} from '../src/lib/atualizarIntegracoes.ts';
import {rascunhoDoUsuario,rascunhosDoUsuario,rascunhosPendentesDoUsuario,guardarRascunhoOffline,novoRascunhoOffline} from '../src/lib/atendimentoOffline.ts';
import {guardarExecucao,execucaoDoUsuario} from '../src/lib/execucaoOffline.ts';
import {mkdir,writeFile} from 'node:fs/promises';
const resultados=[];
// Simula atualização de um aparelho que já tem rascunhos e fotos no banco versão 1.
const antigo=await new Promise((ok,no)=>{const r=indexedDB.open('patio-atendimento-offline-v1',1);r.onupgradeneeded=()=>{r.result.createObjectStore('bases',{keyPath:'id'});r.result.createObjectStore('rascunhos',{keyPath:'id'});};r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error);});
const imagem='data:image/jpeg;base64,'+'a'.repeat(2048);
await new Promise((ok,no)=>{const t=antigo.transaction('rascunhos','readwrite'),s=t.objectStore('rascunhos');for(let i=0;i<3000;i++)s.put({...novoRascunhoOffline('u','w'),id:'enviado-'+i,situacao:'sincronizado',fotos:[{id:'f',imagem,legenda:'Preservada',fase:'antes',sincronizada:true}]});for(const [id,usuario,oficina,situacao] of [['pendente','u','w','pendente'],['parcial','u','w','parcial'],['outra-empresa','u','x','pendente'],['outro-usuario','x','w','pendente']])s.put({...novoRascunhoOffline(usuario,oficina),id,situacao});t.oncomplete=ok;t.onerror=()=>no(t.error);});
const inicio=performance.now();const antes=await new Promise((ok,no)=>{const t=antigo.transaction('rascunhos'),r=t.objectStore('rascunhos').getAll();t.oncomplete=()=>ok(r.result);t.onerror=()=>no(t.error);});const msAntes=performance.now()-inicio;antigo.close();
const inicioNovo=performance.now();const pendentes=await rascunhosPendentesDoUsuario('u','w');const msAtualizacao=performance.now()-inicioNovo;
assert.deepEqual(pendentes.map(r=>r.id).sort(),['parcial','pendente']);
assert.equal((await rascunhosDoUsuario('u','w')).length,3002);
assert.equal((await rascunhosDoUsuario('u')).length,3003);
assert.equal((await rascunhoDoUsuario('u','w','enviado-2999')).fotos[0].imagem,imagem);
assert.equal(await rascunhoDoUsuario('u','w','outra-empresa'),undefined);
assert.equal(await rascunhoDoUsuario('u','w','outro-usuario'),undefined);
assert.equal(await rascunhoDoUsuario('u','w','inexistente'),undefined);
const r=await rascunhoDoUsuario('u','w','pendente');await guardarRascunhoOffline({...r,relato:'Editado após atualização'});assert.equal((await rascunhoDoUsuario('u','w','pendente')).relato,'Editado após atualização');
const tempos=[];for(let i=0;i<5;i++){const t=performance.now();await rascunhosPendentesDoUsuario('u','w');tempos.push(performance.now()-t);}
resultados.push({teste:'Upgrade IndexedDB v1→v2 e leitura de pendências',antesRegistros:antes.length,depoisRegistros:pendentes.length,antesMs:msAntes,upgradeMs:msAtualizacao,depoisMedianaMs:tempos.sort((a,b)=>a-b)[2],nota:'Medição no fake-indexeddb; volume lido e isolamento comprovados. Não representa a velocidade do disco do cliente.'});
const exec={id:'ex',usuario:'u',oficina:'w',revisao:0,fotos:[],dados:{anotacoes:'Preservada'},base:{id:'ex'}};await guardarExecucao(exec);assert.equal((await execucaoDoUsuario('u','w','ex')).dados.anotacoes,'Preservada');assert.equal(await execucaoDoUsuario('u','x','ex'),undefined);assert.equal(await execucaoDoUsuario('x','w','ex'),undefined);
// Mantém o mesmo conjunto de chaves e atualiza cada observador ativo uma única vez.
const qc=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity,gcTime:Infinity}}});for(let i=0;i<2000;i++)qc.setQueryData([i%2?'estoque':'nao-relacionada','w',i],i);
let chamadas=0;const obs=new QueryObserver(qc,{queryKey:['financeiro','w'],queryFn:async()=>++chamadas,initialData:0,staleTime:Infinity});const stop=obs.subscribe(()=>{});
await atualizarIntegracoes(qc);assert.equal(chamadas,1);assert.equal(qc.getQueryState(['estoque','w',1]).isInvalidated,true);assert.equal(qc.getQueryState(['nao-relacionada','w',0]).isInvalidated,false);assert.equal(qc.getQueryData(['financeiro','w']),1);stop();qc.clear();
resultados.push({teste:'Invalidação única do cache',consultas:2001,refetchAtivo:chamadas,isolamento:'Consultas não relacionadas preservadas'});
await mkdir('output/desempenho-20261111',{recursive:true});await writeFile('output/desempenho-20261111/testes-desempenho.json',JSON.stringify(resultados,null,2));console.log('PASS: índices offline, atualização sem perda de fotos, isolamento, consulta pontual e invalidação única.');
