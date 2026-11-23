import type { AtendimentoServico } from "../services/servicos";
import { especialidades } from "./especialidades.ts";
import {
  aceiteServicoPendente,
  reabrirFichaServico,
  validarAceiteServico,
} from "./aceiteServico.ts";
export { resumoAceiteServico as resumoAceiteManutencao } from "./aceiteServico.ts";
export const ehManutencao = (a: AtendimentoServico) =>
  especialidades[a.ficha_especialidade?.especialidade || ""]?.ramo ===
  "manutencao_campo";
export const aceiteManutencaoPendente = (a: AtendimentoServico) =>
  ehManutencao(a) && aceiteServicoPendente(a);
export const validarAceiteManutencao = (a: AtendimentoServico) => {
  if (ehManutencao(a)) validarAceiteServico(a);
};
export const reabrirFichaManutencao = (a: AtendimentoServico) =>
  ehManutencao(a) ? reabrirFichaServico(a) : a.ficha_especialidade;
