import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import "fake-indexeddb/auto";
import {
  lerCSV,
  prepararCadastros,
  lerNFe,
  centavosBR,
} from "../src/lib/importacao.ts";
import {
  estimarMargem,
  valorSelecionado,
  incluirDependencias,
  retirarGrupo,
} from "../src/lib/orcamentoInteligente.ts";
import { conferirCaptura } from "../src/lib/capturaAtendimento.ts";
import {
  guardarBase,
  basesDoUsuario,
  novoRascunhoOffline,
  guardarRascunhoOffline,
  rascunhosDoUsuario,
  excluirRascunhoOffline,
  limparOfflineUsuario,
} from "../src/lib/atendimentoOffline.ts";
import {
  assinaturaPixValida,
  configuracaoPix,
  pagamentoConferido,
  corpoCriacaoPix,
  chamarPix,
} from "../supabase/functions/_shared/pix.mjs";
const item = (grupo, valor, dep = "") => ({
  grupo_servico: grupo,
  preco_unitario_centavos: valor,
  quantidade: 1,
  tipo: "service",
  depende_grupo: dep,
});
test("CSV com BOM, vírgulas, aspas e quebra de linha dentro de campo", () => {
  assert.deepEqual(
    lerCSV('\uFEFFnome;observações\r\n"João; Silva";"linha 1\nlinha 2"\r\n'),
    [{ nome: "João; Silva", observacoes: "linha 1\nlinha 2" }],
  );
  assert.equal(
    lerCSV('nome,email\n"Ana ""Maria""",ana@example.com')[0].nome,
    'Ana "Maria"',
  );
});
test("CSV rejeita aspas incompletas e linhas com colunas divergentes", () => {
  assert.throws(() => lerCSV('nome;email\n"Ana;email'));
  assert.throws(() => lerCSV("nome;email\nAna;a@b.com;extra"));
  assert.throws(() => lerCSV("nome;nome\nAna;Ana"));
});
test("Importação limita volume e não confunde ausência com cliente válido", () => {
  assert.throws(() => lerCSV("nome\n" + "Ana\n".repeat(501)));
  assert.throws(() => prepararCadastros([{ nome: "A" }], "clientes"));
});
test("Normaliza DDD, email e preço brasileiro", () => {
  assert.equal(
    prepararCadastros(
      [{ nome: "Marcelo", telefone: "(16) 99999-0000" }],
      "clientes",
    )[0].telefone_e164,
    "+5516999990000",
  );
  assert.equal(centavosBR("R$ 1.250,75"), 125075);
  assert.equal(centavosBR("35.90"), 3590);
});
test("Importação rejeita preço negativo, email inválido e tipo desconhecido", () => {
  assert.throws(() => centavosBR("-1"));
  assert.throws(() =>
    prepararCadastros([{ nome: "Ana", email: "invalido" }], "clientes"),
  );
  assert.throws(() =>
    prepararCadastros(
      [{ descricao: "Óleo", tipo: "outro", preco: "50" }],
      "catalogo",
    ),
  );
});
const chave = "1".repeat(44),
  xml = `<nfeProc><NFe><infNFe Id="NFe${chave}"><ide><mod>55</mod><dhEmi>2026-10-05T10:00:00-03:00</dhEmi></ide><emit><xNome>Peças Silva</xNome><CNPJ>12345678000190</CNPJ></emit><det nItem="1"><prod><cProd>001</cProd><xProd>Filtro</xProd><uCom>un</uCom><qCom>2.000</qCom><vUnCom>15.00</vUnCom><vProd>30.00</vProd></prod></det><total><ICMSTot><vNF>30.00</vNF></ICMSTot></total></infNFe></NFe><protNFe><infProt><cStat>100</cStat><chNFe>${chave}</chNFe></infProt></protNFe></nfeProc>`;
