import type { ItemEditorOS } from "../components/EditorItensOS";
import type { ItemAtendimento } from "../types/servicosCompletos";

/** Adapta o editor compartilhado sem misturar os contratos dos dois módulos. */
export function itensParaAtendimento(itens: ItemEditorOS[]): ItemAtendimento[] {
  return itens.map((i) => ({
    id: i.id,
    descricao: i.descricao,
    tipo: i.tipo === "part" ? "material" : "servico",
    quantidade: i.quantidade,
    unidade: i.unidade,
    grupo_servico: i.grupo_servico || "",
    depende_grupo: i.depende_grupo || "",
    preco_centavos: i.preco_unitario_centavos,
    custo_centavos: i.custo_unitario_previsto_centavos ?? 0,
    custo_informado: i.custo_unitario_previsto_centavos != null,
    custo_ajustado: i.custo_ajustado,
    produto_id: i.tipo === "part" ? i.produto_estoque_id || null : null,
    origem:
      i.tipo === "part" && i.produto_estoque_id
        ? "estoque"
        : i.origem_peca === "cliente"
          ? "cliente"
          : "externa",
  }));
}
