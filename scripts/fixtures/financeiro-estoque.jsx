import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ContextoAcesso } from "../../src/auth/contexto";
import { Financeiro } from "../../src/pages/Financeiro";
import { Compras } from "../../src/pages/Compras";
import { Estoque } from "../../src/pages/Estoque";
import { Suprimentos } from "../../src/pages/Suprimentos";
import { PerguntaPagamento } from "../../src/components/PagamentoAposRegistro";
import { ContextoPagamentoAposRegistro } from "../../src/lib/pagamentoAposRegistro";
import "../../src/index.css";
import "../../src/App.css";
import "../../src/Tema.css";
import "../../src/Clareza.css";
import "../../src/pages/Clientes.css";
const params = new URLSearchParams(location.search);
document.documentElement.dataset.tema = params.get("tema") || "escuro";
const c = await fetch("/test-context?perfil=" + params.get("perfil")).then((r) =>
  r.json(),
);
const acesso = {
  demo: false,
  carregando: false,
  erro: "",
  usuario: c.usuario,
  oficina: c.oficina,
  permite: () => true,
};
const qc = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});
function Bancada() {
  const [registro, setRegistro] = useState(null);
  return (
    <ContextoPagamentoAposRegistro.Provider value={setRegistro}>
      <Routes>
        <Route path="/financeiro" element={<Financeiro />} />
        <Route path="/compras" element={<Compras />} />
        <Route path="/estoque" element={<Estoque />} />
        <Route path="/suprimentos" element={<Suprimentos />} />
      </Routes>
      {registro && (
        <PerguntaPagamento registro={registro} fechar={() => setRegistro(null)} />
      )}
    </ContextoPagamentoAposRegistro.Provider>
  );
}
createRoot(document.getElementById("root")).render(
  <QueryClientProvider client={qc}>
    <ContextoAcesso.Provider value={acesso}>
      <MemoryRouter initialEntries={[params.get("rota") || "/financeiro?aba=contas"]}>
        <div className="estrutura-sistema">
          <main
            style={{
              width: "100%",
              maxWidth: 1250,
              padding: "clamp(16px,3vw,32px)",
              margin: "0 auto",
              minWidth: 0,
            }}
          >
            <Bancada />
          </main>
        </div>
      </MemoryRouter>
    </ContextoAcesso.Provider>
  </QueryClientProvider>,
);