test("NF-e lê item único, preserva código com zeros e centavos", () => {
  const n = lerNFe(xml);
  assert.equal(n.itens[0].codigo, "001");
  assert.equal(n.itens[0].custo_centavos, 1500);
  assert.equal(n.total_xml_centavos, 3000);
});
test("NF-e aceita namespace e informa diferença por frete/imposto", () => {
  assert.equal(
    lerNFe(
      xml.replace("<NFe>", '<NFe xmlns="http://www.portalfiscal.inf.br/nfe">'),
    ).itens.length,
    1,
  );
  assert.match(
    lerNFe(xml.replace("<vNF>30.00", "<vNF>35.00")).avisos.join(" "),
    /difere/,
  );
});
test("NF-e rejeita entidades, arquivos truncados, modelo e autorização inválidos", () => {
  assert.throws(() =>
    lerNFe('<!DOCTYPE x [<!ENTITY f SYSTEM "file:///etc/passwd">]>' + xml),
  );
  assert.throws(() => lerNFe(xml.slice(0, 80)));
  assert.throws(() => lerNFe(xml.replace("<mod>55", "<mod>65")));
  assert.throws(() => lerNFe(xml.replace("<cStat>100", "<cStat>110")));
});
test("NF-e rejeita chave diferente no protocolo e precisão não suportada", () => {
  assert.throws(() =>
    lerNFe(xml.replace(`<chNFe>${chave}`, `<chNFe>${"2".repeat(44)}`)),
  );
  assert.throws(() => lerNFe(xml.replace("2.000", "2.0001")));
});
test("Desconto proporcional coincide com o banco", () => {
  assert.deepEqual(
    valorSelecionado(
      [item("A", 10000), item("B", 5000), item("C", 9000)],
      1001,
      ["A", "B"],
    ),
    { subtotal: 15000, desconto: 626, total: 14374 },
  );
});
test("Dependências transitivas e ciclos terminam; retirada remove dependentes", () => {
  const i = [item("A", 1, "B"), item("B", 1, "C"), item("C", 1, "A")];
  assert.equal(incluirDependencias(i, ["A"]).length, 3);
  assert.equal(retirarGrupo(i, ["A", "B", "C"], "A").length, 0);
});
test("Margem calcula custo de peça, tempo, extras e desconto sem tratar como lucro", () => {
  const m = estimarMargem(
    [
      {
        ...item("Peça", 10000),
        tipo: "part",
        custo_unitario_previsto_centavos: 6000,
      },
      { ...item("MO", 8000), minutos_previstos: 90, custo_hora_centavos: 4000 },
    ],
    1000,
    2000,
  );
  assert.equal(m.custo, 14000);
  assert.equal(m.saldo, 3000);
  assert.equal(m.faltantes, 0);
});
test("Margem alerta prejuízo e dados incompletos sem dividir por zero", () => {
  assert.equal(estimarMargem([item("A", 0)], 0).percentual, null);
  assert.equal(estimarMargem([item("A", 100)], 0).faltantes, 1);
  assert.ok(
    estimarMargem(
      [{ ...item("A", 100), custo_unitario_previsto_centavos: 200 }],
      0,
    ).saldo < 0,
  );
});
test("Captura normaliza placa e mantém incerteza vazia", () => {
  assert.equal(
    conferirCaptura({
      placa: "abc-1d23",
      quilometragem: 123000,
      relato: "Barulho",
      itens: [],
    }).placa,
    "ABC1D23",
  );
  assert.equal(
    conferirCaptura({ placa: null, quilometragem: null, relato: "", itens: [] })
      .quilometragem,
    null,
  );
});
test("Captura não aceita placa inventada, KM negativo ou item fora do limite", () => {
  assert.throws(() =>
    conferirCaptura({
      placa: "ABCDEFG",
      quilometragem: 0,
      relato: "",
      itens: [],
    }),
  );
  assert.throws(() =>
    conferirCaptura({ placa: null, quilometragem: -1, relato: "", itens: [] }),
  );
  assert.throws(() =>
    conferirCaptura({
      placa: null,
      quilometragem: 1,
      relato: "",
      itens: [{ descricao: "Peça", tipo: "part", quantidade: 0 }],
    }),
  );
});
test("Offline isola por pessoa e oficina; sair apaga somente os dados da conta", async () => {
  const a = novoRascunhoOffline("a", "w1"),
    b = novoRascunhoOffline("b", "w2");
  a.relato = "Rascunho a";
  b.relato = "Rascunho b";
  await guardarRascunhoOffline(a);
  await guardarRascunhoOffline(b);
  assert.equal((await rascunhosDoUsuario("a", "w2")).length, 0);
  await assert.rejects(() => excluirRascunhoOffline("b", "w1", a.id));
  await limparOfflineUsuario("a");
  assert.equal((await rascunhosDoUsuario("a", "w1")).length, 0);
  assert.equal((await rascunhosDoUsuario("b", "w2")).length, 1);
});
test("Offline rejeita sobrescrita concorrente e preserva fotos", async () => {
  const a = novoRascunhoOffline("c", "w3");
  a.fotos = [
    {
      id: "foto",
      imagem: "data:image/jpeg;base64,YQ==",
      fase: "before",
      legenda: "Antes",
      sincronizada: false,
    },
  ];
  await guardarRascunhoOffline(a);
  const outraAba = structuredClone(a);
  a.relato = "Primeira aba salvou";
  await guardarRascunhoOffline(a);
  await assert.rejects(() => guardarRascunhoOffline(outraAba), /outra aba/);
  assert.equal((await rascunhosDoUsuario("c", "w3"))[0].fotos.length, 1);
});
test("Offline expira base de cadastros após sete dias, preservando rascunhos", async () => {
  await guardarBase({
    id: "x:y",
    usuario: "x",
    oficina: "y",
    nome: "Oficina",
    atualizado: Date.now() - 8 * 86400000,
    aux: {},
  });
  assert.equal((await basesDoUsuario("x")).length, 0);
});
const cfg = {
    oficina: "w",
    token: "teste",
    segredo_webhook: "segredo",
    recebedor_id: "123",
    ambiente: "teste",
  },
  c = {
    id: "cobranca",
    valor_centavos: 1200,
    ambiente: "teste",
    email_pagador: "a@example.com",
    criado_em: "2026-10-05T12:00:00Z",
  },
  pagamento = {
    id: 999,
    collector_id: 123,
    transaction_amount: 12,
    currency_id: "BRL",
    payment_method_id: "pix",
    external_reference: "cobranca",
    live_mode: false,
    status: "approved",
    fee_details: [{ amount: 0.12 }],
  };
