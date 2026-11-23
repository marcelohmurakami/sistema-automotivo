// Fixture visual: cache preenchido, sem credenciais nem chamadas ao banco.
import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ContextoAcesso } from "../../src/auth/contexto";
import { FichaCliente } from "../../src/components/FichaCliente";
import { Dialogo } from "../../src/components/Dialogo";
import "../../src/index.css";
import "../../src/App.css";
import "../../src/Tema.css";
import "../../src/Clareza.css";
const params = new URLSearchParams(location.search);
document.documentElement.dataset.tema = params.get("tema") || "escuro";
const acesso = {
  demo: false,
  usuario: "qa",
  oficina: { id: "qa-estilos", perfil: "owner", ramo: "automotivo", recursos: [] },
  permite: () => true,
};
const cache = new QueryClient({
  defaultOptions: {
    queries: { staleTime: Infinity, retry: false, refetchOnWindowFocus: false },
  },
});
const cliente = {
  id: "cliente-qa",
  nome: "Alexandre de Oliveira e Filhos — Comércio e Manutenção de Equipamentos",
  tipo: "pessoa_juridica",
  criado_em: "2026-01-15",
  atualizado_em: "2026-11-23",
  email: "atendimento.alexandre.oliveira@example.com",
  telefone_e164: "+5511999991234",
  endereco: "Avenida dos Trabalhadores, 1234, sala 502 — Centro",
  observacoes:
    "Conferir o orçamento antes de autorizar o serviço.\nEnviar a nota ao responsável pelo financeiro.",
  arquivado_em: null,
};
const itens = [
  {
    descricao:
      "Revisão completa do sistema de alimentação, limpeza dos componentes e verificação de pressão",
    tipo: "service",
    quantidade: 1,
    unidade: "serv",
    total_centavos: 123456789,
    situacao: "done",
  },
];
const historico = Array.from({ length: 3 }, (_, i) => ({
  id: `os-${i}`,
  tipo: "os",
  numero: 8100 + i,
  situacao: i === 0 ? "delivered" : "in_progress",
  data: "2026-11-23",
  total_centavos: 123456789,
  veiculo: {
    modelo: "Volkswagen Polo Comfortline 1.0 TSI automático",
    placa: "ABC1D23",
  },
  resumo: "Revisão solicitada pelo cliente, incluindo diagnóstico completo.",
  itens,
}));
const escopo = JSON.stringify([
  acesso.demo,
  acesso.usuario,
  acesso.oficina.id,
  acesso.oficina.perfil,
  acesso.oficina.recursos,
  cliente.id,
]);
for (const filtro of ["todos", "concluidos", "andamento", "cancelados"]) {
  const filtrados = historico.filter(
    (h) =>
      filtro === "todos" ||
      (filtro === "concluidos"
        ? h.situacao === "delivered"
        : filtro === "andamento"
          ? h.situacao === "in_progress"
          : false),
  );
  cache.setQueryData(["ficha-cliente", escopo, 0, filtro], {
    cliente,
    resumo: {
      total_servicos_centavos: 123456789,
      ticket_medio_centavos: 123456789,
      atendimentos_concluidos: 1,
      em_andamento: 2,
      ultimo_atendimento_em: "2026-11-23",
    },
    financeiro: { pago_centavos: 100000000, aberto_centavos: 23456789 },
    historico: { total: filtrados.length, itens: filtrados },
    veiculos: [
      {
        id: "veiculo-qa",
        modelo: "Polo Comfortline 1.0 TSI automático",
        marca: "Volkswagen",
        ano_modelo: 2024,
        placa: "ABC1D23",
      },
    ],
    recursos: { ordens: true, notinhas: true },
  });
}
cache.setQueryData(["lucro-cliente", acesso.oficina.id, cliente.id], {
  lucro_medio: 65432100,
  lucro: 65432100,
  pendentes: 1,
  quantidade: 1,
  ticket_medio: 123456789,
});
createRoot(document.getElementById("root")).render(
  <QueryClientProvider client={cache}>
    <ContextoAcesso.Provider value={acesso}>
      <MemoryRouter>
        <div className="estrutura-sistema">
          <Dialogo
            aberto
            titulo="Ficha do cliente"
            classe="dialogo-ficha-cliente"
            fechar={() => {}}
          >
            <FichaCliente id={cliente.id} editar={() => {}} />
          </Dialogo>
        </div>
      </MemoryRouter>
    </ContextoAcesso.Provider>
  </QueryClientProvider>,
);
