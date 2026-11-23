import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {useAgora} from '../../src/lib/useAgora';

const intervalos=new Set(), foco=new Set(), visibilidade=new Set();
const intervaloOriginal=window.setInterval.bind(window), limparOriginal=window.clearInterval.bind(window);
window.setInterval=(fn,ms,...args)=>{const id=intervaloOriginal(fn,ms,...args);if(ms===30000)intervalos.add(id);return id;};
window.clearInterval=(id)=>{intervalos.delete(id);limparOriginal(id);};
for(const [alvo,tipo,lista] of [[window,'focus',foco],[document,'visibilitychange',visibilidade]]){
  const adicionar=alvo.addEventListener.bind(alvo),remover=alvo.removeEventListener.bind(alvo);
  alvo.addEventListener=(nome,fn,...args)=>{if(nome===tipo)lista.add(fn);adicionar(nome,fn,...args);};
  alvo.removeEventListener=(nome,fn,...args)=>{if(nome===tipo)lista.delete(fn);remover(nome,fn,...args);};
}
window.qa={contagens:()=>({intervalos:intervalos.size,foco:foco.size,visibilidade:visibilidade.size}),visibilidade:(estado)=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>estado});document.dispatchEvent(new Event('visibilitychange'));}};
function Prazo({id}){const agora=useAgora();return <time data-id={id} data-instante={agora.getTime()}>{agora.toISOString()}</time>;}
function Teste(){const [n,setN]=useState(100);return <main><button onClick={()=>setN(n?0:100)}>{n?'Desmontar':'Montar'}</button><div>{Array.from({length:n},(_,i)=><Prazo key={i} id={i}/>)}</div></main>;}
createRoot(document.getElementById('root')).render(<Teste/>);
