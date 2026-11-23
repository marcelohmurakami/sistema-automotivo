import { resultadoAtendimento } from "./calculosAtendimento.ts";
import type { CusteioRelatorio } from "../types/custeioRelatorio";
import type {
  DetalhesAtendimento,
  QualidadeAtendimento,
} from "../types/servicosCompletos";
import type { AtendimentoServico, ReservaServico } from "../services/servicos";
import type { TituloFinanceiro, BaixaFinanceira } from "../services/financeiro";
export type ContaAtendimento = {
  atendimento_id: string;
  numero: number;
  titulo: string;
  data_servico: string;
  cliente_id: string;
  cliente: string;
  telefone: string | null;
  titulo_id: string;
  total: number;
  pago: number;
  saldo: number;
  vencimento: string;
};
export type EstoqueRelatorioServico = {
  id: string;
  descricao: string;
  saldo: number;
  minimo: number;
  custo_centavos: number;
  fornecedor: string;
  ultima_movimentacao: string | null;
  consumido: number;
  reservado: number;
};
export type RelatorioServicos = {
  custeios?: Record<string, CusteioRelatorio>;
  agora: string;
  detalhes: DetalhesAtendimento[];
  abertos: (AtendimentoServico & { funcionarios: string[] })[];
  agenda: (ReservaServico & { titulo: string; recurso: string })[];
  qualidade: (QualidadeAtendimento & {
    titulo: string;
    cliente: string;
    cliente_id: string;
    subsetor: string;
  })[];
  titulos: TituloFinanceiro[];
  baixas: (BaixaFinanceira & { natureza: string; categoria: string })[];
  devedores: ContaAtendimento[];
  estoque: EstoqueRelatorioServico[];
};
export type Classificacao = {
  id: string;
  nome: string;
  valor: number;
  quantidade: number;
};
/** Distribui centavos sem perder o resíduo do arredondamento entre os itens. */
export function ratearCentavos(total: number, pesos: number[]) {
  if (
    !Number.isSafeInteger(total) ||
    total < 0 ||
    pesos.some((p) => !Number.isSafeInteger(p) || p < 0)
  )
    throw Error("Rateio monetário inválido.");
  const soma = pesos.reduce((s, p) => s + BigInt(p), 0n);
  if (!soma) return pesos.map(() => 0);
  let acumulado = 0n,
    anterior = 0n;
  return pesos.map((p) => {
    acumulado += BigInt(p);
    const atual = (BigInt(total) * acumulado * 2n + soma) / (soma * 2n),
      valor = Number(atual - anterior);
    anterior = atual;
    return valor;
  });
}
export function ranking(
  lista: { id: string; nome: string; valor: number; quantidade?: number }[],
): Classificacao[] {
  const m = new Map<string, Classificacao>();
  for (const x of lista) {
    const a = m.get(x.id) || { id: x.id, nome: x.nome, valor: 0, quantidade: 0 };
    a.valor += x.valor;
    a.quantidade += x.quantidade ?? 1;
    m.set(x.id, a);
  }
  return [...m.values()].sort(
    (a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome),
  );
}
const media = (ns: number[]) =>
  ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : null;
