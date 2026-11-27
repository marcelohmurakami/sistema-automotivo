import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { createServer } from "vite";
import { sessaoQa } from "./sessoes-qa-concorrencia-20261116.mjs";
const root = "output/atalhos-publicado-26-20261127";
await mkdir(root, { recursive: true });
const contas = JSON.parse(
  await readFile("output/contas-teste/20261019/credenciais.local.json", "utf8"),
).contas;
assert.equal(contas.length, 26);
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
const server = await createServer({
  configFile: false,
  envDir: false,
  cacheDir: root + "/.vite",
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: "custom",
});
const { especialidades, tiposServico } = await server.ssrLoadModule(
  "/src/lib/especialidades.ts",
);
const { novaFichaEspecialidade } = await server.ssrLoadModule(
  "/src/lib/perfisAtendimento.ts",
);
const conf = process.argv.includes("--conferir");
const resultados = [];
try {
  for (const c of contas.filter(
    (x) =>
      !process.env.QA_PERFIS ||
      process.env.QA_PERFIS.split(",").includes(x.especialidade),
  )) {
    assert(c.empresa.startsWith("ZZ [TESTE 20261019] "));
    const perfil = c.especialidade,
      auto = c.ramo === "automotivo",
      file = `${root}/${perfil}.json`;
    let s;
    try {
      s = JSON.parse(await readFile(file, "utf8"));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    s ||= {
      perfil,
      nome: especialidades[perfil].nome,
      ramo: c.ramo,
      empresa: c.empresa_id,
      casos: [],
      calls: [],
    };
    const save = () => writeFile(file, JSON.stringify(s, null, 2));
    const api = createClient(
      "https://sistema-automotivo.vercel.app/_supabase",
      env.VITE_SUPABASE_PUBLISHABLE_KEY,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: (u, o) => fetch(u, { ...o, signal: AbortSignal.timeout(45000) }),
        },
      },
    );
    const rpc = async (n, a = {}) => {
      const t = performance.now();
      const { data, error } = await api.rpc(n, { p_oficina: c.empresa_id, ...a });
      s.calls.push({
        rpc: n,
        segundos: +((performance.now() - t) / 1000).toFixed(3),
        erro: error?.message,
      });
      if (error) throw Error(n + ": " + error.message);
      return data;
    };
    try {
      await sessaoQa(api, c);
      const { data: w, error } = await api
        .from("oficinas")
        .select("nome")
        .eq("id", c.empresa_id)
        .single();
      assert.ifError(error);
      assert(w.nome.startsWith("ZZ [TESTE 20261019] "));
      for (const tela of ["desktop", "mobile"])
        for (const tipo of ["os", "orcamento"]) {
          let x = s.casos.find((x) => x.tela === tela && x.tipo === tipo);
          if (!x) {
            x = {
              tela,
              tipo,
              id: randomUUID(),
              chave: randomUUID(),
              icone:
                especialidades[perfil].tipos[tela === "desktop" ? 0 : 1] ||
                especialidades[perfil].tipos[0],
              data: tipo === "os" ? "2026-12-08T10:25" : "2026-12-09T15:40",
            };
            x.iconeNome = tiposServico[x.icone][0];
            s.casos.push(x);
            await save();
          }
          const ler = () =>
            rpc(
              auto
                ? tipo === "os"
                  ? "consultar_ordem_servico"
                  : "consultar_orcamento"
                : "consultar_detalhes_atendimento",
              auto
                ? tipo === "os"
                  ? { p_os: x.id }
                  : { p_orcamento: x.id, p_versao: null }
                : { p_atendimento: x.id },
            );
          if (conf) {
            assert(x.antes);
            const d = await ler();
            x.depois = d;
            const b = auto
                ? tipo === "os"
                  ? x.antes
                  : x.antes.versao
                : x.antes.atendimento,
              a = auto ? (tipo === "os" ? d : d.versao) : d.atendimento;
            const checks = [];
            const eq = (name, a, b) => {
              assert.deepEqual(a, b, perfil + " " + tela + " " + tipo + " " + name);
              checks.push(name);
            };
            eq(
              "ícone persistido",
              auto ? a.tipo_servico : a.dados.tipo_servico,
              x.icone,
            );
            eq(
              "prazo e fuso persistidos",
              Date.parse(auto ? a.entrega_prevista_em : a.dados.entrega_prevista_em),
              Date.parse(x.data + ":00-03:00"),
            );
            eq(
              "situação persistida",
              auto ? d.situacao : a.situacao,
              auto
                ? tipo === "os"
                  ? "in_progress"
                  : "awaiting_approval"
                : tipo === "os"
                  ? "aguardando"
                  : "aprovado",
            );
            for (const campo of auto
              ? [
                  "dados_cliente",
                  "dados_veiculo",
                  "desconto_centavos",
                  "total_centavos",
                ]
              : ["cliente_id", "objeto_id", "valor_centavos", "vencimento", "titulo"])
              eq(campo, a[campo], b[campo]);
            eq("itens preservados", d.itens, x.antes.itens);
            if (!auto) {
              eq(
                "observações preservadas",
                a.dados.observacoes_cliente,
                b.dados.observacoes_cliente,
              );
              eq(
                "desconto preservado",
                d.comercial.desconto_centavos,
                x.antes.comercial.desconto_centavos,
              );
              eq(
                "checklist preservado",
                a.ficha_especialidade.checklist,
                b.ficha_especialidade.checklist,
              );
            }
            x.verificacao = { ok: true, checks };
            await save();
          } else if (!x.antes) {
            const ficha = novaFichaEspecialidade(perfil);
            const tag = `QA A26 ${tipo} ${tela}`;
            if (auto) {
              if (!s.vinculo) {
                const base = JSON.parse(
                  await readFile(
                    "output/timeouts-concorrencia-26-20261116/antes-documentos-4/resultado.json",
                    "utf8",
                  ),
                ).docs.find((d) => d.perfil === perfil && d.tipo === "ordem");
                assert(base);
                const anterior = await rpc("consultar_ordem_servico", {
                  p_os: base.id,
                });
                s.vinculo = {
                  cliente_id: anterior.cliente_id,
                  veiculo_id: anterior.veiculo_id,
                };
                if (perfil === "retifica")
                  s.vinculo = {
                    cliente_nome_livre: "QA A26 Retífica",
                    carro_livre: "QA A26 Retífica",
                    motor_livre: "QA teste",
                  };
                await save();
              }
              if (perfil !== "retifica" && !x.veiculo) {
                const { data: clientes, error } = await api
                  .from("clientes")
                  .select("id")
                  .eq("oficina_id", c.empresa_id)
                  .is("arquivado_em", null)
                  .limit(1);
                assert.ifError(error);
                assert(clientes.length);
                x.cliente = clientes[0].id;
                x.veiculo = await rpc("cadastrar_veiculo_orcamento", {
                  p_cliente: x.cliente,
                  p_modelo: tag,
                  p_placa: null,
                });
                await save();
              }
              const dados = {
                ...s.vinculo,
                ...(x.veiculo
                  ? { cliente_id: x.cliente, veiculo_id: x.veiculo }
                  : { cliente_nome_livre: tag }),
                data_servico: "2026-11-27",
                ficha_especialidade: ficha,
                tipo_servico: null,
                observacoes: tag,
                queixa_cliente: tag,
                diagnostico: "Diagnóstico QA a preservar",
                condicoes: "Condições QA",
                desconto_centavos: 1000,
                itens: [
                  {
                    id: x.chave,
                    tipo: "service",
                    descricao: tag,
                    unidade: "un",
                    quantidade: 1,
                    preco_unitario_centavos: 15000,
                    situacao: "pending",
                  },
                ],
              };
              const d = await rpc(
                tipo === "os" ? "salvar_os_com_itens" : "salvar_orcamento",
                {
                  p_chave: x.chave,
                  p_dados: dados,
                  ...(tipo === "orcamento"
                    ? { p_orcamento: null, p_revisao: null }
                    : {}),
                },
              );
              x.id = d.id;
            } else {
              const sem = JSON.parse(
                await readFile(
                  `output/regressao-assistencia-manutencao-limpeza-20261116/sementes/${perfil}.json`,
                  "utf8",
                ),
              );
              await rpc("criar_atendimento_com_itens", {
                p_id: x.id,
                p_dados: {
                  cliente_id: sem.cliente,
                  objeto_id: sem.objeto,
                  titulo: tag,
                  data_servico: "2026-11-27",
                  vencimento: "2026-12-20",
                  situacao: tipo === "os" ? "aprovado" : "orcamento",
                  ficha_especialidade: ficha,
                  dados: {
                    documento: tipo === "os" ? "ordem" : "orcamento",
                    observacoes_cliente: "QA A26 preservar observações",
                    observacoes_internas: "QA A26 observação interna",
                  },
                },
                p_itens: [
                  {
                    id: x.chave,
                    tipo: "servico",
                    descricao: tag,
                    unidade: "un",
                    quantidade: 1,
                    preco_centavos: 15000,
                    origem: "externa",
                  },
                ],
                p_desconto: 1000,
              });
            }
            await save();
            x.antes = await ler();
            x.numero = auto ? x.antes.numero : x.antes.atendimento.numero;
            await save();
          }
        }
      s.ok = true;
      delete s.erro;
      await save();
      console.log(
        "PASS",
        perfil,
        s.casos.map((x) => `${x.tipo}/${x.tela} #${x.numero}`).join(", "),
      );
    } catch (e) {
      s.ok = false;
      s.erro = e.message;
      await save();
      console.log("FAIL", perfil, e.message);
    }
    resultados.push({
      perfil: s.perfil,
      ok: s.ok,
      erro: s.erro,
      casos: s.casos.map(({ antes, depois, ...x }) => x),
    });
  }
  await writeFile(
    `${root}/${conf ? "conferencia" : "sementes"}-resumo.json`,
    JSON.stringify(resultados, null, 2),
  );
  if (resultados.some((s) => !s.ok)) process.exitCode = 1;
} finally {
  await server.close();
}
