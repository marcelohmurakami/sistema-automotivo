import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { atualizarQualidade } from '../src/lib/atualizarQualidade.ts';

test('ocorrência invalida os demonstrativos derivados, preservando consultas não relacionadas', async()=>{
  const c=new QueryClient({defaultOptions:{queries:{staleTime:Infinity,retry:false}}});
  const chaves=['qualidade','relatorios-gestao','relatorios-servicos','analise-gerencial','equipe','lucro-documento','lucro-cliente','custeio','custeio-detalhe','apuracao','financeiro','financeiro-detalhe'];
  for(const k of [...chaves,'catalogo'])c.setQueryData([k,'empresa-teste'],{valor:100});
  await atualizarQualidade(c);
  for(const k of chaves)assert.equal(c.getQueryState([k,'empresa-teste']).isInvalidated,true,k);
  assert.equal(c.getQueryState(['catalogo','empresa-teste']).isInvalidated,false);
  c.clear();
});
test('apuração aberta recebe o custo atualizado sem recarregar ou esperar expirar o cache',async()=>{
  const c=new QueryClient({defaultOptions:{queries:{staleTime:Infinity,retry:false}}});
  let valor=100;
  const o=new QueryObserver(c,{queryKey:['apuracao','empresa-teste'],queryFn:async()=>({custo:valor})});
  const parar=o.subscribe(()=>{});await o.refetch();assert.equal(o.getCurrentResult().data.custo,100);
  valor=213.45;await atualizarQualidade(c);assert.equal(o.getCurrentResult().data.custo,213.45);
  parar();c.clear();
});
