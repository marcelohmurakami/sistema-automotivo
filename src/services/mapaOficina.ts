import { supabase } from "../lib/supabase";
import type { OrdemNoMapa } from "../lib/mapaOficina";
export async function consultarMapaOficina(
  demo: boolean,
  oficina: string,
): Promise<OrdemNoMapa[]> {
  if (demo) return JSON.parse(localStorage.getItem("patio_os_v1") || "[]");
  if (!supabase) throw new Error("Conexão com o banco não configurada.");
  const ordens: OrdemNoMapa[] = [];
  let cursor: string | undefined;
  for (;;) {
    let consulta = supabase
      .from("ordens_servico")
      .select(
        "id,numero,situacao,veiculo_id,dados_cliente,dados_veiculo,responsavel,queixa_cliente,recebido_em,entrega_prevista_em,paradas:paradas_ordem_servico(id,motivo,detalhes,encerrado_em)",
      )
      .eq("oficina_id", oficina)
      .in("situacao", ["open", "in_progress", "quality_check", "ready"])
      .order("id")
      .limit(200);
    if (cursor) consulta = consulta.gt("id", cursor);
    const { data, error } = await consulta;
    if (error) throw error;
    const pagina = data as OrdemNoMapa[];
    ordens.push(...pagina);
    if (pagina.length < 200) return ordens;
    cursor = pagina[pagina.length - 1].id;
  }
}
