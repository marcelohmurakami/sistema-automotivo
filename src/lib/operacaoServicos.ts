import type { AtendimentoServico, PainelServicos } from "../services/servicos.ts";
import { especialidades } from "./especialidades.ts";
import { perfilAtendimento, novaFichaEspecialidade } from "./perfisAtendimento.ts";
import { aguardaRetirada, aguardaAceite } from "./assistenciaTecnica.ts";
import { aceiteServicoPendente } from "./aceiteServico.ts";

export function fichaDoAtendimento(t: AtendimentoServico, especialidade: string) {
  if (t.ficha_especialidade) {
    const f = t.ficha_especialidade;
    return especialidades[f.especialidade]?.ramo === "assistencia_tecnica" &&
      f.campos.defeito === undefined &&
      t.dados?.solicitacao
      ? { ...f, campos: { ...f.campos, defeito: t.dados.solicitacao } }
      : f;
  }
  const ficha = novaFichaEspecialidade(especialidade);
  if (
    especialidades[especialidade]?.ramo === "assistencia_tecnica" &&
    t.dados?.solicitacao
  )
    ficha.campos.defeito = t.dados.solicitacao;
  if (t.revisao > 0 && t.vencimento) ficha.campos.prazo_servico = t.vencimento;
  return ficha;
}

export type FiltroOperacao =
  "" | "espera" | "atrasados" | "retirada" | "retornos" | "aceite";
export function situacaoOperacional(t: AtendimentoServico, hoje: string) {
  const campos = t.ficha_especialidade?.campos || {};
  const aberto = !["cancelado", "concluido"].includes(t.situacao);
  // O cadastro antigo tinha uma única data para prazo e cobrança.
  const prazo = t.ficha_especialidade ? campos.prazo_servico || "" : t.vencimento;
  return {
    aberto,
    espera:
      aberto &&
      (t.situacao === "aguardando" ||
        (!!campos.motivo_espera && campos.motivo_espera !== "Sem pendência")),
    atrasados: aberto && !!prazo && prazo < hoje,
    retirada: aguardaRetirada(t),
    aceite: aguardaAceite(t) || aceiteServicoPendente(t),
    // Retorno técnico não é vencimento financeiro. Inclui serviços encerrados.
    retornos:
      t.situacao !== "cancelado" &&
      !!campos.proxima_data &&
      campos.proxima_data <= hoje,
    prazo,
    proxima: campos.proxima_data || "",
    pendencia:
      campos.motivo_espera && campos.motivo_espera !== "Sem pendência"
        ? especialidades[t.ficha_especialidade?.especialidade || ""]?.ramo ===
            "limpeza" && campos.motivo_espera === "Peça / material"
          ? "Produtos / materiais"
          : campos.motivo_espera
        : "",
  };
}
export function retornoJaAgendado(
  t: AtendimentoServico,
  agenda: PainelServicos["agenda"],
) {
  if (t.retorno_agendado !== undefined) return t.retorno_agendado;
  const data = t.ficha_especialidade?.campos.proxima_data;
  if (!data) return false;
  return agenda.some(
    (a) =>
      a.atendimento_id === t.id &&
      ["agendado", "confirmado", "concluido"].includes(a.situacao) &&
      formatoDiaRetorno.format(new Date(a.inicio)) >= data,
  );
}
const formatoDiaRetorno = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "America/Sao_Paulo",
});
export function resumoOperacao(
  t: AtendimentoServico,
  hoje: string,
  agenda: PainelServicos["agenda"],
) {
  const s = situacaoOperacional(t, hoje);
  return { ...s, retornos: s.retornos && !retornoJaAgendado(t, agenda) };
}
export function destaquesAtendimento(t: AtendimentoServico) {
  const ficha = t.ficha_especialidade;
  if (!ficha) return [];
  const prioridades = [
    ...(especialidades[ficha.especialidade]?.ramo === "limpeza"
      ? ["liberacao_uso", "area", "frequencia", "situacao_aceite"]
      : []),
    ...(especialidades[ficha.especialidade]?.ramo === "manutencao_campo"
      ? ["ativo", "condicao_uso", "situacao_aceite", "natureza", "endereco_visita"]
      : []),
    ...(ficha.especialidade === "assistencia_eletronica"
      ? ["placa", "revisao_placa", "resultado_teste", "equipamento_origem"]
      : []),
    ...(ficha.especialidade === "assistencia_eletrodomesticos"
      ? ["familia", "modalidade", "codigo_erro", "resultado_teste"]
      : []),
    ...(["assistencia_celulares", "assistencia_informatica"].includes(
      ficha.especialidade,
    )
      ? ["tipo_aparelho", "resultado_teste"]
      : []),
    "responsavel",
    "identificacao",
    "ativo",
    "circuito",
    "rede",
    "tecido",
    "contrato",
    "secagem",
    "retirada_prevista",
    "proxima_data",
  ];
  const campos = perfilAtendimento(ficha.especialidade).grupos.flatMap((g) => g.campos);
  return [...new Set(prioridades)]
    .filter((id) => ficha.campos[id]?.trim())
    .slice(0, 3)
    .map((id) => ({
      id,
      rotulo: campos.find((c) => c.id === id)?.nome || id,
      valor:
        campos.find((c) => c.id === id)?.tipo === "data"
          ? ficha.campos[id].split("-").reverse().join("/")
          : ficha.campos[id],
    }));
}
export function subsetoresDoRamo(ramo: string) {
  return Object.entries(especialidades).filter(([, p]) => p.ramo === ramo);
}
