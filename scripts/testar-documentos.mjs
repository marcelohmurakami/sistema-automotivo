import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import {
  documentoDaOS,
  documentoDoOrcamento,
  dataDocumento,
  logoDocumento,
  corDocumento,
} from "../src/lib/documentoCliente.ts";
import { gerarPdfCliente } from "../src/services/pdfCliente.ts";

const identidade = {
  nome: "Oficina Horizonte",
  telefone: "(16) 99999-0000",
  endereco: { rua: "Rua das Oficinas, 120", cidade: "Franca / SP" },
  cor: "#244336",
  rodape: "Obrigado pela confiança. Conte com a nossa equipe!",
};
const itens = [
  {
    descricao: "Troca de óleo e filtro do motor",
    tipo: "service",
    unidade: "serv",
    quantidade: 1,
    preco_unitario_centavos: 12000,
    total_item_centavos: 12000,
    situacao: "done",
  },
  {
    descricao: "Óleo sintético 5W30",
    tipo: "part",
    unidade: "L",
    quantidade: 3.5,
    preco_unitario_centavos: 4990,
    total_item_centavos: 17465,
    situacao: "done",
  },
];
const os = {
  id: "os-teste",
  numero: 42,
  situacao: "ready",
  dados_cliente: {
    nome: "José Antônio da Silva",
    telefone_e164: "+5516999991111",
  },
  dados_veiculo: { modelo: "Volkswagen Gol 1.6 / 2018", placa: "ABC1D23" },
  recebido_em: "2026-10-05T12:00:00Z",
  concluido_em: "2026-10-06T20:00:00Z",
  entrega_prevista_em: "2026-10-06T20:00:00Z",
  quilometragem_entrada: 82500,
  quilometragem_saida: null,
  queixa_cliente: "Revisão preventiva e verificação de ruído na suspensão.",
  resumo_cliente: "Óleo e filtro substituídos. Teste de rodagem realizado.",
  observacoes_internas: "SEGREDO_INTERNO",
  diagnostico: "DIAGNOSTICO_INTERNO",
  custo_hora_centavos: 77331,
  itens,
  subtotal_centavos: 29465,
  desconto_centavos: 1465,
  mostrar_desconto_nota: true,
  total_centavos: 28000,
  condicoes_garantia: "Consulte as condições dos serviços executados com a oficina.",
  garantia_ate: "2026-12-31",
};
const proposta = {
  id: "q-teste",
  numero: 58,
  situacao: "awaiting_approval",
  versao_atual_id: "v2",
  versao: {
    id: "v2",
    numero_versao: 2,
    dados_oficina: identidade,
    dados_cliente: os.dados_cliente,
    dados_veiculo: os.dados_veiculo,
    publicado_em: "2026-10-05T12:00:00Z",
    expira_em: "2026-10-20T23:00:00Z",
    subtotal_centavos: 29465,
    desconto_centavos: 1465,
    total_centavos: 28000,
    observacoes: "Valores sujeitos à aprovação desta versão.",
    condicoes: "Pagamento no recebimento do veículo.",
  },
  itens,
  historico: [],
  aprovacao: null,
};
const agora = new Date("2026-10-06T12:00:00Z");

test("orçamento exibe a data do serviço no documento sem presumir data ausente", () => {
  const comData = documentoDoOrcamento(
    { ...proposta, versao: { ...proposta.versao, data_servico: "2026-09-17" } },
    agora,
  );
  assert.ok(
    comData.informacoes.some(
      (i) => i.rotulo === "Data do serviço" && i.valor === "17/09/2026",
    ),
  );
  assert.ok(
    !documentoDoOrcamento(proposta, agora).informacoes.some(
      (i) => i.rotulo === "Data do serviço",
    ),
  );
});

const servicosRevisao = [
  "Troca de óleo do motor",
  "Filtro de óleo",
  "Filtro de ar do motor",
  "Filtro de combustível",
  "Filtro de cabine",
  "Alinhamento da direção",
  "Balanceamento das rodas",
  "Rodízio dos pneus",
  "Revisão dos freios",
  "Limpeza dos freios traseiros",
  "Troca do fluido de freio",
  "Verificação da suspensão",
  "Reaperto dos componentes",
  "Teste da bateria",
  "Revisão do sistema de carga",
  "Verificação do arrefecimento",
  "Limpeza do corpo de borboleta",
  "Diagnóstico eletrônico",
  "Regulagem dos faróis",
  "Teste de rodagem",
];
function osComItens(quantidade) {
  const novos = Array.from({ length: quantidade }, (_, n) => ({
    ...itens[0],
    descricao: servicosRevisao[n % servicosRevisao.length],
    preco_unitario_centavos: 5000 + n * 100,
    total_item_centavos: 5000 + n * 100,
  }));
  const subtotal = novos.reduce((s, i) => s + i.total_item_centavos, 0);
  return {
    ...os,
    itens: novos,
    subtotal_centavos: subtotal,
    desconto_centavos: Math.min(9000, subtotal),
    total_centavos: subtotal - Math.min(9000, subtotal),
  };
}

