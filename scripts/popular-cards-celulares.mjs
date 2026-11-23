import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { novaFichaEspecialidade } from "../src/lib/perfisAtendimento.ts";
import {
  avancarAssistencia,
  pararAssistencia,
  etapaPainelAssistencia,
} from "../src/lib/fluxoAssistencia.ts";

// Somente a empresa fictícia solicitada. Sem chave administrativa e sem mensagens.
const lote = process.argv.includes("--lote=20261015") ? "20261015" : "20261019";
const empresa =
  lote === "20261015"
    ? "981410a7-c821-4335-a1dc-5b38cabcfa8f"
    : "592d98d7-a8d8-40ee-b6fd-d8ae572ab6ad";
const perfil = "assistencia_celulares";
const pasta = `output/validacao-celulares-20261021${lote === "20261015" ? "-conta15" : ""}`;
const aplicar = process.argv.includes("--aplicar");
const credenciais = JSON.parse(
  await readFile(`output/contas-teste/${lote}/credenciais.local.json`, "utf8"),
);
const conta = credenciais.contas.find((c) => c.especialidade === perfil);
assert.equal(credenciais.projeto, "hzihxtjirttetnfdujcx");
assert.equal(conta.empresa_id, empresa);
assert.equal(conta.empresa, `ZZ [TESTE ${lote}] Celulares e tablets`);
const env = Object.fromEntries(
  (await readFile(".env.local", "utf8"))
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const pos = l.indexOf("=");
      return [
        l.slice(0, pos),
        l
          .slice(pos + 1)
          .trim()
          .replace(/^['"]|['"]$/g, ""),
      ];
    }),
);
assert.equal(env.VITE_SUPABASE_URL, `https://${credenciais.projeto}.supabase.co`);
const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: {
    fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(30000) }),
  },
});
const { error: loginErro } = await client.auth.signInWithPassword({
  email: conta.email,
  password: conta.senha,
});
if (loginErro) throw Error(`Login da conta de teste: ${loginErro.message}`);
const rpc = async (nome, args = {}) => {
  const { data, error } = await client.rpc(nome, args);
  if (error) throw Error(`${nome}: ${error.message}`);
  return data;
};
const acesso = await rpc("consultar_meu_acesso");
assert.equal(acesso.length, 1);
assert.equal(acesso[0].id, empresa);
assert.equal(acesso[0].especialidade, perfil);
const cenarios = [
  [
    "Ana",
    "Samsung Galaxy A54",
    "Samsung",
    "Não liga após descarga da bateria",
    12000,
    "recebidos",
  ],
  [
    "Bruno",
    "Motorola Moto G84",
    "Motorola",
    "Troca de tela trincada",
    38000,
    "aprovacao",
  ],
  [
    "Carla",
    "iPhone 11",
    "Apple",
    "Troca de bateria e teste de autonomia",
    29000,
    "aprovados",
  ],
  [
    "Diego",
    "Redmi Note 12",
    "Xiaomi",
    "Reparo do conector de carga",
    22000,
    "producao",
  ],
  [
    "Elisa",
    "Samsung Galaxy A32",
    "Samsung",
    "Troca de display aguardando peça",
    34000,
    "parados",
  ],
  [
    "Ana",
    "iPhone 12",
    "Apple",
    "Troca do alto-falante e teste de áudio",
    18000,
    "prontos",
  ],
  ["Bruno", "iPad 9", "Apple", "Troca de vidro e teste do toque", 68000, "aprovacao"],
  [
    "Carla",
    "Motorola Moto G22",
    "Motorola",
    "Diagnóstico de oxidação na placa",
    15000,
    "parados",
  ],
  [
    "Diego",
    "Samsung Galaxy Tab A8",
    "Samsung",
    "Troca de bateria do tablet",
    26000,
    "producao",
  ],
  ["Elisa", "iPhone 13", "Apple", "Diagnóstico de câmera sem foco", 12000, "recebidos"],
];
await mkdir(pasta, { recursive: true });
const arquivo = `${pasta}/cenarios.json`;
let estado;
try {
  estado = JSON.parse(await readFile(arquivo, "utf8"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
estado ||= {
  empresa,
  email: conta.email,
  iniciadoEm: new Date().toISOString(),
  clientes: {},
  cenarios: cenarios.map(([cliente, equipamento, marca, servico, valor, etapa]) => ({
    cliente,
    equipamento,
    marca,
    servico,
    valor,
    etapa,
    id: randomUUID(),
    objeto: randomUUID(),
  })),
};
assert.equal(estado.empresa, empresa);
const salvar = () => writeFile(arquivo, JSON.stringify(estado, null, 2) + "\n");
await salvar();
if (aplicar) {
  for (const nome of new Set(cenarios.map((c) => c[0]))) {
    if (estado.clientes[nome]) continue;
    const nomeCompleto = `QA Cards 21/10 · ${nome}`;
    const encontrados = await rpc("buscar_cadastros_operacao", {
      p_oficina: empresa,
      p_tipo: "clientes",
      p_busca: nomeCompleto,
    });
    const c =
      encontrados.find((c) => c.nome === nomeCompleto) ||
      (await rpc("salvar_cliente", {
        p_oficina: empresa,
        p_dados: {
          nome: nomeCompleto,
          observacoes: "Cliente fictício para testes de cards. Não contatar.",
          endereco: "Endereço fictício de teste",
        },
      }));
    estado.clientes[nome] = c.id;
    await salvar();
  }
  for (const [i, c] of estado.cenarios.entries()) {
    if (c.preparado) continue;
    await rpc("salvar_objeto_atendimento", {
      p_oficina: empresa,
      p_id: c.objeto,
      p_dados: {
        cliente_id: estado.clientes[c.cliente],
        nome: c.equipamento,
        dados: {
          marca: c.marca,
          modelo: c.equipamento,
          serie: `QA-CARDS-${i + 1}`,
          condicao: "Aparelho fictício para homologação",
          acessorios: "Somente aparelho",
        },
      },
    });
    const ficha = novaFichaEspecialidade(perfil);
    ficha.campos = { defeito: c.servico, identificacao: `QA-CARDS-${i + 1}` };
    const dados = {
      cliente_id: estado.clientes[c.cliente],
      objeto_id: c.objeto,
      titulo: `QA Cards · ${c.servico}`,
      situacao: "orcamento",
      data_servico: "2026-10-21",
      vencimento: "2026-11-21",
      ficha_especialidade: ficha,
      dados: {
        documento: "ordem",
        orcamento_enviado: "nao",
        observacoes_cliente:
          "Atendimento fictício para testar o painel. Sem cobrança real.",
      },
    };
    const material = Math.round(c.valor * 0.6);
    await rpc("criar_atendimento_com_itens", {
      p_oficina: empresa,
      p_id: c.id,
      p_dados: dados,
      p_desconto: 0,
      p_itens: [
        {
          id: c.itemServico || (c.itemServico = randomUUID()),
          tipo: "servico",
          descricao: c.servico,
          quantidade: 1,
          unidade: "serv",
          preco_centavos: c.valor - material,
          custo_centavos: 0,
          origem: "externa",
        },
        {
          id: c.itemMaterial || (c.itemMaterial = randomUUID()),
          tipo: "material",
          descricao: "Componente para teste de orçamento",
          quantidade: 1,
          unidade: "un",
          preco_centavos: material,
          custo_centavos: 0,
          origem: "externa",
        },
      ],
    });
    for (let passo = 0; passo < 6; passo++) {
      const d = await rpc("consultar_detalhes_atendimento", {
        p_oficina: empresa,
        p_atendimento: c.id,
      });
      const a = d.atendimento;
      if (etapaPainelAssistencia(a) === c.etapa) {
        c.numero = a.numero;
        c.preparado = true;
        await salvar();
        break;
      }
      const proximo =
        c.etapa === "parados" && ["aprovado", "em_execucao"].includes(a.situacao)
          ? pararAssistencia(
              a,
              perfil,
              i === 4
                ? "Aguardando chegada do display solicitado"
                : "Cliente vai confirmar autorização para tratar oxidação",
            )
          : avancarAssistencia(a, perfil);
      await rpc("salvar_atendimento_servico", {
        p_oficina: empresa,
        p_id: c.id,
        p_revisao: a.revisao,
        p_dados: proximo,
      });
    }
    assert(c.preparado, `Cenário não chegou à etapa planejada: ${c.equipamento}`);
    console.log(`PREPARADO OS #${c.numero}: ${c.equipamento} · ${c.etapa}`);
  }
}
const verificacoes = [];
for (const fluxo of [
  "recebidos",
  "aprovacao",
  "aprovados",
  "producao",
  "parados",
  "prontos",
]) {
  const p = await rpc("pagina_servicos", {
    p_oficina: empresa,
    p_filtros: { tela: "atendimentos", fluxo, busca: "QA Cards" },
    p_apos: null,
  });
  verificacoes.push({
    fluxo,
    registros: p.atendimentos.map((a) => ({
      id: a.id,
      numero: a.numero,
      titulo: a.titulo,
    })),
  });
}
estado.verificacoes = verificacoes;
estado.verificadoEm = new Date().toISOString();
await salvar();
console.log(
  JSON.stringify(
    {
      empresa: conta.empresa,
      email: conta.email,
      aplicado: aplicar,
      quantidades: verificacoes.map((v) => ({
        etapa: v.fluxo,
        total: v.registros.length,
      })),
    },
    null,
    2,
  ),
);
