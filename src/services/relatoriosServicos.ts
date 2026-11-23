import { rpc } from "../lib/rpc";
import { lerServicosDemo } from "./servicos";
import { consultarDetalhesAtendimento } from "./servicosCompletos";
import { lerEstoqueDemo } from "./estoque";
import type { RelatorioServicos, ContaAtendimento } from "../lib/relatoriosServicos";
import { consultarFinanceiroDemoCompleto } from "./financeiro";
export function validarPeriodoServicos(inicio: string, fim: string) {
  if (
    !inicio ||
    !fim ||
    inicio > fim ||
    !Number.isFinite(Date.parse(inicio)) ||
    !Number.isFinite(Date.parse(fim)) ||
    Date.parse(fim) - Date.parse(inicio) > 366 * 86400000
  )
    throw Error("Selecione um período válido de até 367 dias.");
}
export async function consultarRelatoriosServicos(
  demo: boolean,
  oficina: string,
  inicio: string,
  fim: string,
  signal?: AbortSignal,
): Promise<RelatorioServicos> {
  validarPeriodoServicos(inicio, fim);
  if (!demo)
    return rpc(
      "consultar_relatorios_servicos",
      {
        p_oficina: oficina,
        p_inicio: inicio,
        p_fim: fim,
      },
      signal,
    );
  const p = lerServicosDemo(oficina),
    todos = await Promise.all(
      p.atendimentos.map((a) => consultarDetalhesAtendimento(true, oficina, a.id)),
    );
  const fin = consultarFinanceiroDemoCompleto();
  const devedores: ContaAtendimento[] = [];
  for (const c of p.cobrancas) {
    const a = todos.find((d) => d.atendimento.id === c.atendimento_id),
      t = fin.titulos.find((t) => t.id === c.titulo_id);
    if (a && t && t.aberto_centavos > 0)
      devedores.push({
        atendimento_id: a.atendimento.id,
        numero: a.atendimento.numero || 0,
        titulo: a.atendimento.titulo,
        data_servico: a.atendimento.data_servico || a.atendimento.vencimento,
        cliente_id: a.atendimento.cliente_id,
        cliente: a.cliente.nome,
        telefone: a.cliente.telefone,
        titulo_id: t.id,
        total: t.valor_centavos,
        pago: t.baixado_centavos,
        saldo: t.aberto_centavos,
        vencimento: t.vencimento,
      });
  }
  const estoque = lerEstoqueDemo(),
    agora = Date.now();
  return {
    agora: new Date().toISOString(),
    detalhes: todos.filter(
      (d) =>
        (d.atendimento.data_servico || d.atendimento.vencimento) >= inicio &&
        (d.atendimento.data_servico || d.atendimento.vencimento) <= fim,
    ),
    abertos: todos
      .filter((d) => !["concluido", "cancelado"].includes(d.atendimento.situacao))
      .map((d) => ({
        ...d.atendimento,
        funcionarios: d.equipe.map((e) => e.funcionario_id),
      })),
    agenda: p.agenda
      .filter(
        (g) =>
          ["agendado", "confirmado"].includes(g.situacao) &&
          Date.parse(g.inicio) >= agora &&
          Date.parse(g.inicio) < agora + 8 * 86400000,
      )
      .map((g) => ({
        ...g,
        titulo:
          p.atendimentos.find((a) => a.id === g.atendimento_id)?.titulo ||
          "Atendimento",
        recurso: p.recursos.find((r) => r.id === g.recurso_id)?.nome || "",
      })),
    qualidade: todos
      .flatMap((d) =>
        d.qualidade.map((q) => ({
          ...q,
          titulo: d.atendimento.titulo,
          cliente: d.cliente.nome,
          cliente_id: d.atendimento.cliente_id,
          subsetor: d.atendimento.ficha_especialidade?.especialidade || "",
        })),
      )
      .filter((q) => q.aberto_em >= inicio && q.aberto_em <= fim),
    titulos: fin.titulos.filter((t) => !t.cancelado_em),
    baixas: fin.baixas
      .filter((b) => b.data >= inicio && b.data <= fim)
      .map((b) => ({
        ...b,
        natureza: fin.titulos.find((t) => t.id === b.titulo_id)?.natureza || "",
        categoria: fin.titulos.find((t) => t.id === b.titulo_id)?.categoria || "",
      })),
    devedores,
    estoque: estoque.produtos
      .filter((p) => !p.arquivado_em && p.saldo != null)
      .map((p) => ({
        ...p,
        saldo: p.saldo!,
        ultima_movimentacao:
          estoque.movimentos
            .filter((m) => m.item_catalogo_id === p.id)
            .map((m) => m.criado_em)
            .sort()
            .at(-1) || null,
        consumido: -estoque.movimentos
          .filter(
            (m) =>
              m.item_catalogo_id === p.id &&
              m.atendimento_id &&
              m.tipo === "saida" &&
              !m.estornado &&
              m.criado_em.slice(0, 10) >= inicio &&
              m.criado_em.slice(0, 10) <= fim,
          )
          .reduce((s, m) => s + m.quantidade, 0),
        reservado: todos
          .filter((d) =>
            ["aprovado", "em_execucao", "aguardando"].includes(d.atendimento.situacao),
          )
          .flatMap((d) => d.itens)
          .filter((i) => i.produto_id === p.id && i.origem === "estoque")
          .reduce((s, i) => s + i.quantidade, 0),
      })),
  };
}
