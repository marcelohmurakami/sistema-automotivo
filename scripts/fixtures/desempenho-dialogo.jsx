import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Dialogo} from '../../src/components/Dialogo';
import {componenteSobDemanda} from '../../src/lib/componenteSobDemanda';
import '../../src/App.css';
window.qa = {carregamentos: 0, montagens: 0, desmontagens: 0};
function Formulario() {
  useEffect(() => { window.qa.montagens++; return () => { window.qa.desmontagens++; }; }, []);
  return <label>Anotação<input defaultValue="Inicial" /></label>;
}
const SobDemanda = componenteSobDemanda(async () => { window.qa.carregamentos++; await new Promise(r=>setTimeout(r,120)); return {default: Formulario}; });
function Teste() {
  const [aberto, abrir] = useState(false);
  return <><button onClick={() => abrir(true)}>Abrir formulário</button><Dialogo aberto={aberto} fechar={() => abrir(false)} titulo="Conferência do diálogo"><SobDemanda /></Dialogo></>;
}
createRoot(document.getElementById('root')).render(<Teste />);
