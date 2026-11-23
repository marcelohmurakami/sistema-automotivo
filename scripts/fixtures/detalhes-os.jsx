import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ContextoAcesso } from "../../src/auth/contexto";
import "../../src/index.css";
import "../../src/App.css";
import "../../src/Tema.css";
import "../../src/Clareza.css";
const p = new URLSearchParams(location.search);
document.documentElement.dataset.tema = p.get("tema") || "escuro";
const c = await fetch(
  "/test-context?perfil=" + p.get("perfil") + (p.has("longo") ? "&longo=1" : ""),
).then((r) => r.json());
// Componentes reais, inclusive localização/offline: demo=false evita esconder as ações que causaram a quebra.
const { OrdensServico } = await import("../../src/pages/OrdensServico");
const { DetalhesAtendimento } =
  await import("../../src/components/DetalhesAtendimento");
if (p.has("extras"))
  for (const carregar of Object.values(import.meta.glob("../../src/**/*.css")))
    await carregar();
const acesso = {
  demo: false,
  oficina: c.oficina,
  usuario: c.usuario,
  permite: () => true,
};
createRoot(document.getElementById("root")).render(
  <QueryClientProvider
    client={
      new QueryClient({
        defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
      })
    }
  >
    <ContextoAcesso.Provider value={acesso}>
      <MemoryRouter initialEntries={["/ordens-servico?os=" + c.doc]}>
        <main
          className="estrutura-sistema"
          style={{ display: "block", padding: 32, minHeight: "100vh" }}
        >
          {c.oficina.ramo === "automotivo" ? (
            <OrdensServico />
          ) : (
            <>
              <h1>Atendimentos</h1>
              <DetalhesAtendimento id={c.doc} fechar={() => {}} editar={() => {}} />
            </>
          )}
        </main>
      </MemoryRouter>
    </ContextoAcesso.Provider>
  </QueryClientProvider>,
);
