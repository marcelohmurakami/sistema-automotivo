// QA real, restrita às empresas fictícias do manifesto. Nunca recebe IDs livres.
// As decisões são feitas no navegador; este script prepara e confere os dados.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { conferirAcesso } from "./lib/contas-teste.mjs";
import { exemplosSubsistemas } from "../supabase/tests/subsistemas-fixture.mjs";
import { especialidades } from "../src/lib/especialidades.ts";
import { novaFichaEspecialidade } from "../src/lib/perfisAtendimento.ts";

const pasta = "output/links-todos-subsetores-20261026";
await mkdir(pasta, { recursive: true });
const arquivo = `${pasta}/${process.argv.includes("--intercorrencias") ? "intercorrencias" : "cenarios"}.local.json`;
const contas = JSON.parse(
  await readFile("output/contas-teste/20261019/credenciais.local.json", "utf8"),
);
const env = parseEnv(await readFile(".env.local", "utf8"));
assert.equal(contas.projeto, "hzihxtjirttetnfdujcx");
assert.equal(env.VITE_SUPABASE_URL, "https://hzihxtjirttetnfdujcx.supabase.co");
assert.equal(contas.contas.length, 26);
const opcoes = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: (u, i) => fetch(u, { ...i, signal: AbortSignal.timeout(30000) }) },
};
const cliente = () =>
  createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, opcoes);
