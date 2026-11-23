import assert from "node:assert/strict";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { createServer } from "vite";

const valores = new Map();
globalThis.localStorage = {
  getItem: (k) => valores.get(k) ?? null,
  setItem: (k, v) => valores.set(k, String(v)),
  removeItem: (k) => valores.delete(k),
};
globalThis.window = new EventTarget();
const server = await createServer({
  configFile: false,
  envDir: false,
  appType: "custom",
  cacheDir: "output/.vite-aprovacao-orcamento-tests",
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const { AcaoOrcamento } = await server.ssrLoadModule(
    "/src/components/AcaoOrcamento.tsx",
  );
  const acao = (proposta, permiteOS = true, compacta = false, ocupado = false) =>
    renderToStaticMarkup(
      h(
        MemoryRouter,
        {},
        h(AcaoOrcamento, {
          proposta,
          permiteOS,
          compacta,
          ocupado,
          aprovar() {},
          converter() {},
        }),
      ),
    );
  for (const compacta of [true, false]) {
    for (const situacao of ["draft", "awaiting_approval"]) {
      assert.match(acao({ situacao }, true, compacta), /> Aprovar<\/button>/);
      assert.match(acao({ situacao }, false, compacta), /> Aprovar<\/button>/);
      assert.match(acao({ situacao }, true, compacta, true), /disabled=""/);
    }
    assert.match(acao({ situacao: "approved" }, true, compacta), /Transformar em OS/);
    assert.equal(acao({ situacao: "approved" }, false, compacta), "");
    for (const campo of ["ordem_servico_id", "adicional_os_id"]) {
      const html = acao({ situacao: "approved", [campo]: "os-teste" }, true, compacta);
      assert.match(html, /href="\/ordens-servico\?os=os-teste"/);
      assert.match(html, /Abrir OS/);
      assert.doesNotMatch(html, /Transformar/);
    }
    for (const situacao of ["cancelled", "declined", "expired"])
      assert.equal(acao({ situacao }, true, compacta), "");
    assert.equal(
      acao({ situacao: "draft", arquivado_em: "2026-10-14" }, true, compacta),
      "",
    );
  }
  console.log("PASS ações visíveis na lista e no detalhe, permissões e vínculo com OS");

  const s = await server.ssrLoadModule("/src/services/orcamentos.ts");
  const osService = await server.ssrLoadModule("/src/services/ordensServico.ts");
  const oficina = "demonstracao";
  const nova = async () =>
    s.salvarProposta(
      true,
      oficina,
      {
        cliente_id: "avulso",
        cliente_nome_livre: "Cliente fictício da regressão",
        veiculo_id: "",
        carro_livre: "Veículo fictício",
        motor_livre: "Motor de teste",
        observacoes: "Somente teste local",
        condicoes: "",
        desconto_centavos: 1000,
        itens: [
          {
            tipo: "service",
            descricao: "Serviço fictício",
            unidade: "un",
            quantidade: 2,
            preco_unitario_centavos: 10000,
            grupo_servico: "Motor",
          },
        ],
      },
      crypto.randomUUID(),
    );
  const ler = (q) => s.obterProposta(true, oficina, q.id);
  let q = await nova();
  q = (await s.emitirProposta(true, oficina, q, 7)).proposta;
  assert.equal(q.situacao, "awaiting_approval");
  assert.equal(q.aprovacao, null);
  await s.aprovarPropostaInterna(true, oficina, q);
  await s.aprovarPropostaInterna(true, oficina, q);
  q = await ler(q);
  const os = await s.acaoProposta(true, oficina, q, "converter");
  assert.equal(await s.acaoProposta(true, oficina, q, "converter"), os);
  const convertido = await osService.consultarOS(true, oficina, os);
  assert.equal(convertido.total_centavos, 19000);
  assert.equal(convertido.itens[0].quantidade, 2);
  assert.equal((await ler(q)).ordem_servico_id, os);
  console.log(
    "PASS salvar pronto para aprovação, aprovar, converter e repetir sem duplicar OS",
  );

  let antigo = await nova();
  await s.aprovarPropostaInterna(true, oficina, antigo);
  antigo = await ler(antigo);
  assert.equal(antigo.situacao, "approved");
  assert.ok(antigo.versao.publicado_em);
  assert.equal(antigo.aprovacao.nome_informado, "Responsável da oficina");
  let pendente = await nova();
  const osPendente = await s.criarOSParaOrcamento(true, oficina, pendente);
  pendente = await ler(pendente);
  await s.aprovarPropostaInterna(true, oficina, pendente);
  const liberada = await osService.consultarOS(true, oficina, osPendente);
  assert.equal(liberada.orcamento_aguardando_id, null);
  assert.equal(liberada.orcamento_origem_id, pendente.id);
  assert.equal(liberada.total_centavos, 19000);
  console.log(
    "PASS aprovação direta de rascunho antigo e liberação da OS já vinculada",
  );

  const desatualizado = await nova();
  s.gravarDemo({ ...desatualizado, revisao: desatualizado.revisao + 1 });
  await assert.rejects(() => s.aprovarPropostaInterna(true, oficina, desatualizado));
  assert.equal((await ler(desatualizado)).situacao, "draft");
  for (const situacao of ["expired", "declined", "cancelled"]) {
    const bloqueado = { ...(await nova()), situacao };
    s.gravarDemo(bloqueado);
    await assert.rejects(() => s.aprovarPropostaInterna(true, oficina, bloqueado));
    assert.equal((await ler(bloqueado)).situacao, situacao);
  }
  const vencido = { ...(await nova()), situacao: "awaiting_approval" };
  vencido.versao.expira_em = "2000-01-01T00:00:00Z";
  s.gravarDemo(vencido);
  await assert.rejects(() => s.aprovarPropostaInterna(true, oficina, vencido));
  console.log("PASS dados desatualizados e orçamentos indisponíveis não aprovados");
} finally {
  await server.close();
}
