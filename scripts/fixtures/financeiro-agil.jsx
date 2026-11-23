import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {FormularioBaixaFinanceira} from '../../src/components/financeiro/FormularioBaixaFinanceira';
import {novoTitulo} from '../../src/services/financeiro';
import '../../src/index.css';
import '../../src/App.css';
import '../../src/pages/Financeiro.css';
function App(){
 const [contas,setContas]=useState({caixa:'Dinheiro',banco:'Banco'});
 const [titulo,setTitulo]=useState({...novoTitulo('receber'),descricao:'Teste isolado de recebimento',aberto_centavos:10000,forma_prevista:'dinheiro'});
 window.qaContas=setContas;window.qaTitulo=d=>setTitulo({...titulo,...d,id:crypto.randomUUID()});
 return <main style={{maxWidth:600,padding:16,margin:'auto'}}><FormularioBaixaFinanceira key={titulo.id} titulo={titulo} contas={contas} ocupado={false} enviarBaixa={e=>{e.preventDefault();window.qaEnviados??=[];window.qaEnviados.push(Object.fromEntries(new FormData(e.currentTarget)))}}/></main>;
}
createRoot(document.getElementById('root')).render(<App/>);
