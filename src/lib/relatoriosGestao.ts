import type { OcorrenciaQualidade } from "../services/qualidade";
import type {
  ComplementoGestao,
  DadosGestao,
  FiltrosGestao,
  OrdemGestao,
} from "../types/relatoriosGestao";
export type {
  ComplementoGestao,
  DadosGestao,
  FiltrosGestao,
  OrdemGestao,
} from "../types/relatoriosGestao";
export const filtrosGestaoVazios: FiltrosGestao = {
  busca: "",
  cliente: "",
  funcionario: "",
  tipo: "",
  situacao: "",
  fornecedor: "",
  estoque: "",
};
const DIA = 86400000;
const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
export const diaGestao = (s: string) => (s.length === 10 ? s : fmt.format(new Date(s)));
export const mediaGestao = (a: number[]) =>
  a.length ? a.reduce((s, n) => s + n, 0) / a.length : null;
export const custoOcorrencia = (q: OcorrenciaQualidade) =>
  Math.round(Number(q.horas_retrabalho) * Number(q.custo_hora_centavos)) +
  Number(q.custo_pecas_centavos) +
  Number(q.outros_custos_centavos) +
  Number(q.reembolso_centavos) -
  Number(q.recuperado_centavos);
const soma = <T>(a: T[], f: (x: T) => number) =>
  a.reduce((s, x) => s + Number(f(x) || 0), 0);
export function complemento(d: DadosGestao, entidade: string, id: string) {
  return (
    d.complementos.find((c) => c.entidade === entidade && c.registro_id === id)
      ?.dados || {}
  );
}
const diasEntre = (a: string | null, b: string | null) =>
  a && b && Date.parse(b) >= Date.parse(a)
    ? (Date.parse(b) - Date.parse(a)) / DIA
    : null;
