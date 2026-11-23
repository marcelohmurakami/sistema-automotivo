import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ContextoAcesso } from "../../src/auth/contexto";
import { SelecaoRapida } from "../../src/components/SelecaoRapida";
import { SelecaoOperacao } from "../../src/components/servicos/SelecaoOperacao";
import { SelecionarPacote } from "../../src/components/SelecionarPacote";
import { CalendarioAgenda } from "../../src/components/agenda/CalendarioAgenda";
import { buscarOpcoesRapidas } from "../../src/lib/buscaSelecaoRapida";
import {
  agruparAgendaPorDia,
  ocupaDiaAgenda,
  diasCalendario,
} from "../../src/lib/calendarioAgenda";
import { normalizarAtalho } from "../../src/lib/atalhosOficina";
import { useCadastrosOrcamento } from "../../src/lib/useCadastrosOrcamento";
import "../../src/index.css";
import "../../src/App.css";
import "../../src/Tema.css";
import "../../src/Clareza.css";
const opcoes = Array.from({ length: 10000 }, (_, i) => ({
  id: String(i),
  nome: `Serviço de manutenção ${i}`,
  detalhe: i % 2 ? "Motor" : "Placa",
}));
const eventos = Array.from({ length: 500 }, (_, i) => ({
  id: String(i),
  inicio: new Date(Date.UTC(2026, 10, 1 + (i % 30), 12)).toISOString(),
  fim: new Date(Date.UTC(2026, 10, 1 + (i % 30), 13)).toISOString(),
  situacao: "agendado",
  recurso: "tecnico",
  cliente: `Cliente ${i}`,
}));
window.qaMedir = () => {
  const medir = (fn) => {
    fn();
    const ms = [];
    for (let i = 0; i < 9; i++) {
      const t = performance.now();
      fn();
      ms.push(performance.now() - t);
    }
    return ms.sort((a, b) => a - b)[4];
  };
  const busca = "servico manutencao",
    termos = normalizarAtalho(busca).split(/\s+/),
    dias = diasCalendario("2026-11-11", "mes");
  return {
    seletor: {
      opcoes: opcoes.length,
      antesMs: medir(() =>
        opcoes
          .filter((o) =>
            termos.every((t) =>
              normalizarAtalho(`${o.nome} ${o.detalhe || ""} ${o.busca || ""}`)
                .replace(/[^a-z0-9]/g, "")
                .includes(t.replace(/[^a-z0-9]/g, "")),
            ),
          )
          .slice(0, 30),
      ),
      depoisMs: medir(() => buscarOpcoesRapidas(opcoes, busca)),
    },
    calendario: {
      eventos: eventos.length,
      dias: dias.length,
      antesMs: medir(() => {
        dias.map((d) => eventos.filter((x) => ocupaDiaAgenda(x, d)));
        eventos.filter((x) => dias.some((d) => ocupaDiaAgenda(x, d)));
      }),
      depoisMs: medir(() => agruparAgendaPorDia(eventos, dias)),
    },
  };
};
function CadastrosOrcamento() {
  const cache = useQueryClient();
  const [c, sc] = useState(""),
    [v, sv] = useState("");
  const d = useCadastrosOrcamento(
    { clientes: [], veiculos: [], vinculos: [], catalogo: [] },
    c,
    v,
  );
  return (
    <section aria-label="Cadastros orçamento">
      <SelecaoRapida
        rotulo="Cliente do orçamento"
        opcoes={d.clientes}
        valor={c}
        selecionar={sc}
      />
      <SelecaoRapida
        rotulo="Veículo do orçamento"
        opcoes={d.veiculos}
        valor={v}
        selecionar={sv}
      />
      <button onClick={() => sv("v-fora")}>Veículo fora da página</button>
      <button onClick={() => cache.setQueryData(
        ["selecao-operacao", "qa", false, "veiculos", c, ""],
        [{ id: "v-fora", nome: "Veículo atualizado", cliente_id: c }],
      )}>Atualizar lista com veículo selecionado</button>
    </section>
  );
}
function Fixture() {
  const [v, sv] = useState(""),
    [c, sc] = useState(""),
    [dia, sd] = useState("2026-11-11"),
    [visao, ss] = useState("mes");
  return (
    <main style={{ padding: 16, minWidth: 0 }}>
      <h1>Conferência</h1>
      <SelecaoRapida
        rotulo="Catálogo local"
        opcoes={opcoes}
        valor={v}
        selecionar={sv}
      />
      <output data-valor>{v}</output>
      <SelecaoOperacao
        tipo="clientes"
        rotulo="Cliente remoto"
        valor={c}
        selecionar={sc}
      />
      <button onClick={() => sc("fora")}>Selecionar fora da página</button>
      <CadastrosOrcamento />
      <SelecionarPacote
        quantidade={0}
        adicionar={(itens) => (window.qaItens = itens)}
        aoProcessar={() => {}}
      />
      <CalendarioAgenda
        agenda={eventos}
        dia={dia}
        alterarDia={sd}
        visao={visao}
        alterarVisao={ss}
        abrir={(id) => (window.qaEvento = id)}
        novo={() => {}}
        situacoes={{ agendado: "Agendado" }}
      />
    </main>
  );
}
createRoot(document.getElementById("root")).render(
  <QueryClientProvider
    client={
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: 60000, refetchOnWindowFocus: false },
        },
      })
    }
  >
    <ContextoAcesso.Provider
      value={{
        demo: false,
        usuario: "qa",
        oficina: {
          id: "qa",
          ramo: "assistencia_tecnica",
          especialidade: "assistencia_celulares",
          perfil: "owner",
        },
        permite: () => true,
      }}
    >
      <Fixture />
    </ContextoAcesso.Provider>
  </QueryClientProvider>,
);