test("OS preserva valores salvos, desconto e entrega no horário de São Paulo", () => {
  const d = documentoDaOS(os, identidade);
  assert.equal(d.total, 28000);
  assert.equal(d.subtotal, 29465);
  assert.equal(d.desconto, 1465);
  assert.equal(
    d.informacoes.find((i) => i.rotulo === "Data do serviço").valor,
    "06/10/2026",
  );
  assert.equal(d.itens[1].quantidade, 3.5);
});
test("OS usual com itens, garantia e assinatura cabe em uma página A4", () => {
  assert.equal(gerarPdfCliente(documentoDaOS(os, identidade)).getNumberOfPages(), 1);
});

test("OS da retífica mantém motor, separa peças e serviços e inclui vencimento informado", () => {
  const d = documentoDaOS(
    { ...os, dados_veiculo: { ...os.dados_veiculo, motor: "GM Familia 1" } },
    { ...identidade, documento: "66.634.668/0001-07" },
  );
  assert.equal(d.motor, "GM Familia 1");
  d.vencimento = "2026-11-07";
  d.formaPagamento = "Carteira";
  const pdf = gerarPdfCliente(d);
  const text = pdf.internal.pages.flat().join("\n");
  for (const trecho of [
    "GM Familia 1",
    "SERVIÇOS E PEÇAS",
    "07/11/2026",
    "Carteira",
    "66.634.668/0001-07",
  ])
    assert.ok(text.includes(trecho), trecho);
  assert.equal(pdf.getNumberOfPages(), 1);
});

test("OS com 20 serviços mantém leitura em até duas folhas no modelo de duas colunas", () => {
  const pdf = gerarPdfCliente(documentoDaOS(osComItens(20), identidade));
  assert.ok(pdf.getNumberOfPages() <= 2);
});

test("OS com 60 itens preserva todos uma única vez e repete cabeçalho nas páginas da tabela", () => {
  const dados = osComItens(60);
  dados.itens = dados.itens.map((i, n) => ({
    ...i,
    descricao: `ITEM_${String(n + 1).padStart(3, "0")} ${i.descricao}`,
  }));
  const pdf = gerarPdfCliente(documentoDaOS(dados, identidade));
  const paginas = pdf.internal.pages.slice(1).map((p) => p.join("\n"));
  assert.ok(paginas.length >= 2);
  for (let n = 1; n <= 60; n++) {
    assert.equal(
      (
        paginas
          .join("\n")
          .match(new RegExp(`ITEM_${String(n).padStart(3, "0")}`, "g")) || []
      ).length,
      1,
    );
  }
  paginas.forEach((pagina, n) => {
    if (pagina.includes("ITEM_")) assert.ok(pagina.includes("UNITÁRIO"));
    assert.ok(pagina.includes(`${n + 1}/${paginas.length}`));
  });
});

