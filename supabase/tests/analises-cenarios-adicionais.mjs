import assert from "node:assert/strict";
import { randomUUID as uuid } from "node:crypto";
export async function conferirConsolidacao(c, call, perfil, r, checks) {
  const { db, ids } = c,
    w = r.w,
    outra = Object.values(c.registros).find((x) => x.w !== w),
    i = "2026-09-01",
    f = r.hoje;
  await db.exec("reset role");
  await db.query(
    "insert into public.membros_oficina(oficina_id,usuario_id,perfil,ativo) values($1,$2,'manager',true)",
    [outra.w, ids[perfil]],
  );
  await c.login(ids[perfil]);
  try {
    const receita = uuid(),
      despesa = uuid(),
      valor = 9876,
      data = "2026-09-21";
    await call("salvar_titulo_financeiro", [
      w,
      receita,
      {
        natureza: "receber",
        descricao: "Operação entre unidades QA",
        categoria: "outras_receitas",
        valor_centavos: valor,
        competencia: data,
        vencimento: f,
      },
      null,
    ]);
    await call("salvar_titulo_financeiro", [
      outra.w,
      despesa,
      {
        natureza: "pagar",
        descricao: "Operação entre unidades QA",
        categoria: "outras_despesas",
        valor_centavos: valor,
        competencia: data,
        vencimento: f,
      },
      null,
    ]);
    const filtros = { unidades: [w, outra.w] },
      antes = await call("consultar_analise_gerencial", [
        w,
        "filiais",
        i,
        f,
        filtros,
        0,
      ]);
    await call("salvar_vinculo_analitico", [
      w,
      "interna",
      receita,
      {
        destino: outra.w,
        despesa_id: despesa,
        motivo: "Serviço entre unidades de teste",
      },
      null,
    ]);
    let depois = await call("consultar_analise_gerencial", [
      w,
      "filiais",
      i,
      f,
      filtros,
      0,
    ]);
    assert.equal(depois.resumo.receita, antes.resumo.receita - valor);
    assert.equal(depois.resumo.resultado, antes.resumo.resultado);
    assert.equal(depois.resumo.eliminado, valor);
    assert.equal(
      (
        await call("consultar_analise_gerencial", [
          w,
          "filiais",
          i,
          f,
          { unidades: [w] },
          0,
        ])
      ).resumo.eliminado,
      0,
    );
    checks.push(
      "Consolidação autorizada: elimina receita/despesa simetricamente só com ambas as unidades",
    );
    const repetida = uuid();
    await call("salvar_titulo_financeiro", [
      w,
      repetida,
      {
        natureza: "receber",
        descricao: "Outro lançamento QA",
        categoria: "outras_receitas",
        valor_centavos: valor,
        competencia: data,
        vencimento: f,
      },
      null,
    ]);
    await assert.rejects(
      () =>
        call("salvar_vinculo_analitico", [
          w,
          "interna",
          repetida,
          {
            destino: outra.w,
            despesa_id: despesa,
            motivo: "Tentativa de duplicar despesa",
          },
          null,
        ]),
      (e) => e.code === "22023",
    );
    checks.push("Mesma despesa não pode ser eliminada duas vezes");
    await db.exec("reset role");
    await db.query(
      "update public.titulos_financeiros set valor_centavos=valor_centavos+1 where id=$1",
      [despesa],
    );
    await c.login(ids[perfil]);
    depois = await call("consultar_analise_gerencial", [
      w,
      "filiais",
      i,
      f,
      filtros,
      0,
    ]);
    assert.equal(depois.resumo.eliminado, 0);
    assert.equal(depois.resumo.vinculos_invalidos, 1);
    checks.push("Alteração posterior invalida eliminação e avisa o gestor");
    await call("retirar_vinculo_analitico", [
      w,
      "interna",
      receita,
      1,
      "Correção de teste",
    ]);
  } finally {
    await db.exec("reset role");
    await db.query(
      "delete from public.membros_oficina where oficina_id=$1 and usuario_id=$2",
      [outra.w, ids[perfil]],
    );
    await c.login(ids[perfil]);
  }
}
export async function conferirCobertura(c, call, perfil, r, doc, checks) {
  const w = r.w,
    mes = "2026-09-01";
  const parametros = {
    salarios: 100000,
    encargos: 20,
    beneficios: 10000,
    prolabore: 0,
    indiretos: 80000,
    depreciacao: 0,
    profissionais: 1,
    dias: 20,
    horas: 8,
    ocupacao: 50,
    margem: 20,
    impostos: 10,
    taxas: 0,
    rateio: "horas",
  };
  await call("salvar_parametros_custeio", [w, mes, parametros, null]);
  let det = await call("consultar_custeio_servico", [w, doc]);
  const rev = {
    minutos: 120,
    categorias: Object.fromEntries(
      [
        "materiais",
        "mao_obra",
        "terceiros",
        "deslocamento",
        "impostos",
        "comissoes",
        "garantia",
        "outros",
      ].map((k) => [k, "Conferência do cenário fictício"]),
    ),
    desconsideradas: Object.fromEntries(
      det.fontes
        .filter((x) => x.pendente)
        .map((x) => [x.chave, "Não aplicável nesta simulação"]),
    ),
  };
  await call("conferir_custeio_servico", [w, doc, det.assinatura, rev, null]);
  let rel = await call("consultar_analise_gerencial", [
    w,
    "clientes",
    mes,
    r.hoje,
    {},
    0,
  ]);
  assert.equal(rel.resumo.conferidos, 1);
  assert.equal(rel.linhas[0].cobertura, 100);
  assert.equal(rel.linhas[0].criterio, "horas");
  checks.push("Cobertura chega a 100% só com parâmetros e conferência atuais");
  await call("registrar_custo_servico", [
    w,
    doc,
    uuid(),
    {
      categoria: "terceiros",
      valor: 500,
      descricao: "Custo encontrado na auditoria QA",
      data: "2026-09-22",
      vencimento: r.hoje,
    },
  ]);
  rel = await call("consultar_analise_gerencial", [w, "dados", mes, r.hoje, {}, 0]);
  assert.equal(rel.resumo.conferidos, 0);
  assert.equal(rel.linhas[0].situacao, "Conferência desatualizada");
  checks.push("Novo custo retira cobertura e pede nova conferência");
  await c.login("", "anon");
  await assert.rejects(
    () => call("consultar_analise_gerencial", [w, "clientes", mes, r.hoje, {}, 0]),
    (e) => e.code === "42501",
  );
  await c.login(c.ids[perfil]);
  checks.push("Acesso anônimo recusado");
  if (perfil === "mecanica") {
    await c.db.exec("reset role");
    await c.db.query(
      "insert into public.ativos_agenda(id,oficina_id,nome,tipo,ativo) select gen_random_uuid(),$1,'Paginação recurso '||lpad(n::text,2,'0'),'box',true from generate_series(1,31)n",
      [w],
    );
    await c.login(c.ids[perfil]);
    const x = await call("consultar_analise_gerencial", [
        w,
        "recursos",
        mes,
        r.hoje,
        { busca: "Paginação recurso" },
        0,
      ]),
      y = await call("consultar_analise_gerencial", [
        w,
        "recursos",
        mes,
        r.hoje,
        { busca: "Paginação recurso" },
        1,
      ]);
    assert.equal(x.total, 31);
    assert.equal(x.linhas.length, 25);
    assert.equal(y.linhas.length, 6);
    assert.equal(new Set([...x.linhas, ...y.linhas].map((v) => v.id)).size, 31);
    checks.push("Filtros e paginação sem omissões/repetições");
  }
}
