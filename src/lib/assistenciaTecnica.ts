import type { AtendimentoServico } from "../services/servicos";
import { especialidades } from "./especialidades.ts";
import { novaFichaEspecialidade, perfilAtendimento } from "./perfisAtendimento.ts";

const etapasEncerradas = [
  "Pronto para retirada",
  "Pronto para entrega",
  "Disponível para retirada",
  "Serviço concluído no local",
  "Aceite registrado",
  "Entregue",
];

export function etapasEmAndamento(especialidade: string) {
  const etapas = perfilAtendimento(especialidade).etapas;
  return especialidades[especialidade]?.ramo === "assistencia_tecnica"
    ? etapas.filter((etapa) => !etapasEncerradas.includes(etapa))
    : etapas;
}

export function validarEtapaReparo(a: AtendimentoServico) {
  const ficha = a.ficha_especialidade;
  if (!ficha || especialidades[ficha.especialidade]?.ramo !== "assistencia_tecnica")
    return;
  if (a.situacao !== "concluido" && etapasEncerradas.includes(ficha.etapa))
    throw new Error("Conclua o reparo antes de marcar como pronto ou entregue.");
  if (
    ["Entregue", "Aceite registrado"].includes(ficha.etapa) &&
    !ficha.campos.recebedor?.trim()
  )
    throw new Error("Informe quem recebeu ou conferiu o equipamento.");
}

export function atendimentoEmDomicilio(a: AtendimentoServico) {
  return (
    a.ficha_especialidade?.especialidade === "assistencia_eletrodomesticos" &&
    a.ficha_especialidade.campos.modalidade === "Domicílio"
  );
}
export function aguardaAceite(a: AtendimentoServico) {
  return (
    atendimentoEmDomicilio(a) &&
    a.situacao === "concluido" &&
    !["Aceite registrado", "Entregue"].includes(a.ficha_especialidade?.etapa || "")
  );
}
export function apresentacaoEntrega(a: AtendimentoServico) {
  const noLocal = atendimentoEmDomicilio(a);
  const confirmada = ["Entregue", "Aceite registrado"].includes(
    a.ficha_especialidade?.etapa || "",
  );
  return {
    confirmada,
    titulo: confirmada
      ? noLocal
        ? "Serviço conferido no local"
        : "Equipamento entregue"
      : noLocal
        ? "Reparo concluído no local · aguardando aceite"
        : "Reparo concluído · aguardando retirada",
    ajuda: confirmada
      ? `Conferido por: ${a.ficha_especialidade?.campos.recebedor || "não informado"}`
      : noLocal
        ? "Registre quem conferiu o serviço no endereço do cliente."
        : "Registre a devolução quando o cliente buscar o equipamento e os acessórios.",
    acao: noLocal ? "Registrar aceite no local" : "Registrar retirada",
    pessoa: noLocal
      ? "Quem conferiu o serviço no local?"
      : "Quem recebeu o equipamento?",
    confirmar: noLocal ? "Confirmar aceite" : "Confirmar retirada",
  };
}

export function aguardaRetirada(a: AtendimentoServico) {
  if (atendimentoEmDomicilio(a)) return false;
  const ficha = a.ficha_especialidade;
  if (a.situacao === "cancelado" || ficha?.etapa === "Entregue") return false;
  const pronto = [
    "Pronto para retirada",
    "Pronto para entrega",
    "Disponível para retirada",
  ].includes(ficha?.etapa || "");
  return (
    pronto ||
    (a.situacao === "concluido" &&
      especialidades[ficha?.especialidade || ""]?.ramo === "assistencia_tecnica")
  );
}

export function concluirReparo(
  a: AtendimentoServico,
  especialidade: string,
): AtendimentoServico {
  const ficha = a.ficha_especialidade || novaFichaEspecialidade(especialidade);
  const perfil = perfilAtendimento(ficha.especialidade, "assistencia_tecnica");
  return {
    ...a,
    situacao: "concluido",
    ficha_especialidade: {
      ...ficha,
      etapa: atendimentoEmDomicilio(a)
        ? "Serviço concluído no local"
        : perfil.etapas.find((e) =>
            [
              "Pronto para retirada",
              "Pronto para entrega",
              "Disponível para retirada",
            ].includes(e),
          ) || ficha.etapa,
      campos: { ...ficha.campos, motivo_espera: "Sem pendência", pendencia: "" },
    },
  };
}

/** A reabertura mantém as medições, mas retira o serviço da fila de entrega. */
export function fichaReaberta(a: AtendimentoServico) {
  const ficha = a.ficha_especialidade;
  if (!ficha || especialidades[ficha.especialidade]?.ramo !== "assistencia_tecnica")
    return ficha;
  return {
    ...ficha,
    etapa:
      perfilAtendimento(ficha.especialidade).etapas.find((e) =>
        e.startsWith("Reparo"),
      ) || "",
  };
}

export function registrarRetirada(
  a: AtendimentoServico,
  recebedor: string,
  especialidade: string,
): AtendimentoServico {
  if (a.situacao !== "concluido")
    throw new Error("Conclua o reparo antes de registrar a retirada.");
  if (!recebedor.trim() || recebedor.trim().length > 1500)
    throw new Error("Informe quem recebeu o equipamento.");
  const ficha = a.ficha_especialidade || novaFichaEspecialidade(especialidade);
  if (especialidades[ficha.especialidade]?.ramo !== "assistencia_tecnica")
    throw new Error("Retirada disponível para equipamentos da assistência técnica.");
  return {
    ...a,
    ficha_especialidade: {
      ...ficha,
      etapa: atendimentoEmDomicilio(a) ? "Aceite registrado" : "Entregue",
      campos: { ...ficha.campos, recebedor: recebedor.trim() },
    },
  };
}
