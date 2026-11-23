import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider,useQuery} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import {ContextoAcesso} from '@audit/auth/contexto';
import {Catalogo} from '@audit/pages/Catalogo';
import {Funcionarios} from '@audit/pages/Funcionarios';
import {Fornecedores} from '@audit/Fornecedores';
import {SeletorLocal,MovimentoFisico} from '@audit/components/localizacao/ControlesLocalizacao';
import {BuscaCompra} from '@audit/components/BuscaCompra';
import {useSuprimentos} from '@audit/components/suprimentos/helpers';
import {especialidades} from '@audit/lib/especialidades';
import '@audit/index.css';import '@audit/App.css';import '@audit/Tema.css';import '@audit/Clareza.css';
const params=new URLSearchParams(location.search),perfil=params.get('perfil')||'retifica',tela=params.get('tela')||'funcionarios';document.documentElement.dataset.tema=params.get('tema')||'escuro';
const qc=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:30000}}});window.qaCache=qc;
function Local(){const[v,s]=React.useState('');return <SeletorLocal valor={v} alterar={s}/>}
function Busca(){const[v,s]=React.useState(''),[escolha,e]=React.useState('');return <><BuscaCompra rotulo="Produto" valor={v} alterar={s} opcoes={v==='vários'?[{id:'a',nome:'A'},{id:'b',nome:'B'}]:[{id:'a',nome:'Produto único'}]} carregando={v==='carregando'} selecionar={o=>e(o.id)}/><output>{escolha}</output></>}
function Integracoes(){const {executar,ocupado}=useSuprimentos();const[salvo,s]=React.useState(false);useQuery({queryKey:['financeiro','qa'],queryFn:async()=>{if(window.qaLento)await new Promise(r=>setTimeout(r,2000));window.qaFinanceiro=(window.qaFinanceiro||0)+1;return 'confirmado'}});return <><button disabled={ocupado} onClick={async()=>{window.qaLento=true;if(await executar(async()=>{}))s(true)}}>Salvar pedido</button>{salvo&&<output>Salvo</output>}</>}
createRoot(document.getElementById('root')).render(<QueryClientProvider client={qc}><ContextoAcesso.Provider value={{demo:false,oficina:{id:'qa',nome:'Empresa QA',perfil:'owner',ramo:especialidades[perfil].ramo,especialidade:perfil},usuario:{id:'qa'},permite:()=>true}}><MemoryRouter><main style={{padding:16}}>{tela==='catalogo'?<Catalogo/>:tela==='fornecedores'?<Fornecedores/>:tela==='local'?<Local/>:tela==='busca'?<Busca/>:tela==='integracoes'?<Integracoes/>:tela==='movimento'?<MovimentoFisico itens={[{id:'item',descricao:'Objeto QA',revisao:1,situacao:'guardado'}]} fechar={()=>{}} salvo={()=>{window.qaSalvo=true}}/>:<Funcionarios/>}</main></MemoryRouter></ContextoAcesso.Provider></QueryClientProvider>);
