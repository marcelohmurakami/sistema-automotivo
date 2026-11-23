import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { atualizarConsultas } from '../src/lib/atualizarConsultas.ts';

test('Saldo confirmado libera a ação enquanto o depósito secundário ainda atualiza',async()=>{
 const cache=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
 let liberarPrincipal,liberarSecundaria;const chamadas={estoque:0,suprimentos:0};
 const principal=new QueryObserver(cache,{queryKey:['estoque','empresa-qa'],queryFn:async()=>{if(++chamadas.estoque===1)return 10;return new Promise(r=>liberarPrincipal=()=>r(8))}});
 const secundaria=new QueryObserver(cache,{queryKey:['suprimentos','depositos','empresa-qa'],queryFn:async()=>{if(++chamadas.suprimentos===1)return 10;return new Promise(r=>liberarSecundaria=()=>r(8))}});
 const cancelar=[principal.subscribe(()=>{}),secundaria.subscribe(()=>{})];
 try{
  await Promise.all([principal.refetch(),secundaria.refetch()]);
  let terminou=false;const atualizacao=atualizarConsultas(cache,[['estoque'],['suprimentos']],[['estoque']]).then(()=>terminou=true);
  await new Promise(r=>setTimeout(r,0));assert.equal(terminou,false,'não libera antes de consultar o saldo confirmado');
  liberarPrincipal();await atualizacao;
  assert.equal(cache.getQueryData(['estoque','empresa-qa']),8);assert.equal(secundaria.getCurrentResult().isFetching,true);
  liberarSecundaria();await secundaria.refetch({cancelRefetch:false});
  assert.equal(cache.getQueryData(['suprimentos','depositos','empresa-qa']),8);assert.deepEqual(chamadas,{estoque:2,suprimentos:2});
 }finally{cancelar.forEach(f=>f());cache.clear()}
});

test('Atualização de clientes não refaz a lista de outra empresa nem perde erros secundários',async()=>{
 const cache=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
 let calls=0;const chave=['clientes','usuario-qa','empresa-qa'];
 const outra=new QueryObserver(cache,{queryKey:['clientes','usuario-qa','outra-empresa'],queryFn:async()=>++calls});
 let falhar=false;const secundaria=new QueryObserver(cache,{queryKey:['selecao-operacao','empresa-qa'],queryFn:async()=>{if(falhar)throw new Error('Consulta secundária indisponível');return []}});
 const parar=[outra.subscribe(()=>{}),secundaria.subscribe(()=>{})];
 try{await Promise.all([outra.refetch(),secundaria.refetch()]);falhar=true;await atualizarConsultas(cache,[chave,['selecao-operacao']],[chave]);await new Promise(r=>setTimeout(r,0));assert.equal(calls,1);assert.equal(secundaria.getCurrentResult().status,'error');assert.equal(secundaria.getCurrentResult().error.message,'Consulta secundária indisponível')}
 finally{parar.forEach(f=>f());cache.clear()}
});