export function resumirServicos(
  r: RelatorioServicos,
  inicio: string,
  fim: string,
  filtros: { subsetor?: string; cliente?: string; funcionario?: string } = {},
) {
  const detalhes = r.detalhes.filter(
    (d) =>
      (!filtros.subsetor ||
        d.atendimento.ficha_especialidade?.especialidade === filtros.subsetor) &&
      (!filtros.cliente || d.atendimento.cliente_id === filtros.cliente) &&
      (!filtros.funcionario ||
        r.custeios?.[d.atendimento.id]?.participantes.some(
          (e) => e.funcionario_id === filtros.funcionario,
        ) ||
        d.equipe.some((e) => e.funcionario_id === filtros.funcionario)),
  );
  const encerrados = detalhes.filter((d) => d.atendimento.situacao === "concluido");
  const calculados = encerrados.map((d) => {
    const v = resultadoAtendimento(d),
      c = r.custeios?.[d.atendimento.id];
    return {
      d,
      v: c
        ? { ...v, custo: c.custo, margem: v.receita - c.custo, horas: c.minutos / 60 }
        : v,
    };
  });
  const receita = calculados.reduce((s, x) => s + x.v.receita, 0),
    custo = calculados.reduce((s, x) => s + x.v.custo, 0);
  const serie = new Map<string, { data: string; valores: number[] }>();
  for (
    let t = Date.parse(inicio + "T12:00:00Z");
    t <= Date.parse(fim + "T12:00:00Z");
    t += 86400000
  ) {
    const data = new Date(t).toISOString().slice(0, 10);
    serie.set(data, { data, valores: [0, 0] });
  }
  for (const { d, v } of calculados) {
    const p = serie.get(d.atendimento.data_servico || "");
    if (p) {
      p.valores[0] += v.receita;
      p.valores[1] += v.margem;
    }
  }
  const clientes = ranking(
    calculados.map(({ d, v }) => ({
      id: d.atendimento.cliente_id,
      nome: d.cliente.nome,
      valor: v.receita,
    })),
  );
  const margens = ranking(
    calculados.map(({ d, v }) => ({
      id: d.atendimento.cliente_id,
      nome: d.cliente.nome,
      valor: v.margem,
    })),
  );
  const itens = calculados.flatMap(({ d }) => {
    const receitas = ratearCentavos(
      d.atendimento.valor_centavos,
      d.itens.map((i) => Math.round(i.quantidade * i.preco_centavos)),
    );
    return d.itens.map((i, j) => ({
      ...i,
      receita: receitas[j],
      margem:
        receitas[j] -
        Math.round(i.quantidade * (i.origem === "cliente" ? 0 : i.custo_centavos || 0)),
    }));
  });
  const qualidade = r.qualidade.filter(
    (q) =>
      (!filtros.subsetor || q.subsetor === filtros.subsetor) &&
      (!filtros.cliente || q.cliente_id === filtros.cliente) &&
      (!filtros.funcionario || q.funcionario_id === filtros.funcionario),
  );
  const baixas = r.baixas.filter((b) => b.categoria !== "transferencia");
  let entradas = 0,
    saidas = 0,
    taxas = 0;
  for (const b of baixas) {
    const sinal = b.estorno_de ? -1 : 1;
    if (b.natureza === "receber") {
      entradas += sinal * (b.valor_centavos - b.taxa_centavos);
      taxas += sinal * b.taxa_centavos;
    } else saidas += sinal * (b.valor_centavos + b.taxa_centavos);
  }
  const horas = calculados.reduce((s, x) => s + x.v.horas, 0);
  const prazo = (d: DetalhesAtendimento) =>
    d.atendimento.ficha_especialidade?.campos.prazo_servico;
  const atrasados = encerrados.filter(
    (d) =>
      prazo(d) &&
      d.atendimento.concluido_em &&
      diaSP(d.atendimento.concluido_em) > prazo(d)!,
  );
  const duracoes = encerrados
    .filter((d) => d.atendimento.concluido_em && d.atendimento.data_servico)
    .map((d) => ({
      id: d.atendimento.ficha_especialidade?.especialidade || "geral",
      nome: d.atendimento.ficha_especialidade?.especialidade || "Geral",
      valor: Math.max(
        0,
        (Date.parse(diaSP(d.atendimento.concluido_em!)) -
          Date.parse(d.atendimento.data_servico!)) /
          86400000,
      ),
    }));
  const etapas = detalhes.flatMap((d) => {
    const eventos = [...d.eventos]
      .filter((e) => e.tipo === "etapa")
      .sort((a, b) => a.criado_em.localeCompare(b.criado_em));
    return eventos.flatMap((e, i) => {
      const fim = eventos[i + 1]?.criado_em || d.atendimento.concluido_em;
      if (!fim || !e.depois) return [];
      return [
        {
          id: e.depois,
          nome: e.depois,
          valor: Math.max(0, (Date.parse(fim) - Date.parse(e.criado_em)) / 3600000),
        },
      ];
    });
  });
  const documentosPorFuncionario = new Map<string, DetalhesAtendimento[]>();
  for (const d of encerrados) {
    const participantes = r.custeios?.[d.atendimento.id]?.participantes ?? d.equipe;
    // Um documento conta uma vez, mesmo que um cadastro antigo repita o participante.
    for (const id of new Set(participantes.map((p) => p.funcionario_id))) {
      const documentos = documentosPorFuncionario.get(id);
      if (documentos) documentos.push(d);
      else documentosPorFuncionario.set(id, [d]);
    }
  }
  const funcionarios = ranking(
    calculados.flatMap(({ d, v }) => {
      const custeio = r.custeios?.[d.atendimento.id];
      if (custeio)
        return custeio.participantes.map((e) => ({
          id: e.funcionario_id,
          nome: e.nome,
          valor: e.receita,
        }));
      const receitas = ratearCentavos(
        v.receita,
        d.equipe.map(() => 1),
      );
      return d.equipe.map((e, j) => ({
        id: e.funcionario_id,
        nome: e.nome,
        valor: receitas[j],
      }));
    }),
  )
    .filter((e) => !filtros.funcionario || e.id === filtros.funcionario)
    .map((e) => {
      const docs = documentosPorFuncionario.get(e.id) ?? [];
      const horas = docs.reduce((s, d) => {
        const c = r.custeios?.[d.atendimento.id];
        return (
          s +
          (c
            ? (c.participantes.find((p) => p.funcionario_id === e.id)?.minutos || 0) /
              60
            : d.horas
                .filter((h) => h.funcionario_id === e.id && h.fim)
                .reduce(
                  (n, h) => n + (Date.parse(h.fim!) - Date.parse(h.inicio)) / 3600000,
                  0,
                ))
        );
      }, 0);
      const comissoes = docs.reduce(
        (s, d) =>
          s +
          (r.custeios?.[d.atendimento.id]
            ? r.custeios[d.atendimento.id].participantes.find(
                (p) => p.funcionario_id === e.id,
              )?.comissoes || 0
            : d.equipe.find((p) => p.funcionario_id === e.id)?.comissao_centavos || 0),
        0,
      );
      return { ...e, quantidade: docs.length, horas, comissoes };
    });
  return {
    detalhes,
    encerrados,
    receita,
    custo,
    margem: receita - custo,
    ticket: encerrados.length ? receita / encerrados.length : 0,
    horas,
    clientes,
    margens,
    funcionarios,
    custosPendentes: encerrados.filter(
      (d) => !r.custeios?.[d.atendimento.id]?.conferido,
    ).length,
    atribuicoesPendentes: encerrados.filter(
      (d) => r.custeios?.[d.atendimento.id]?.atribuicao_revisar,
    ).length,
    qualidade,
    garantias: qualidade.filter((q) => q.tipo === "garantia").length,
    retrabalhos: qualidade.filter((q) => q.tipo === "retrabalho").length,
    custoQualidade: qualidade.reduce((s, q) => s + q.custo_centavos, 0),
    nota: media(qualidade.filter((q) => q.nota !== null).map((q) => q.nota!)),
    diasResolucao: media(
      qualidade
        .filter((q) => q.resolvido_em)
        .map((q) => (Date.parse(q.resolvido_em!) - Date.parse(q.aberto_em)) / 86400000),
    ),
    servicos: ranking(
      itens
        .filter((i) => i.tipo === "servico")
        .map((i) => ({
          id: i.descricao,
          nome: i.descricao,
          valor: i.receita,
          quantidade: i.quantidade,
        })),
    ),
    materiais: ranking(
      itens
        .filter((i) => i.tipo === "material")
        .map((i) => ({
          id: i.produto_id || i.descricao,
          nome: i.descricao,
          valor: i.receita,
          quantidade: i.quantidade,
        })),
    ),
    lucroMateriais: ranking(
      itens
        .filter((i) => i.tipo === "material")
        .map((i) => ({
          id: i.produto_id || i.descricao,
          nome: i.descricao,
          valor: i.margem,
          quantidade: i.quantidade,
        })),
    ),
    serie: [...serie.values()],
    entradas,
    saidas,
    taxas,
    despesas: ranking(
      r.titulos
        .filter(
          (t) =>
            t.natureza === "pagar" &&
            ![
              "transferencia",
              "compra_estoque",
              "retirada",
              "aporte",
              "saldo_inicial",
            ].includes(t.categoria) &&
            t.competencia >= inicio &&
            t.competencia <= fim,
        )
        .map((t) => ({ id: t.categoria, nome: t.categoria, valor: t.valor_centavos })),
    ),
    formas: ranking(
      baixas
        .filter((b) => b.natureza === "receber")
        .map((b) => ({
          id: b.forma,
          nome: b.forma,
          valor: (b.estorno_de ? -1 : 1) * b.valor_centavos,
        })),
    ),
    atrasados,
    diasAtraso: media(
      atrasados.map(
        (d) =>
          (Date.parse(diaSP(d.atendimento.concluido_em!)) - Date.parse(prazo(d)!)) /
          86400000,
      ),
    ),
    duracoes: ranking(duracoes).map((x) => ({ ...x, valor: x.valor / x.quantidade })),
    etapas: ranking(etapas).map((x) => ({ ...x, valor: x.valor / x.quantidade })),
    orcado: detalhes.reduce((s, d) => s + (d.comercial.orcado_centavos || 0), 0),
    finalOrcado: detalhes
      .filter((d) => d.comercial.orcado_centavos != null)
      .reduce((s, d) => s + d.atendimento.valor_centavos, 0),
    devedores: ranking(
      r.devedores.map((c) => ({ id: c.cliente_id, nome: c.cliente, valor: c.saldo })),
    ),
  };
}
const formatoDiaSP = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Sao_Paulo",
});
export function diaSP(v: string) {
  return formatoDiaSP.format(new Date(v));
}
