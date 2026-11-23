import type { QueryClient } from "@tanstack/react-query";
import { atualizarConsultas } from "./atualizarConsultas.ts";

// Uma ocorrência altera também margem, atribuição e conferência contábil.
// Atualiza consultas já abertas ao salvar pela lista ou pelos detalhes da OS.
export const consultasQualidade = [
  "qualidade",
  "qualidade-servicos",
  "qualidade-avancada",
  "qualidade-historico",
  "relatorios-gestao",
  "relatorios-oficina",
  "relatorios-servicos",
  "relatorios",
  "analise-gerencial",
  "equipe",
  "detalhes-atendimento",
  "lucro-documento",
  "lucro-cliente",
  "custeio",
  "custeio-detalhe",
  "apuracao",
  "financeiro",
  "financeiro-detalhe",
  "financeiro-relatorio",
  "alertas",
].map((key) => [key]);

export async function atualizarQualidade(cache: QueryClient) {
  await atualizarConsultas(cache, consultasQualidade);
}
