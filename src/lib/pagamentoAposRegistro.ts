import { createContext, useContext } from "react";

export type RegistroParaPagamento = {
  tipo: "os" | "compra" | "atendimento";
  id: string;
  contexto?: "entrega" | "criacao-pronta";
};

export type ContinuacaoPagamento = {
  rotulo: string;
  rotuloAdiar: string;
  executar: () => void;
};

export const ContextoPagamentoAposRegistro = createContext<
  (registro: RegistroParaPagamento, continuacao?: ContinuacaoPagamento) => void
>(() => {});

export const usePagamentoAposRegistro = () => useContext(ContextoPagamentoAposRegistro);

export function devePerguntarPagamentoOS(anterior: string, atual: string) {
  return anterior !== atual && atual === "delivered";
}
