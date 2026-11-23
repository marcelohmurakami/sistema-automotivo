import { rpc } from "../lib/rpc";
import {
  consultarRelatoriosServicos,
  validarPeriodoServicos,
} from "./relatoriosServicos";
import type { RelatorioServicos } from "../lib/relatoriosServicos";

// Compatibilidade durante a atualização do banco. Guarda só a disponibilidade
// do endpoint, nunca ocorrências, sessão ou permissões de outro usuário.
let tentarNovaConsultaEm = 0;
export async function consultarOcorrenciasServicos(
  demo: boolean,
  oficina: string,
  inicio: string,
  fim: string,
  signal?: AbortSignal,
): Promise<RelatorioServicos["qualidade"]> {
  validarPeriodoServicos(inicio, fim);
  if (!demo && Date.now() >= tentarNovaConsultaEm) {
    try {
      return await rpc<RelatorioServicos["qualidade"]>(
        "consultar_ocorrencias_servicos",
        { p_oficina: oficina, p_inicio: inicio, p_fim: fim },
        signal,
      );
    } catch (erro) {
      // Não contorna negação de acesso, timeout ou falha de rede.
      if (
        !erro ||
        typeof erro !== "object" ||
        !("code" in erro) ||
        erro.code !== "PGRST202"
      )
        throw erro;
      tentarNovaConsultaEm = Date.now() + 300_000;
    }
  }
  return (await consultarRelatoriosServicos(demo, oficina, inicio, fim, signal))
    .qualidade;
}