test("descrição maior que uma página continua até o fim sem repetir os valores", () => {
  const dados = osComItens(1);
  dados.itens[0].descricao =
    "INICIO_DESCRICAO " +
    "Conferência dos componentes da suspensão. ".repeat(200) +
    " FIM_DESCRICAO";
  const pdf = gerarPdfCliente(documentoDaOS(dados, identidade));
  const conteudo = pdf.internal.pages.flat().join("\n");
  assert.ok(pdf.getNumberOfPages() >= 3);
  assert.equal((conteudo.match(/INICIO_DESCRICAO/g) || []).length, 1);
  assert.equal((conteudo.match(/FIM_DESCRICAO/g) || []).length, 1);
  assert.equal((conteudo.match(/Subtotal/g) || []).length, 1);
});
test("não expõe observações, diagnóstico ou custos internos no modelo do cliente", () => {
  const d = documentoDaOS(
    {
      ...os,
      itens: [
        {
          ...itens[0],
          custo_interno: "CUSTO_SECRETO",
          observacoes_internas: "ITEM_SECRETO",
        },
      ],
    },
    identidade,
  );
  assert.doesNotMatch(
    JSON.stringify(d),
    /SEGREDO_INTERNO|DIAGNOSTICO_INTERNO|77331|CUSTO_SECRETO|ITEM_SECRETO/,
  );
  assert.match(JSON.stringify(d), /Teste de rodagem/);
});
test("fallback de valores antigos mantém quantidade fracionada e desconto", () => {
  const d = documentoDaOS(
    {
      ...os,
      subtotal_centavos: undefined,
      desconto_centavos: undefined,
      itens: itens.map((i) => ({ ...i, total_item_centavos: undefined })),
    },
    identidade,
  );
  assert.equal(d.subtotal, 29465);
  assert.equal(d.desconto, 1465);
});
test("cancelamento é explícito e não recalcula os valores históricos", () => {
  const d = documentoDaOS(
    {
      ...os,
      situacao: "cancelled",
      itens: [{ ...itens[0], situacao: "cancelled" }],
    },
    identidade,
  );
  assert.equal(d.situacao, "Cancelada");
  assert.equal(d.destaque, true);
  assert.equal(d.itens[0].cancelado, true);
  assert.equal(d.total, os.total_centavos);
});
test("OS pendente identifica aprovação e não apresenta zero como proposta autorizada", () => {
  const d = documentoDaOS(
    {
      ...os,
      orcamento_aguardando_id: "q-pendente",
      situacao: "open",
      itens: [],
      total_centavos: 0,
    },
    identidade,
  );
  assert.equal(d.situacao, "Aguardando aprovação");
  assert.ok(d.secoes.some((s) => s.titulo === "Autorização pendente"));
});
test("Autorização da oficina é identificada sem simular assinatura do cliente", () => {
  const d = documentoDaOS(
    { ...os, autorizacao_oficina_em: "2026-10-06T14:00:00Z" },
    identidade,
  );
  assert.equal(d.confirmacao, "Serviço autorizado pela oficina em 06/10/2026, 11:00.");
});
test("OS extensa pagina sem perder itens e mantém valores salvos", () => {
  const d = documentoDaOS(
    {
      ...os,
      itens: Array.from({ length: 45 }, (_, n) => ({
        ...itens[n % 2],
        descricao:
          `Serviço ${n + 1}: ` +
          "Verificação de peças e orientação ao cliente. ".repeat(5),
      })),
    },
    identidade,
  );
  const pdf = gerarPdfCliente(d);
  assert.ok(pdf.getNumberOfPages() > 3);
  assert.equal(d.total, os.total_centavos);
});
test("OS sem conclusão usa a data de criação e continua imprimível", () => {
  const d = documentoDaOS(
    {
      ...os,
      itens: [],
      entrega_prevista_em: null,
      concluido_em: null,
      criado_em: "2026-10-04T01:00:00Z",
      subtotal_centavos: 0,
      desconto_centavos: 0,
      total_centavos: 0,
    },
    identidade,
  );
  assert.equal(
    d.informacoes.find((i) => i.rotulo === "Data do serviço").valor,
    "03/10/2026",
  );
  assert.equal(gerarPdfCliente(d).getNumberOfPages(), 1);
});
test("orçamento utiliza identidade, valores e número da versão emitida", () => {
  const q = structuredClone(proposta);
  q.versao.dados_oficina.nome = "Marca original da emissão";
  const d = documentoDoOrcamento(q, agora);
  assert.equal(d.identidade.nome, "Marca original da emissão");
  assert.equal(d.total, 28000);
  assert.equal(d.versao, 2);
  assert.equal(d.arquivo, "orcamento-58-v2.pdf");
});
test("consulta pública sem IDs internos mantém situação e valores", () => {
  const q = {
    ...proposta,
    id: undefined,
    versao_atual_id: undefined,
    versao: { ...proposta.versao, id: undefined },
  };
  const d = documentoDoOrcamento(q, agora);
  assert.equal(d.situacao, "Aguardando aprovação");
  assert.equal(d.total, 28000);
  assert.equal(gerarPdfCliente(d).getNumberOfPages(), 1);
});
test("versão antiga não recebe status aprovado da versão atual", () => {
  const d = documentoDoOrcamento(
    { ...proposta, situacao: "approved", versao_atual_id: "v3" },
    agora,
  );
  assert.equal(d.situacao, "Versão anterior");
  assert.equal(d.destaque, true);
});
test("rascunho e orçamento cancelado são identificados", () => {
  const rascunho = {
    ...proposta,
    versao: { ...proposta.versao, publicado_em: null },
  };
  assert.equal(
    documentoDoOrcamento(rascunho, agora).situacao,
    "Rascunho - não emitido",
  );
  assert.equal(
    documentoDoOrcamento({ ...rascunho, situacao: "cancelled" }, agora).situacao,
    "Cancelado",
  );
});
test("vencimento não altera aprovação já registrada", () => {
  const vencido = {
    ...proposta,
    versao: { ...proposta.versao, expira_em: "2026-10-01T12:00:00Z" },
  };
  assert.equal(documentoDoOrcamento(vencido, agora).situacao, "Validade encerrada");
  assert.equal(
    documentoDoOrcamento({ ...vencido, situacao: "approved" }, agora).situacao,
    "Aprovado",
  );
});
test("aprovação mantém nome e horário da confirmação", () => {
  const d = documentoDoOrcamento(
    {
      ...proposta,
      aprovacao: {
        decisao: "approved",
        nome_informado: "José",
        confirmado_em: "2026-10-05T15:00:00Z",
      },
    },
    agora,
  );
  assert.equal(d.confirmacao, "Aprovado por José em 05/10/2026, 12:00.");
});
test("data sem horário não muda de dia e data inválida é tratada", () => {
  assert.equal(dataDocumento("2026-12-31", false), "31/12/2026");
  assert.equal(dataDocumento("inválida"), "Não informada");
});
test("identidade rejeita URL externa, SVG e CSS arbitrário", () => {
  for (const v of [
    "https://example.com/logo.png",
    "data:image/svg+xml;base64,AA==",
    "javascript:alert(1)",
  ])
    assert.equal(logoDocumento(v), undefined);
  assert.equal(
    logoDocumento("data:image/png;base64,AA=="),
    "data:image/png;base64,AA==",
  );
  assert.equal(corDocumento("red;background:url(x)"), "#244336");
});
test("PDF tolera logo legado corrompido, sem perder conteúdo", () => {
  assert.ok(
    gerarPdfCliente(
      documentoDaOS(os, { ...identidade, logo: "data:image/png;base64,AA==" }),
    ).output("arraybuffer").byteLength > 1000,
  );
});
test("PDF A4 pagina itens longos e aceita somente links HTTP(S)", () => {
  const d = documentoDoOrcamento(
    {
      ...proposta,
      itens: Array.from({ length: 70 }, (_, i) => ({
        ...itens[i % 2],
        descricao:
          `${i + 1}. Descrição extensa de um serviço de manutenção com conferência das peças substituídas. `.repeat(
            3,
          ),
      })),
    },
    agora,
  );
  const pdf = gerarPdfCliente(d, "https://example.com/proposta?token=teste");
  assert.ok(pdf.getNumberOfPages() >= 5);
  assert.ok(Math.abs(pdf.internal.pageSize.getWidth() - 210) < 0.01);
  assert.ok(pdf.output().includes("https://example.com/proposta?token=teste"));
  assert.ok(
    !gerarPdfCliente(d, "javascript:alert(1)").output().includes("javascript:"),
  );
});

