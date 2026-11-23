import { createContext, useContext } from "react";
import type {
  LembretesFinanceiros,
  PendenciaLembrete,
} from "../../services/lembretesFinanceiros";
export type AlvoAdiamento = Pick<
  PendenciaLembrete,
  "tipo" | "id" | "vencimento" | "descricao"
>;
export const ContextoLembretes = createContext<{
  permitido: boolean;
  dados?: LembretesFinanceiros;
  agora: Date;
  conferencia: boolean;
  abrir: (tela: "pendencias" | "configurar") => void;
  adiar: (alvo?: AlvoAdiamento) => void;
  conferir: () => void;
  ocupado: boolean;
} | null>(null);
export const useLembretesFinanceiros = () => useContext(ContextoLembretes);
