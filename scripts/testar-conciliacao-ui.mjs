import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
const server=await createServer({configFile:false,envDir:false,cacheDir:'output/.vite-conciliacao-ui',server:{middlewareMode:true,hmr:false,ws:false,watch:null},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
try{
 const {ContextoAcesso}=await server.ssrLoadModule('/src/auth/contexto.ts');
 const {ConciliacaoBancaria}=await server.ssrLoadModule('/src/components/financeiro/ConciliacaoBancaria.tsx');
 const {CobrancasContratos}=await server.ssrLoadModule('/src/components/financeiro/CobrancasContratos.tsx');
 const {especialidades}=await server.ssrLoadModule('/src/lib/especialidades.ts');
 const dt=new Date();dt.setDate(1);dt.setMonth(dt.getMonth()-1);const mes=`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
 const perfis=Object.keys(especialidades);
 for(const perfil of perfis){
  const qc=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});const w='empresa-ui-'+perfil;
  qc.setQueryData(['contas-bancarias',false,w],[{codigo:'banco',tipo:'banco',nome:'Banco da empresa',ativo:true}]);
  qc.setQueryData(['conciliacao',w,'banco','2026-10-01','2026-10-29','pendente',0],{itens:[{id:'linha',data:'2026-10-02',descricao:'Recebimento do cliente',valor:10000,estado:'pendente'}],total:1,resumo:{pendentes:1,conciliados:0,ignorados:0,sem_extrato:1,movimento_extrato:10000,movimento_sistema:10000}});
  qc.setQueryData(['contratos-cobrancas',w,mes,0,true],{total:1,itens:[{id:'contrato',nome:'Plano preventivo',cliente:'Cliente fictício',fechada:false,assinatura:'abc',fatura:{inicio:mes+'-01',fim:mes+'-28',total:15000,mensalidade:10000,excedente_visitas:2000,excedente_horas:2000,excedente_materiais:1000,participacao:0,vencimento:mes+'-28'}}]});
  const render=componente=>renderToStaticMarkup(h(QueryClientProvider,{client:qc},h(ContextoAcesso.Provider,{value:{demo:false,oficina:{id:w,especialidade:perfil,perfil:'owner'},permite:()=>true}},h(MemoryRouter,{},componente))));
  const html=render(h(ConciliacaoBancaria,{inicio:'2026-10-01',fim:'2026-10-29'}));assert.match(html,/Recebimento do cliente/);assert.match(html,/Banco da empresa/);assert.match(html,/Importar extrato/);assert.doesNotMatch(html,/Carregando extrato|undefined|NaN/);
  const contratos=render(h(CobrancasContratos));assert.match(contratos,/Plano preventivo/);assert.match(contratos,/Cliente fictício/);assert.match(contratos,/Selecionar pendentes da página/);assert.match(contratos,/Composição/);assert.doesNotMatch(contratos,/undefined|NaN|Calculando cobranças/);qc.clear();
 }
 console.log(`PASS interface renderizada com dados nos ${perfis.length} subsetores: conciliação e cobrança de contratos.`);
}finally{await server.close();}
