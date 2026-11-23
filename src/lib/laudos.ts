import type { Identidade } from "../services/documentos";
import type { Ramo } from "./ramos";

export const camposLaudo = [
  ["titulo", "Título", 180],
  ["cliente", "Cliente / solicitante", 180],
  ["bem", "Bem ou local avaliado", 240],
  ["data_avaliacao", "Data da avaliação", 10],
  ["constatacoes", "O que foi constatado", 12000],
  ["servicos", "Serviços realizados", 12000],
  ["conclusao", "Conclusão técnica", 12000],
  ["responsavel", "Responsável pelo laudo", 180],
  ["documento_cliente", "CPF / CNPJ do cliente", 60],
  ["contato_cliente", "Contato do cliente", 180],
  ["identificacao", "Identificação complementar", 240],
  ["local_avaliacao", "Local da avaliação", 300],
  ["solicitacao", "Solicitação e objetivo", 8000],
  ["condicoes", "Condições encontradas", 8000],
  ["procedimentos", "Testes, medições e métodos utilizados", 12000],
  ["recomendacoes", "Recomendações", 8000],
  ["limitacoes", "Limitações da avaliação", 8000],
  ["referencias", "Evidências e referências", 8000],
  ["qualificacao", "Função / qualificação do responsável", 180],
  ["registro_profissional", "Registro profissional", 120],
  ["numero_art", "ART / TRT ou documento de responsabilidade", 120],
  ["observacoes", "Observações complementares", 8000],
] as const;
export type CampoLaudo = (typeof camposLaudo)[number][0];
export type DadosLaudo = Record<CampoLaudo, string>;
export type OrigemLaudo = {
  tipo: "os" | "atendimento";
  id: string;
  numero: number;
  cliente: string;
  bem: string;
};
export type VersaoLaudo = {
  versao: number;
  conteudo: { dados: DadosLaudo; empresa: Identidade; origem: string; numero: number };
  hash: string;
  emitido_em: string;
  autor: string;
};
export type Laudo = {
  id: string;
  numero: number;
  situacao: "rascunho" | "emitido" | "cancelado";
  revisao: number;
  versao: number;
  origem_tipo: "os" | "atendimento" | null;
  origem_id: string | null;
  origem_rotulo: string;
  dados: DadosLaudo;
  criado_em: string;
  atualizado_em: string;
  motivo_cancelamento: string;
  versoes: Omit<VersaoLaudo, "conteudo">[];
  historico: { acao: string; motivo: string; criado_em: string; versao: number }[];
};
export type LinhaLaudo = Pick<
  Laudo,
  "id" | "numero" | "situacao" | "versao" | "atualizado_em"
> & { titulo: string; cliente: string; bem: string };
export const situacoesLaudo = {
  rascunho: "Rascunho",
  emitido: "Emitido",
  cancelado: "Cancelado",
};
export function novoLaudo(dados: Partial<DadosLaudo> = {}): DadosLaudo {
  return Object.fromEntries(
    camposLaudo.map(([k]) => [
      k,
      dados[k] ||
        (k === "titulo"
          ? "Laudo técnico"
          : k === "data_avaliacao"
            ? new Intl.DateTimeFormat("en-CA", {
                timeZone: "America/Sao_Paulo",
              }).format(new Date())
            : ""),
    ]),
  ) as DadosLaudo;
}
export function validarLaudo(d: DadosLaudo, emitir = false) {
  for (const [k, nome, max] of camposLaudo)
    if (typeof d[k] !== "string" || d[k].length > max)
      throw Error(`Confira o campo ${nome.toLowerCase()}.`);
  if (d.titulo.trim().length < 3) throw Error("Informe um título para o laudo.");
  if (
    d.data_avaliacao &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(d.data_avaliacao) ||
      Number.isNaN(Date.parse(d.data_avaliacao)) ||
      new Date(d.data_avaliacao).toISOString().slice(0, 10) !== d.data_avaliacao)
  )
    throw Error("Informe uma data de avaliação válida.");
  if (emitir)
    for (const k of [
      "cliente",
      "bem",
      "data_avaliacao",
      "constatacoes",
      "conclusao",
      "responsavel",
    ] as const)
      if (!d[k].trim())
        throw Error(
          `Preencha ${camposLaudo.find(([c]) => c === k)![1].toLowerCase()} antes de emitir.`,
        );
}
export function linguagemLaudo(ramo: Ramo = "automotivo", especialidade = "") {
  if (ramo === "limpeza")
    return {
      bem: "Local / área avaliada",
      identificacao: "Endereço, ambientes e superfícies",
      exemplo:
        "Condições das áreas e superfícies, resíduos encontrados e resultado da limpeza.",
    };
  if (ramo === "manutencao_campo")
    return {
      bem: "Local / equipamento avaliado",
      identificacao: "Endereço, marca, modelo e patrimônio",
      exemplo:
        "Condições da instalação ou equipamento, falhas e resultados das verificações.",
    };
  if (ramo === "assistencia_tecnica")
    return {
      bem: "Aparelho / equipamento avaliado",
      identificacao:
        especialidade === "assistencia_celulares"
          ? "Marca, modelo, série e IMEI"
          : "Marca, modelo e número de série",
      exemplo: "Defeito constatado, componentes avaliados e resultados dos testes.",
    };
  return {
    bem:
      especialidade === "retifica"
        ? "Veículo, motor ou peça avaliada"
        : "Veículo / peça avaliada",
    identificacao: "Placa, motor, numeração ou aplicação",
    exemplo:
      "Condições do veículo ou componente e resultados das inspeções e medições.",
  };
}
export const numeroLaudo = (n: number) => `LT-${String(n).padStart(6, "0")}`;