const semCapital = ["compra_estoque", "retirada", "saldo_inicial", "transferencia"];
// Intervalos sobrepostos contam uma única vez, inclusive nas paradas e na agenda.
export function duracaoUnida(intervalos: [number, number][]) {
  let fim = -Infinity,
    total = 0;
  for (const [a, b] of [...intervalos].sort((x, y) => x[0] - y[0])) {
    if (b > a) {
      total += Math.max(0, b - Math.max(a, fim));
      fim = Math.max(fim, b);
    }
  }
  return total;
}
function agrupar<T, K extends string | null>(itens: T[], chave: (item: T) => K) {
  const grupos = new Map<K, T[]>();
  for (const item of itens) {
    const id = chave(item);
    const grupo = grupos.get(id);
    if (grupo) grupo.push(item);
    else grupos.set(id, [item]);
  }
  return grupos;
}
export function calcularGestao(
  d: DadosGestao,
  inicio: string,
  fim: string,
  f: FiltrosGestao = filtrosGestaoVazios,
) {
  // Índices construídos uma vez por consulta evitam varrer todas as listas para cada OS.
  const ordensPorId = new Map(d.ordens.map((o) => [o.id, o]));
  const itensPorId = new Map(d.itens.map((i) => [i.id, i]));
  const produtosPorId = new Map(d.produtos.map((p) => [p.id, p]));
  const fornecedoresPorId = new Map(d.fornecedores.map((p) => [p.id, p]));
  const itensPorOS = agrupar(d.itens, (i) => i.os);
  const movimentosPorOS = agrupar(d.movimentos, (m) => m.os);
  const movimentosPorItem = agrupar(d.movimentos, (m) => m.item);
  const movimentosPorProduto = agrupar(d.movimentos, (m) => m.produto);
  const comissoesPorOS = agrupar(d.comissoes, (c) => c.os);
  const comissoesPorItem = agrupar(d.comissoes, (c) => c.item);
  const historicoPorOS = agrupar(d.historico, (h) => h.os);
  const paradasPorOS = agrupar(d.paradas, (p) => p.os);
  const complementos = new Map<string, ComplementoGestao["dados"]>();
  for (const c of d.complementos) {
    const chave = JSON.stringify([c.entidade, c.registro_id]);
    if (!complementos.has(chave)) complementos.set(chave, c.dados);
  }
  const dadosComplementares = (entidade: string, id: string) =>
    complementos.get(JSON.stringify([entidade, id])) || {};
  const em = (s: string | null) => !!s && diaGestao(s) >= inicio && diaGestao(s) <= fim;
  const agora = Date.parse(d.agora),
    de = Date.parse(inicio + "T00:00:00-03:00"),
    ate = Math.min(agora, Date.parse(fim + "T23:59:59.999-03:00") + 1);
  const cfg = d.complementos.find((c) => c.entidade === "oficina")?.dados || {};
  const funcionarioOS = (o: OrdemGestao | undefined) =>
    o ? String(dadosComplementares("os", o.id).funcionario_id || "") : "";
  const funcionarioItem = (item: DadosGestao["itens"][number]) => {
    const c = comissoesPorItem.get(item.id)?.[0];
    return (
      String(
        c?.profissional
          ? dadosComplementares("profissional", c.profissional).funcionario_id || ""
          : "",
      ) || funcionarioOS(ordensPorId.get(item.os))
    );
  };
  const aceita = (o: OrdemGestao) =>
    (!f.cliente || o.cliente_id === f.cliente) &&
    (!f.tipo || (o.tipo || "sem_tipo") === f.tipo) &&
    (!f.situacao ||
      (f.situacao === "paused"
        ? (paradasPorOS.get(o.id) || []).some((p) => !p.fim) &&
          !["delivered", "cancelled"].includes(o.situacao)
        : o.situacao === f.situacao)) &&
    (!f.funcionario ||
      d.custeios?.[o.id]?.participantes.some(
        (p) => p.funcionario_id === f.funcionario,
      ) ||
      funcionarioOS(o) === f.funcionario ||
      (itensPorOS.get(o.id) || []).some((i) => funcionarioItem(i) === f.funcionario)) &&
    `${o.numero} ${o.cliente} ${o.veiculo}`
      .toLowerCase()
      .includes(f.busca.toLowerCase());
  const ordens = d.ordens.filter(aceita),
    ids = new Set(ordens.map((o) => o.id));
  const entregues = ordens.filter((o) => o.situacao === "delivered" && em(o.entrega));
  const qualTodas = d.qualidade.filter(
    (q) => q.situacao !== "cancelada" && ids.has(q.ordem_original_id),
  );
  const qualidade = qualTodas.filter(
      (q) => em(q.aberto_em) && (!f.funcionario || q.funcionario_id === f.funcionario),
    ),
    retornoIds = new Set(
      d.qualidade
        .filter((q) => q.situacao !== "cancelada" && q.ordem_retrabalho_id)
        .map((q) => q.ordem_retrabalho_id),
    );
  const titulosDespesa = d.titulos.filter(
    (t) => t.natureza === "pagar" && !semCapital.includes(t.categoria),
  );
  const despesasPorOS = agrupar(titulosDespesa, (t) => t.os);
  const qualidadePorOS = agrupar(qualTodas, (q) => q.ordem_original_id);
  const osFinanceiro = entregues.map((o) => {
    const conf = dadosComplementares("os", o.id),
      retornos = qualidadePorOS.get(o.id) || [],
      itens = itensPorOS.get(o.id) || [],
      mov = movimentosPorOS.get(o.id) || [];
    const pecas = soma(mov, (m) => Math.round(-m.quantidade * m.custo));
    const despesas = soma(
      (despesasPorOS.get(o.id) || []).filter((t) => !t.comissao),
      (t) => t.valor,
    );
    const comissao = soma(comissoesPorOS.get(o.id) || [], (c) => c.valor);
    const custoBase =
      pecas +
      despesas +
      o.mao_obra +
      Number(conf.custo_externo_centavos || 0) +
      comissao;
    const garantia = soma(retornos, custoOcorrencia);
    const custeio = d.custeios?.[o.id];
    const custo = custeio?.custo ?? (retornoIds.has(o.id) ? 0 : custoBase) + garantia;
    // A conferência declara que os custos adicionais ausentes nos lançamentos foram informados.
    const conferido =
      custeio?.conferido ??
      (!!conf.custos_conferidos && retornos.every((q) => q.custos_conferidos));
    return {
      ...o,
      funcionario: funcionarioOS(o),
      pecas,
      despesas,
      comissao,
      custo,
      garantia,
      conferido,
      margem: o.total - custo,
      percentual: o.total ? ((o.total - custo) / o.total) * 100 : null,
      itens,
    };
  });
  const linhasItens = osFinanceiro.flatMap((o) =>
    o.itens.map((i) => {
      const mov = movimentosPorItem.get(i.id) || [],
        custo = soma(mov, (m) => Math.round(-m.quantidade * m.custo));
      return {
        ...i,
        funcionario: funcionarioItem(i),
        custo,
        margem: i.receita - custo,
        conferido: i.tipo === "service" || mov.length > 0,
      };
    }),
  );
  function rankingItens(tipo: string) {
    const m = new Map<
      string,
      {
        id: string;
        nome: string;
        quantidade: number;
        receita: number;
        custo: number;
        margem: number;
        conferido: boolean;
      }
    >();
    for (const i of linhasItens.filter(
      (i) => i.tipo === tipo && (!f.funcionario || i.funcionario === f.funcionario),
    )) {
      const id = i.catalogo || i.produto || i.nome.trim().toLowerCase(),
        v = m.get(id) || {
          id,
          nome: i.nome,
          quantidade: 0,
          receita: 0,
          custo: 0,
          margem: 0,
          conferido: true,
        };
      v.quantidade += Number(i.quantidade);
      v.receita += i.receita;
      v.custo += i.custo;
      v.margem += i.margem;
      v.conferido &&= i.conferido;
      m.set(id, v);
    }
    return [...m.values()].sort((a, b) => b.receita - a.receita);
  }
  const osPorCliente = agrupar(osFinanceiro, (o) => o.cliente_id || o.id);
  const clientes = [...osPorCliente]
    .map(([id, os]) => {
      return {
        id,
        nome: os[0].cliente,
        registrado: !!os[0].cliente_id,
        ordens: os.length,
        receita: soma(os, (o) => o.total),
        margem: soma(os, (o) => o.margem),
        garantia: soma(os, (o) => o.garantia),
        conferido: os.every((o) => o.conferido),
      };
    })
    .sort((a, b) => b.margem - a.margem);
  const perdasPorCliente = agrupar(
    qualidade,
    (q) => ordensPorId.get(q.ordem_original_id)!.cliente_id || q.ordem_original_id,
  );
  const perdasClientes = [...perdasPorCliente]
    .map(([id, qs]) => {
      return {
        id,
        nome: ordensPorId.get(qs[0].ordem_original_id)!.cliente,
        retornos: qs.length,
        custo: soma(qs, custoOcorrencia),
        conferido: qs.every((q) => q.custos_conferidos),
      };
    })
    .sort((a, b) => b.custo - a.custo);
  const equipe = d.equipe_permitida
    ? d.funcionarios
        .filter((p) => !f.funcionario || f.funcionario === p.id)
        .map((p) => {
          const itens = linhasItens.filter(
              (i) => i.tipo === "service" && i.funcionario === p.id,
            ),
            os = new Set(itens.map((i) => i.os));
          const qs = qualidade.filter((q) => q.funcionario_id === p.id);
          const cs = d.comissoes.filter(
            (c) =>
              osFinanceiro.some((o) => o.id === c.os) &&
              c.profissional &&
              dadosComplementares("profissional", c.profissional).funcionario_id ===
                p.id,
          );
          const atribuicoes = osFinanceiro.flatMap(
            (o) =>
              d.custeios?.[o.id]?.participantes.filter(
                (e) => e.funcionario_id === p.id,
              ) || [],
          );
          return {
            ...p,
            os: d.custeios ? atribuicoes.length : os.size,
            servicos: soma(itens, (i) => i.quantidade),
            receita: d.custeios
              ? soma(atribuicoes, (e) => e.receita)
              : soma(itens, (i) => i.receita),
            // A comissão a pagar é a gerada para o profissional. O rateio de
            // custos da equipe não cria um direito de recebimento.
            comissao: soma(cs, (c) => c.valor),
            liberada: soma(cs, (c) => c.liberada),
            paga: soma(cs, (c) => c.paga),
            retornos: qs.length,
            horas: soma(qs, (q) => q.horas_retrabalho),
            perda: soma(qs, custoOcorrencia),
            conferido: qs.every((q) => q.custos_conferidos),
          };
        })
    : [];
  const despesas =
    !f.cliente && !f.funcionario && !f.tipo && !f.situacao && !f.busca
      ? titulosDespesa.filter((t) => em(t.data))
      : titulosDespesa.filter((t) => em(t.data) && t.os && ids.has(t.os));
  const despesasGrupos = ["fixa", "variavel", "nao_classificada"].map((k) => ({
    nome: k,
    valor: soma(
      despesas.filter(
        (t) =>
          (dadosComplementares("despesa", t.id).classificacao || "nao_classificada") ===
          k,
      ),
      (t) => t.valor,
    ),
    quantidade: despesas.filter(
      (t) =>
        (dadosComplementares("despesa", t.id).classificacao || "nao_classificada") ===
        k,
    ).length,
  }));
  const despesasCategorias = [...new Set(despesas.map((t) => t.categoria))]
    .map((k) => ({
      nome: k,
      valor: soma(
        despesas.filter((t) => t.categoria === k),
        (t) => t.valor,
      ),
    }))
    .sort((a, b) => b.valor - a.valor);
  const formas = [
    ...new Set(d.pagamentos.filter((p) => em(p.data)).map((p) => p.forma)),
  ]
    .map((k) => {
      const ps = d.pagamentos.filter((p) => em(p.data) && p.forma === k);
      return {
        nome: k,
        quantidade: ps.filter((p) => !p.estorno).length,
        estornos: ps.filter((p) => p.estorno).length,
        valor: soma(ps, (p) => p.valor),
      };
    })
    .sort((a, b) => b.quantidade - a.quantidade);
  const prontas = ordens.filter(
    (o) => ["ready", "delivered"].includes(o.situacao) && em(o.pronta),
  );
  const tipos = [...new Set(prontas.map((o) => o.tipo || "sem_tipo"))]
    .map((tipo) => {
      const os = prontas.filter((o) => (o.tipo || "sem_tipo") === tipo);
      const vals = os.flatMap((o) => {
        const v = diasEntre(o.entrada, o.pronta);
        return v === null ? [] : [v];
      });
      return {
        tipo,
        quantidade: os.length,
        amostra: vals.length,
        dias: mediaGestao(vals),
      };
    })
    .sort((a, b) => (a.dias ?? Infinity) - (b.dias ?? Infinity));
  const etapas = new Map<string, Map<string, number>>();
  let semHistorico = 0;
  for (const o of ordens) {
    const hs = (historicoPorOS.get(o.id) || [])
      .filter((h) => h.para && h.de !== h.para)
      .sort((a, b) => a.data.localeCompare(b.data));
    if (!hs.length) {
      // A falta de histórico só afeta o tempo das etapas no período consultado.
      if (
        (!o.entrada || Date.parse(o.entrada) < ate) &&
        Date.parse(o.entrega || o.cancelamento || d.agora) > de
      )
        semHistorico++;
      continue;
    }
    let cursor = o.entrada ? Date.parse(o.entrada) : Date.parse(hs[0].data),
      etapa = hs[0].de || "open";
    const fimOS = Math.min(ate, o.entrega ? Date.parse(o.entrega) : ate);
    for (const h of [
      ...hs,
      {
        data: new Date(Math.max(cursor, fimOS)).toISOString(),
        para: null,
        de: null,
        os: o.id,
      },
    ]) {
      const b = Math.min(Date.parse(h.data), fimOS),
        a = Math.max(cursor, de);
      if (b > a && !["delivered", "cancelled"].includes(etapa)) {
        const m = etapas.get(etapa) || new Map<string, number>();
        m.set(o.id, (m.get(o.id) || 0) + (b - a) / DIA);
        etapas.set(etapa, m);
      }
      cursor = Date.parse(h.data);
      etapa = h.para || etapa;
      if (cursor >= fimOS) break;
    }
  }
  const tempoEtapas = [...etapas].map(([etapa, m]) => ({
    etapa,
    ordens: m.size,
    dias: mediaGestao([...m.values()]),
  }));
  const atrasos = ordens
    .filter(
      (o) =>
        o.situacao !== "cancelled" &&
        o.prazo &&
        o.entrada &&
        Date.parse(o.entrada) < ate &&
        Date.parse(o.prazo) < Math.min(o.entrega ? Date.parse(o.entrega) : ate, ate) &&
        (o.entrega ? Date.parse(o.entrega) : ate) > de,
    )
    .map((o) => ({
      ...o,
      dias: Math.max(
        0,
        (Math.min(o.entrega ? Date.parse(o.entrega) : ate, ate) -
          Date.parse(o.prazo!)) /
          DIA,
      ),
    }));
  const paradas = ordens.flatMap((o) => {
    const ps = (paradasPorOS.get(o.id) || [])
      .map(
        (p) =>
          [
            Math.max(de, Date.parse(p.inicio)),
            Math.min(ate, Date.parse(p.fim || o.entrega || o.cancelamento || d.agora)),
          ] as [number, number],
      )
      .filter(([a, b]) => b > a);
    return ps.length ? [{ ...o, dias: duracaoUnida(ps) / DIA }] : [];
  });
  const motivosParada = [...new Set(d.paradas.map((p) => p.motivo))]
    .map((motivo) => {
      const ps = d.paradas.filter(
        (p) =>
          ids.has(p.os) &&
          p.motivo === motivo &&
          Date.parse(p.inicio) < ate &&
          Date.parse(p.fim || d.agora) > de,
      );
      return {
        motivo,
        quantidade: new Set(ps.map((p) => p.os)).size,
        horas: [...new Set(ps.map((p) => p.os))].reduce(
          (total, id) =>
            total +
            duracaoUnida(
              ps
                .filter((p) => p.os === id)
                .map((p) => [
                  Math.max(de, Date.parse(p.inicio)),
                  Math.min(
                    ate,
                    Date.parse(
                      p.fim ||
                        ordensPorId.get(id)?.entrega ||
                        ordensPorId.get(id)?.cancelamento ||
                        d.agora,
                    ),
                  ),
                ]),
            ) /
              3600000,
          0,
        ),
      };
    })
    .filter((p) => p.quantidade);
  const atuais = ordens.filter((o) => !["delivered", "cancelled"].includes(o.situacao)),
    atuaisIds = new Set(atuais.map((o) => o.id)),
    ativosParados = d.paradas.filter((p) => !p.fim && atuaisIds.has(p.os));
  const capacidade = Number(cfg.capacidade) || null;
  const permanencia = soma(ordens, (o) =>
    o.entrada
      ? Math.max(
          0,
          Math.min(ate, Date.parse(o.entrega || o.cancelamento || d.agora)) -
            Math.max(de, Date.parse(o.entrada)),
        )
      : 0,
  );
  const ocupacaoMedia =
    capacidade && ate > de ? (permanencia / (ate - de) / capacidade) * 100 : null;
  const clientesPeriodo = new Set(
    entregues.flatMap((o) => (o.cliente_id ? [o.cliente_id] : [])),
  );
  const primeirasEntregas = new Map<string, string>();
  for (const o of d.ordens)
    if (
      o.cliente_id &&
      o.situacao === "delivered" &&
      o.entrega &&
      (!primeirasEntregas.has(o.cliente_id) ||
        o.entrega < primeirasEntregas.get(o.cliente_id)!)
    )
      primeirasEntregas.set(o.cliente_id, o.entrega);
  for (const p of d.primeiras_entregas || [])
    if (p.data) primeirasEntregas.set(p.cliente_id, p.data);
  const primeiraNoPeriodo = new Map<string, string>();
  for (const o of entregues)
    if (
      o.cliente_id &&
      o.entrega &&
      (!primeiraNoPeriodo.has(o.cliente_id) ||
        o.entrega < primeiraNoPeriodo.get(o.cliente_id)!)
    )
      primeiraNoPeriodo.set(o.cliente_id, o.entrega);
  const clientesRetornaram = [...clientesPeriodo].filter(
    (id) =>
      primeirasEntregas.has(id) &&
      primeirasEntregas.get(id)! < primeiraNoPeriodo.get(id)!,
  );
  const notas = qualidade.flatMap((q) => (q.nota_cliente ? [q.nota_cliente] : [])),
    resolucoes = qualidade
      .filter((q) => q.situacao === "resolvida")
      .flatMap((q) => {
        const v = diasEntre(q.aberto_em, q.resolvido_em);
        return v === null ? [] : [v];
      });
  const reclamacoesResolvidas = qualidade
    .filter(
      (q) => (q.reclamacao || q.tipo === "reclamacao") && q.situacao === "resolvida",
    )
    .flatMap((q) => {
      const v = diasEntre(q.aberto_em, q.resolvido_em);
      return v === null ? [] : [v];
    });
  const motivosQualidade = [...new Set(qualidade.map((q) => q.motivo))]
    .map((motivo) => {
      const qs = qualidade.filter((q) => q.motivo === motivo);
      return {
        motivo,
        quantidade: qs.length,
        custo: soma(qs, custoOcorrencia),
      };
    })
    .sort((a, b) => b.quantidade - a.quantidade);
  const servicosQualidade = [
    ...new Set(qualidade.map((q) => q.item_os_id || "sem_servico")),
  ].map((id) => {
    const qs = qualidade.filter((q) => (q.item_os_id || "sem_servico") === id);
    return {
      id,
      nome: itensPorId.get(id)?.nome || "Serviço não identificado",
      quantidade: qs.length,
      custo: soma(qs, custoOcorrencia),
      horas: soma(qs, (q) => q.horas_retrabalho),
    };
  });
  const coorteRetornos = entregues.filter((o) =>
    qualTodas.some(
      (q) =>
        q.ordem_original_id === o.id &&
        q.tipo === "garantia" &&
        Date.parse(q.aberto_em) >= Date.parse(o.entrega!),
    ),
  );
  const produtos = d.produtos
    .map((p) => {
      const c = dadosComplementares("produto", p.id),
        mov = movimentosPorProduto.get(p.id) || [],
        ultimo =
          p.ultima_movimentacao !== undefined
            ? p.ultima_movimentacao || p.criado
            : mov.reduce<string | null>(
                (maior, m) => (!maior || m.data > maior ? m.data : maior),
                null,
              ) || p.criado,
        idade = ultimo ? Math.floor((agora - Date.parse(ultimo)) / DIA) : null,
        usos = mov.filter((m) => em(m.data) && !!m.os);
      return {
        ...p,
        maximo: c.maximo == null ? null : Number(c.maximo),
        reposicao: c.reposicao_dias == null ? null : Number(c.reposicao_dias),
        fornecedor_id: String(c.fornecedor_id || ""),
        fornecedor:
          fornecedoresPorId.get(String(c.fornecedor_id))?.nome || p.fornecedor,
        disponivel: Math.max(0, p.saldo - p.reservado),
        faltaReserva: Math.max(0, p.reservado - p.saldo),
        valor: Math.round(p.saldo * p.custo),
        idade,
        ultimo,
        semMovimento:
          p.ultima_movimentacao !== undefined ? !p.ultima_movimentacao : !mov.length,
        uso: -soma(usos, (m) => m.quantidade),
        movimentosPeriodo: mov.filter((m) => em(m.data)).length,
      };
    })
    .filter(
      (p) =>
        (!f.fornecedor || p.fornecedor_id === f.fornecedor) &&
        `${p.nome} ${p.codigo || ""}`.toLowerCase().includes(f.busca.toLowerCase()) &&
        (!f.estoque ||
          (f.estoque === "baixo"
            ? p.disponivel < p.minimo
            : f.estoque === "zerado"
              ? p.saldo === 0
              : f.estoque === "reservado"
                ? p.reservado > 0
                : f.estoque === "sem_movimento"
                  ? p.movimentosPeriodo === 0
                  : p.saldo > 0 && p.idade !== null && p.idade > Number(f.estoque))),
    );
  const compras = d.compras
    .filter((c) => em(c.data) && (!f.fornecedor || c.fornecedor_id === f.fornecedor))
    .map((c) => {
      const x = dadosComplementares("compra", c.id);
      return {
        ...c,
        pedido: String(x.pedido_em || ""),
        prevista: String(x.prevista_em || ""),
        condicoes: String(x.condicoes || ""),
        prazo: diasEntre(String(x.pedido_em || "") || null, c.data),
        atraso: x.prevista_em
          ? Math.max(0, (Date.parse(c.data) - Date.parse(String(x.prevista_em))) / DIA)
          : null,
      };
    });
  const fornecedores = [...new Set(compras.map((c) => c.fornecedor_id || c.fornecedor))]
    .map((id) => {
      const cs = compras.filter((c) => (c.fornecedor_id || c.fornecedor) === id);
      return {
        id,
        nome: cs[0].fornecedor,
        quantidade: cs.length,
        total: soma(cs, (c) => c.total),
        prazo: mediaGestao(cs.flatMap((c) => (c.prazo === null ? [] : [c.prazo]))),
        amostra: cs.filter((c) => c.prazo !== null).length,
        atrasadas: cs.filter((c) => c.atraso !== null && c.atraso > 0).length,
        comPrevisao: cs.filter((c) => c.atraso !== null).length,
      };
    })
    .sort((a, b) => b.total - a.total);
  const produtosIds = new Set(produtos.map((p) => p.id));
  const movimentos = d.movimentos.filter(
    (m) => em(m.data) && produtosIds.has(m.produto),
  );
  const excecoes = movimentos
    .filter((m) => m.tipo === "ajuste" || m.tipo === "estorno" || m.tipo === "saida")
    .map((m) => ({
      ...m,
      nome: produtosPorId.get(m.produto)?.nome || "Peça",
      valor: Math.round(Math.abs(m.quantidade) * m.custo),
    }));
  const agenda = d.agenda
    .filter(
      (a) => Date.parse(a.inicio) >= agora && Date.parse(a.inicio) < agora + 7 * DIA,
    )
    .sort((a, b) => a.inicio.localeCompare(b.inicio));
  const livres: {
    dia: string;
    recurso: string;
    horas: number | null;
    semFim: number;
  }[] = [];
  if (cfg.abertura && cfg.fechamento && Array.isArray(cfg.dias)) {
    const recursos = [...new Set(d.agenda.map((a) => a.recurso))];
    for (let i = 0; i < 7; i++) {
      const dia = new Date(Date.parse(diaGestao(d.agora)) + i * DIA)
        .toISOString()
        .slice(0, 10);
      if (!cfg.dias.includes(new Date(dia + "T12:00:00-03:00").getUTCDay())) continue;
      const a = Math.max(agora, Date.parse(dia + "T" + cfg.abertura + "-03:00")),
        b = Date.parse(dia + "T" + cfg.fechamento + "-03:00");
      if (b <= a) continue;
      for (const recurso of recursos) {
        const eventos = d.agenda.filter(
          (e) =>
            e.recurso === recurso &&
            Date.parse(e.inicio) < b &&
            Date.parse(e.fim || e.inicio) >= Date.parse(dia + "T00:00:00-03:00"),
        );
        const semFim = eventos.filter((e) => !e.fim).length;
        const ocupado = duracaoUnida(
          eventos
            .filter((e) => e.fim)
            .map((e) => [
              Math.max(a, Date.parse(e.inicio)),
              Math.min(b, Date.parse(e.fim!)),
            ]),
        );
        livres.push({
          dia,
          recurso,
          horas: semFim ? null : Math.max(0, b - a - ocupado) / 3600000,
          semFim,
        });
      }
    }
  }
  return {
    osFinanceiro,
    entradasTecnicas: ordens.filter((o) => o.situacao !== "cancelled" && em(o.entrada)),
    servicos: rankingItens("service"),
    pecas: rankingItens("part"),
    clientes,
    perdasClientes,
    equipe,
    despesas,
    despesasGrupos,
    despesasCategorias,
    formas,
    tipos,
    tempoEtapas,
    semHistorico,
    atrasos,
    paradas,
    motivosParada,
    atuais,
    capacidade,
    ocupacaoMedia,
    ocupacaoAtual: capacidade ? (atuais.length / capacidade) * 100 : null,
    diagnostico: atuais.filter((o) => o.situacao === "open").length,
    aprovacao: new Set(
      ativosParados.filter((p) => p.motivo === "approval").map((p) => p.os),
    ).size,
    pecasAguardando: new Set(
      ativosParados.filter((p) => p.motivo === "parts").map((p) => p.os),
    ).size,
    tempoInicio: mediaGestao(
      ordens
        .filter(
          (o) =>
            em(o.inicio) &&
            (!o.pronta || Date.parse(o.inicio!) <= Date.parse(o.pronta)) &&
            (!o.entrega || Date.parse(o.inicio!) <= Date.parse(o.entrega)),
        )
        .flatMap((o) => {
          const v = diasEntre(o.entrada, o.inicio);
          return v === null ? [] : [v];
        }),
    ),
    tempoPermanencia: mediaGestao(
      entregues.flatMap((o) => {
        const v = diasEntre(o.entrada, o.entrega);
        return v === null ? [] : [v];
      }),
    ),
    retornoClientes: clientesPeriodo.size
      ? (clientesRetornaram.length / clientesPeriodo.size) * 100
      : null,
    clientesIdentificados: clientesPeriodo.size,
    qualidade,
    motivosQualidade,
    servicosQualidade,
    qualidadeResumo: {
      garantias: qualidade.filter((q) => q.tipo === "garantia").length,
      retrabalhos: qualidade.filter(
        (q) => q.houve_retrabalho || q.tipo === "retrabalho",
      ).length,
      reclamacoes: qualidade.filter((q) => q.reclamacao || q.tipo === "reclamacao")
        .length,
      horas: soma(qualidade, (q) => q.horas_retrabalho),
      custo: soma(qualidade, custoOcorrencia),
      pendentes: qualidade.filter((q) => !q.custos_conferidos).length,
      abertas: qualidade.filter((q) => !["resolvida", "cancelada"].includes(q.situacao))
        .length,
      nota: mediaGestao(notas),
      avaliacoes: notas.length,
      satisfacao: notas.length
        ? (notas.filter((n) => n >= 4).length / notas.length) * 100
        : null,
      resolucao: mediaGestao(resolucoes),
      reclamacaoResolucao: mediaGestao(reclamacoesResolvidas),
      resolvidas: resolucoes.length,
      coorte: entregues.length
        ? (coorteRetornos.length / entregues.length) * 100
        : null,
    },
    orcamentos: d.orcamentos.filter(
      (o) =>
        em(o.data) &&
        (!f.cliente || o.cliente_id === f.cliente) &&
        (!f.tipo || (o.tipo || "sem_tipo") === f.tipo),
    ),
    produtos,
    compras,
    fornecedores,
    excecoes,
    agenda,
    livres,
    resumoFinanceiro: {
      receita: soma(osFinanceiro, (o) => o.total),
      margem: soma(osFinanceiro, (o) => o.margem),
      rentabilidade: mediaGestao(
        osFinanceiro
          .filter((o) => o.conferido)
          .map((o) => o.percentual)
          .filter((v): v is number => v !== null),
      ),
      ticketMargem: mediaGestao(
        osFinanceiro.filter((o) => o.conferido).map((o) => o.margem),
      ),
      conferidas: osFinanceiro.filter((o) => o.conferido).length,
      pendentes: osFinanceiro.filter((o) => !o.conferido).length,
    },
  };
}
export type ResultadoGestao = ReturnType<typeof calcularGestao>;
