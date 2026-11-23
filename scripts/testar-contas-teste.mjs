import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { importarTypescript } from "./lib/importar-typescript.mjs";
import {
  planejarContas,
  novoManifesto,
  conferirManifesto,
  conferirUsuario,
  conferirAcesso,
  paginaCredenciais,
} from "./lib/contas-teste.mjs";

const { especialidades } = await importarTypescript(
  new URL("../src/lib/especialidades.ts", import.meta.url),
);
const lote = "20261015";
const projeto = "hzihxtjirttetnfdujcx";
const plano = planejarContas(especialidades, lote);
test("cobre cada subsetor com endereço único e somente domínio fictício", () => {
  assert.equal(plano.length, 26);
  assert.deepEqual(
    Object.fromEntries(
      ["automotivo", "assistencia_tecnica", "manutencao_campo", "limpeza"].map((r) => [
        r,
        plano.filter((c) => c.ramo === r).length,
      ]),
    ),
    { automotivo: 10, assistencia_tecnica: 5, manutencao_campo: 5, limpeza: 6 },
  );
  assert.equal(new Set(plano.map((c) => c.email)).size, 26);
  assert.ok(
    plano.every(
      (c) =>
        c.email.endsWith("@example.com") && c.empresa.startsWith("ZZ [TESTE 20261015]"),
    ),
  );
  assert.throws(() => planejarContas(especialidades, "../../fora"));
});
test("senhas independentes e manifesto retomável sem regenerá-las", () => {
  const manifesto = novoManifesto(plano, lote, projeto);
  assert.equal(new Set(manifesto.contas.map((c) => c.senha)).size, 26);
  assert.ok(manifesto.contas.every((c) => c.senha.length >= 32));
  const recarregado = JSON.parse(JSON.stringify(manifesto));
  conferirManifesto(recarregado, plano, lote, projeto);
  assert.deepEqual(recarregado, manifesto);
});
test("recusa manifesto de outro projeto, conta duplicada ou endereço alterado", () => {
  for (const alterar of [
    (m) => {
      m.projeto = "outro";
    },
    (m) => {
      m.contas[1] = m.contas[0];
    },
    (m) => {
      m.contas[0].email = "cliente@real.com";
    },
    (m) => {
      m.contas[0].senha = "";
    },
  ]) {
    const m = novoManifesto(plano, lote, projeto);
    alterar(m);
    assert.throws(() => conferirManifesto(m, plano, lote, projeto));
  }
});
test("recusa colisão com usuário existente que não pertence ao lote", () => {
  const conta = plano[0];
  const usuario = {
    id: "u1",
    email: conta.email,
    app_metadata: { qa_lote: lote, qa_especialidade: conta.especialidade },
  };
  conferirUsuario(usuario, conta, lote);
  assert.throws(() => conferirUsuario({ ...usuario, app_metadata: {} }, conta, lote));
  assert.throws(() =>
    conferirUsuario(usuario, { ...conta, usuario_id: "outro" }, lote),
  );
});
test("recusa acesso a outra empresa, papel incorreto ou plano incompleto", () => {
  const conta = { ...plano[0], empresa_id: "empresa-teste" };
  const empresa = {
    id: conta.empresa_id,
    nome: conta.empresa,
    ramo: conta.ramo,
    especialidade: conta.especialidade,
    perfil: "owner",
    codigo_plano: "complete",
    situacao: "active",
  };
  conferirAcesso([empresa], conta, true);
  for (const acessos of [
    [],
    [empresa, empresa],
    [{ ...empresa, id: "real" }],
    [{ ...empresa, perfil: "staff" }],
    [{ ...empresa, codigo_plano: "basic" }],
    [{ ...empresa, situacao: "suspended" }],
  ]) {
    assert.throws(() => conferirAcesso(acessos, conta, true));
  }
});
test("a página só apresenta logins conferidos e escapa conteúdo HTML", () => {
  const m = novoManifesto(plano, lote, projeto);
  const pendente = m.contas[1].senha;
  m.contas[0].status = "conferida";
  m.contas[0].nome = "<img src=x onerror=alert(1)>";
  const html = paginaCredenciais(m);
  assert.ok(html.includes("1 de 26 contas verificadas"));
  assert.ok(html.includes(m.contas[0].senha));
  assert.ok(!html.includes(pendente));
  assert.ok(!html.includes("<img src="));
});
test("simulação funciona sem chave e não acessa serviço externo", () => {
  const ambiente = {
    ...process.env,
    SUPABASE_SERVICE_ROLE_KEY: "",
    VITE_SUPABASE_URL: "http://destino-invalido",
  };
  const resultado = spawnSync(
    process.execPath,
    ["scripts/criar-contas-teste.mjs", "--lote=20261015"],
    { encoding: "utf8", env: ambiente },
  );
  assert.equal(resultado.status, 0, resultado.stderr);
  assert.match(resultado.stdout, /26 contas previstas; nenhuma conta ou senha criada/);
});
