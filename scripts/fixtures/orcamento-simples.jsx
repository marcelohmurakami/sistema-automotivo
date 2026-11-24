import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ContextoAcesso } from "../../src/auth/contexto";
import { Orcamentos } from "../../src/pages/Orcamentos";
import { Servicos } from "../../src/pages/Servicos";
import { especialidades } from "../../src/lib/especialidades";
import "../../src/index.css";
import "../../src/App.css";
import "../../src/Tema.css";
import "../../src/Clareza.css";
const p = new URLSearchParams(location.search),
  especialidade = p.get("perfil") || "retifica",
  ramo = especialidades[especialidade].ramo;
document.documentElement.dataset.tema = p.get("tema") || "escuro";
window.qaPerfis = Object.keys(especialidades);
const gravar = Storage.prototype.setItem;
Storage.prototype.setItem = function (k, v) {
  if (
    window.qaFalhaSalvar &&
    (k === "patio_orcamentos_v2" || k === "patio_servicos:demo")
  )
    throw Error("Falha de gravação simulada");
  return gravar.call(this, k, v);
};
createRoot(document.getElementById("root")).render(
  <QueryClientProvider
    client={
      new QueryClient({
        defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
      })
    }
  >
    <ContextoAcesso.Provider
      value={{
        demo: true,
        usuario: "qa",
        oficina: {
          id: "demo",
          nome: "Empresa QA",
          perfil: "owner",
          ramo,
          especialidade,
          codigo_plano: "complete",
          recursos: ["finance"],
        },
        permite: () => true,
      }}
    >
      <MemoryRouter
        initialEntries={[
          "/orcamentos" + (ramo === "automotivo" ? "?novo=1" : "?novo=1"),
        ]}
      >
        <main className="estrutura-sistema" style={{ display: "block", padding: 16 }}>
          {ramo === "automotivo" ? <Orcamentos /> : <Servicos tela="/orcamentos" />}
        </main>
      </MemoryRouter>
    </ContextoAcesso.Provider>
  </QueryClientProvider>,
);
