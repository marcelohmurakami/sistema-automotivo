import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createServer } from 'vite';
import { novoId } from '../src/lib/uuid.ts';
import { gerarSugestaoOleo } from '../supabase/functions/recontatos-oleo/gerar.ts';
import { novaFichaEspecialidade } from '../src/lib/perfisAtendimento.ts';
import { subsetoresDoRamo } from '../src/lib/operacaoServicos.ts';
import { registrarRetirada } from '../src/lib/assistenciaTecnica.ts';

const cryptoOriginal=globalThis.crypto;
Object.defineProperty(globalThis,'crypto',{configurable:true,value:{getRandomValues:cryptoOriginal.getRandomValues.bind(cryptoOriginal)}});
assert.throws(()=>globalThis.crypto.randomUUID(),TypeError,'Reproduz a API ausente em HTTP de rede local');
const ids=new Set(Array.from({length:10000},()=>novoId()));assert.equal(ids.size,10000);
for(const id of ids)assert.match(id,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
const chamadas=[];globalThis.capturarRpcRevisao=(nome,args)=>{chamadas.push({nome,args});return Promise.resolve('comissao-teste');};
const server=await createServer({configFile:false,envDir:false,cacheDir:'output/.vite-operacao-tests',server:{middlewareMode:true,hmr:false,ws:false,watch:null},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]},plugins:[{name:'rpc-isolado',enforce:'pre',load(id){if(id.replaceAll('\\','/').endsWith('/src/lib/rpc.ts'))return 'export const rpc=(nome,args)=>globalThis.capturarRpcRevisao(nome,args);';}}]});
try {
 const {ContextoAcesso}=await server.ssrLoadModule('/src/auth/contexto.ts');
 const paginas=[];
 for(const [arquivo,nome] of [['Clientes','Clientes'],['Catalogo','Catalogo'],['Compras','Compras'],['Fornecedores','Fornecedores']])paginas.push([nome,(await server.ssrLoadModule(`/src/pages/${arquivo}.tsx`))[nome]]);
 for(const [especialidade] of subsetoresDoRamo('automotivo')){
  const acesso={demo:true,usuario:'qa',oficina:{id:'qa',nome:'Empresa QA',ramo:'automotivo',especialidade,perfil:'owner',codigo_plano:'complete'},permite:()=>true};
  const qc=new QueryClient({defaultOptions:{queries:{enabled:false,retry:false}}});
  for(const [nome,Pagina] of paginas){const html=renderToStaticMarkup(h(QueryClientProvider,{client:qc},h(ContextoAcesso.Provider,{value:acesso},h(MemoryRouter,null,h(Pagina)))));assert.ok(html.length>100,`${especialidade}: ${nome} abre sem randomUUID`);}
  qc.clear();
 }
 const s=await server.ssrLoadModule('/src/services/servicosCompletos.ts');
 await s.operarAtendimento(false,'empresa','gerar_comissao_atendimento',{p_atendimento:'ordem',p_equipe:'integrante'});
 assert.deepEqual(chamadas.at(-1),{nome:'gerar_comissao_atendimento',args:{p_oficina:'empresa',p_equipe:'integrante'}});
 const fluxo=await server.ssrLoadModule('/src/lib/fluxoAssistencia.ts');
 for(const [especialidade] of subsetoresDoRamo('assistencia_tecnica')){
  let a={id:novoId(),situacao:'orcamento',dados:{documento:'ordem',orcamento_enviado:'nao'},ficha_especialidade:novaFichaEspecialidade(especialidade)};
  assert.equal(fluxo.etapaPainelAssistencia(a),'recebidos');
  a=fluxo.avancarAssistencia(a,especialidade);assert.equal(fluxo.etapaPainelAssistencia(a),'aprovacao');
  a=fluxo.avancarAssistencia(a,especialidade);assert.equal(fluxo.etapaPainelAssistencia(a),'aprovados');
  a=fluxo.avancarAssistencia(a,especialidade);assert.equal(fluxo.etapaPainelAssistencia(a),'producao');
  a=fluxo.pararAssistencia(a,especialidade,'Peça em transporte');assert.equal(fluxo.etapaPainelAssistencia(a),'parados');
  a=fluxo.avancarAssistencia(a,especialidade);assert.equal(fluxo.etapaPainelAssistencia(a),'producao');
  a=fluxo.avancarAssistencia(a,especialidade);assert.equal(fluxo.etapaPainelAssistencia(a),'prontos');
  a=registrarRetirada(a,'Cliente QA',especialidade);assert.equal(fluxo.etapaPainelAssistencia(a),null);
 }
 let corpo;
 const req=async(url,args)=>{assert.equal(url,'https://api.openai.com/v1/responses');corpo=JSON.parse(args.body);return Response.json({status:'completed',output:[{type:'reasoning'},{content:[{type:'output_text',text:'Qual a quilometragem atual? Podemos agendar sua revisão?'}]}]});};
 await gerarSugestaoOleo({data_prevista:'2026-11-01',proxima_km:90000,km_na_troca:85000,km_por_dia:50,base:'uso informado',nome:'NÃO ENVIAR'},'chave-falsa','modelo-teste',req);
 assert.equal(corpo.store,false);assert.doesNotMatch(corpo.input,/NÃO ENVIAR/);
 await assert.rejects(()=>gerarSugestaoOleo({},'x','x',async()=>Response.json({status:'incomplete'})),/incompleta/);
 console.log(`PASS 4 telas em ${subsetoresDoRamo('automotivo').length} subsetores sem randomUUID, 10 mil UUIDs, contrato real de comissão, fluxo de 5 assistências e IA isolada.`);
} finally { await server.close();Object.defineProperty(globalThis,'crypto',{configurable:true,value:cryptoOriginal});delete globalThis.capturarRpcRevisao; }
