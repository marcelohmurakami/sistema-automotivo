// Rotinas fictícias, somente nas empresas do lote de teste explicitamente escolhido.
// Credenciais ficam em output/contas-teste; nunca são incluídas nos resultados.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { parseEnv } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { criarBancoLocal } from "../supabase/tests/banco-local.mjs";
import { especialidades } from "../src/lib/especialidades.ts";
import { novaFichaEspecialidade } from "../src/lib/perfisAtendimento.ts";
import { concluirReparo, registrarRetirada } from "../src/lib/assistenciaTecnica.ts";
import { exemplosSubsistemas } from "../supabase/tests/subsistemas-fixture.mjs";
import { cenariosEspecialidades } from "../supabase/tests/cenarios-especialidades.mjs";

const argv = process.argv.slice(2),
  lote = argv.find((a) => a.startsWith("--lote="))?.slice(7);
assert(
  argv.includes("--aplicar") && /^\d{8}$/.test(lote || ""),
  "Uso: --lote=AAAAMMDD --aplicar [--perfil=ID] [--sem-conflitos]",
);
assert(
  argv.every(
    (a) =>
      a === "--aplicar" ||
      a === "--sem-conflitos" ||
      /^--lote=\d{8}$/.test(a) ||
      /^--perfil=[a-z_]+$/.test(a),
  ),
  "Argumento desconhecido",
);
const filtro = argv.find((a) => a.startsWith("--perfil="))?.slice(9);
const testarConflitos = !argv.includes("--sem-conflitos");
const pasta = resolve("output", `auditoria-pos-refatoracao-${lote}`);
await mkdir(pasta, { recursive: true });
const credenciais = JSON.parse(
  await readFile(
    resolve("output/contas-teste", lote, "credenciais.local.json"),
    "utf8",
  ),
);
assert.equal(credenciais.projeto, "hzihxtjirttetnfdujcx");
assert.equal(credenciais.lote, lote);
assert.equal(credenciais.contas.length, Object.keys(especialidades).length);
const config = parseEnv(await readFile(".env.local", "utf8"));
assert.equal(config.VITE_SUPABASE_URL, `https://${credenciais.projeto}.supabase.co`);
process.env.DB_VALIDATION_RUNTIME ||= resolve(
  "node_modules/@electric-sql/pglite/dist/index.js",
);
process.env.DB_VALIDATION_MIGRATION_LIMIT ||= "20261019001100";
const schema = await criarBancoLocal();
const assinaturas = (
  await schema.query(
    "select p.proname,p.proargnames,p.pronargs,p.pronargdefaults from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'",
  )
).rows;
await schema.close();
const estadoArquivo = resolve(pasta, "rotinas-remotas.json");
let estado;
try {
  estado = JSON.parse(await readFile(estadoArquivo, "utf8"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
  estado = {
    lote,
    projeto: credenciais.projeto,
    iniciadoEm: new Date().toISOString(),
    perfis: {},
  };
}
assert.equal(estado.lote, lote);
assert.equal(estado.projeto, credenciais.projeto);
const salvar = () => writeFile(estadoArquivo, JSON.stringify(estado, null, 2) + "\n");
// Retomar o mesmo lote após a meia-noite não pode alterar pagamentos ou reservas.
const hoje =
  (estado.dataCenario ||= `${lote.slice(0, 4)}-${lote.slice(4, 6)}-${lote.slice(6, 8)}`);
const mes = hoje.slice(0, 8) + "01";
const fimRelatorio = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Sao_Paulo",
}).format(new Date());
let falhas = 0;
for (const conta of credenciais.contas.filter(
  (c) => !filtro || c.especialidade === filtro,
)) {
  assert.equal(conta.status, "conferida");
  assert.equal(conta.empresa, `ZZ [TESTE ${lote}] ${conta.nome}`);
  const perfil = conta.especialidade,
    e = especialidades[perfil],
    w = conta.empresa_id;
  const s = (estado.perfis[perfil] ||= {
    empresa: w,
    ids: {},
    acoes: {},
    verificacoes: [],
  });
  assert.equal(s.empresa, w);
  if (!testarConflitos && s.status === "aprovado_sem_conflitos") {
    console.log(`JÁ CONFERIDO ${perfil}: reteste de conflito permanece pendente.`);
    continue;
  }
  const cliente = createClient(
    config.VITE_SUPABASE_URL,
    config.VITE_SUPABASE_PUBLISHABLE_KEY,
    {
      global: {
        fetch: (url, init) =>
          fetch(url, {
            ...init,
            signal: init?.signal
              ? AbortSignal.any([init.signal, AbortSignal.timeout(30_000)])
              : AbortSignal.timeout(30_000),
          }),
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
  let autenticacao;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    autenticacao = await cliente.auth.signInWithPassword({
      email: conta.email,
      password: conta.senha,
    });
    if (
      !autenticacao.error ||
      (autenticacao.error.status > 0 && autenticacao.error.status < 500)
    )
      break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (autenticacao.error) {
    falhas++;
    s.status = "falhou";
    s.erro = {
      mensagem: "Falha de autenticação na auditoria",
      codigo: autenticacao.error.code || autenticacao.error.name,
      status: autenticacao.error.status,
    };
    await salvar();
    console.log(`FALHOU ${perfil}: autenticação ${s.erro.codigo} (${s.erro.status})`);
    continue;
  }
  const call = async (fn, ...args) => {
    const candidatas = assinaturas.filter(
      (a) =>
        a.proname === fn &&
        args.length <= a.pronargs &&
        args.length >= a.pronargs - a.pronargdefaults,
    );
    assert.equal(candidatas.length, 1, `Assinatura ambígua: ${fn}`);
    const params = Object.fromEntries(
      args.map((v, i) => [candidatas[0].proargnames[i], v]),
    );
    if ("p_oficina" in params)
      assert.equal(params.p_oficina, w, "Operação fora da empresa do lote");
    const inicio = performance.now();
    const { data, error, status } = await cliente
      .rpc(fn, params)
      .abortSignal(AbortSignal.timeout(30_000))
      .retry(false);
    if (error) {
      if (error.code === "PT409") {
        (s.conflitosRevisao ||= []).push({
          funcao: fn,
          codigo: error.code,
          http: status,
          duracaoMs: Math.round(performance.now() - inicio),
          conferidoEm: new Date().toISOString(),
        });
      }
      throw Object.assign(new Error(`${fn}: ${error.message}`), {
        code: error.code,
        status,
      });
    }
    return data;
  };
  const id = (nome) => (s.ids[nome] ||= randomUUID());
  const executar = async (nome, fn, ...args) => {
    if (s.acoes[nome]) return s.acoes[nome].retorno;
    await salvar();
    const retorno = await call(fn, ...args);
    s.acoes[nome] = { funcao: fn, retorno, concluidaEm: new Date().toISOString() };
    await salvar();
    return retorno;
  };
  const confirmar = (nome) => {
    if (!s.verificacoes.includes(nome)) s.verificacoes.push(nome);
  };
  try {
    const acessos = await call("consultar_meu_acesso");
    assert.equal(acessos.length, 1);
    assert.equal(acessos[0].id, w);
    assert.equal(acessos[0].especialidade, perfil);
    confirmar("Login real e isolamento da empresa");
    const [nomeObjeto, servico, material] = exemplosSubsistemas[perfil],
      cenario = cenariosEspecialidades[perfil];
    const cliente1 = await executar("cliente-principal", "salvar_cliente", w, {
      nome: `QA ${lote} Ana · ${conta.nome}`,
      email: `cliente.${perfil}@example.com`,
      endereco: "Rua de Teste, 123 — endereço fictício",
      observacoes: "Cadastro fictício para auditoria; não contatar.",
    });
    await executar("cliente-secundario", "salvar_cliente", w, {
      nome: `QA ${lote} Bruno · ${conta.nome}`,
      observacoes: "Cliente fictício para conferir troca de cadastro.",
    });
    const clientes = await call("buscar_cadastros_operacao", w, "clientes", "Ana");
    assert(clientes.some((c) => c.id === cliente1.id));
    confirmar("Busca e identificação do cliente");
    const fracionado = perfil === "troca_oleo" || e.ramo === "limpeza";
    const quantidade = perfil === "troca_oleo" ? 4.5 : e.ramo === "limpeza" ? 0.25 : 1;
    const unidade = fracionado ? "l" : "un",
      produto = id("produto");
    await executar(
      "produto",
      "salvar_produto_estoque",
      w,
      {
        descricao: `QA ${material}`,
        unidade,
        codigo: `AUD-${perfil}`,
        custo_centavos: 2000,
        preco_padrao_centavos: 5000,
        minimo: 2,
      },
      produto,
    );
    await executar(
      "entrada-estoque",
      "movimentar_estoque",
      w,
      produto,
      "entrada",
      10,
      "Estoque fictício da auditoria",
      id("entrada"),
      1,
    );
    await executar("catalogo", "salvar_item_catalogo", w, id("catalogo"), {
      descricao: `QA ${servico}`,
      tipo: "service",
      unidade: "un",
      preco_padrao_centavos: 10000,
    });
    await executar("funcionario", "salvar_funcionario", w, id("funcionario"), {
      nome: `QA Profissional · ${conta.nome}`,
      funcao: e.ramo === "limpeza" ? "Auxiliar de limpeza" : "Técnico",
      ativo: true,
      observacoes: "Pessoa fictícia da auditoria.",
    });
    const catalogo = await call(
      "buscar_cadastros_operacao",
      w,
      "catalogo",
      `AUD-${perfil}`,
    );
    assert(catalogo.some((p) => p.id === produto));
    confirmar("Busca do produto por código de estoque");
    const ficha = { ...novaFichaEspecialidade(perfil), campos: { ...cenario.entrada } };
    const doCliente = perfil === "acessorios";
    let atendimento,
      proposta,
      total = 10000 + (doCliente ? 0 : Math.round(quantidade * 5000)),
      get,
      titulo;
    if (e.ramo === "automotivo") {
      const objeto = await executar(
        "veiculo",
        "cadastrar_veiculo_orcamento",
        w,
        cliente1.id,
        nomeObjeto,
        null,
      );
      proposta = await executar(
        "orcamento",
        "salvar_orcamento",
        w,
        {
          cliente_id: cliente1.id,
          veiculo_id: objeto,
          tipo_servico: {
            mecanica: "freios",
            retifica: "cabecote",
            autoeletrica: "eletrica",
            autocenter: "alinhamento",
            borracharia: "pneus",
            estetica: "polimento",
            lava_rapido: "lavagem",
            troca_oleo: "oleo",
            acessorios: "acessorios",
            funilaria: "pintura",
          }[perfil],
          ficha_especialidade: ficha,
          observacoes: "QA · Dados fictícios. Serviço simulado.",
          desconto_centavos: 0,
          itens: [
            {
              tipo: "service",
              descricao: servico,
              unidade: "un",
              quantidade: 1,
              preco_unitario_centavos: 10000,
            },
            {
              tipo: "part",
              descricao: material,
              unidade,
              quantidade,
              preco_unitario_centavos: doCliente ? 0 : 5000,
            },
          ],
        },
        id("chave-orcamento"),
      );
      await executar(
        "emitir",
        "emitir_orcamento",
        w,
        proposta.id,
        proposta.revisao,
        7,
        createHash("sha256").update(id("token")).digest("hex"),
      );
      let p = await call("consultar_orcamento", w, proposta.id);
      await executar(
        "aprovar",
        "aprovar_orcamento_interno",
        w,
        proposta.id,
        p.revisao,
        p.versao_atual_id,
      );
      atendimento = await executar(
        "converter",
        "converter_orcamento_em_os",
        w,
        proposta.id,
      );
      assert.equal(
        await call("converter_orcamento_em_os", w, proposta.id),
        atendimento,
      );
      confirmar("Aprovação e conversão sem OS duplicada");
      get = () => call("consultar_ordem_servico", w, atendimento);
      let os = await get();
      await executar(
        "ficha-saida",
        "salvar_ordem_servico",
        w,
        {
          ficha_especialidade: {
            ...ficha,
            campos: { ...cenario.entrada, ...cenario.saida },
          },
        },
        id("ficha"),
        atendimento,
        os.revisao,
      );
      os = await get();
      const peca = os.itens.find((i) => i.tipo === "part");
      await executar(
        "origem-peca",
        "vincular_estoque_item_os",
        w,
        atendimento,
        peca.id,
        doCliente ? null : produto,
        doCliente ? "cliente" : "estoque",
        os.revisao,
      );
      const parada = await executar(
        "parada",
        "registrar_parada_os",
        w,
        atendimento,
        "approval",
        "QA · Aguardando autorização do serviço adicional",
      );
      await executar("retomar", "resolver_parada_os", w, atendimento, parada);
      confirmar("Parada e retomada preservadas no histórico");
      for (const i of (await get()).itens) {
        os = await get();
        await executar(
          "concluir-item-" + i.id,
          "salvar_item_os",
          w,
          atendimento,
          os.revisao,
          { situacao: "done" },
          i.id,
        );
      }
      for (const status of ["in_progress", "quality_check", "ready", "delivered"]) {
        os = await get();
        await executar(
          "etapa-" + status,
          "atualizar_mapa_ordem_servico",
          w,
          atendimento,
          os.revisao,
          status,
          null,
          null,
          null,
          new Date().toISOString(),
        );
      }
      const final = await get();
      assert.equal(final.situacao, "delivered");
      assert.equal(final.total_centavos, total);
      assert.equal(final.ficha_especialidade.especialidade, perfil);
      assert.deepEqual(
        (await call("consultar_orcamento", w, proposta.id)).versao.ficha_especialidade
          .campos,
        cenario.entrada,
      );
      confirmar("Ficha da OS não modifica o orçamento aprovado");
      titulo = await executar("faturar", "preparar_financeiro_os", w, atendimento);
    } else {
      const objeto = id("objeto");
      atendimento = id("atendimento");
      await executar("objeto", "salvar_objeto_atendimento", w, objeto, {
        cliente_id: cliente1.id,
        nome: nomeObjeto,
        dados:
          e.ramo === "assistencia_tecnica"
            ? {
                marca: "Marca fictícia",
                modelo: "Modelo de teste",
                serie: "QA-" + perfil,
              }
            : { endereco: "Rua de Teste, 123 — endereço fictício", contato: "Ana QA" },
      });
      await executar(
        "recurso",
        "salvar_recurso_agenda",
        w,
        id("recurso"),
        "QA Profissional / equipe 1",
        true,
      );
      await executar("atendimento", "salvar_atendimento_servico", w, atendimento, {
        cliente_id: cliente1.id,
        objeto_id: objeto,
        titulo: servico,
        situacao: "orcamento",
        valor_centavos: total,
        data_servico: hoje,
        vencimento: hoje,
        dados: {
          tipo_servico: e.tipos[0],
          observacoes_cliente: "QA · Serviço e valores fictícios.",
        },
        ficha_especialidade: ficha,
      });
      get = () => call("consultar_detalhes_atendimento", w, atendimento);
      let d = await get();
      await executar(
        "itens",
        "salvar_itens_atendimento",
        w,
        atendimento,
        d.atendimento.revisao,
        [
          {
            id: id("item-servico"),
            tipo: "servico",
            descricao: servico,
            quantidade: 1,
            unidade: "un",
            preco_centavos: 10000,
            custo_centavos: 3000,
            origem: "externa",
          },
          {
            id: id("item-material"),
            tipo: "material",
            descricao: material,
            quantidade,
            unidade,
            preco_centavos: 5000,
            origem: "estoque",
            produto_id: produto,
          },
        ],
        0,
        0,
        "",
      );
      for (const situacao of ["aprovado", "em_execucao", "aguardando"]) {
        d = await get();
        await executar(
          "situacao-" + situacao,
          "salvar_atendimento_servico",
          w,
          atendimento,
          { ...d.atendimento, situacao },
          d.atendimento.revisao,
        );
      }
      d = await get();
      await executar(
        "retomar",
        "salvar_atendimento_servico",
        w,
        atendimento,
        { ...d.atendimento, situacao: "em_execucao" },
        d.atendimento.revisao,
      );
      d = await get();
      await executar(
        "equipe",
        "salvar_equipe_atendimento",
        w,
        atendimento,
        d.atendimento.revisao,
        [
          {
            funcionario_id: id("funcionario"),
            percentual: 10,
            custo_hora_centavos: 2500,
          },
        ],
      );
      const inicio = new Date(Date.now() - 7200000).toISOString(),
        fim = new Date(Date.now() - 3600000).toISOString();
      await executar(
        "horas",
        "registrar_horas_atendimento",
        w,
        atendimento,
        id("horas"),
        id("funcionario"),
        inicio,
        fim,
        "QA · Uma hora fictícia de execução",
      );
      d = await get();
      const atual = {
        ...d.atendimento,
        ficha_especialidade: {
          ...ficha,
          campos: { ...cenario.entrada, ...cenario.saida },
        },
      };
      const pronto =
        e.ramo === "assistencia_tecnica"
          ? concluirReparo(atual, perfil)
          : { ...atual, situacao: "concluido" };
      await executar(
        "concluir",
        "salvar_atendimento_servico",
        w,
        atendimento,
        pronto,
        d.atendimento.revisao,
      );
      d = await get();
      const entregue =
        e.ramo === "assistencia_tecnica"
          ? registrarRetirada(d.atendimento, "Ana QA", perfil)
          : {
              ...d.atendimento,
              ficha_especialidade: {
                ...d.atendimento.ficha_especialidade,
                campos: {
                  ...d.atendimento.ficha_especialidade.campos,
                  situacao_aceite: "Aceito",
                  aceite: "Ana QA",
                  data_aceite: hoje,
                },
              },
            };
      await executar(
        "entregar-aceitar",
        "salvar_atendimento_servico",
        w,
        atendimento,
        entregue,
        d.atendimento.revisao,
      );
      d = await get();
      assert.equal(d.atendimento.situacao, "concluido");
      assert.equal(d.atendimento.valor_centavos, total);
      assert.equal(d.atendimento.ficha_especialidade.especialidade, perfil);
      confirmar("Execução, equipe, horas e aceite/retirada do subsetor");
      titulo = await executar("faturar", "faturar_atendimento_servico", w, atendimento);
      assert.equal(await call("faturar_atendimento_servico", w, atendimento), titulo);
      confirmar("Cobrança sem duplicação");
      const agenda = {
        atendimento_id: atendimento,
        recurso_id: id("recurso"),
        inicio: hoje + "T22:00:00-03:00",
        fim: hoje + "T23:00:00-03:00",
        situacao: "agendado",
        observacoes: "QA · Retorno de conferência fictício",
      };
      await executar("agenda", "salvar_agenda_servico", w, id("agenda"), agenda);
      await assert.rejects(
        () => call("salvar_agenda_servico", w, id("conflito"), agenda),
        /horário|reserva|ocupado|conflit/i,
      );
      confirmar("Agenda impede reserva simultânea do recurso");
    }
    const estoque = await call("listar_estoque", w);
    assert.equal(
      Number(estoque.itens.find((p) => p.id === produto).saldo),
      doCliente ? 10 : 10 - quantidade,
    );
    confirmar("Consumo exato de estoque e material do cliente");
    const pagamento = await executar(
      "pagamento-parcial",
      "baixar_titulo_financeiro",
      w,
      titulo,
      id("pagamento"),
      5000,
      0,
      hoje,
      "banco",
      "pix",
      "QA · Recebimento fictício, sem transação bancária",
    );
    assert.equal(
      await call(
        "baixar_titulo_financeiro",
        w,
        titulo,
        id("pagamento"),
        5000,
        0,
        hoje,
        "banco",
        "pix",
        "QA · Recebimento fictício, sem transação bancária",
      ),
      pagamento,
    );
    const t = await call("consultar_titulo_alerta", w, titulo);
    assert.equal(t.aberto_centavos, total - 5000);
    confirmar("Recebimento parcial, saldo e repetição idempotente");
    await assert.rejects(
      () =>
        call(
          "baixar_titulo_financeiro",
          w,
          titulo,
          id("excesso"),
          total + 1,
          0,
          hoje,
          "banco",
          "pix",
        ),
      /saldo|valor/i,
    );
    confirmar("Bloqueio de recebimento acima do saldo");
    if (e.ramo !== "automotivo") {
      const rel = await call("consultar_relatorios_servicos", w, mes, fimRelatorio);
      assert(rel.detalhes.some((d) => d.atendimento.id === atendimento));
      assert(
        rel.devedores.some(
          (d) => d.atendimento_id === atendimento && d.saldo === total - 5000,
        ),
      );
    } else {
      const rel = await call("consultar_relatorios_gestao", w, mes, fimRelatorio);
      assert(rel.ordens.some((d) => d.id === atendimento && d.total === total));
    }
    confirmar("Relatório reflete o atendimento e seus valores");
    if (e.ramo === "automotivo") {
      const os = await get();
      if (testarConflitos)
        await assert.rejects(
          () =>
            call(
              "salvar_ordem_servico",
              w,
              { observacoes: "QA edição antiga" },
              id("edicao-antiga"),
              atendimento,
              os.revisao - 1,
            ),
          (erro) => erro.code === "PT409" && erro.status === 409,
        );
      await executar("qualidade", "salvar_ocorrencia_qualidade", w, id("qualidade"), {
        ordem_original_id: atendimento,
        motivo: "execucao",
        descricao: `QA · Retorno fictício para conferir ${servico}`,
        horas_retrabalho: 0.5,
        custo_hora_centavos: 4000,
        houve_retrabalho: true,
        reclamacao: true,
      });
      await executar(
        "resolver-qualidade",
        "salvar_ocorrencia_qualidade",
        w,
        id("qualidade"),
        {
          situacao: "resolvida",
          solucao: "QA · Ajuste conferido com o cliente fictício",
          nota_cliente: 5,
          custos_conferidos: true,
        },
        1,
      );
      const qualidade = await call("consultar_qualidade", w, mes, fimRelatorio);
      const ocorrencia = qualidade.ocorrencias.find((x) => x.id === id("qualidade"));
      assert.equal(ocorrencia.custo_total_centavos, 2000);
      assert.equal(ocorrencia.situacao, "resolvida");
      const rel = await call("consultar_relatorios_gestao", w, mes, fimRelatorio);
      assert(rel.qualidade.some((x) => x.id === id("qualidade")));
    } else {
      let d = await get();
      if (testarConflitos)
        await assert.rejects(
          () =>
            call(
              "salvar_atendimento_servico",
              w,
              atendimento,
              d.atendimento,
              d.atendimento.revisao - 1,
            ),
          (erro) => erro.code === "PT409" && erro.status === 409,
        );
      if (!s.acoes["encerrar-retorno"]) {
        await executar(
          "reabrir-retorno",
          "reabrir_atendimento_servico",
          w,
          atendimento,
          d.atendimento.revisao,
          `QA · Rever ${servico}`,
        );
        d = await get();
        assert.equal(d.atendimento.situacao, "em_execucao");
        assert.equal(
          Number(
            (await call("listar_estoque", w)).itens.find((p) => p.id === produto).saldo,
          ),
          10,
        );
        if (e.ramo === "assistencia_tecnica")
          assert.notEqual(d.atendimento.ficha_especialidade.etapa, "Retirado");
        else
          assert.equal(
            d.atendimento.ficha_especialidade.campos.situacao_aceite,
            "Pendente",
          );
        const pronto =
          e.ramo === "assistencia_tecnica"
            ? concluirReparo(d.atendimento, perfil)
            : {
                ...d.atendimento,
                situacao: "concluido",
                ficha_especialidade: {
                  ...d.atendimento.ficha_especialidade,
                  campos: {
                    ...d.atendimento.ficha_especialidade.campos,
                    ...cenario.saida,
                  },
                },
              };
        await executar(
          "encerrar-retorno",
          "salvar_atendimento_servico",
          w,
          atendimento,
          pronto,
          d.atendimento.revisao,
        );
      }
      d = await get();
      if (e.ramo === "assistencia_tecnica")
        await executar(
          "retirada-retorno",
          "salvar_atendimento_servico",
          w,
          atendimento,
          registrarRetirada(d.atendimento, "Ana QA", perfil),
          d.atendimento.revisao,
        );
      assert.equal(
        Number(
          (await call("listar_estoque", w)).itens.find((p) => p.id === produto).saldo,
        ),
        10 - quantidade,
      );
      assert.equal(await call("faturar_atendimento_servico", w, atendimento), titulo);
      assert.equal(
        (await call("consultar_titulo_alerta", w, titulo)).aberto_centavos,
        total - 5000,
      );
      confirmar(
        "Reabertura estorna consumo e reconclusão preserva cobrança e pagamento",
      );
      await executar(
        "qualidade",
        "salvar_qualidade_atendimento",
        w,
        atendimento,
        id("qualidade"),
        {
          tipo: "retrabalho",
          motivo: `QA · Conferência de ${servico}`,
          aberto_em: hoje,
          custo_centavos: 2000,
          minutos: 30,
          funcionario_id: id("funcionario"),
          nota: 5,
        },
      );
      const rel = await call("consultar_relatorios_servicos", w, mes, fimRelatorio);
      assert(
        rel.qualidade.some(
          (x) => x.id === id("qualidade") && x.custo_centavos === 2000,
        ),
      );
    }
    if (testarConflitos)
      confirmar("Edição desatualizada recusada sem sobrescrever o atendimento");
    confirmar("Retrabalho com custo e avaliação refletidos no relatório");
    const outra = credenciais.contas.find((c) => c.empresa_id !== w);
    const invasao = await cliente.rpc("buscar_cadastros_operacao", {
      p_oficina: outra.empresa_id,
      p_tipo: "clientes",
    });
    assert(invasao.error);
    confirmar("Consulta de outra empresa recusada");
    s.status = testarConflitos ? "aprovado" : "aprovado_sem_conflitos";
    s.conflitosPendentes = !testarConflitos;
    delete s.erro;
    s.atendimento = atendimento;
    s.total = total;
    s.saldo = total - 5000;
    s.finalizadoEm = new Date().toISOString();
    console.log(
      `PASS ${perfil}: ${s.verificacoes.length} verificações, rotina real no Supabase`,
    );
  } catch (erro) {
    falhas++;
    s.status = "falhou";
    s.erro = { mensagem: erro.message, codigo: erro.code || null };
    console.log(`FALHOU ${perfil}: ${erro.message}`);
  } finally {
    await salvar();
    await cliente.auth.signOut({ scope: "local" });
  }
}
console.log(
  `Rotinas concluídas; ${falhas} falhas nesta execução. Resultados em ${estadoArquivo}`,
);
process.exitCode = falhas ? 1 : 0;
