import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ContextoAcesso } from "../../src/auth/contexto";
import { CalendarioOficina } from "../../src/components/agenda/CalendarioOficina";
import { AgendaServicos } from "../../src/components/servicos/AgendaServicos";
import { especialidades } from "../../src/lib/especialidades";
import "../../src/index.css";
import "../../src/App.css";
import "../../src/Tema.css";
import "../../src/Clareza.css";

const perfil = new URLSearchParams(location.search).get("perfil") || "retifica";
const ramo = especialidades[perfil].ramo;
document.documentElement.dataset.tema = "escuro";
const nomes =
  ramo === "automotivo"
    ? [
        "Volkswagen Gol",
        "Toyota Corolla",
        "Honda Civic",
        "Honda Civic",
        "Chevrolet Onix",
      ]
    : ramo === "assistencia_tecnica"
      ? [
          "iPhone 15",
          "Notebook Dell",
          "Televisor Samsung",
          "Televisor Samsung",
          "Tablet Lenovo",
        ]
      : [
          "Ar-condicionado Loja São José",
          "Elevador Edifício Central",
          "Bomba hidráulica Galpão",
          "Bomba hidráulica Galpão",
          "Climatizador Escritório",
        ];
const dias = ["2026-11-25", "2026-11-26", "2026-11-03", "2026-12-15", "2026-11-25"];
const clientes = [
  { id: "joao", nome: "João da Silva" },
  { id: "ana", nome: "Ana Souza" },
];
const recursos = [{ id: "equipe", nome: "Equipe principal", ativo: true, revisao: 1 }];
const objetos = nomes.map((nome, i) => ({
  id: `objeto-${i}`,
  cliente_id: i === 4 ? "ana" : "joao",
  nome,
  dados: {},
  arquivado: false,
  revisao: 1,
}));
const atendimentos = objetos.map((o, i) => ({
  id: `atendimento-${i}`,
  cliente_id: o.cliente_id,
  objeto_id: o.id,
  titulo: "Revisão preventiva",
  situacao: "aprovado",
  dados: {},
  valor_centavos: 10000,
  revisao: 1,
}));
const agenda = dias.map((dia, i) => ({
  id: `agenda-${i}`,
  atendimento_id: atendimentos[i].id,
  cliente: clientes.find((c) => c.id === objetos[i].cliente_id).nome,
  veiculo: nomes[i],
  placa: i === 0 ? "ABC1D23" : "",
  recurso: "Equipe principal",
  recurso_id: "equipe",
  inicio: `${dia}T09:00:00-03:00`,
  fim: `${dia}T10:00:00-03:00`,
  servico: "Revisão preventiva",
  situacao: "agendado",
  revisao: 1,
  observacoes: "",
}));
const qc = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});
function App() {
  const [dia, setDia] = useState("2026-11-25"),
    [visao, setVisao] = useState("semana"),
    [aberto, setAberto] = useState("");
  return (
    <main
      className="estrutura-sistema"
      style={{ display: "block", padding: 16, maxWidth: 1440, margin: "auto" }}
    >
      <h1>Agenda de teste · {perfil}</h1>
      <p role="status">{aberto ? `Aberto: ${aberto}` : ""}</p>
      {ramo === "automotivo" ? (
        <CalendarioOficina
          agenda={agenda}
          dia={dia}
          alterarDia={setDia}
          visao={visao}
          alterarVisao={setVisao}
          novo={() => {}}
          abrir={(x) => setAberto(x.id)}
        />
      ) : (
        <AgendaServicos
          dados={{ agenda, atendimentos, objetos, recursos, cobrancas: [] }}
          dia={dia}
          setDia={setDia}
          visao={visao}
          setVisao={setVisao}
          novo={() => {}}
          abrir={(x) => setAberto(x.item.id)}
          gerencia={false}
          nomeCliente={(id) => clientes.find((c) => c.id === id)?.nome || "Cliente"}
        />
      )}
    </main>
  );
}
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
          ramo,
          especialidade: perfil,
          codigo_plano: "complete",
        },
        permite: () => true,
      }}
    >
      <MemoryRouter>
        <App />
      </MemoryRouter>
    </ContextoAcesso.Provider>
  </QueryClientProvider>,
);
