import { useOutletContext } from "react-router-dom";
import type { Orcamento, Veiculo } from "../data/demonstracao";
export type ContextoOficina = {
  veiculos: Veiculo[];
  orcamentos: Orcamento[];
  nomeOficina: string;
  abrirOrcamento: () => void;
  abrirVeiculo: (veiculo: Veiculo) => void;
  avisar: (mensagem: string) => void;
  definirOficina: (nome: string) => void;
};
export const useOficina = () => useOutletContext<ContextoOficina>();
