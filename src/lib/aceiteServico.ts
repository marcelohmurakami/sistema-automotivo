import type { AtendimentoServico } from "../services/servicos";
import { especialidades } from "./especialidades.ts";

export const ehLimpeza = (a: AtendimentoServico) =>
  especialidades[a.ficha_especialidade?.especialidade || ""]?.ramo === "limpeza";
export const temAceiteServico = (a: AtendimentoServico) =>
  ["manutencao_campo", "limpeza"].includes(
    especialidades[a.ficha_especialidade?.especialidade || ""]?.ramo || "",
  );
export function resumoAceiteServico(a?: AtendimentoServico) {
  const c = a?.ficha_especialidade?.campos || {};
  return [
    `Conferência: ${c.situacao_aceite || "Pendente"}`,
    c.aceite,
    c.data_aceite,
    c.ressalvas_aceite,
  ]
    .filter(Boolean)
    .join(" · ");
}
export function aceiteServicoPendente(a: AtendimentoServico) {
  return (
    temAceiteServico(a) &&
    a.situacao === "concluido" &&
    !["Aceito", "Aceito com ressalvas"].includes(
      a.ficha_especialidade?.campos.situacao_aceite || "",
    )
  );
}
export function validarAceiteServico(a: AtendimentoServico) {
  if (!temAceiteServico(a)) return;
  const c = a.ficha_especialidade!.campos;
  if (c.situacao_aceite && c.situacao_aceite !== "Pendente") {
    if (a.situacao !== "concluido")
      throw new Error("Conclua o serviço antes de registrar a conferência do cliente.");
    if (!c.aceite?.trim() || !c.data_aceite)
      throw new Error("Informe quem conferiu o serviço e a data da conferência.");
    if (
      ["Aceito com ressalvas", "Não aceito"].includes(c.situacao_aceite) &&
      !c.ressalvas_aceite?.trim()
    )
      throw new Error("Descreva as ressalvas ou o motivo da recusa.");
  }
}
export function reabrirFichaServico(a: AtendimentoServico) {
  if (!temAceiteServico(a)) return a.ficha_especialidade;
  const f = a.ficha_especialidade!;
  const etapas: Record<string, string> = {
    manutencao_climatizacao: "Limpeza e manutenção",
    manutencao_eletrica: "Intervenção",
    manutencao_hidraulica: "Reparo / instalação",
    manutencao_equipamentos: "Manutenção",
    manutencao_geral: "Execução",
    limpeza_residencial: "Limpeza por cômodo",
    limpeza_comercial: "Execução por área",
    limpeza_pos_obra: "Limpeza fina",
    limpeza_estofados: "Higienização",
    limpeza_vidros: "Limpeza",
    limpeza_geral: "Limpeza por ambiente",
  };
  return {
    ...f,
    etapa: etapas[f.especialidade],
    campos: {
      ...f.campos,
      ...(ehLimpeza(a)
        ? { liberacao_uso: "Não liberado", resultado_vistoria: "" }
        : { condicao_uso: "Não avaliado" }),
      situacao_aceite: "Pendente",
      aceite: "",
      data_aceite: "",
      ressalvas_aceite: "",
    },
  };
}
