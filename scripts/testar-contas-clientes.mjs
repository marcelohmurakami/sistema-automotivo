import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createServer } from "vite";
mkdirSync("output/pdf", { recursive: true });
const server = await createServer({
  configFile: false,
  cacheDir: 'output/.vite-contas-tests',
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: "custom",
});
try {
  const { gerarPdfContaCliente } = await server.ssrLoadModule(
    "/src/services/pdfContaCliente.ts",
  );
  const instante = "2026-10-13T15:00:00.000Z",
    hoje = "2026-10-13";
  const cliente = {
    cliente_id: "cliente-qa",
    chave_cliente: "cliente:cliente-qa",
    cliente: "Transportadora São José",
    telefone: "+5511999991234",
  };
  const ordens = [
    {
      ...cliente,
      id: "os-qa-1",
      numero: 8051,
      data: "2026-10-01",
      situacao: "delivered",
      veiculo: "Volkswagen Delivery",
      placa: "ABC1D23",
      servicos:
        "Retífica de cabeçote; troca de vedação e teste de estanqueidade",
      vencimento: "2026-10-05",
      total_centavos: 420000,
      pago_centavos: 120000,
      aberto_centavos: 300000,
      vencido_centavos: 300000,
      titulos: [
        {
          id: "t1",
          descricao: "Pagamento OS 8051",
          vencimento: "2026-10-05",
          total_centavos: 420000,
          pago_centavos: 120000,
          aberto_centavos: 300000,
        },
      ],
    },
    {
      ...cliente,
      id: "os-qa-2",
      numero: 8052,
      data: "2026-10-06",
      situacao: "delivered",
      veiculo: "Fiat Strada",
      placa: "DEF4G56",
      servicos: "Revisão completa e substituição do kit de embreagem",
      vencimento: "2026-10-20",
      total_centavos: 185050,
      pago_centavos: 50000,
      aberto_centavos: 135050,
      vencido_centavos: 0,
      titulos: [
        {
          id: "t2",
          descricao: "Pagamento OS 8052",
          vencimento: "2026-10-20",
          total_centavos: 185050,
          pago_centavos: 50000,
          aberto_centavos: 135050,
        },
      ],
    },
  ];
  const identidade = {
    nome: "Oficina Modelo",
    documento: "Oficina de demonstração",
    telefone: "+551133334444",
    endereco: { logradouro: "Rua das Oficinas, 120", cidade: "São Paulo - SP" },
    cor: "#244336",
  };
  const pdf = gerarPdfContaCliente(ordens, identidade, instante, hoje);
  assert.equal(pdf.getNumberOfPages(), 1);
  writeFileSync(
    "output/pdf/conta-cliente-exemplo.pdf",
    Buffer.from(pdf.output("arraybuffer")),
  );
  const individual = gerarPdfContaCliente(
    [ordens[1]],
    identidade,
    instante,
    hoje,
  );
  writeFileSync(
    "output/pdf/conta-cliente-selecao.pdf",
    Buffer.from(individual.output("arraybuffer")),
  );
  const volume = Array.from({ length: 24 }, (_, i) => ({
    ...ordens[i % 2],
    id: `os-volume-${i}`,
    numero: 9000 + i,
    servicos:
      i === 5
        ? "Diagnóstico e reparo de componentes com descrição detalhada. ".repeat(
            45,
          )
        : ordens[i % 2].servicos,
  }));
  const multipagina = gerarPdfContaCliente(
    volume,
    {
      ...identidade,
      nome: "Oficina especializada em manutenção de motores e veículos comerciais - Unidade de São Paulo",
    },
    instante,
    hoje,
  );
  assert.ok(multipagina.getNumberOfPages() >= 5);
  writeFileSync(
    "output/pdf/conta-cliente-volume.pdf",
    Buffer.from(multipagina.output("arraybuffer")),
  );
  assert.throws(() => gerarPdfContaCliente([], identidade, instante, hoje));
  assert.throws(() =>
    gerarPdfContaCliente([ordens[0], ordens[0]], identidade, instante, hoje),
  );
  assert.throws(() =>
    gerarPdfContaCliente(
      [ordens[0], { ...ordens[1], chave_cliente: "outro" }],
      identidade,
      instante,
      hoje,
    ),
  );
  assert.throws(() =>
    gerarPdfContaCliente(
      [{ ...ordens[0], aberto_centavos: 0 }],
      identidade,
      instante,
      hoje,
    ),
  );
  const extras = [
    {
      ...ordens[0],
      id: "os-qa-3",
      numero: 8053,
      cliente_id: "cliente-qa-2",
      chave_cliente: "cliente:cliente-qa-2",
      cliente: "Antônio Ferreira",
      total_centavos: 230000,
      pago_centavos: 0,
      aberto_centavos: 230000,
      vencido_centavos: 230000,
      titulos: [
        {
          id: "t3",
          descricao: "Pagamento OS 8053",
          vencimento: "2026-10-05",
          total_centavos: 230000,
          pago_centavos: 0,
          aberto_centavos: 230000,
        },
      ],
    },
    {
      ...ordens[1],
      id: "os-qa-4",
      numero: 8054,
      cliente_id: "cliente-qa-3",
      chave_cliente: "cliente:cliente-qa-3",
      cliente: "Mariana Costa",
      total_centavos: 98000,
      pago_centavos: 0,
      aberto_centavos: 98000,
      vencido_centavos: 0,
      titulos: [
        {
          id: "t4",
          descricao: "Pagamento OS 8054",
          vencimento: "2026-10-20",
          total_centavos: 98000,
          pago_centavos: 0,
          aberto_centavos: 98000,
        },
      ],
    },
  ];
  writeFileSync(
    "output/contas-clientes-visual.json",
    JSON.stringify(
      { hoje, consultado_em: instante, ordens: [...ordens, ...extras] },
      null,
      2,
    ),
  );
  // Integração demo usa os mesmos valores e estornos da tela real.
  const memoria = new Map();
  global.localStorage = {
    getItem: (k) => memoria.get(k) || null,
    setItem: (k, v) => memoria.set(k, v),
  };
  const osDemo = ordens.map((o) => ({
    ...o,
    cliente_id: null,
    data_servico: o.data,
    criado_em: instante,
    dados_cliente: { nome: o.cliente },
    dados_veiculo: { modelo: o.veiculo },
    itens: [],
  }));
  memoria.set("patio_os_v1", JSON.stringify(osDemo));
  memoria.set(
    "patio_financeiro_v1",
    JSON.stringify({
      titulos: ordens.flatMap((o) =>
        o.titulos.map((t) => ({
          ...t,
          valor_centavos: t.total_centavos,
          natureza: "receber",
          ordem_servico_id: o.id,
        })),
      ),
      baixas: [
        { titulo_id: "t1", valor_centavos: 150000 },
        { titulo_id: "t1", valor_centavos: 30000, estorno_de: "b1" },
        { titulo_id: "t2", valor_centavos: 50000 },
      ],
    }),
  );
  const { consultarContasClientes } = await server.ssrLoadModule(
    "/src/services/contasClientes.ts",
  );
  const demo = await consultarContasClientes(true, "qa");
  assert.equal(demo.ordens[0].aberto_centavos, 300000);
  assert.equal(demo.ordens[1].aberto_centavos, 135050);
  assert.notEqual(demo.ordens[0].chave_cliente, demo.ordens[1].chave_cliente);
  assert.ok(readFileSync("output/pdf/conta-cliente-exemplo.pdf").length > 3000);
  console.log(
    `PASS: PDF de 1 página, seleção isolada, ${multipagina.getNumberOfPages()} páginas com conteúdo longo, validações e saldos demo.`,
  );
} finally {
  await server.close();
}