const anon = cliente();
let admin;
async function administrador() {
  if (!admin) {
    const conf = parseEnv(
      await readFile("output/contas-teste/admin.env.local", "utf8"),
    );
    assert(
      conf.SUPABASE_SERVICE_ROLE_KEY,
      "Chave administrativa local necessária só para simular expiração de links fictícios.",
    );
    admin = createClient(env.VITE_SUPABASE_URL, conf.SUPABASE_SERVICE_ROLE_KEY, opcoes);
  }
  return admin;
}
let estado = {
  origem: "https://patio-gestao-peach.vercel.app",
  criado_em: new Date().toISOString(),
  casos: [],
};
try {
  estado = JSON.parse(await readFile(arquivo, "utf8"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const salvar = () => writeFile(arquivo, JSON.stringify(estado, null, 2));
const hash = (s) => createHash("sha256").update(s).digest("hex");
const rpc = async (c, n, a) => {
  const { data, error } = await c.rpc(n, a);
  if (error) throw Error(`${n}: ${error.code} ${error.message}`);
  return data;
};
const filtro = process.argv.includes("--perfil")
  ? process.argv[process.argv.indexOf("--perfil") + 1]
  : null;
const selecionadas = contas.contas.filter((c) => !filtro || c.especialidade === filtro);
assert(selecionadas.length, "Subsetor não encontrado.");
const casosEsperados = process.argv.includes("--intercorrencias")
  ? ["selecao", "expira_aberto", "revoga_aberto"]
  : ["total", "parcial", "recusa", "expirado", "revogado"];

for (const conta of selecionadas) {
  assert(conta.empresa.startsWith("ZZ [TESTE 20261019] "));
  assert.equal(conta.email, `qa.20261019.${conta.especialidade}@example.com`);
  const c = cliente();
  const login = await c.auth.signInWithPassword({
    email: conta.email,
    password: conta.senha,
  });
  if (login.error) throw Error(`Login QA ${conta.especialidade}: ${login.error.code}`);
  try {
    conferirAcesso(await rpc(c, "consultar_meu_acesso", {}), conta, true);
    for (const tipo of casosEsperados) {
      let caso = estado.casos.find(
        (x) => x.especialidade === conta.especialidade && x.tipo === tipo,
      );
      if (
        process.argv.includes("--invalidar-aberto") &&
        ["expira_aberto", "revoga_aberto"].includes(tipo)
      ) {
        assert(caso?.preparado);
        const auto = conta.ramo === "automotivo";
        if (tipo === "expira_aberto") {
          const a = await administrador();
          const { data, error } = await a
            .from(auto ? "tokens_acesso_orcamento" : "links_proposta_atendimento")
            .update({
              expira_em: "2026-10-25T00:00:00Z",
              ...(auto ? { criado_em: "2026-10-24T00:00:00Z" } : {}),
            })
            .eq("oficina_id", conta.empresa_id)
            .eq("hash_token", hash(caso.token))
            .select("id");
          if (error) throw Error(`Expiração QA: ${error.code}`);
          assert.equal(data.length, 1);
        } else if (auto)
          await rpc(c, "revisar_orcamento", {
            p_oficina: conta.empresa_id,
            p_orcamento: caso.id,
            p_revisao: caso.revisao,
          });
        else
          await rpc(c, "revogar_links_proposta_atendimento", {
            p_oficina: conta.empresa_id,
            p_atendimento: caso.id,
          });
        console.log("INVALIDADO", conta.especialidade, tipo);
      }
      if (process.argv.includes("--preparar")) {
        if (!caso) {
          caso = {
            especialidade: conta.especialidade,
            ramo: conta.ramo,
            empresa: conta.empresa,
            empresa_id: conta.empresa_id,
            tipo,
            chave: randomUUID(),
            id: randomUUID(),
            objeto_id: randomUUID(),
            token: randomBytes(32).toString("hex"),
          };
          estado.casos.push(caso);
          await salvar();
        }
        if (!caso.preparado) {
          const [objeto, servico, material] = exemplosSubsistemas[conta.especialidade];
          const nome = `QA Links 26/10 · ${conta.nome} · ${tipo}`;
          if (!caso.cliente_id) {
            const achados = await rpc(c, "buscar_cadastros_operacao", {
              p_oficina: conta.empresa_id,
              p_tipo: "clientes",
              p_busca: nome,
            });
            const cli =
              achados.find((x) => x.nome === nome) ||
              (await rpc(c, "salvar_cliente", {
                p_oficina: conta.empresa_id,
                p_dados: {
                  nome,
                  observacoes: "Dado fictício de homologação. Não contatar.",
                },
              }));
            caso.cliente_id = cli.id;
            await salvar();
          }
          const principal = [
            {
              descricao: servico,
              preco: 10000,
              tipo: "servico",
              grupo: "Serviço principal",
            },
            {
              descricao: material,
              preco: 5000,
              tipo: "material",
              grupo: "Serviço principal",
            },
            {
              descricao: `Complemento opcional · ${servico}`,
              preco: 10000,
              tipo: "servico",
              grupo: "Adicional",
            },
          ];
          if (conta.ramo === "automotivo") {
            if (!caso.veiculo_id) {
              caso.veiculo_id = await rpc(c, "cadastrar_veiculo_orcamento", {
                p_oficina: conta.empresa_id,
                p_cliente: caso.cliente_id,
                p_modelo: objeto,
                p_placa: null,
              });
              await salvar();
            }
            if (!caso.criado) {
              const q = await rpc(c, "salvar_orcamento", {
                p_oficina: conta.empresa_id,
                p_chave: caso.chave,
                p_dados: {
                  cliente_id: caso.cliente_id,
                  veiculo_id: caso.veiculo_id,
                  data_servico: "2026-10-26",
                  tipo_servico: especialidades[conta.especialidade].tipos[0],
                  ficha_especialidade: novaFichaEspecialidade(conta.especialidade),
                  observacoes: `QA Links 26/10 · ${tipo}. Sem serviço ou cobrança real.`,
                  condicoes: "Executar somente os grupos autorizados.",
                  desconto_centavos: 2500,
                  itens: principal.map((i) => ({
                    tipo: i.tipo === "servico" ? "service" : "part",
                    descricao: i.descricao,
                    quantidade: 1,
                    unidade: "un",
                    preco_unitario_centavos: i.preco,
                    grupo_servico: i.grupo,
                    depende_grupo: i.grupo === "Adicional" ? "Serviço principal" : "",
                    custo_unitario_previsto_centavos: 1234,
                  })),
                },
              });
              caso.id = q.id;
              caso.numero = q.numero;
              caso.versao_id = q.versao.id;
              caso.revisao = q.revisao;
              caso.criado = true;
              await salvar();
            }
            if (!caso.link_criado) {
              const q = await rpc(c, "emitir_orcamento", {
                p_oficina: conta.empresa_id,
                p_orcamento: caso.id,
                p_revisao: caso.revisao,
                p_validade_dias: 7,
                p_hash_token: hash(caso.token),
              });
              caso.revisao = q.revisao;
              caso.link_criado = true;
              await salvar();
            }
            caso.url = `${estado.origem}/proposta#${caso.token}`;
          } else {
            if (!caso.criado) {
              await rpc(c, "salvar_objeto_atendimento", {
                p_oficina: conta.empresa_id,
                p_id: caso.objeto_id,
                p_dados: {
                  cliente_id: caso.cliente_id,
                  nome: objeto,
                  dados: { observacoes: "QA fictício" },
                },
              });
              await rpc(c, "criar_atendimento_com_itens", {
                p_oficina: conta.empresa_id,
                p_id: caso.id,
                p_dados: {
                  cliente_id: caso.cliente_id,
                  objeto_id: caso.objeto_id,
                  titulo: `QA Links 26/10 · ${tipo} · ${servico}`,
                  situacao: "orcamento",
                  data_servico: "2026-10-26",
                  vencimento: "2026-10-26",
                  ficha_especialidade: novaFichaEspecialidade(conta.especialidade),
                  dados: {
                    documento: "orcamento",
                    orcamento_enviado: "sim",
                    nota_interna: "QA_PRIVADO_NAO_PUBLICAR",
                  },
                },
                p_itens: principal.map((i) => ({
                  id: randomUUID(),
                  tipo: i.tipo,
                  descricao: i.descricao,
                  quantidade: 1,
                  unidade: "un",
                  preco_centavos: i.preco,
                  custo_centavos: 1234,
                  origem: "externa",
                  grupo_servico: i.grupo,
                  depende_grupo: i.grupo === "Adicional" ? "Serviço principal" : "",
                })),
                p_desconto: 2500,
              });
              const d = await rpc(c, "consultar_detalhes_atendimento", {
                p_oficina: conta.empresa_id,
                p_atendimento: caso.id,
              });
              caso.numero = d.atendimento.numero;
              caso.revisao = d.atendimento.revisao;
              caso.criado = true;
              await salvar();
            }
            if (!caso.link_criado) {
              const l = await rpc(c, "gerar_link_proposta_atendimento", {
                p_oficina: conta.empresa_id,
                p_atendimento: caso.id,
                p_revisao: caso.revisao,
                p_hash_token: hash(caso.token),
                p_validade_dias: 7,
              });
              caso.proposta_id = l.proposta_id;
              caso.link_criado = true;
              await salvar();
            }
            caso.url = `${estado.origem}/aprovar-servico#${caso.token}`;
          }
          if (tipo === "expirado") {
            // Altera apenas a validade deste link QA, sem relógio falso no navegador.
            const a = await administrador();
            const tabela =
              conta.ramo === "automotivo"
                ? "tokens_acesso_orcamento"
                : "links_proposta_atendimento";
            const validade = {
              expira_em: "2026-10-25T00:00:00Z",
              ...(conta.ramo === "automotivo"
                ? { criado_em: "2026-10-24T00:00:00Z" }
                : {}),
            };
            const { data, error } = await a
              .from(tabela)
              .update(validade)
              .eq("oficina_id", conta.empresa_id)
              .eq("hash_token", hash(caso.token))
              .select("id");
            if (error) throw Error(`Expiração QA: ${error.code}`);
            assert.equal(data.length, 1);
          } else if (tipo === "revogado") {
            if (conta.ramo === "automotivo")
              await rpc(c, "revisar_orcamento", {
                p_oficina: conta.empresa_id,
                p_orcamento: caso.id,
                p_revisao: caso.revisao,
              });
            else
              await rpc(c, "revogar_links_proposta_atendimento", {
                p_oficina: conta.empresa_id,
                p_atendimento: caso.id,
              });
          }
          caso.preparado = true;
          await salvar();
        }
        console.log("PREPARADO", conta.especialidade, tipo, caso.numero);
      }
      if (process.argv.includes("--conferir")) {
        assert(caso?.preparado, "Cenário não preparado");
        const auto = conta.ramo === "automotivo";
        const d = await rpc(
          c,
          auto ? "consultar_orcamento" : "consultar_detalhes_atendimento",
          auto
            ? { p_oficina: conta.empresa_id, p_orcamento: caso.id }
            : { p_oficina: conta.empresa_id, p_atendimento: caso.id },
        );
        const aceito = tipo === "total" || tipo === "parcial";
        const p = auto
          ? d.aprovacao
          : d.propostas.find((x) => x.id === caso.proposta_id);
        if (aceito || tipo === "recusa") {
          assert(p, "Resposta deve existir");
          assert.equal(
            p.decisao,
            auto
              ? aceito
                ? "approved"
                : "declined"
              : aceito
                ? "aprovado"
                : "recusado",
          );
          assert.equal(
            p.total_aprovado_centavos,
            aceito ? (tipo === "total" ? 22500 : 13500) : 0,
          );
          assert.equal(p.nome_informado, `Cliente QA ${conta.especialidade} ${tipo}`);
          assert.equal(
            auto ? d.versao.total_centavos : p.documento.total_centavos,
            22500,
          );
          assert.equal(auto ? d.itens.length : p.documento.itens.length, 3);
          assert.deepEqual(
            [...p.grupos_aprovados].sort(),
            aceito
              ? tipo === "total"
                ? ["Adicional", "Serviço principal"]
                : ["Serviço principal"]
              : [],
          );
        } else assert(!p?.decisao, "Link bloqueado não pode ter decisão");
        if (auto) {
          assert.equal(
            d.situacao,
            aceito
              ? "approved"
              : tipo === "recusa"
                ? "declined"
                : tipo === "revogado"
                  ? "draft"
                  : "awaiting_approval",
          );
          if (aceito) {
            const os = await rpc(c, "converter_orcamento_em_os", {
              p_oficina: conta.empresa_id,
              p_orcamento: caso.id,
            });
            assert.equal(
              await rpc(c, "converter_orcamento_em_os", {
                p_oficina: conta.empresa_id,
                p_orcamento: caso.id,
              }),
              os,
            );
            const ordem = await rpc(c, "consultar_ordem_servico", {
              p_oficina: conta.empresa_id,
              p_os: os,
            });
            assert.equal(ordem.total_centavos, tipo === "total" ? 22500 : 13500);
            assert.equal(ordem.itens.length, tipo === "total" ? 3 : 2);
            caso.os_id = os;
          } else assert.equal(d.ordem_servico_id, null);
        } else {
          assert.equal(d.atendimento.situacao, aceito ? "aprovado" : "orcamento");
          assert.equal(d.atendimento.dados.documento, aceito ? "ordem" : "orcamento");
          assert.equal(d.itens.length, tipo === "parcial" ? 2 : 3);
          assert.equal(
            d.atendimento.valor_centavos,
            tipo === "parcial" ? 13500 : 22500,
          );
          if (tipo === "recusa") assert(d.atendimento.dados.orcamento_recusado_em);
        }
        const publico = await anon.rpc(
          auto ? "consultar_orcamento_publico" : "consultar_proposta_atendimento",
          { p_token: caso.token },
        );
        if (["expirado", "revogado"].includes(tipo))
          assert.equal(publico.error?.code, "P0002");
        else {
          assert(!publico.error);
          for (const segredo of [
            "custo_centavos",
            "custo_unitario_previsto_centavos",
            "QA_PRIVADO_NAO_PUBLICAR",
          ])
            assert(!JSON.stringify(publico.data).includes(segredo));
        }
        if (process.argv.includes("--seguranca")) {
          const fn = auto
            ? "responder_grupos_orcamento"
            : "responder_link_proposta_atendimento";
          const grupos = aceito
            ? tipo === "total"
              ? ["Adicional", "Serviço principal"]
              : ["Serviço principal"]
            : [];
          const resposta = {
            p_token: caso.token,
            p_nome: `Cliente QA ${conta.especialidade} ${tipo}`,
            p_decisao: auto
              ? aceito
                ? "approved"
                : "declined"
              : aceito
                ? "aprovado"
                : "recusado",
            p_grupos: grupos,
            p_confirmo: true,
          };
          if (["expirado", "revogado"].includes(tipo)) {
            for (const aprovar of [true, false]) {
              const r = await anon.rpc(fn, {
                ...resposta,
                p_decisao: auto
                  ? aprovar
                    ? "approved"
                    : "declined"
                  : aprovar
                    ? "aprovado"
                    : "recusado",
                p_grupos: ["Serviço principal"],
              });
              assert.equal(
                r.error?.code,
                "P0002",
                "Link bloqueado não pode receber decisão via API",
              );
            }
          } else {
            const repetida = await anon.rpc(fn, resposta);
            assert(!repetida.error, "Repetir a mesma decisão deve ser idempotente");
            assert.equal(
              auto
                ? repetida.data.aprovacao.confirmado_em
                : repetida.data.confirmado_em,
              p.confirmado_em,
            );
            const conflitante = await anon.rpc(fn, {
              ...resposta,
              p_nome: "Outra pessoa QA",
            });
            assert(
              ["22023", "PT409"].includes(conflitante.error?.code),
              "Outra decisão não pode sobrescrever a anterior",
            );
            const semConfirmacao = await anon.rpc(fn, {
              ...resposta,
              p_confirmo: false,
            });
            assert.equal(
              semConfirmacao.error?.code,
              "22023",
              "Confirmação explícita obrigatória",
            );
          }
          caso.seguranca_conferida = true;
        }
        caso.conferido_em = new Date().toISOString();
        await salvar();
        console.log("CONFERIDO", conta.especialidade, tipo, caso.numero);
      }
    }
  } finally {
    await c.auth.signOut();
  }
}
await writeFile(
  `${pasta}/${process.argv.includes("--intercorrencias") ? "resumo-intercorrencias" : "resumo"}.json`,
  JSON.stringify(
    {
      origem: estado.origem,
      criado_em: estado.criado_em,
      casos: estado.casos.map(
        ({
          especialidade,
          ramo,
          tipo,
          numero,
          preparado,
          conferido_em,
          seguranca_conferida,
        }) => ({
          especialidade,
          ramo,
          tipo,
          numero,
          preparado,
          conferido_em,
          seguranca_conferida,
        }),
      ),
    },
    null,
    2,
  ),
);
