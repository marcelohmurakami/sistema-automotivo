import { rpc } from "../lib/rpc";
import type { CusteioServico } from "./custeio";
export type ItemLucro = {
  id: string;
  descricao: string;
  quantidade: number;
  preco: number;
  origem: string;
  custo_unitario: number | null;
  custo_ajustado: boolean;
  custo: number | null;
  receita: number;
  margem: number | null;
};
export type LucroDocumento = CusteioServico & {
  revisao: number;
  bruto: number;
  desconto: number;
  pago: number;
  aberto: number;
  itens: ItemLucro[];
};
export type LucroCliente = {
  quantidade: number;
  receita: number;
  ticket_medio: number | null;
  lucro: number;
  lucro_medio: number | null;
  pendentes: number;
};
export const consultarLucroDocumento = (oficina: string, documento: string) =>
  rpc<LucroDocumento>("consultar_lucro_documento", {
    p_oficina: oficina,
    p_documento: documento,
  });
export const consultarLucroCliente = (
  oficina: string,
  cliente: string,
  signal?: AbortSignal,
) =>
  rpc<LucroCliente>(
    "consultar_lucro_cliente",
    {
      p_oficina: oficina,
      p_cliente: cliente,
    },
    signal,
  );
export const salvarCustoItem = (
  oficina: string,
  documento: string,
  item: string,
  revisao: number,
  custo: number | null,
) =>
  rpc("salvar_custo_item_documento", {
    p_oficina: oficina,
    p_documento: documento,
    p_item: item,
    p_revisao: revisao,
    p_custo: custo,
  });
