import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {ContextoAcesso} from '../../src/auth/contexto';
import {MapaOficina} from '../../src/pages/MapaOficina';
import {ProvedorPagamentoAposRegistro} from '../../src/components/ProvedorPagamentoAposRegistro';
import {salvarOS} from '../../src/services/ordensServico';
import '../../src/index.css';import '../../src/App.css';import '../../src/Tema.css';import '../../src/Clareza.css';
const p=new URLSearchParams(location.search),n=Number(p.get('n')||100),dados=[];
document.documentElement.dataset.tema='escuro';localStorage.removeItem('patio_os_v1');
const modelo=await salvarOS(true,'demo',{cliente_nome_livre:'QA Cliente',carro_livre:'QA Volkswagen',motor_livre:'AP',data_servico:'2026-11-13',itens:[{id:crypto.randomUUID(),tipo:'service',descricao:'QA serviço',unidade:'serv',quantidade:1,preco_unitario_centavos:10000,situacao:'pending'}]},crypto.randomUUID());
for(let i=1;i<=n;i++)dados.push({...modelo,id:crypto.randomUUID(),numero:i,dados_cliente:{nome:'QA Cliente '+i},dados_veiculo:{modelo:'QA Volkswagen '+i},situacao:i===1?'open':['open','in_progress','quality_check','ready'][i%4],paradas:[]});
localStorage.setItem('patio_os_v1',JSON.stringify(dados));
const qc=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
// Revalidação lenta controlada, somente no teste; mutação usa o serviço real demo.
if(p.has('lento')){qc.setQueryDefaults(['mapa-oficina'],{queryFn:async()=>{await new Promise(r=>setTimeout(r,2000));return JSON.parse(localStorage.getItem('patio_os_v1'));}});const orig=qc.invalidateQueries.bind(qc);qc.invalidateQueries=async(...args)=>{await new Promise(r=>setTimeout(r,2000));return orig(...args);};}
window.qa={qc,mutacoes:0};
const gravar=Storage.prototype.setItem;
Storage.prototype.setItem=function(k,v){if(k==='patio_os_v1'){if(window.qa.falhar)throw Error('Falha simulada ao gravar. Tente novamente.');window.qa.mutacoes++;}return gravar.call(this,k,v);};
const acesso={demo:true,usuario:'qa',oficina:{id:'demo',nome:'QA mapa',perfil:'owner',ramo:'automotivo',especialidade:'retifica',codigo_plano:'complete',recursos:['finance']},permite:()=>true};
createRoot(document.getElementById('root')).render(<QueryClientProvider client={qc}><ContextoAcesso.Provider value={acesso}><MemoryRouter><ProvedorPagamentoAposRegistro><main style={{padding:16}}><Routes><Route path="/" element={<MapaOficina/>}/></Routes></main></ProvedorPagamentoAposRegistro></MemoryRouter></ContextoAcesso.Provider></QueryClientProvider>);