// Geração opcional para inspeção visual, sem acessar contas ou dados reais.
if (process.argv.includes("--amostras")) {
  const pasta = "tmp/pdfs";
  mkdirSync(pasta, { recursive: true });
  const marca = {
    ...identidade,
    logo:
      "data:image/png;base64," +
      readFileSync(pasta + "/logo-teste.png").toString("base64"),
  };
  const documentos = {
    "os-com-logo": documentoDaOS(os, marca),
    "os-20-servicos": documentoDaOS(osComItens(20), marca),
    "os-60-servicos": documentoDaOS(osComItens(60), marca),
    "os-multipaginas": documentoDaOS(
      {
        ...os,
        itens: Array.from({ length: 24 }, (_, n) => ({
          ...itens[n % 2],
          descricao:
            `Serviço ${n + 1}: ` +
            "Verificação de peças e orientação ao cliente. ".repeat(5),
        })),
      },
      marca,
    ),
    "orcamento-com-logo": documentoDoOrcamento(
      { ...proposta, versao: { ...proposta.versao, dados_oficina: marca } },
      agora,
    ),
    "orcamento-multipaginas": documentoDoOrcamento(
      {
        ...proposta,
        itens: Array.from({ length: 24 }, (_, n) => ({
          ...itens[n % 2],
          descricao:
            `Item ${n + 1} / revisão e substituição de componentes. ` +
            "Conferência de desgaste e funcionamento com orientação ao cliente. ".repeat(
              3,
            ),
        })),
        versao: {
          ...proposta.versao,
          dados_oficina: marca,
          subtotal_centavos: 353580,
          desconto_centavos: 13580,
          total_centavos: 340000,
        },
      },
      agora,
    ),
  };
  for (const [nome, d] of Object.entries(documentos)) {
    const pdf = gerarPdfCliente(d);
    writeFileSync(`${pasta}/${nome}.pdf`, Buffer.from(pdf.output("arraybuffer")));
    console.log(`${nome}: ${pdf.getNumberOfPages()} página(s)`);
  }
}

