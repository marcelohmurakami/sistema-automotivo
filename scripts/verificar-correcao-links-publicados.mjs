// Conferência pós-publicação de dois cenários fictícios decididos no navegador.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { conferirAcesso } from "./lib/contas-teste.mjs";

const pasta = "output/links-todos-subsetores-20261026";
const contas = JSON.parse(
  await readFile("output/contas-teste/20261019/credenciais.local.json", "utf8"),
);
const cenarios = JSON.parse(
  await readFile(`${pasta}/intercorrencias.local.json`, "utf8"),
);
const env = parseEnv(await readFile(".env.local", "utf8"));
assert.equal(contas.projeto, "hzihxtjirttetnfdujcx");
assert.equal(env.VITE_SUPABASE_URL, "https://hzihxtjirttetnfdujcx.supabase.co");
const resultados = [];
for (const especialidade of ["mecanica", "assistencia_celulares"]) {
  const conta = contas.contas.find((x) => x.especialidade === especialidade);
  const caso = cenarios.casos.find(
    (x) => x.especialidade === especialidade && x.tipo === "selecao",
  );
  assert(conta.empresa.startsWith("ZZ [TESTE 20261019] "));
  assert.equal(conta.email, `qa.20261019.${especialidade}@example.com`);
  assert.equal(caso.empresa_id, conta.empresa_id);
  const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (u, i) => fetch(u, { ...i, signal: AbortSignal.timeout(30000) }) },
  });
  const rpc = async (fn, args) => {
    const { data, error } = await c.rpc(fn, args);
    if (error) throw Error(`${fn}: ${error.code} ${error.message}`);
    return data;
  };
  const login = await c.auth.signInWithPassword({
    email: conta.email,
    password: conta.senha,
  });
  assert(!login.error, "Login da empresa fictícia");
  try {
    conferirAcesso(await rpc("consultar_meu_acesso", {}), conta, true);
    const auto = conta.ramo === "automotivo";
    const d = await rpc(
      auto ? "consultar_orcamento" : "consultar_detalhes_atendimento",
      {
        p_oficina: conta.empresa_id,
        [auto ? "p_orcamento" : "p_atendimento"]: caso.id,
      },
    );
    const p = auto ? d.aprovacao : d.propostas.find((x) => x.id === caso.proposta_id);
    assert.equal(p.decisao, auto ? "approved" : "aprovado");
    assert.equal(p.total_aprovado_centavos, 13500);
    assert.equal(p.nome_informado, `Cliente QA ${especialidade} selecao`);
    assert.deepEqual(p.grupos_aprovados, ["Serviço principal"]);
    assert.equal(auto ? d.versao.total_centavos : p.documento.total_centavos, 22500);
    assert.equal(auto ? d.itens.length : p.documento.itens.length, 3);
    if (auto) {
      const os = await rpc("converter_orcamento_em_os", {
        p_oficina: conta.empresa_id,
        p_orcamento: caso.id,
      });
      const ordem = await rpc("consultar_ordem_servico", {
        p_oficina: conta.empresa_id,
        p_os: os,
      });
      assert.equal(ordem.total_centavos, 13500);
      assert.equal(ordem.itens.length, 2);
    } else {
      assert.equal(d.atendimento.situacao, "aprovado");
      assert.equal(d.atendimento.dados.documento, "ordem");
      assert.equal(d.atendimento.valor_centavos, 13500);
      assert.equal(d.itens.length, 2);
    }
    resultados.push({
      especialidade,
      numero: caso.numero,
      passou: true,
      total_autorizado_centavos: 13500,
      original_centavos: 22500,
      itens_autorizados: 2,
      itens_originais: 3,
      conferido_em: new Date().toISOString(),
    });
    console.log("CONFERIDO", especialidade, caso.numero);
  } finally {
    await c.auth.signOut();
  }
}
await writeFile(
  `${pasta}/correcao-publicada-banco.json`,
  JSON.stringify(resultados, null, 2),
);
