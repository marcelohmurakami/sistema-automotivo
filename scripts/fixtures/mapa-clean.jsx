import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route}from'react-router-dom';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';
import{ContextoAcesso}from'../../src/auth/contexto';import{LayoutPorRamo}from'../../src/layouts/LayoutEmpresa';import{MapaOficina}from'../../src/pages/MapaOficina';import{OrdensServico}from'../../src/pages/OrdensServico';import{salvarOS}from'../../src/services/ordensServico';
import'../../src/index.css';import'../../src/App.css';import'../../src/Tema.css';import'../../src/Clareza.css';
const p=new URLSearchParams(location.search);document.documentElement.dataset.tema=p.get('tema')||'escuro';
const dados=[];
for(let i=0;i<5;i++){
 const os=await salvarOS(true,'demo',{cliente_id:null,cliente_nome_livre:'QA Cliente da oficina com nome completo '+i,carro_livre:'Volkswagen Polo Comfortline 1.0 TSI '+i,motor_livre:'EA211',data_servico:'2026-11-05',servico_pronto:true,itens:[{id:crypto.randomUUID(),tipo:'service',unidade:'serv',descricao:'Serviço de teste',quantidade:1,preco_unitario_centavos:15000,situacao:'done'}]},crypto.randomUUID());
 os.situacao=['open','open','in_progress','quality_check','ready'][i];os.numero=100+i;os.recebido_em='2026-11-05T08:00:00-03:00';if(i===1)os.paradas=[{id:crypto.randomUUID(),motivo:'approval',detalhes:'Aguardando aprovação do orçamento',encerrado_em:null}];dados.push(os);
}
localStorage.setItem('patio_os_v1',JSON.stringify(dados));
const noop=()=>{};const oficina={id:'demo',nome:'Oficina QA',especialidade:'retifica',ramo:'automotivo',perfil:'owner',codigo_plano:'complete',nome_plano:'Completo',recursos:['ai','finance','work_orders'],situacao:'active'};
const acesso={demo:true,usuario:'qa',email:'qa@example.com',carregando:false,erro:'',oficina,oficinas:[oficina],permite:()=>true,selecionarOficina:noop,definirPlanoDemo:noop,sair:async()=>{},atualizar:async()=>{},demonstrar:noop,demonstrarRamo:noop,usarContaReal:noop};
createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ContextoAcesso.Provider value={acesso}><MemoryRouter><Routes><Route element={<LayoutPorRamo/>}><Route index element={<MapaOficina/>}/><Route path="ordens-servico" element={<OrdensServico/>}/></Route></Routes></MemoryRouter></ContextoAcesso.Provider></QueryClientProvider>);
