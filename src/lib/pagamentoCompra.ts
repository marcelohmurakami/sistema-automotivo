import {
  gerarParcelasFinanceiras,
  type ParcelaFinanceira,
} from "./parcelasFinanceiras";
export type PlanoPagamentoCompra = {
  modo: "pago" | "prazo";
  forma: string;
  conta: string;
  data: string;
  parcelas: ParcelaFinanceira[];
};
export const parcelasCompra = (total: number, n: number, dia: string) =>
  n === 1
    ? [{ valor_centavos: total, vencimento: dia }]
    : gerarParcelasFinanceiras(total, n, dia);
export function lerPagamentoCompra(f: FormData, total: number): PlanoPagamentoCompra {
  const modo = String(f.get("compra_pagamento")) as PlanoPagamentoCompra["modo"],
    data = String(f.get("compra_data") || "");
  const datas = modo === "pago" ? [data] : f.getAll("compra_vencimento").map(String);
  if (
    !["pago", "prazo"].includes(modo) ||
    !datas.length ||
    datas.length > 60 ||
    total < datas.length ||
    datas.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d))
  )
    throw Error("Confira o pagamento e as datas das parcelas.");
  return {
    modo,
    forma: String(f.get("compra_forma")),
    conta: String(f.get("compra_conta") || "banco"),
    data,
    parcelas: parcelasCompra(total, datas.length, datas[0]).map((p, i) => ({
      ...p,
      vencimento: datas[i],
    })),
  };
}
