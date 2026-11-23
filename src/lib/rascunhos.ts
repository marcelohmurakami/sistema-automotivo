import type { DadosProposta } from "../services/orcamentos";
import type { EstadoDesconto } from "./desconto";
export type Rascunho = {
  versao: 1;
  chave: string;
  atualizado: number;
  dados: DadosProposta;
  revisao?: number;
  desconto?: EstadoDesconto;
};
export function chaveRascunho(
  usuario: string,
  oficina: string,
  id = "novo",
  clienteInicial = "",
) {
  // Um orçamento iniciado pela ficha não deve recuperar o rascunho de outro cliente.
  const origem =
    id === "novo" && clienteInicial ? `novo-cliente:${clienteInicial}` : id;
  return `patio_rascunho:${usuario}:${oficina}:${origem}`;
}
export function lerRascunho(
  chave: string,
  storage: Pick<Storage, "getItem"> = localStorage,
  agora = Date.now(),
): Rascunho | null {
  try {
    const v = JSON.parse(storage.getItem(chave) || "null");
    if (
      !v ||
      v.versao !== 1 ||
      typeof v.chave !== "string" ||
      !v.dados ||
      !Array.isArray(v.dados.itens) ||
      v.dados.itens.length > 100 ||
      typeof v.dados.cliente_id !== "string" ||
      typeof v.dados.veiculo_id !== "string" ||
      typeof v.dados.observacoes !== "string" ||
      typeof v.dados.condicoes !== "string" ||
      !Number.isFinite(v.dados.desconto_centavos) ||
      v.dados.itens.some(
        (i: Record<string, unknown> | null) =>
          !i ||
          typeof i.descricao !== "string" ||
          typeof i.unidade !== "string" ||
          !["part", "service"].includes(String(i.tipo)) ||
          !Number.isFinite(i.quantidade) ||
          !Number.isFinite(i.preco_unitario_centavos),
      ) ||
      typeof v.atualizado !== "number" ||
      v.atualizado > agora + 60000 ||
      agora - v.atualizado > 7 * 86400000
    )
      return null;
    return v;
  } catch {
    return null;
  }
}
export function gravarRascunho(
  chave: string,
  dados: Rascunho,
  storage: Pick<Storage, "setItem"> = localStorage,
) {
  try {
    storage.setItem(chave, JSON.stringify(dados));
    return true;
  } catch {
    return false;
  }
}
export function limparRascunho(
  chave: string,
  storage: Pick<Storage, "removeItem"> = localStorage,
) {
  try {
    storage.removeItem(chave);
  } catch {
    /* O cadastro já foi salvo no servidor. */
  }
}
