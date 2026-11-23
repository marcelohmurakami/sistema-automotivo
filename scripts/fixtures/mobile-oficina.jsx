import React from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ContextoAcesso } from "../../src/auth/contexto";
import { LayoutPorRamo } from "../../src/layouts/LayoutEmpresa";
import { MapaOficina } from "../../src/pages/MapaOficina";
import { OrdensServico } from "../../src/pages/OrdensServico";
import { Orcamentos } from "../../src/pages/Orcamentos";
import { Estoque } from "../../src/pages/Estoque";
import { Clientes } from "../../src/pages/Clientes";
import { Catalogo } from "../../src/pages/Catalogo";
import { Financeiro } from "../../src/pages/Financeiro";
import { Equipe } from "../../src/pages/Equipe";
import { Relatorios } from "../../src/pages/Relatorios";
import { Qualidade } from "../../src/pages/Qualidade";
import { Configuracoes } from "../../src/pages/Gestao";
import { Fornecedores } from "../../src/pages/Fornecedores";
import { Localizacao } from "../../src/pages/Localizacao";
import { CentralCompras } from "../../src/pages/CentralCompras";
import { Funcionarios } from "../../src/pages/Funcionarios";
import { Laudos } from "../../src/pages/Laudos";
import { Historico } from "../../src/pages/Historico";
import { DadosSeguranca } from "../../src/pages/DadosSeguranca";
import { MeuSite } from "../../src/pages/MeuSite";
import { salvarOS } from "../../src/services/ordensServico";
import { salvarProposta } from "../../src/services/orcamentos";
import { salvarRecorrencia } from "../../src/services/recorrencias";
import { hoje } from "../../src/services/financeiro";
import "../../src/index.css";
import "../../src/App.css";
import "../../src/Tema.css";
import "../../src/Clareza.css";
const params = new URLSearchParams(location.search);
document.documentElement.dataset.tema = params.get("tema") || "escuro";
if (!localStorage.getItem("qa-mobile-preparado")) {
  const ordens = [];
  for (let i = 0; i < 5; i++) {
    const o = await salvarOS(
      true,
      "demo",
      {
        cliente_id: null,
        cliente_nome_livre: "Cliente de teste com nome completo " + i,
        cliente_telefone_livre: i === 4 ? "+5511999991234" : "",
        carro_livre: "Volkswagen Polo Comfortline 1.0 TSI " + i,
        motor_livre: "EA211",
        data_servico: hoje(),
        itens: [
          {
            id: crypto.randomUUID(),
            tipo: "service",
            unidade: "serv",
            descricao: "Revisão completa do sistema de freios e troca de componentes",
            quantidade: 1,
            preco_unitario_centavos: 17500,
            situacao: "pending",
          },
        ],
      },
      crypto.randomUUID(),
    );
    o.situacao = ["open", "open", "in_progress", "quality_check", "ready"][i];
    o.numero = 900 + i;
    o.recebido_em = new Date().toISOString();
    if (i === 1)
      o.paradas = [
        {
          id: crypto.randomUUID(),
          motivo: "parts",
          detalhes: "Aguardando peças do fornecedor",
          encerrado_em: null,
        },
      ];
    ordens.push(o);
  }
  localStorage.setItem("patio_os_v1", JSON.stringify(ordens));
  for (let i = 0; i < 3; i++)
    await salvarProposta(
      true,
      "demo",
      {
        cliente_id: "avulso",
        cliente_nome_livre: "Cliente de orçamento " + i,
        carro_livre: "Fiat Argo 1.3 " + i,
        motor_livre: "Firefly",
        data_servico: hoje(),
        itens: [
          {
            tipo: "service",
            unidade: "serv",
            descricao: "Revisão preventiva completa",
            quantidade: 1,
            preco_unitario_centavos: 89500,
          },
        ],
        desconto_centavos: 0,
        observacoes: "",
        condicoes: "",
      },
      crypto.randomUUID(),
    );
  const produtos = Array.from({ length: 3 }, (_, i) => ({
    id: "peca-qa-" + i,
    descricao: "Jogo de pastilhas de freio dianteiro / Volkswagen Polo " + i,
    tipo: "part",
    unidade: "un",
    preco_padrao_centavos: 19500,
    arquivado_em: null,
    codigo: "PT-00" + i,
    localizacao: "Prateleira A" + i,
    fornecedor: "",
    saldo: i * 10,
    minimo: 2,
    custo_centavos: 12000,
    revisao: 1,
  }));
  localStorage.setItem(
    "patio_catalogo_v1",
    JSON.stringify([
      ...produtos,
      {
        id: "servico-qa",
        descricao: "Revisão completa do sistema de injeção",
        tipo: "service",
        unidade: "serv",
        preco_padrao_centavos: 35000,
        arquivado_em: null,
        revisao: 1,
      },
    ]),
  );
  localStorage.setItem(
    "patio_estoque_v1",
    JSON.stringify({ produtos, movimentos: [] }),
  );
  for (const [descricao, valor, variavel, natureza] of [
    ["Aluguel mensal", 150000, false, "pagar"],
    ["Água mensal", 0, true, "pagar"],
    ["Internet estimada", 12000, true, "pagar"],
    ["Contrato mensal", 60000, false, "receber"],
  ])
    await salvarRecorrencia(true, "demo", {
      id: crypto.randomUUID(),
      descricao,
      natureza,
      categoria: natureza === "pagar" ? "outras_despesas" : "outras_receitas",
      valor_centavos: valor,
      valor_variavel: variavel,
      dia: Number(hoje().slice(-2)),
      inicio: hoje(),
      fim: null,
      ativa: true,
      revisao: 0,
      proximo_mes: hoje().slice(0, 7) + "-01",
    });
  localStorage.setItem("qa-mobile-preparado", "1");
}
const noop = () => {};
const oficina = {
  id: "demo",
  nome: "Oficina QA Mobile",
  especialidade: "retifica",
  ramo: "automotivo",
  perfil: "owner",
  codigo_plano: "complete",
  nome_plano: "Completo",
  recursos: [],
  situacao: "active",
};
const acesso = {
  demo: true,
  usuario: "qa-mobile",
  email: "qa@example.com",
  carregando: false,
  erro: "",
  oficina,
  oficinas: [oficina],
  permite: () => true,
  selecionarOficina: noop,
  definirPlanoDemo: noop,
  sair: async () => {},
  atualizar: async () => {},
  demonstrar: noop,
  demonstrarRamo: noop,
  usarContaReal: noop,
};
createRoot(document.getElementById("root")).render(
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
  >
    <ContextoAcesso.Provider value={acesso}>
      <MemoryRouter initialEntries={[params.get("rota") || "/"]}>
        <Routes>
          <Route element={<LayoutPorRamo />}>
            <Route index element={<MapaOficina />} />
            <Route path="ordens-servico" element={<OrdensServico />} />
            <Route path="orcamentos" element={<Orcamentos />} />
            <Route path="estoque" element={<Estoque />} />
            <Route path="clientes" element={<Clientes />} />
            <Route path="catalogo" element={<Catalogo />} />
            <Route path="financeiro" element={<Financeiro />} />
            <Route path="equipe" element={<Equipe />} />
            <Route path="relatorios" element={<Relatorios />} />
            <Route path="qualidade" element={<Qualidade />} />
            <Route path="configuracoes" element={<Configuracoes />} />
            <Route path="fornecedores" element={<Fornecedores />} />
            <Route path="localizacao" element={<Localizacao />} />
            <Route path="compras" element={<CentralCompras />} />
            <Route path="funcionarios" element={<Funcionarios />} />
            <Route path="laudos" element={<Laudos />} />
            <Route path="historico" element={<Historico />} />
            <Route path="dados-seguranca" element={<DadosSeguranca />} />
            <Route path="meu-site" element={<MeuSite />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ContextoAcesso.Provider>
  </QueryClientProvider>,
);