test("Pix fica desligado sem configuração e produção exige liberação explícita", () => {
  assert.equal(
    configuracaoPix(() => undefined, "w"),
    null,
  );
  const e = {
    PIX_HABILITADO: "true",
    PIX_OFICINAS_JSON: JSON.stringify([{ ...cfg, ambiente: "producao" }]),
  };
  assert.equal(
    configuracaoPix((k) => e[k], "w"),
    null,
  );
  e.PIX_PRODUCAO_HABILITADA = "true";
  assert.ok(configuracaoPix((k) => e[k], "w"));
  assert.equal(
    configuracaoPix((k) => e[k], "outra"),
    null,
  );
});
test("Pix valida recebedor, referência, moeda, valor e ambiente", () => {
  assert.equal(pagamentoConferido(pagamento, c, cfg).taxa_centavos, 12);
  for (const patch of [
    { collector_id: 444 },
    { external_reference: "outra" },
    { transaction_amount: 13 },
    { currency_id: "USD" },
    { live_mode: true },
    { payment_method_id: "credit_card" },
  ])
    assert.throws(() => pagamentoConferido({ ...pagamento, ...patch }, c, cfg));
});
test("Pix detecta reembolso parcial para conciliação", () => {
  assert.equal(
    pagamentoConferido({ ...pagamento, transaction_amount_refunded: 4 }, c, cfg)
      .situacao,
    "estornado",
  );
});
test("Pix corpo de repetição usa data e identificação imutáveis", () => {
  assert.deepEqual(
    corpoCriacaoPix(c, cfg, "https://projeto.supabase.co"),
    corpoCriacaoPix(c, cfg, "https://projeto.supabase.co"),
  );
  assert.equal(
    corpoCriacaoPix(c, cfg, "https://projeto.supabase.co").date_of_expiration,
    "2026-10-05T12:30:00.000Z",
  );
});
test("Webhook Pix valida HMAC; adulteração, ausência e replay antigo falham", async () => {
  const ts = String(Math.floor(Date.now() / 1000)),
    requestId = "req-1",
    dataId = "999",
    segredo = "segredo";
  const sig = createHmac("sha256", segredo)
    .update(`id:${dataId};request-id:${requestId};ts:${ts};`)
    .digest("hex");
  const v = { assinatura: `ts=${ts},v1=${sig}`, requestId, dataId, segredo };
  assert.ok(await assinaturaPixValida(v));
  assert.equal(await assinaturaPixValida({ ...v, dataId: "998" }), false);
  assert.equal(await assinaturaPixValida({ ...v, requestId: null }), false);
  assert.equal(
    await assinaturaPixValida({ ...v, agora: Date.now() + 7200000 }),
    false,
  );
});
test("Adapter Pix envia chave idempotente e recusa rotas arbitrárias", async () => {
  let args;
  await chamarPix(
    cfg,
    "/v1/payments",
    { valor: 12 },
    "POST",
    "unica",
    async (...a) => {
      args = a;
      return { ok: true, json: async () => ({ id: 1 }) };
    },
  );
  assert.equal(args[1].headers["X-Idempotency-Key"], "unica");
  await assert.rejects(
    () => chamarPix(cfg, "https://outro.exemplo"),
    /Rota inválida/,
  );
});
