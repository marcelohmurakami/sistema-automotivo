import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { sessaoQa } from "./sessoes-qa-concorrencia-20261116.mjs";
const out = "output/atalhos-mapa-20261127";
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
const api = createClient(
  "https://sistema-automotivo.vercel.app/_supabase",
  env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
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
if (process.argv.includes("--conferir")) {
  const resultados = [];
  for (const c of casos) {
    const os = await rpc("consultar_ordem_servico", { p_os: c.id });
    assert(os.dados_cliente.nome.startsWith("QA AT27 "));
    const antes = JSON.parse(
      await readFile(out + "/" + c.caso + "-antes.json", "utf8"),
    );
    for (const campo of [
      "cliente_id",
      "veiculo_id",
      "dados_cliente",
      "dados_veiculo",
      "situacao",
      "data_servico",
      "queixa_cliente",
      "diagnostico",
      "observacoes_internas",
      "resumo_cliente",
      "responsavel",
      "prioridade",
      "quilometragem_entrada",
      "quilometragem_saida",
      "combustivel_percentual",
      "pertences",
      "condicoes_garantia",
      "garantia_ate",
      "checklist",
      "itens",
      "total_centavos",
      "desconto_centavos",
      "mostrar_desconto_nota",
      "fotos",
      "paradas",
    ])
      assert.deepEqual(os[campo], antes[campo], c.caso + ": preservar " + campo);
    resultados.push({
      caso: c.caso,
      numero: os.numero,
      revisao: os.revisao,
      tipo: os.tipo_servico,
      entrega: os.entrega_prevista_em,
      total: os.total_centavos,
      preservacao: "PASS",
    });
  }
  await writeFile(out + "/conferencia.json", JSON.stringify(resultados, null, 2));
  console.log(resultados);
} else {
  for (const caso of ["desktop", "mobile"]) {
    let c = casos.find((x) => x.caso === caso);
    if (c?.id) continue;
    if (!c) {
      c = { caso, chave: randomUUID() };
      casos.push(c);
      await writeFile(out + "/casos.json", JSON.stringify(casos, null, 2));
    }
    const os = await rpc("salvar_os_com_itens", {
      p_chave: c.chave,
      p_dados: {
        cliente_nome_livre: "QA AT27 " + caso,
        carro_livre: "QA AT27 " + caso,
        motor_livre: "Teste",
        data_servico: "2026-11-27",
        queixa_cliente: "Queixa QA a preservar",
        diagnostico: "Diagnóstico QA a preservar",
        observacoes_internas: "Observação interna QA",
        resumo_cliente: "Resumo QA",
        responsavel: "Técnico fictício QA",
        prioridade: "normal",
        quilometragem_entrada: 100,
        quilometragem_saida: 102,
        combustivel_percentual: 50,
        pertences: "Chave QA",
        condicoes_garantia: "Condições QA",
        garantia_ate: "2027-01-27",
        checklist: { conferido: true },
        desconto_centavos: 1000,
        mostrar_desconto_nota: true,
        itens: [
          {
            id: c.chave,
            tipo: "service",
            descricao: "Serviço fictício QA AT27",
            unidade: "un",
            quantidade: 1,
            preco_unitario_centavos: 15000,
            situacao: "pending",
          },
        ],
      },
    });
    c.id = os.id;
    c.numero = os.numero;
    await writeFile(out + "/casos.json", JSON.stringify(casos, null, 2));
    await writeFile(out + "/" + caso + "-antes.json", JSON.stringify(os, null, 2));
    console.log({ caso, numero: c.numero });
  }
}
