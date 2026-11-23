import { lazy } from "react";
import { BrowserRouter, useLocation } from "react-router-dom";
import { ProvedorAcesso } from "./auth/ProvedorAcesso";
import { CarregamentoPagina } from "./components/CarregamentoPagina";
import { PrepararNavegacao } from "./components/PrepararNavegacao";
import { MedicaoUsabilidade } from "./components/MedicaoUsabilidade";
import { SincronizacaoDocumentosOffline } from "./components/offline/SincronizacaoDocumentosOffline";
import "./App.css";
import "./Tema.css";
import "./Clareza.css";

const RotasSistema = lazy(() => import("./RotasSistema"));
const ExecucaoOffline = lazy(() =>
  import("./pages/ExecucaoOffline").then((m) => ({ default: m.ExecucaoOffline })),
);

function ConteudoRotas() {
  const { pathname } = useLocation();
  // A área local não precisa inicializar os menus, formulários e serviços online.
  // Os provedores permanecem montados ao entrar ou voltar para o sistema.
  return pathname.replace(/\/+$/, "").toLowerCase() === "/execucao-offline" ? (
    <ExecucaoOffline />
  ) : (
    <RotasSistema />
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ProvedorAcesso>
        <PrepararNavegacao />
        <MedicaoUsabilidade />
        <SincronizacaoDocumentosOffline />
        <CarregamentoPagina>
          <ConteudoRotas />
        </CarregamentoPagina>
      </ProvedorAcesso>
    </BrowserRouter>
  );
}