test("Retífica imprime motor e não imprime placa, mesmo em OS legada", () => {
  const d = documentoDaOS(
    { ...os, dados_veiculo: { modelo: "Gol", motor: "AP", placa: "ABC1D23" } },
    { ...identidade, especialidade: "retifica" },
  );
  const text = gerarPdfCliente(d).internal.pages.flat().join("\n");
  assert.ok(text.includes("MOTOR"));
  assert.ok(text.includes("(Motor: AP)"));
  assert.ok(!text.includes("Placa:"));
  assert.ok(!text.includes("ABC1D23"));
});

test("OS usa dados do cliente, conclusão e pagamento, sem imprimir campos antigos", () => {
  const d = documentoDaOS(
    {
      ...os,
      dados_cliente: {
        nome: "Teste",
        telefone_e164: "+5516999991111",
        documento: "123.456.789-00",
        endereco: "Rua teste, 10",
      },
      forma_pagamento: "Pix",
    },
    identidade,
  );
  assert.equal(d.telefoneCliente, "(16) 99999-1111");
  assert.equal(d.documentoCliente, "123.456.789-00");
  assert.equal(d.enderecoCliente, "Rua teste, 10");
  assert.equal(d.formaPagamento, "Pix");
  assert.ok(d.secoes.some((s) => s.titulo === "Observações"));
  assert.ok(d.assinatura.includes("OS Nº 42"));
  const text = gerarPdfCliente(d).internal.pages.flat().join("\n");
  assert.ok(!text.includes("Entrega prometida"));
  assert.ok(!text.includes("Entrada do veículo"));
  assert.ok(text.includes("123.456.789-00"));
});
test("Assinatura fica no fim da última página, tanto em OS curta quanto longa", () => {
  const curta = gerarPdfCliente(documentoDaOS(os, identidade));
  const longa = gerarPdfCliente(documentoDaOS(osComItens(80), identidade));
  const posicao = (pdf) => {
    const paginas = pdf.internal.pages.slice(1).map((p) => p.join("\n"));
    assert.ok(paginas.at(-1).includes("Assinatura do cliente"));
    assert.ok(paginas.slice(0, -1).every((p) => !p.includes("Assinatura do cliente")));
    return paginas.at(-1).match(/([\d.]+) ([\d.]+) Td\n\(Assinatura do cliente\)/)?.[2];
  };
  const y = posicao(curta);
  assert.ok(y);
  assert.equal(posicao(longa), y);
});


test("nota oculta desconto por padrão e mantém valores internos", () => {
  for (const preferencia of [undefined, false]) {
    const original = { ...os, mostrar_desconto_nota: preferencia };
    const d = documentoDaOS(original, identidade);
    assert.equal(d.mostrarDesconto, false); assert.equal(d.desconto, 0);
    assert.equal(d.total, 29465); assert.equal(original.total_centavos, 28000);
    assert.equal(original.desconto_centavos, 1465);
    const pdf = gerarPdfCliente(d).internal.pages.flat().join("\n");
    assert.ok(!pdf.includes('Desconto')); assert.ok(!pdf.includes('280,00')); assert.ok(pdf.includes('294,65'));
  }
});
test("nota mostra desconto somente com escolha explícita", () => {
 const d = documentoDaOS({...os,mostrar_desconto_nota:true}, identidade);
 assert.equal(d.mostrarDesconto,true); assert.equal(d.total,28000);
 const pdf=gerarPdfCliente(d).internal.pages.flat().join("\n"); assert.ok(pdf.includes('Desconto')); assert.ok(pdf.includes('280,00'));
});
