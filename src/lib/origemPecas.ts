import type { OrdemServico } from "../services/ordensServico";
import type { ProdutoEstoque } from "../services/estoque";

export type OrigemPeca = "estoque" | "cliente" | "externa";
export type EscolhaOrigem = { origem: OrigemPeca; produto?: string };

export function faltaOrigemPeca(erro: unknown) {
  const mensagem =
    erro && typeof erro === "object" && "message" in erro ? String(erro.message) : "";
  return /^Defina a origem (?:da peça|de ).*antes de entregar\.?$/s.test(mensagem);
}

export function pecasSemOrigem(
  os: Pick<OrdemServico, "itens">,
  produtos: ProdutoEstoque[],
) {
  const controlados = new Set(
    produtos.filter((p) => p.saldo !== null).map((p) => p.id),
  );
  return os.itens.filter(
    (i) =>
      i.tipo === "part" &&
      i.situacao !== "cancelled" &&
      !["cliente", "externa"].includes(i.origem_peca ?? "") &&
      !controlados.has(i.produto_estoque_id ?? i.item_catalogo_id ?? ""),
  );
}

export function validarOrigensPecas(
  pecas: OrdemServico["itens"],
  escolhas: Record<string, EscolhaOrigem>,
  produtos: ProdutoEstoque[],
) {
  for (const p of pecas) {
    const e = escolhas[p.id];
    if (!e || !["estoque", "cliente", "externa"].includes(e.origem))
      throw new Error(`Informe de onde veio a peça “${p.descricao}”.`);
    if (
      e.origem === "estoque" &&
      !produtos.some(
        (s) =>
          s.id === e.produto &&
          s.saldo !== null &&
          !s.arquivado_em &&
          s.unidade === p.unidade,
      )
    )
      throw new Error(
        `Selecione a peça “${p.descricao}” no estoque, na unidade ${p.unidade}.`,
      );
  }
}
