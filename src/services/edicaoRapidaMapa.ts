import { novoId } from "../lib/uuid";
import { rpc } from "../lib/rpc";
import { supabase } from "../lib/supabase";
import { consultarOS, salvarOS, type OrdemServico } from "./ordensServico";

// O RPC existente substitui estes campos mesmo quando não vêm no pedido.
// A edição rápida preserva o retrato lido, protegido pela revisão da OS.
export const camposPreservadosMapa = [
  "queixa_cliente",
  "diagnostico",
  "observacoes_internas",
  "resumo_cliente",
  "responsavel",
  "prioridade",
  "quilometragem_entrada",
  "quilometragem_saida",
  "combustivel_percentual",
  "pertences",
  "entrega_prevista_em",
  "condicoes_garantia",
  "garantia_ate",
  "checklist",
] as const;

export type DadosEdicaoMapa = Pick<
  OrdemServico,
  | "id"
  | "revisao"
  | "situacao"
  | "tipo_servico"
  | (typeof camposPreservadosMapa)[number]
>;
export type AlteracaoRapidaMapa =
  { campo: "tipo"; valor: string } | { campo: "entrega"; valor: string | null };

export function dadosAlteracaoRapidaMapa(
  atual: DadosEdicaoMapa,
  alteracao: AlteracaoRapidaMapa,
) {
  return {
    ...Object.fromEntries(camposPreservadosMapa.map((c) => [c, atual[c]])),
    ...(alteracao.campo === "tipo"
      ? { tipo_servico: alteracao.valor }
      : { entrega_prevista_em: alteracao.valor }),
  };
}

export async function consultarEdicaoRapidaMapa(
  demo: boolean,
  oficina: string,
  id: string,
  signal?: AbortSignal,
): Promise<DadosEdicaoMapa> {
  if (demo) return consultarOS(true, oficina, id, signal);
  if (!supabase) throw new Error("Conexão indisponível.");
  // Só carrega os campos necessários quando o usuário abre um atalho.
  // Fotos, itens e histórico não participam desta consulta.
  let consulta = supabase
    .from("ordens_servico")
    .select(
      ["id", "revisao", "situacao", "tipo_servico", ...camposPreservadosMapa].join(","),
    )
    .eq("oficina_id", oficina)
    .eq("id", id);
  if (signal) consulta = consulta.abortSignal(signal);
  const { data, error } = await consulta.single();
  if (error) throw error;
  return data as unknown as DadosEdicaoMapa;
}

export async function salvarEdicaoRapidaMapa(
  demo: boolean,
  oficina: string,
  atual: DadosEdicaoMapa,
  alteracao: AlteracaoRapidaMapa,
): Promise<OrdemServico> {
  const dados = dadosAlteracaoRapidaMapa(atual, alteracao);
  if (!demo)
    return rpc<OrdemServico>("salvar_ordem_servico", {
      p_oficina: oficina,
      p_os: atual.id,
      p_revisao: atual.revisao,
      p_chave: novoId(),
      p_dados: dados,
    });
  const os = await consultarOS(true, oficina, atual.id);
  if (os.revisao !== atual.revisao)
    throw new Error("OS alterada. Atualize os dados antes de salvar.");
  return salvarOS(true, oficina, dados, novoId(), os);
}
