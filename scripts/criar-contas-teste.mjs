import { readFile, writeFile, mkdir, open, rename, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { importarTypescript } from "./lib/importar-typescript.mjs";
import {
  planejarContas,
  novoManifesto,
  conferirManifesto,
  conferirUsuario,
  conferirAcesso,
  paginaCredenciais,
} from "./lib/contas-teste.mjs";

// Ferramenta administrativa local. Nunca importar no frontend nem publicar output/.
// Sem --aplicar, apenas lista as contas; não cria credenciais nem acessa o banco.
const argumentos = process.argv.slice(2);
if (argumentos.some((a) => a !== "--aplicar" && !/^--lote=\d{8}$/.test(a)))
  throw new Error(
    "Uso: node scripts/criar-contas-teste.mjs --lote=AAAAMMDD [--aplicar]",
  );
const lote = argumentos.find((a) => a.startsWith("--lote="))?.slice(7) ?? "20261015";
const { especialidades } = await importarTypescript(
  new URL("../src/lib/especialidades.ts", import.meta.url),
);
const plano = planejarContas(especialidades, lote);
const projeto = "hzihxtjirttetnfdujcx";
const pasta = resolve("output/contas-teste", lote);

async function salvar(manifesto) {
  const destino = resolve(pasta, "credenciais.local.json");
  await writeFile(`${destino}.tmp`, JSON.stringify(manifesto, null, 2), {
    mode: 0o600,
  });
  await rename(`${destino}.tmp`, destino);
  await writeFile(resolve(pasta, "acessos.html"), paginaCredenciais(manifesto), {
    mode: 0o600,
  });
}
function verificar(resultado, operacao) {
  // Nunca imprimir objetos de Auth, headers ou sessões, inclusive em falhas.
  if (resultado.error)
    throw new Error(
      `${operacao} falhou (${resultado.error.code || resultado.error.status || "sem código"}).`,
    );
  return resultado.data;
}
async function executar() {
  if (!argumentos.includes("--aplicar")) {
    console.table(plano.map(({ nome, ramo, email }) => ({ nome, ramo, email })));
    console.log(
      `${plano.length} contas previstas; nenhuma conta ou senha criada. Use --aplicar somente com o banco atualizado e a chave administrativa no ambiente.`,
    );
    return;
  }
  const config = { ...parseEnv(await readFile(".env.local", "utf8")), ...process.env };
  // Segredo separado das variáveis do Vite e de qualquer artefato publicado.
  let adminConfig = {};
  try {
    adminConfig = parseEnv(
      await readFile("output/contas-teste/admin.env.local", "utf8"),
    );
  } catch (erro) {
    if (erro.code !== "ENOENT") throw erro;
  }
  const chave =
    process.env.SUPABASE_SERVICE_ROLE_KEY || adminConfig.SUPABASE_SERVICE_ROLE_KEY;
  if (!chave)
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY no ambiente ou em output/contas-teste/admin.env.local. Não coloque a chave no frontend nem no chat.",
    );
  if (config.VITE_SUPABASE_URL !== `https://${projeto}.supabase.co`)
    throw new Error(
      "Projeto diferente do ambiente conferido. Revise o destino antes de criar contas.",
    );
  const opcoes = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  };
  const admin = createClient(config.VITE_SUPABASE_URL, chave, opcoes);
  // Verifica as tabelas/colunas novas antes de criar qualquer usuário.
  for (const [tabela, colunas] of [
    ["oficinas", "id,ramo,especialidade"],
    [
      "atendimentos_servicos",
      "id,numero,data_servico,ficha_especialidade,compartilhado_cliente",
    ],
    ["itens_atendimento_servico", "id"],
    ["qualidade_atendimento", "id"],
    ["contas_cobranca", "oficina_id,ambiente"],
  ])
    verificar(
      await admin.from(tabela).select(colunas).limit(0),
      `Pré-requisito ${tabela}; confira as migrações até 20261015000500`,
    );
  const planos = verificar(
    await admin
      .from("planos")
      .select("codigo")
      .eq("codigo", "complete")
      .eq("ativo", true),
    "Plano Completo",
  );
  if (planos.length !== 1) throw new Error("Plano Completo indisponível.");
  await mkdir(pasta, { recursive: true });
  const caminhoLock = resolve(pasta, "provisionamento.lock");
  const lock = await open(caminhoLock, "wx");
  try {
    let manifesto;
    try {
      manifesto = JSON.parse(
        await readFile(resolve(pasta, "credenciais.local.json"), "utf8"),
      );
    } catch (erro) {
      if (erro.code !== "ENOENT") throw erro;
      manifesto = novoManifesto(plano, lote, projeto);
    }
    conferirManifesto(manifesto, plano, lote, projeto);
    await salvar(manifesto); // Senhas persistidas antes da chamada: permite retomada sem reset.
    const existentes = new Map();
    for (let pagina = 1; ; pagina++) {
      const dados = verificar(
        await admin.auth.admin.listUsers({ page: pagina, perPage: 1000 }),
        "Consultar usuários",
      );
      for (const u of dados.users)
        if (manifesto.contas.some((c) => c.email === u.email))
          existentes.set(u.email, u);
      if (dados.users.length < 1000) break;
    }
    for (const conta of manifesto.contas) {
      const existente = existentes.get(conta.email);
      if (existente) conferirUsuario(existente, conta, lote);
      else if (conta.usuario_id)
        throw new Error(
          `Usuário removido externamente: ${conta.email}. Não será recriado automaticamente.`,
        );
    }
    for (const conta of manifesto.contas) {
      let usuario = existentes.get(conta.email);
      if (!usuario)
        usuario = verificar(
          await admin.auth.admin.createUser({
            email: conta.email,
            password: conta.senha,
            email_confirm: true,
            app_metadata: { qa_lote: lote, qa_especialidade: conta.especialidade },
            user_metadata: { nome: `Teste — ${conta.nome}` },
          }),
          `Criar ${conta.email}`,
        ).user;
      conferirUsuario(usuario, conta, lote);
      conta.usuario_id = usuario.id;
      conta.status = "usuario_criado";
      await salvar(manifesto);
      const cliente = createClient(
        config.VITE_SUPABASE_URL,
        config.VITE_SUPABASE_PUBLISHABLE_KEY,
        opcoes,
      );
      verificar(
        await cliente.auth.signInWithPassword({
          email: conta.email,
          password: conta.senha,
        }),
        `Login ${conta.email}`,
      );
      try {
        const acessos = verificar(
          await cliente.rpc("consultar_meu_acesso"),
          "Conferir acessos existentes",
        );
        // Interrupção após o RPC é retomada pela mesma chave, sem criar outra empresa.
        if (
          acessos.length > 1 ||
          (acessos.length === 1 &&
            (acessos[0].nome !== conta.empresa ||
              acessos[0].especialidade !== conta.especialidade))
        ) {
          throw new Error(`Usuário vinculado a outra empresa: ${conta.email}.`);
        }
        const empresaId = verificar(
          await cliente.rpc("configurar_nova_empresa", {
            p_chave: conta.chave,
            p_nome: conta.empresa,
            p_telefone: "",
            p_endereco: {},
            p_ramo: conta.ramo,
            p_especialidade: conta.especialidade,
          }),
          `Criar empresa ${conta.nome}`,
        );
        if (conta.empresa_id && conta.empresa_id !== empresaId)
          throw new Error("A empresa retornada diverge do manifesto.");
        conta.empresa_id = empresaId;
        conta.status = "empresa_criada";
        await salvar(manifesto);
        conferirAcesso(
          verificar(await cliente.rpc("consultar_meu_acesso"), "Conferir isolamento"),
          conta,
        );
        const assinatura = verificar(
          await admin
            .from("assinaturas_oficina")
            .select("provedor_cobranca,assinatura_provedor_id")
            .eq("oficina_id", empresaId)
            .single(),
          "Conferir assinatura de teste",
        );
        if (assinatura.provedor_cobranca || assinatura.assinatura_provedor_id)
          throw new Error(
            "Empresa já vinculada a cobrança externa. Nenhuma assinatura será alterada.",
          );
        const atualizadas = verificar(
          await admin
            .from("assinaturas_oficina")
            .update({ codigo_plano: "complete", situacao: "active", valido_ate: null })
            .eq("oficina_id", empresaId)
            .is("provedor_cobranca", null)
            .is("assinatura_provedor_id", null)
            .select("oficina_id"),
          "Liberar plano de teste",
        );
        if (atualizadas.length !== 1)
          throw new Error("Assinatura alterada simultaneamente; confira a empresa.");
        conferirAcesso(
          verificar(
            await cliente.rpc("consultar_meu_acesso"),
            "Verificar Plano Completo",
          ),
          conta,
          true,
        );
        // A leitura com a sessão do novo usuário deve retornar apenas sua empresa.
        const empresasVisiveis = verificar(
          await cliente.from("oficinas").select("id"),
          "Verificar isolamento de empresas",
        );
        if (empresasVisiveis.length !== 1 || empresasVisiveis[0].id !== empresaId)
          throw new Error("Falha de isolamento entre empresas.");
        conta.status = "conferida";
        conta.verificado_em = new Date().toISOString();
        await salvar(manifesto);
        console.log(`Verificada: ${conta.nome} (${conta.email})`);
      } finally {
        await cliente.auth.signOut({ scope: "local" });
      }
    }
    console.log(
      `${manifesto.contas.length} contas verificadas. Credenciais privadas: ${resolve(pasta, "acessos.html")}`,
    );
  } finally {
    await lock.close();
    await unlink(caminhoLock);
  }
}
executar().catch((erro) => {
  console.error(erro.message);
  process.exitCode = 1;
});
