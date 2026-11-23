import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { performance } from "node:perf_hooks";
import { criarBancoLocal } from "../supabase/tests/banco-local.mjs";

// Banco descartável em memória. Este script nunca acessa o Supabase remoto.
process.env.DB_VALIDATION_RUNTIME ||= join(
  tmpdir(),
  "sistema-automotivo-db-validation/node_modules/@electric-sql/pglite/dist/index.js",
);
const db = await criarBancoLocal("20261001000700");
const esc = (v) => `'${String(v).replaceAll("'", "''")}'`;
const json = (v) => `${esc(JSON.stringify(v))}::jsonb`;
const scalar = async (sql) => Object.values((await db.query(sql)).rows[0])[0];
const uid = randomUUID(),
  outro = randomUUID();
const resultado = {
  ambiente: "PGlite isolado em memória; sem rede",
  clientes: 600,
  orcamentos: 60,
  ordens: 20,
  verificacoes: [],
  tempos: [],
};
function ok(condicao, nome) {
  assert.ok(condicao, nome);
  resultado.verificacoes.push(nome);
}
async function login(id, role = "authenticated") {
  await db.exec(
    `reset role; select set_config('request.jwt.claim.sub',${esc(id)},false); set role ${role}`,
  );
}
async function medir(nome, sql, repeticoes = 10) {
  const amostras = [];
  for (let i = 0; i < repeticoes; i++) {
    const inicio = performance.now();
    await scalar(sql);
    amostras.push(performance.now() - inicio);
  }
  const ordem = [...amostras].sort((a, b) => a - b);
  resultado.tempos.push({
    nome,
    amostras_ms: amostras,
    mediana_ms: ordem[Math.floor(ordem.length / 2)],
    p95_ms: ordem[Math.ceil(ordem.length * 0.95) - 1],
  });
}
try {
  await db.exec(`insert into auth.users values('${uid}'),('${outro}')`);
  await login(uid);
  const oficina = await scalar(
    "select public.criar_oficina('Volume local descartável',null)",
  );
  await db.exec(
    `reset role; update public.assinaturas_oficina set codigo_plano='intermediate' where oficina_id='${oficina}'`,
  );
  await login(uid);
  const clientes = [];
  for (let i = 0; i < 600; i++) {
    clientes.push(
      await scalar(
        `select public.salvar_cliente('${oficina}',${json({ nome: `[VOLUME] ${String(i).padStart(4, "0")} João D'Ávila & Filhos`, tipo: i % 2 ? "pessoa_fisica" : "pessoa_juridica" })})`,
      ),
    );
  }
  const primeira = await scalar(`select public.listar_clientes('${oficina}')`);
  ok(primeira.total === 600, "600 cadastros válidos, com acentos e apóstrofo");
  const vistos = new Set();
  for (let pagina = 0; vistos.size < 600; pagina++) {
    assert.ok(pagina < 100, "paginação deve terminar");
    const lote = await scalar(
      `select public.listar_clientes('${oficina}','',false,${pagina})`,
    );
    assert.ok(
      lote.itens.length > 0,
      "página intermediária não pode estar vazia",
    );
    for (const c of lote.itens) {
      assert.ok(!vistos.has(c.id), "cliente duplicado entre páginas");
      vistos.add(c.id);
    }
  }
  ok(
    vistos.size === 600,
    "Paginação percorre os 600 clientes sem perder ou repetir cadastro",
  );
  const ultimo = await scalar(
    `select public.listar_clientes('${oficina}','0599')`,
  );
  ok(
    ultimo.total === 1 && ultimo.itens[0].id === clientes[599].id,
    "Busca encontra cliente fora da primeira página",
  );
  await medir(
    "listar 600 clientes (primeira página)",
    `select public.listar_clientes('${oficina}')`,
  );
  await medir(
    "buscar cliente no fim da carteira",
    `select public.listar_clientes('${oficina}','0599')`,
  );
  const veiculo = await scalar(
    `select public.cadastrar_veiculo_orcamento('${oficina}','${clientes[0].id}','Veículo de volume',null)`,
  );
  let receitaEsperada = 0,
    ultimoOrcamento;
  for (let i = 0; i < 60; i++) {
    const itens = Array.from({ length: 1 + (i % 10) }, (_, j) => ({
      tipo: "service",
      descricao: `Serviço ${i}/${j}`,
      unidade: "hora",
      quantidade: (1 + (j % 4)) / 4,
      preco_unitario_centavos: 1001 + i * 13 + j * 7,
    }));
    const subtotal = itens.reduce(
      (total, item) =>
        total + Math.round(item.quantidade * item.preco_unitario_centavos),
      0,
    );
    const desconto = i % 2 ? Math.floor(subtotal / 10) : 0;
    const dados = {
      cliente_id: clientes[0].id,
      veiculo_id: veiculo,
      itens,
      desconto_centavos: desconto,
    };
    const chave = randomUUID();
    let q = await scalar(
      `select public.salvar_orcamento('${oficina}',${json(dados)},'${chave}')`,
    );
    ok(
      q.versao.total_centavos === subtotal - desconto,
      `Orçamento ${i + 1}: arredondamento por item e desconto corretos`,
    );
    const repetido = await scalar(
      `select public.salvar_orcamento('${oficina}',${json(dados)},'${chave}')`,
    );
    ok(
      repetido.id === q.id,
      `Orçamento ${i + 1}: reenvio não duplica cadastro`,
    );
    if (i < 20) {
      const token = createHash("sha256").update(`local-${i}`).digest("hex");
      const hash = createHash("sha256").update(token).digest("hex");
      q = await scalar(
        `select public.emitir_orcamento('${oficina}','${q.id}',${q.revisao},7,'${hash}')`,
      );
      await login("", "anon");
      await scalar(
        `select public.responder_orcamento('${token}','Cliente fictício volume','approved',true)`,
      );
      await login(uid);
      const osId = await scalar(
        `select public.converter_orcamento_em_os('${oficina}','${q.id}')`,
      );
      const repetida = await scalar(
        `select public.converter_orcamento_em_os('${oficina}','${q.id}')`,
      );
      ok(
        osId === repetida,
        `OS ${i + 1}: conversão repetida mantém uma única OS`,
      );
      let os = await scalar(
        `select public.consultar_ordem_servico('${oficina}','${osId}')`,
      );
      for (const item of os.itens) {
        await scalar(
          `select public.salvar_item_os('${oficina}','${osId}',${os.revisao},'{"situacao":"done"}','${item.id}')`,
        );
        os = await scalar(
          `select public.consultar_ordem_servico('${oficina}','${osId}')`,
        );
      }
      for (const situacao of [
        "in_progress",
        "quality_check",
        "ready",
        "delivered",
      ]) {
        await scalar(
          `select public.atualizar_mapa_ordem_servico('${oficina}','${osId}',${os.revisao},'${situacao}',null,null,null,coalesce(${os.recebido_em ? esc(os.recebido_em) : "null"}::timestamptz,now()))`,
        );
        os = await scalar(
          `select public.consultar_ordem_servico('${oficina}','${osId}')`,
        );
      }
      receitaEsperada += subtotal - desconto;
      ok(
        os.situacao === "delivered" &&
          os.total_centavos === subtotal - desconto,
        `OS ${i + 1}: entregue preservando total aprovado`,
      );
    }
    ultimoOrcamento = q;
  }
  const lista = await scalar(`select public.listar_orcamentos('${oficina}')`);
  ok(lista.total === 60, "60 orçamentos únicos após 120 tentativas de criação");
  const hoje = await scalar(
    "select (now() at time zone 'America/Sao_Paulo')::date::text",
  );
  const sqlFinanceiro = `select public.consultar_financeiro('${oficina}','${hoje}','${hoje}')`;
  const financeiro = await scalar(sqlFinanceiro);
  ok(
    financeiro.resumo.receitas === receitaEsperada,
    "Receita das 20 entregas confere com a soma dos valores aprovados",
  );
  ok(
    financeiro.resumo.entradas === 0,
    "20 entregas a prazo não inventam entrada de dinheiro",
  );
  await medir(
    "listar 60 orçamentos",
    `select public.listar_orcamentos('${oficina}')`,
  );
  await medir(
    "abrir orçamento com dez itens",
    `select public.consultar_orcamento('${oficina}','${ultimoOrcamento.id}')`,
  );
  await medir("financeiro após 20 entregas", sqlFinanceiro);
  await login(outro);
  ok(
    (await scalar("select count(*)::int from public.clientes")) === 0,
    "Segunda conta não lê os 600 clientes de outra oficina",
  );
  await assert.rejects(
    () =>
      scalar(
        `select public.consultar_orcamento('${oficina}','${ultimoOrcamento.id}')`,
      ),
    (e) => e.code === "42501",
  );
  ok(true, "Segunda conta não abre orçamento por ID conhecido");
  resultado.resultado = "aprovado";
  console.log(
    `${resultado.verificacoes.length} verificações de volume aprovadas; 600 clientes, 60 orçamentos, 20 entregas locais.`,
  );
} catch (erro) {
  resultado.resultado = "falhou";
  resultado.erro = { mensagem: erro.message, codigo: erro.code };
  process.exitCode = 1;
  console.error(erro.message, erro.code ?? "");
} finally {
  await db.close();
  await mkdir("docs/validacao-ampliada-2026-10-02", { recursive: true });
  await writeFile(
    "docs/validacao-ampliada-2026-10-02/volume-local.json",
    JSON.stringify(resultado, null, 2),
  );
}
