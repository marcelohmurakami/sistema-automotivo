import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ContextoAcesso } from "../../src/auth/contexto";
import { OrdensServico } from "../../src/pages/OrdensServico";
import { salvarOS } from "../../src/services/ordensServico";
import { ProvedorPagamentoAposRegistro } from "../../src/components/ProvedorPagamentoAposRegistro";
import "../../src/index.css";
import "../../src/App.css";
import "../../src/Tema.css";
import "../../src/Clareza.css";
const p = new URLSearchParams(location.search),
  n = Number(p.get("n") || 12),
  id = "00000000-0000-4000-8000-000000000038";
document.documentElement.dataset.tema = p.get("tema") || "escuro";
localStorage.clear();
async function iniciar() {
  const os = await salvarOS(
    true,
    "demo",
    {
      cliente_id: null,
      cliente_nome_livre: "Cliente QA",
      carro_livre: "Volkswagen Gol",
      motor_livre: "AP 1.6",
      data_servico: "2026-11-16",
      itens: Array.from({ length: n }, (_, i) => ({
        id: crypto.randomUUID(),
        tipo: "service",
        descricao: "QA serviço " + (i + 1),
        unidade: "serv",
        quantidade: 1,
        preco_unitario_centavos: 10000,
        situacao: "pending",
      })),
    },
    id,
  );
  if (p.has("encerrada")) {
    os.situacao = "delivered";
    localStorage.setItem("patio_os_v1", JSON.stringify([os]));
  }
  const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
    }),
    espera = () => new Promise((r) => setTimeout(r, 2000));
  if (p.has("lento")) {
    const original = qc.invalidateQueries.bind(qc);
    qc.invalidateQueries = async (filtros, opcoes) => {
      if (filtros?.predicate?.({ queryKey: ["os", true, "demo", "", "", 0] }))
        await espera();
      return original(filtros, opcoes);
    };
  }
  const invalidacoes = [],
    invalidar = qc.invalidateQueries.bind(qc);
  qc.invalidateQueries = (...args) => {
    invalidacoes.push(args[0]);
    return invalidar(...args);
  };
  window.qa = { qc, id, numero: os.numero, gravacoes: 0, falhar: false, invalidacoes };
  const gravar = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    if (k === "patio_os_v1") {
      if (window.qa.falhar) throw new Error("Falha simulada ao gravar");
      window.qa.gravacoes++;
    }
    return gravar.call(this, k, v);
  };
  createRoot(document.getElementById("root")).render(
    <QueryClientProvider client={qc}>
      <ContextoAcesso.Provider
        value={{
          demo: true,
          usuario: "qa",
          oficina: {
            id: "demo",
            nome: "Empresa QA",
            perfil: "owner",
            ramo: "automotivo",
            especialidade: "retifica",
            codigo_plano: "complete",
            recursos: ["finance"],
          },
          permite: () => true,
        }}
      >
        <MemoryRouter initialEntries={["/ordens-servico"]}>
          <ProvedorPagamentoAposRegistro>
            <main
              className="estrutura-sistema"
              style={{ display: "block", padding: 16 }}
            >
              <OrdensServico />
            </main>
          </ProvedorPagamentoAposRegistro>
        </MemoryRouter>
      </ContextoAcesso.Provider>
    </QueryClientProvider>,
  );
}
iniciar();
