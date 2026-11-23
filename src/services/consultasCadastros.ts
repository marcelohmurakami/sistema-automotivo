import { rpc } from "../lib/rpc";
import type { Auxiliares } from "./orcamentos";
import type { ItemCatalogo } from "../lib/catalogo";

export type ConsultaCadastro = {
  busca?: string;
  cliente?: string;
  id?: string;
  tipoItem?: "service" | "part" | "";
};

export type CatalogoConsultado = ItemCatalogo;
type Cadastros = {
  clientes: Auxiliares["clientes"][number];
  veiculos: Auxiliares["veiculos"][number] & { cliente_id: string };
  catalogo: CatalogoConsultado;
};

/** Busca de seleção: até 30 opções; a busca por ID recupera a seleção fora do lote. */
export function buscarCadastro<T extends keyof Cadastros>(
  oficina: string,
  tipo: T,
  filtros: ConsultaCadastro = {},
  signal?: AbortSignal,
) {
  return rpc<Cadastros[T][]>(
    "buscar_cadastros_operacao",
    {
      p_oficina: oficina,
      p_tipo: tipo,
      p_busca: filtros.busca?.trim() || "",
      p_cliente: filtros.cliente || null,
      p_id: filtros.id || null,
      p_tipo_item: filtros.tipoItem || "",
    },
    signal,
  );
}
