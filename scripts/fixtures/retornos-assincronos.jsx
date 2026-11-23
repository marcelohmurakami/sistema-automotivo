import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {ContextoAcesso} from '../../src/auth/contexto';
import {CobrancaPix} from '../../src/components/CobrancaPix';
import {AtendimentoExpresso} from '../../src/components/AtendimentoExpresso';
import {EscolherDeposito} from '../../src/components/suprimentos/Depositos';
import {SelecaoClienteVeiculo} from '../../src/components/SelecaoClienteVeiculo';
import {ConfiguracaoAnalises} from '../../src/components/analises/ConfiguracaoAnalises';
import {Comissoes} from '../../src/components/Comissoes';
import {RelatoriosServicos} from '../../src/pages/RelatoriosServicos';
import {SeletorLocal} from '../../src/components/localizacao/ControlesLocalizacao';
import {DetalheCusto} from '../../src/components/financeiro/CustosServicos';
import {DistribuicaoAgenda} from '../../src/components/DistribuicaoAgenda';
import {BrowserRouter} from 'react-router-dom';
import '../../src/index.css';
import '../../src/App.css';
import '../../src/Tema.css';
import '../../src/Clareza.css';
const tela=new URLSearchParams(location.search).get('tela');
window.qa={fotosPendentes:0,falharQr:false};
const criarBitmap=window.createImageBitmap.bind(window);
window.createImageBitmap=async(file,...args)=>{
  window.qa.fotosPendentes++;
  try {
    const bmp=await criarBitmap(file,...args);
    if(file.name==='foto-antiga.png')await new Promise(r=>setTimeout(r,500));
    return bmp;
  } finally {window.qa.fotosPendentes--;}
};
const exportarCanvas=HTMLCanvasElement.prototype.toDataURL;
HTMLCanvasElement.prototype.toDataURL=function(...args){if(window.qa.falharQr)throw Error('Falha simulada ao renderizar QR');return exportarCanvas.apply(this,args)};
const acesso={demo:false,usuario:'qa-local',oficina:{id:'qa-local',nome:'Empresa fictícia',perfil:'owner',recursos:[],ramo:'automotivo',especialidade:'mecanica'},permite:()=>true};
function Deposito(){const [id,setId]=React.useState(null);return <EscolherDeposito valor={id} alterar={setId}/>}
function Local(){const [id,setId]=React.useState('');return <><SeletorLocal valor={id} alterar={setId}/><output data-testid="local">{id}</output></>}
function Custo(){const [aberto,setAberto]=React.useState(true);return aberto?<DetalheCusto id="os-a" fechar={()=>setAberto(false)} abrirParametros={()=>{}}/>:<p>Detalhe fechado</p>}
function Equipe(){return <form><input name="inicio" defaultValue="2026-11-19T09:00"/><input name="fim" defaultValue="2026-11-19T10:00"/><DistribuicaoAgenda id="visita-qa" inicial={{perfil_id:'perfil-a',habilidades:['Diagnóstico']}} aoEscolher={()=>{}} aoProcessar={()=>{}}/></form>}
function Cliente(){const [cliente,setCliente]=React.useState(''),[veiculo,setVeiculo]=React.useState('');return <><SelecaoClienteVeiculo aux={{clientes:[],veiculos:[],vinculos:[],catalogo:[]}} cliente={cliente} veiculo={veiculo} selecionarCliente={setCliente} selecionarVeiculo={setVeiculo} aoProcessar={()=>{}} permitirAvulso/><output data-testid="selecao">{JSON.stringify({cliente,veiculo})}</output></>}
const cache=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});window.qa.cache=cache;
cache.setQueryData(['selecao-operacao','qa-local',false,'clientes','',''],[{id:'cliente-a',nome:'Cliente A'}]);
cache.setQueryData(['selecao-operacao','qa-local',false,'veiculos','cliente-a',''],[{id:'veiculo-a',cliente_id:'cliente-a',modelo:'Veículo A',placa:'ABC1D23'}]);
createRoot(document.getElementById('root')).render(<QueryClientProvider client={cache}><ContextoAcesso.Provider value={acesso}><BrowserRouter><main style={{padding:16,maxWidth:1100,margin:'auto'}}>{tela==='equipe'?<Equipe/>:tela==='local'?<Local/>:tela==='custo'?<Custo/>:tela==='conta'?<RelatoriosServicos inicial="contas"/>:tela==='comissao'?<Comissoes inicio="2026-11-01" fim="2026-11-19"/>:tela==='foto'?<AtendimentoExpresso aplicar={()=>{}}/>:tela==='deposito'?<Deposito/>:tela==='cliente'?<Cliente/>:tela==='analise'?<ConfiguracaoAnalises tipo="primeira_visita" idInicial="problema-a" modoInicial="editar_problema"/>:<CobrancaPix titulo={{id:'titulo-qa'}} restante={0}/>}</main></BrowserRouter></ContextoAcesso.Provider></QueryClientProvider>);
