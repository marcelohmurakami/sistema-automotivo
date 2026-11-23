import type {
  ObjetoServico,
  AtendimentoServico,
  ReservaServico,
  RecursoAgenda,
} from "../../services/servicos";
export type Editor =
  | { tipo: "objeto"; item: ObjetoServico }
  | { tipo: "atendimento"; item: AtendimentoServico }
  | { tipo: "agenda"; item: ReservaServico; recorrente?: boolean }
  | { tipo: "recurso"; item: RecursoAgenda };
