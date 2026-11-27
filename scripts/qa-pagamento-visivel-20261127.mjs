// Somente empresas fictícias ZZ; autenticação normal, sem chave de serviço.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { sessaoQa } from "./sessoes-qa-concorrencia-20261116.mjs";
const out = "output/pagamento-visivel-20261127";
await mkdir(out, { recursive: true });
const conta = JSON.parse(
  await readFile("output/contas-teste/20261019/credenciais.local.json", "utf8"),
).contas.find((c) => c.especialidade === "retifica");
assert(conta.empresa.startsWith("ZZ [TESTE 20261019] "));
const env = Object.fromEntries(
  (await readFile(".env.local", "utf8"))
    .split(/\r?\n/)
    .filter((l) => /^VITE_SUPABASE_/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [
        l.slice(0, i),
        l
          .slice(i + 1)
          .trim()
          .replace(/^['"]|['"]$/g, ""),
      ];
    }),
);
const base = "https://sistema-automotivo.vercel.app";
const api = createClient(base + "/_supabase", env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
await sessaoQa(api, conta);
const { data: empresa, error } = await api
  .from("oficinas")
  .select("nome")
  .eq("id", conta.empresa_id)
  .single();
assert.ifError(error);
assert(empresa.nome.startsWith("ZZ [TESTE 20261019] "));
const rpc = async (nome, args = {}) => {
  const { data, error } = await api.rpc(nome, { p_oficina: conta.empresa_id, ...args });
  assert.ifError(error);
  return data;
};
let casos;
try {
  casos = JSON.parse(await readFile(out + "/casos.json", "utf8"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
  casos = [];
}
if (process.argv.includes("--combinar")) {
  const c = casos.find((x) => x.caso === "prazo");
  assert(c?.id);
  const os = await rpc("consultar_ordem_servico", { p_os: c.id });
  assert.equal(os.dados_cliente.nome, "QA P27 prazo");
  const titulo = await rpc("consultar_financeiro_os", { p_os: c.id });
  if (!titulo.pagamento_combinado)
    await rpc("combinar_pagamento_titulo", {
      p_titulo: titulo.id,
      p_revisao: titulo.revisao,
      p_vencimento: "2026-12-15",
    });
  const atualizado = await rpc("consultar_financeiro_os", { p_os: c.id });
  assert.equal(atualizado.pagamento_combinado, true);
  assert.equal(atualizado.vencimento, "2026-12-15");
  console.log("Prazo fictício conferido: 15/12/2026");
  process.exit(0);
}
if (process.argv.includes("--conferir")) {
  const resultados = [];
  for (const c of casos) {
    if (!c.id) continue;
    const os = await rpc("consultar_ordem_servico", { p_os: c.id });
    assert(os.dados_cliente.nome.startsWith("QA P27 "));
    const titulo = await rpc("consultar_financeiro_os", { p_os: c.id });
    resultados.push({
      caso: c.caso,
      numero: os.numero,
      id: os.id,
      situacao: os.situacao,
      total: os.total_centavos,
      pago: titulo?.baixado_centavos || 0,
      aberto: titulo?.aberto_centavos || 0,
      vencimento: titulo?.vencimento,
      pagamento_combinado: titulo?.pagamento_combinado,
    });
  }
  await writeFile(out + "/conferencia.json", JSON.stringify(resultados, null, 2));
  console.log(resultados);
} else {
  for (const caso of [
    "zero-antes",
    "zero-depois",
    "aberto",
    "parcial",
    "pago",
    "prazo",
  ]) {
    let c = casos.find((x) => x.caso === caso);
    if (c?.pronto) continue;
    if (!c) {
      c = { caso, chave: randomUUID() };
      casos.push(c);
      await writeFile(out + "/casos.json", JSON.stringify(casos, null, 2));
    }
    const zero = caso.startsWith("zero");
    let os = await rpc(zero ? "salvar_ordem_servico" : "criar_os_pronta", {
      p_chave: c.chave,
      p_dados: {
        cliente_nome_livre: "QA P27 " + caso,
        carro_livre: "QA P27 " + caso,
        motor_livre: "Teste",
        recebido_em: new Date().toISOString(),
        data_servico: "2026-11-27",
        desconto_centavos: 0,
        ...(zero
          ? {}
          : {
              itens: [
                {
                  id: c.chave,
                  tipo: "service",
                  descricao: "QA P27 serviço fictício",
                  unidade: "un",
                  quantidade: 1,
                  preco_unitario_centavos: 15000,
                  situacao: "done",
                },
              ],
            }),
      },
    });
    c.id = os.id;
    c.numero = os.numero;
    await writeFile(out + "/casos.json", JSON.stringify(casos, null, 2));
    if (zero) {
      for (let n = 0; os.situacao !== "ready" && n < 3; n++) {
        await rpc("mover_ordem_no_mapa", {
          p_os: os.id,
          p_revisao: os.revisao,
          p_direcao: "avancar",
        });
        os = await rpc("consultar_ordem_servico", { p_os: os.id });
      }
      assert.equal(os.situacao, "ready");
    }
    if (["parcial", "pago", "prazo"].includes(caso)) {
      await rpc("preparar_financeiro_os", { p_os: os.id });
      const titulo = await rpc("consultar_financeiro_os", { p_os: os.id });
      if (caso !== "prazo")
        await rpc("baixar_titulo_financeiro", {
          p_titulo: titulo.id,
          p_chave: c.chave,
          p_valor: caso === "pago" ? 15000 : 5000,
          p_taxa: 0,
          p_data: "2026-11-27",
          p_conta: "caixa",
          p_forma: "dinheiro",
          p_observacao: "QA fictício: conferir abertura do pagamento",
        });
      else
        await rpc("combinar_pagamento_titulo", {
          p_titulo: titulo.id,
          p_revisao: titulo.revisao,
          p_vencimento: "2026-12-15",
        });
    }
    c.pronto = true;
    await writeFile(out + "/casos.json", JSON.stringify(casos, null, 2));
    console.log({ caso, numero: c.numero, id: c.id });
  }
}
