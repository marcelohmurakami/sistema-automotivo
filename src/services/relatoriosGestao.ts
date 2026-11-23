import { lerOrdensDemo } from "../lib/ordensDemo";
import { rpc } from "../lib/rpc";
import { lerPropostasDemo } from "./orcamentos";
import { lerEstoqueDemo } from "./estoque";
import type { OrdemServico } from "./ordensServico";
import type { DadosGestao, ComplementoGestao } from "../lib/relatoriosGestao";
import type { TituloFinanceiro, BaixaFinanceira } from "./financeiro";
import type { Compra, Fornecedor } from "./compras";
const chave = (id: string) => "patio_gestao_complementos_v1_" + id;
export async function consultarGestao(
  demo: boolean,
  oficina: string,
  inicio: string,
  fim: string,
  equipe: boolean,
  signal?: AbortSignal,
): Promise<DadosGestao> {
  if (!demo)
    return rpc<DadosGestao>(
      "consultar_relatorios_gestao",
      {
        p_oficina: oficina,
        p_inicio: inicio,
        p_fim: fim,
      },
      signal,
    );
  const os: OrdemServico[] = lerOrdensDemo(),
    estoque = lerEstoqueDemo(),
    qs = lerPropostasDemo();
  const fin: { titulos: TituloFinanceiro[]; baixas: BaixaFinanceira[] } = JSON.parse(
    localStorage.getItem("patio_financeiro_v1") || '{"titulos":[],"baixas":[]}',
  );
  const compras: Compra[] = JSON.parse(
      localStorage.getItem("patio_compras_v1") || "[]",
    ),
    fornecedores: Fornecedor[] = JSON.parse(
      localStorage.getItem("patio_fornecedores_v1") || "[]",
    );
  return {
    agora: new Date().toISOString(),
    equipe_permitida: equipe,
    complementos: JSON.parse(localStorage.getItem(chave(oficina)) || "[]"),
    funcionarios: JSON.parse(
      localStorage.getItem("patio_funcionarios_v1_" + oficina) || "[]",
    ),
    fornecedores: fornecedores.map((f) => ({ id: f.id, nome: f.nome })),
    ordens: os
      .filter((o) => !o.arquivado_em)
      .map((o) => ({
        id: o.id,
        numero: o.numero,
        cliente_id: o.cliente_id,
        cliente: o.dados_cliente.nome,
        veiculo: o.dados_veiculo.modelo,
        tipo: o.tipo_servico || null,
        ficha_especialidade: o.ficha_especialidade,
        situacao: o.situacao,
        total: o.total_centavos,
        entrada: o.recebido_em,
        inicio:
          o.historico.find((h) => h.metadados?.new_status === "in_progress")
            ?.ocorrido_em || null,
        pronta: o.concluido_em || null,
        entrega:
          o.historico.find((h) => h.descricao === "Situação: Entregue")?.ocorrido_em ||
          null,
        cancelamento: null,
        prazo: o.entrega_prevista_em,
        orcado:
          qs.find((q) => q.id === o.orcamento_origem_id)?.versao.total_centavos ?? null,
        orcamento: o.orcamento_origem_id,
        adicionais: 0,
        mao_obra: 0,
      })),
    itens: os.flatMap((o) => {
      let acumulado = 0;
      const itens = o.itens.filter((i) => i.situacao !== "cancelled"),
        total = itens.reduce((s, i) => s + (i.total_item_centavos || 0), 0);
      return itens.map((i) => {
        const antes = acumulado;
        acumulado += i.total_item_centavos || 0;
        return {
          id: i.id,
          os: o.id,
          catalogo: i.item_catalogo_id || null,
          produto: i.produto_estoque_id || null,
          tipo: i.tipo,
          nome: i.descricao,
          quantidade: i.quantidade,
          receita: total
            ? Math.round((acumulado * Math.min(o.total_centavos, total)) / total) -
              Math.round((antes * Math.min(o.total_centavos, total)) / total)
            : 0,
        };
      });
    }),
    historico: os.flatMap((o) =>
      o.historico
        .filter((h) => h.metadados?.new_status)
        .map((h) => ({
          os: o.id,
          data: h.ocorrido_em,
          de: String(h.metadados?.old_status || ""),
          para: String(h.metadados?.new_status || ""),
        })),
    ),
    paradas: os.flatMap((o) =>
      o.paradas
        .filter((p) => p.iniciado_em)
        .map((p) => ({
          os: o.id,
          motivo: p.motivo,
          inicio: p.iniciado_em!,
          fim: p.encerrado_em,
        })),
    ),
    qualidade: JSON.parse(
      localStorage.getItem("patio_qualidade_v1_" + oficina) || "[]",
    ),
    orcamentos: qs
      .filter((q) => !q.arquivado_em)
      .map((q) => ({
        id: q.id,
        numero: q.numero,
        situacao: q.situacao,
        data: q.versao.publicado_em || "",
        valor: q.versao.total_centavos,
      })),
    titulos: fin.titulos
      .filter((t) => !t.cancelado_em)
      .map((t) => ({
        id: t.id,
        os: t.ordem_servico_id,
        nome: t.descricao,
        categoria: t.categoria,
        natureza: t.natureza,
        data: t.competencia,
        valor: t.valor_centavos,
        comissao: t.comissao_id || null,
        compra: t.compra_id || null,
        vencimento: t.vencimento,
      })),
    pagamentos: fin.baixas
      .filter((b) =>
        fin.titulos.some(
          (t) =>
            t.id === b.titulo_id &&
            t.natureza === "receber" &&
            t.categoria !== "transferencia",
        ),
      )
      .map((b) => ({
        forma: b.forma,
        valor: b.valor_centavos * (b.estorno_de ? -1 : 1),
        estorno: !!b.estorno_de,
        data: b.data,
      })),
    produtos: estoque.produtos
      .filter((p) => !p.arquivado_em && p.saldo !== null)
      .map((p) => ({
        id: p.id,
        nome: p.descricao,
        codigo: p.codigo,
        unidade: p.unidade,
        saldo: p.saldo!,
        minimo: p.minimo,
        custo: p.custo_centavos,
        fornecedor: p.fornecedor,
        criado: null,
        reservado: os
          .filter(
            (o) => !["delivered", "cancelled"].includes(o.situacao) && !o.arquivado_em,
          )
          .flatMap((o) => o.itens)
          .filter((i) => i.produto_estoque_id === p.id && i.situacao !== "cancelled")
          .reduce((s, i) => s + i.quantidade, 0),
      })),
    movimentos: estoque.movimentos.map((m) => ({
      id: m.id,
      produto: m.item_catalogo_id,
      os: m.ordem_servico_id,
      item: null,
      tipo: m.tipo,
      quantidade: m.quantidade,
      custo: m.custo_centavos,
      motivo: m.motivo,
      data: m.criado_em,
      estorno: m.estorno_de || null,
    })),
    compras: compras
      .filter((c) => !c.cancelado_em)
      .map((c) => ({
        id: c.id,
        fornecedor_id: c.fornecedor_id,
        fornecedor: c.nome_fornecedor,
        documento: c.documento,
        data: c.data,
        total: c.total_centavos,
      })),
    agenda: [],
    comissoes: [],
    profissionais: [],
  };
}
export async function salvarComplemento(
  demo: boolean,
  oficina: string,
  entidade: string,
  id: string,
  dados: Record<string, unknown>,
  revisao: number,
) {
  if (!demo)
    return rpc("salvar_complemento_gestao", {
      p_oficina: oficina,
      p_entidade: entidade,
      p_id: id,
      p_dados: dados,
      p_revisao: revisao,
    });
  const cs: ComplementoGestao[] = JSON.parse(
    localStorage.getItem(chave(oficina)) || "[]",
  );
  const anterior = cs.find((c) => c.entidade === entidade && c.registro_id === id);
  if ((anterior?.revisao || 0) !== revisao)
    throw new Error("Dados alterados. Atualize antes de salvar.");
  localStorage.setItem(
    chave(oficina),
    JSON.stringify([
      ...cs.filter((c) => c !== anterior),
      { entidade, registro_id: id, dados, revisao: revisao + 1 },
    ]),
  );
}
