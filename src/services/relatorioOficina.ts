import { lerOrdensDemo } from "../lib/ordensDemo";
import { rpc } from "../lib/rpc";

import type { OrdemServico } from "./ordensServico";
import {
  detalharOficina,
  validarPeriodoOficina,
  type DadosRelatorioOficina,
} from "../lib/relatorioOficina";

export async function consultarRelatorioOficina(
  demo: boolean,
  oficina: string,
  inicio: string,
  fim: string,
  signal?: AbortSignal,
) {
  validarPeriodoOficina(inicio, fim);
  if (!demo) {
    const dados = await rpc<DadosRelatorioOficina>(
      "consultar_relatorio_oficina",
      {
        p_oficina: oficina,
        p_inicio: inicio,
        p_fim: fim,
      },
      signal,
    );
    return detalharOficina(dados, inicio, fim);
  }
  const ordens: OrdemServico[] = lerOrdensDemo();
  return detalharOficina(
    {
      agora: new Date().toISOString(),
      ordens: ordens
        .filter((o) => !o.arquivado_em)
        .map((o) => ({
          id: o.id,
          numero: o.numero,
          cliente: o.dados_cliente.nome,
          veiculo: o.dados_veiculo.modelo,
          situacao: o.situacao,
          responsavel: o.responsavel,
          data_servico: o.data_servico || null,
          criado_em: o.criado_em,
          recebido_em: o.recebido_em,
          concluido_em:
            o.concluido_em ||
            o.historico.find((h) => h.descricao === "Situação: Pronta para entrega")
              ?.ocorrido_em ||
            null,
          entregue_em:
            o.historico.find((h) => h.descricao === "Situação: Entregue")
              ?.ocorrido_em || null,
          cancelado_em:
            o.historico.find((h) => h.descricao === "Situação: Cancelada")
              ?.ocorrido_em || null,
          entrega_prevista_em: o.entrega_prevista_em,
          paradas: o.paradas.map((p) => ({
            motivo: p.motivo,
            iniciado_em: p.iniciado_em || null,
            encerrado_em: p.encerrado_em,
          })),
          servicos: o.itens
            .filter((i) => i.tipo === "service" && i.situacao !== "cancelled")
            .map((i) => ({ descricao: i.descricao, quantidade: i.quantidade })),
        })),
    },
    inicio,
    fim,
  );
}
