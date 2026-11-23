import { rpc } from "../lib/rpc";
import { supabase } from "../lib/supabase";
import type { OrdemNoMapa } from "../lib/mapaOficina";
import { destinoNoMapa, type DirecaoMapa } from "../lib/movimentacaoMapa";
import { consultarOS, operarOS } from "./ordensServico";

import { notificarOSPronta } from "../lib/avisoOSPronta";
export type AcaoRapidaMapa =
  | { acao: "concluir" | "retomar" }
  | { acao: "parar"; motivo: string; detalhes: string };

export async function executarAcaoNoMapa(
  demo: boolean,
  oficina: string,
  id: string,
  revisao: number,
  acao: AcaoRapidaMapa,
): Promise<Pick<OrdemNoMapa, "situacao" | "revisao" | "recebido_em" | "paradas">> {
  const dados = {
    p_revisao: revisao,
    p_acao: acao.acao,
    p_motivo: acao.acao === "parar" ? acao.motivo : null,
    p_detalhes: acao.acao === "parar" ? acao.detalhes : null,
  };
  if (!demo) {
    const atual = await rpc<
      Pick<OrdemNoMapa, "situacao" | "revisao" | "recebido_em" | "paradas">
    >("operar_mapa_rapido", {
      p_oficina: oficina,
      p_os: id,
      ...dados,
    });
    if (acao.acao === "concluir" && atual.situacao === "ready")
      notificarOSPronta(oficina, id);
    return atual;
  }
  const os = await consultarOS(true, oficina, id);
  await operarOS(true, oficina, os, "operar_mapa_rapido", dados);
  const atual = await consultarOS(true, oficina, id);
  return {
    situacao: atual.situacao,
    revisao: atual.revisao,
    recebido_em: atual.recebido_em,
    paradas: atual.paradas,
  };
}

export async function consultarMapaOficina(
  demo: boolean,
  oficina: string,
  signal?: AbortSignal,
): Promise<OrdemNoMapa[]> {
  if (demo) return JSON.parse(localStorage.getItem("patio_os_v1") || "[]");
  if (!supabase) throw new Error("Conexão com o banco não configurada.");
  const ordens: OrdemNoMapa[] = [];
  let cursor: string | undefined;
  for (;;) {
    let consulta = supabase
      .from("ordens_servico")
      .select(
        "id,numero,revisao,situacao,tipo_servico,veiculo_id,dados_cliente,dados_veiculo,responsavel,queixa_cliente,recebido_em,entrega_prevista_em,paradas:paradas_ordem_servico(id,motivo,detalhes,encerrado_em)",
      )
      .eq("oficina_id", oficina)
      .in("situacao", ["open", "in_progress", "quality_check", "ready"])
      .order("id")
      .limit(200);
    if (cursor) consulta = consulta.gt("id", cursor);
    if (signal) consulta = consulta.abortSignal(signal);
    const { data, error } = await consulta;
    if (error) throw error;
    const pagina = data as OrdemNoMapa[];
    ordens.push(...pagina);
    if (pagina.length < 200) return ordens;
    cursor = pagina[pagina.length - 1].id;
  }
}

export async function moverOSNoMapa(
  demo: boolean,
  oficina: string,
  id: string,
  revisao: number,
  direcao: DirecaoMapa,
): Promise<{ situacao: string; revisao: number; recebido_em: string | null }> {
  if (!demo) {
    const atual = await rpc<{
      situacao: string;
      revisao: number;
      recebido_em: string | null;
    }>("mover_ordem_no_mapa", {
      p_oficina: oficina,
      p_os: id,
      p_revisao: revisao,
      p_direcao: direcao,
    });
    if (direcao === "avancar" && atual.situacao === "ready")
      notificarOSPronta(oficina, id);
    return atual;
  }
  const os = await consultarOS(true, oficina, id);
  if (os.revisao !== revisao)
    throw new Error(
      "Esta OS foi alterada. Confira o mapa atualizado e tente novamente.",
    );
  if (os.paradas.some((p) => !p.encerrado_em))
    throw new Error("Resolva a parada na OS antes de mudar a etapa.");
  const destino = destinoNoMapa(os.situacao, direcao);
  if (!destino) throw new Error("Não há outra etapa nesta direção.");
  await operarOS(true, oficina, os, "atualizar_mapa_ordem_servico", {
    p_revisao_esperada: revisao,
    p_situacao: destino,
    p_etapa: os.etapa_id,
    p_local: os.local_id,
    p_entrega_prevista_em: os.entrega_prevista_em,
    p_recebido_em: os.recebido_em,
  });
  const atual = await consultarOS(true, oficina, id);
  return {
    situacao: atual.situacao,
    revisao: atual.revisao,
    recebido_em: atual.recebido_em,
  };
}
