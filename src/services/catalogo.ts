import { supabase } from "../lib/supabase";
import { rpc } from "./orcamentos";
import {
  lerCatalogoDemo,
  salvarCatalogoDemo,
  type ItemCatalogo,
} from "../lib/catalogo";
export async function listarCatalogo(
  demo: boolean,
  oficina: string,
): Promise<ItemCatalogo[]> {
  if (demo) return lerCatalogoDemo();
  if (!supabase) throw new Error("Conexão indisponível.");
  const itens: ItemCatalogo[] = [];
  let cursor: string | undefined;
  for (;;) {
    let q = supabase
      .from("itens_catalogo")
      .select(
        "id,tipo,descricao,unidade,preco_padrao_centavos,favorito,arquivado_em,revisao",
      )
      .eq("oficina_id", oficina)
      .order("id")
      .limit(200);
    if (cursor) q = q.gt("id", cursor);
    const { data, error } = await q;
    if (error) throw error;
    itens.push(...(data as ItemCatalogo[]));
    if (data.length < 200) return itens;
    cursor = data[data.length - 1].id;
  }
}
export async function salvarCatalogo(
  demo: boolean,
  oficina: string,
  item: ItemCatalogo,
  novo = false,
) {
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
  if (demo) return salvarCatalogoDemo(d, novo);
  return rpc("salvar_item_catalogo", {
    p_oficina: oficina,
    p_id: item.id,
    p_revisao: novo ? null : item.revisao,
    p_dados: { ...d, arquivado: !!d.arquivado_em },
  });
}
