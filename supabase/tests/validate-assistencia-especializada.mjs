import { codigoConflitoRevisao } from './banco-local.mjs';
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { criarBancoLocal } from "./banco-local.mjs";
import {
  perfisAtendimento,
  novaFichaEspecialidade,
} from "../../src/lib/perfisAtendimento.ts";
import { concluirReparo, registrarRetirada } from "../../src/lib/assistenciaTecnica.ts";

let db;
try {
  db = await criarBancoLocal("20261015000800");
  const one = async (sql, args = []) =>
    Object.values((await db.query(sql, args)).rows[0])[0];
  const schema = await one("select private.perfis_atendimento()");
  for (const [id, p] of Object.entries(perfisAtendimento)) {
    assert.deepEqual(schema[id].etapas, p.etapas, `Etapas: ${id}`);
    assert.deepEqual(schema[id].checklist, p.checklist, `Checklist: ${id}`);
    for (const c of p.grupos.flatMap((g) => g.campos)) {
      assert.deepEqual(
        schema[id].campos[c.id],
        { tipo: c.tipo || "texto", ...(c.opcoes ? { opcoes: c.opcoes } : {}) },
        `Campo: ${id}/${c.id}`,
      );
    }
  }
  const u = randomUUID();
  await db.exec(
    `alter table auth.users add column email_confirmed_at timestamptz;insert into auth.users values('${u}',now());select set_config('request.jwt.claim.sub','${u}',false);set role authenticated;`,
  );
  const w = await one(
    "select public.configurar_nova_empresa($1,$2,'','{}','assistencia_tecnica','assistencia_eletrodomesticos')",
    [randomUUID(), "Bancada fictícia de eletrodomésticos"],
  );
  await db.exec(
    `reset role;update public.assinaturas_oficina set codigo_plano='complete' where oficina_id='${w}';set role authenticated;`,
  );
  const c = await one("select public.salvar_cliente($1,$2)", [
    w,
    { nome: "Cliente fictício" },
  ]);
  const objeto = randomUUID();
  await one("select public.salvar_objeto_atendimento($1,$2,$3)", [
    w,
    objeto,
    { cliente_id: c.id, nome: "Geladeira teste", dados: { serie: "TESTE-ELE-001" } },
  ]);
  for (const modalidade of ["Domicílio", "Bancada"]) {
    const id = randomUUID(),
      f = novaFichaEspecialidade("assistencia_eletrodomesticos");
    f.campos = {
      modalidade,
      familia: "Geladeira / freezer",
      identificacao: "SERIE-TESTE",
      codigo_produto: "PNC-TESTE",
      refrigeracao: "Freezer -18 °C; 2 h",
      resultado_teste: "Teste parcial",
      limitacoes_teste: "Sem carga do cliente",
      diagnostico: "Teste de persistência",
      testes: "Resultado registrado",
    };
    const save = (a) =>
      one("select public.salvar_atendimento_servico($1,$2,$3,$4)", [
        w,
        id,
        a,
        a.revisao || null,
      ]);
    const get = () =>
      one("select public.consultar_detalhes_atendimento($1,$2)", [w, id]);
    await save({
      cliente_id: c.id,
      objeto_id: objeto,
      titulo: "Reparo fictício",
      situacao: "em_execucao",
      dados: {},
      valor_centavos: 25000,
      data_servico: "2026-10-15",
      vencimento: "2026-10-30",
      ficha_especialidade: f,
    });
    let d = await get();
    assert.deepEqual(d.atendimento.ficha_especialidade.campos, f.campos);
    await save(concluirReparo(d.atendimento, f.especialidade));
    d = await get();
    const conclusao = d.atendimento.concluido_em,
      valor = d.atendimento.valor_centavos;
    assert.equal(
      d.atendimento.ficha_especialidade.etapa,
      modalidade === "Domicílio" ? "Serviço concluído no local" : "Pronto para entrega",
    );
    await save(registrarRetirada(d.atendimento, "Cliente conferiu", f.especialidade));
    d = await get();
    assert.equal(
      d.atendimento.ficha_especialidade.etapa,
      modalidade === "Domicílio" ? "Aceite registrado" : "Entregue",
    );
    assert.equal(d.atendimento.concluido_em, conclusao);
    assert.equal(d.atendimento.valor_centavos, valor);
    assert.equal(
      d.atendimento.ficha_especialidade.campos.refrigeracao,
      f.campos.refrigeracao,
    );
    assert.ok(
      d.eventos.some(
        (e) =>
          e.tipo === "etapa" && e.depois === d.atendimento.ficha_especialidade.etapa,
      ),
    );
    await assert.rejects(
      () =>
        save({
          ...d.atendimento,
          ficha_especialidade: {
            ...d.atendimento.ficha_especialidade,
            campos: { ...f.campos, familia: "Categoria inexistente" },
          },
        }),
      (e) => e.code === "22023",
    );
    await assert.rejects(
      () => save({ ...d.atendimento, revisao: 1 }),
      (e) => e.code === codigoConflitoRevisao,
    );
  }
  const wp = await one(
    "select public.configurar_nova_empresa($1,$2,'','{}','assistencia_tecnica','assistencia_eletronica')",
    [randomUUID(), "Bancada fictícia de placas"],
  );
  await db.exec(
    `reset role;update public.assinaturas_oficina set codigo_plano='complete' where oficina_id='${wp}';set role authenticated;`,
  );
  const cp = await one("select public.salvar_cliente($1,$2)", [
    wp,
    { nome: "Cliente de placas fictício" },
  ]);
  const op = randomUUID(),
    ap = randomUUID(),
    fp = novaFichaEspecialidade("assistencia_eletronica");
  fp.campos = {
    objeto_recebido: "Placa avulsa",
    placa: "PCB-001",
    revisao_placa: "REV-C",
    equipamento_origem: "Fonte teste",
    medicoes_entrada: "TP1: 0 V",
    medicoes_saida: "TP1: 5.01 V",
    componentes: "U1, PN-001, LOTE-001",
    condicao_ensaio: "Somente placa / módulo",
    resultado_teste: "Teste parcial",
    duracao_ensaio: "45",
    limitacoes_teste: "Equipamento completo não disponível",
    protecao_esd: "Conferido e registrado",
  };
  await one("select public.salvar_objeto_atendimento($1,$2,$3)", [
    wp,
    op,
    { cliente_id: cp.id, nome: "Placa de teste", dados: { serie: "PCB-SERIE" } },
  ]);
  const savep = (a) =>
    one("select public.salvar_atendimento_servico($1,$2,$3,$4)", [
      wp,
      ap,
      a,
      a.revisao || null,
    ]);
  const getp = () =>
    one("select public.consultar_detalhes_atendimento($1,$2)", [wp, ap]);
  await savep({
    cliente_id: cp.id,
    objeto_id: op,
    titulo: "Reparo de placa",
    situacao: "em_execucao",
    dados: {},
    valor_centavos: 20000,
    data_servico: "2026-10-15",
    vencimento: "2026-10-30",
    ficha_especialidade: fp,
  });
  let dp = await getp();
  assert.deepEqual(dp.atendimento.ficha_especialidade.campos, fp.campos);
  await savep(concluirReparo(dp.atendimento, fp.especialidade));
  dp = await getp();
  await savep(registrarRetirada(dp.atendimento, "Cliente de placas", fp.especialidade));
  dp = await getp();
  assert.equal(
    dp.atendimento.ficha_especialidade.campos.resultado_teste,
    "Teste parcial",
  );
  assert.equal(
    dp.atendimento.ficha_especialidade.campos.limitacoes_teste,
    fp.campos.limitacoes_teste,
  );
  assert.equal(dp.atendimento.ficha_especialidade.etapa, "Entregue");
  await assert.rejects(
    () =>
      savep({
        ...dp.atendimento,
        ficha_especialidade: { ...fp, campos: { ...fp.campos, duracao_ensaio: "-1" } },
      }),
    (e) => e.code === "22023",
  );
  await assert.rejects(
    () =>
      savep({
        ...dp.atendimento,
        ficha_especialidade: {
          ...fp,
          campos: { ...fp.campos, resultado_teste: "Inventado" },
        },
      }),
    (e) => e.code === "22023",
  );
  console.log(
    "PASS 26 contratos; eletrodomésticos em bancada/domicílio e placa avulsa; persistência, conclusão, aceite/entrega, histórico, limites e opções inválidas.",
  );
} finally {
  await db?.close();
}
