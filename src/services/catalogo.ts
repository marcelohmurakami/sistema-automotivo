import { rpc } from "../lib/rpc";

import {
  lerCatalogoDemo,
  salvarCatalogoDemo,
  type ItemCatalogo,
  filtrarCatalogo,
} from "../lib/catalogo";
export type CursorCatalogo = Pick<ItemCatalogo, "id" | "descricao" | "favorito">;
export async function consultarFichaServico(
  demo: boolean,
  oficina: string,
  id: string,
  signal?: AbortSignal,
): Promise<ItemCatalogo> {
  if (!demo)
    return rpc("consultar_ficha_servico", { p_oficina: oficina, p_item: id }, signal);
  const i = lerCatalogoDemo(oficina).find((x) => x.id === id && x.tipo === "service");
  if (!i) throw new Error("Serviço não encontrado.");
  return { ...i, ficha: i.ficha || { notas: "", duracao_minutos: null, custos: [] } };
}
export async function paginaCatalogo(
  demo: boolean,
  oficina: string,
  busca: string,
  situacao: string,
  favoritos: boolean,
  cursor: CursorCatalogo | null,
  signal?: AbortSignal,
): Promise<{ itens: ItemCatalogo[]; proximo: CursorCatalogo | null }> {
  if (!demo)
    return rpc(
      "listar_catalogo_paginado",
      {
        p_oficina: oficina,
        p_busca: busca,
        p_arquivados: situacao === "arquivados",
        p_favoritos: favoritos,
        p_apos: cursor,
      },
      signal,
    );
  const lista = filtrarCatalogo(
    lerCatalogoDemo(oficina),
    busca,
    "service",
    situacao,
    favoritos,
  );
  const inicio = cursor ? lista.findIndex((i) => i.id === cursor.id) + 1 : 0;
  const itens = lista.slice(inicio, inicio + 24);
  return { itens, proximo: inicio + 24 < lista.length ? itens.at(-1)! : null };
}
export async function resumoCatalogo(
  demo: boolean,
  oficina: string,
  signal?: AbortSignal,
): Promise<{ ativos: number; favoritos: number }> {
  if (!demo) return rpc("resumo_catalogo", { p_oficina: oficina }, signal);
  const ativos = lerCatalogoDemo(oficina).filter(
    (i) => i.tipo === "service" && !i.arquivado_em,
  );
  return { ativos: ativos.length, favoritos: ativos.filter((i) => i.favorito).length };
}
export async function salvarCatalogo(
  demo: boolean,
  oficina: string,
  item: ItemCatalogo,
  novo = false,
) {
  if (item.ficha) {
    if (
      item.ficha.notas.length > 6000 ||
      (item.ficha.duracao_minutos != null &&
        (!Number.isInteger(item.ficha.duracao_minutos) ||
          item.ficha.duracao_minutos < 1 ||
          item.ficha.duracao_minutos > 43200)) ||
      item.ficha.custos.length > 40 ||
      item.ficha.custos.some(
        (c) =>
          !c.descricao.trim() ||
          c.descricao.length > 160 ||
          !Number.isSafeInteger(c.valor_centavos) ||
          c.valor_centavos < 0,
      )
    )
      throw new Error("Confira os detalhes e custos do serviço.");
    if (item.ficha.custos.length)
      item = {
        ...item,
        custo_centavos: item.ficha.custos.reduce((s, c) => s + c.valor_centavos, 0),
      };
  }
  if (
    item.custo_centavos != null &&
    (!Number.isSafeInteger(item.custo_centavos) ||
      item.custo_centavos < 0 ||
      item.custo_centavos > 100000000)
  )
    throw new Error("Informe um custo entre zero e R$ 1.000.000,00, ou deixe vazio.");
  if (
    !item.descricao.trim() ||
    item.descricao.trim().length > 300 ||
    !item.unidade.trim() ||
    item.unidade.length > 15 ||
    !Number.isSafeInteger(item.preco_padrao_centavos) ||
    item.preco_padrao_centavos < 0 ||
    item.preco_padrao_centavos > 100000000
  )
    throw new Error("Confira descrição, unidade e preço.");
  const d = {
    ...item,
    descricao: item.descricao.trim(),
    unidade: item.unidade.trim(),
  };
  if (demo) return salvarCatalogoDemo(d, novo, oficina);
  return rpc(item.ficha ? "salvar_servico_detalhado" : "salvar_item_catalogo", {
    p_oficina: oficina,
    p_id: item.id,
    p_revisao: novo ? null : item.revisao,
    p_dados: { ...d, arquivado: !!d.arquivado_em },
  });
}
