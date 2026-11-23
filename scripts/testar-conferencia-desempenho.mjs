import assert from 'node:assert/strict';
import {test} from 'node:test';
import {QueryClient,QueryObserver} from '@tanstack/react-query';
import {buscarOpcoesRapidas,unirOpcoesPorId} from '../src/lib/buscaSelecaoRapida.ts';
import {normalizarAtalho} from '../src/lib/atalhosOficina.ts';
import {agruparAgendaPorDia,ocupaDiaAgenda,diasCalendario} from '../src/lib/calendarioAgenda.ts';
import {atualizarConsultas} from '../src/lib/atualizarConsultas.ts';

test('Cadastro recuperado por ID não duplica a página e preserva dados atuais',()=>{
 const atual={id:'1',nome:'Nome atualizado'},outro={id:'2',nome:'Fora da página'};
 const pagina=[atual],selecionados=[{id:'1',nome:'Nome antigo'},outro,outro];
 assert.deepEqual(unirOpcoesPorId(pagina,selecionados),[atual,outro]);
 assert.equal(unirOpcoesPorId(pagina,selecionados)[0],atual);
 assert.equal(pagina.length,1);assert.equal(selecionados.length,3);
 assert.deepEqual(unirOpcoesPorId(),[]);
 assert.deepEqual(unirOpcoesPorId(undefined,[outro]),[outro]);
});

test('Busca mantém acentos, palavras, código, detalhe, ordem e identidade dos itens',()=>{
 const opcoes=Array.from({length:2000},(_,i)=>({id:String(i),nome:i%2?'Retífica cabeçote GM':'Placa de alimentação',detalhe:`Peça ${i}`,busca:i%3?'MOTOR FIRE':'ABC-123'}));
 for(const busca of ['', 'cabeçote gm', 'retifica 15','PLACA alimentação', 'abc123', 'motor fire', '***', 'não encontrado']){
  const termos=normalizarAtalho(busca).split(/\s+/).filter(Boolean);
  const esperadas=opcoes.filter(o=>termos.every(t=>normalizarAtalho(`${o.nome} ${o.detalhe||''} ${o.busca||''}`).replace(/[^a-z0-9]/g,'').includes(t.replace(/[^a-z0-9]/g,'')))).slice(0,30);
  assert.deepEqual(buscarOpcoesRapidas(opcoes,busca),esperadas);
  if(esperadas.length)assert.equal(buscarOpcoesRapidas(opcoes,busca)[0],esperadas[0]);
 }
 assert.deepEqual(buscarOpcoesRapidas(opcoes,'resultado do servidor',true),opcoes.slice(0,30));
});
test('Busca interrompe a leitura em 30 resultados; não pesquisa uma resposta remota',()=>{
 let leituras=0;const opcoes=Array.from({length:10000},(_,i)=>({id:String(i),get nome(){leituras++;return 'Serviço';}}));
 assert.equal(buscarOpcoesRapidas(opcoes,'serviço').length,30);assert.equal(leituras,30);
 leituras=0;buscarOpcoesRapidas(opcoes,'');buscarOpcoesRapidas(opcoes,'abc',true);assert.equal(leituras,0);
});
test('Agenda agrupada mantém dias, deslocamento, viradas, eventos sem fim e ordem',()=>{
 const dias=diasCalendario('2026-11-11','mes');
 const eventos=Array.from({length:160},(_,i)=>({id:String(i),inicio:new Date(Date.UTC(2026,9,28,23,i*507)).toISOString(),fim:i%5?new Date(Date.UTC(2026,9,28,23,i*507+(i%7)*631)).toISOString():null,situacao:'agendado',visita:!!(i%2),deslocamento_minutos:i%40,logistica:{margem_minutos:15,retorno_minutos:70}}));
 eventos.push({id:'meia-noite',inicio:'2026-11-10T23:00:00-03:00',fim:'2026-11-11T00:00:00-03:00',situacao:'agendado'});
 for(const fuso of [undefined,'America/Sao_Paulo']){
  const r=agruparAgendaPorDia(eventos,dias,fuso);
  for(const dia of dias)assert.deepEqual(r.porDia.get(dia),eventos.filter(x=>ocupaDiaAgenda(x,dia,fuso)));
  assert.equal(r.quantidade,eventos.filter(x=>dias.some(d=>ocupaDiaAgenda(x,d,fuso))).length);
 }
 assert.equal(agruparAgendaPorDia(eventos,[]).quantidade,0);
 assert.deepEqual(agruparAgendaPorDia([],dias).porDia.get(dias[0]),[]);
});
test('Atualização priorizada preserva escopo, dados, erros e deduplicação',async()=>{
 const q=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}});
 let liberar,recusar;const lenta=new Promise(ok=>liberar=ok),falha=new Promise((_,no)=>recusar=no),n={};const stops=[];
 const observar=(key,espera)=>{q.setQueryData(key,0);const o=new QueryObserver(q,{queryKey:key,staleTime:Infinity,queryFn:async()=>{n[key.join(':')]=(n[key.join(':')]||0)+1;await espera;return 42;}});stops.push(o.subscribe(()=>{}));};
 observar(['detalhes','empresa-a','os-1']);observar(['alertas'],lenta);observar(['relatorios'],falha);observar(['detalhes','empresa-b','os-1']);
 q.setQueryData(['estoque','empresa-a'],0);
 try{
  const chaves=[['detalhes','empresa-a'],['detalhes','empresa-a','os-1'],['alertas'],['relatorios'],['estoque','empresa-a']];
  const fim=await Promise.race([atualizarConsultas(q,chaves,[['detalhes']]).then(()=>true),new Promise(ok=>setTimeout(()=>ok(false),500))]);
  assert.equal(fim,true);assert.equal(q.getQueryData(['detalhes','empresa-a','os-1']),42);
  assert.equal(q.getQueryData(['detalhes','empresa-b','os-1']),0);assert.equal(n['detalhes:empresa-a:os-1'],1);
  assert.equal(q.getQueryState(['alertas']).fetchStatus,'fetching');assert.equal(q.getQueryState(['estoque','empresa-a']).isInvalidated,true);
  liberar();recusar(new Error('Falha simulada'));await new Promise(ok=>setTimeout(ok,10));
  assert.equal(q.getQueryData(['alertas']),42);assert.equal(q.getQueryState(['relatorios']).status,'error');
  await atualizarConsultas(q,[['detalhes','empresa-a'],['detalhes','empresa-a','os-1']]);assert.equal(n['detalhes:empresa-a:os-1'],2);
 }finally{liberar();for(const stop of stops)stop();q.clear();}
});
