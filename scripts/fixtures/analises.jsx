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
const c = await fetch("/test-context?perfil=" + p.get("perfil")).then((r) => r.json());
const { Relatorios } = await import("../../src/pages/Relatorios");
const { RelatoriosServicos } = await import("../../src/pages/RelatoriosServicos");
if (p.has("extras"))
  for (const carregar of Object.values(import.meta.glob("../../src/**/*.css")))
    await carregar();
const acesso = {
  demo: false,
  oficina: c.oficina,
  oficinas: [c.oficina],
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
      <MemoryRouter initialEntries={["/relatorios?aba=" + (p.get("aba") || "analises")]}>
        <main
          className="estrutura-sistema"
          style={{
            display: "block",
            padding: "clamp(12px, 2vw, 32px)",
            minHeight: "100vh",
          }}
        >
          {c.oficina.ramo === "automotivo" ? (
            <Relatorios />
          ) : (
            <RelatoriosServicos inicial={p.get("aba") || "analises"} />
          )}
        </main>
      </MemoryRouter>
    </ContextoAcesso.Provider>
  </QueryClientProvider>,
);
