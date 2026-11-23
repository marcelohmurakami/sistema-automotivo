import { rpc } from "../lib/rpc";
import { supabase, erroPublico } from "../lib/supabase";
import {
  execucoesLocais,
  guardarExecucao,
  novaExecucao,
  tratarFalhaExecucao,
  type BaseExecucao,
  type ExecucaoLocal,
} from "../lib/execucaoOffline";
export type PacoteExecucao = {
  empresa: string;
  usuario: string;
  oficina: string;
  itens: BaseExecucao[];
};
export const baixarExecucoes = (
  w: string,
  inicio?: string,
  fim?: string,
  agenda?: string | null,
  documento?: string | null,
) =>
  rpc<PacoteExecucao>("preparar_execucao_offline", {
    p_oficina: w,
    p_inicio: inicio ?? null,
    p_fim: fim ?? null,
    p_agenda: agenda ?? null,
    p_documento: documento ?? null,
  });
export async function prepararAparelho(p: PacoteExecucao) {
  const lista = await execucoesLocais(p.usuario);
  const porId = new Map(lista.map((r) => [r.id, r]));
  let preservados = 0;
  for (const b of p.itens) {
    const id = `${p.usuario}:${p.oficina}:${b.id}`,
      old = porId.get(id);
    if (old?.pendente || old?.pedido) {
      preservados++;
      continue;
    }
    const r = novaExecucao(p.usuario, p.oficina, p.empresa, b);
    r.revisao = old?.revisao || 0;
    await guardarExecucao(r);
  }
  return preservados;
}
export async function sincronizarExecucao(
  r: ExecucaoLocal,
  usuario: string,
  oficina: string,
) {
  if (r.usuario !== usuario || r.oficina !== oficina)
    throw Error("Entre na mesma conta e empresa para enviar esta execução.");
  if (!navigator.onLine) throw Error("Reconecte para sincronizar.");
  if (!r.pendente) return r;
  const d = structuredClone(r);
  try {
    if (!d.pedido) {
      d.pedido = { base: structuredClone(d.base), dados: structuredClone(d.dados) };
      await guardarExecucao(d);
    }
    if (!d.resposta) {
      d.resposta = await rpc<BaseExecucao>("sincronizar_execucao_offline", {
        p_oficina: oficina,
        p_chave: d.chave,
        p_base: d.pedido.base,
        p_dados: d.pedido.dados,
      });
      await guardarExecucao(d);
    }
    for (const f of d.fotos.filter((x) => !x.sincronizada)) {
      if (!d.base.documento_id)
        throw Error("A visita ainda não tem uma OS vinculada para receber fotos.");
      const blob = await (await fetch(f.imagem)).blob(),
        hash = Array.from(
          new Uint8Array(
            await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
          ),
          (b) => b.toString(16).padStart(2, "0"),
        ).join("");
      const auto = d.base.automotivo,
        reserva = await rpc<{ id: string; caminho: string }>(
          auto ? "reservar_foto_os_offline" : "reservar_foto_servico_offline",
          {
            p_oficina: oficina,
            [auto ? "p_os" : "p_atendimento"]: d.base.documento_id,
            p_chave: f.id,
            p_hash: hash,
            p_fase: auto ? (f.fase === "depois" ? "after" : "before") : f.fase,
            p_tamanho: blob.size,
            p_legenda: f.legenda,
          },
        );
      const { error } = await supabase!.storage
        .from("workshop-files")
        .upload(reserva.caminho, blob, { contentType: "image/jpeg", upsert: false });
      if (error && String((error as { statusCode?: string }).statusCode) !== "409")
        throw error;
      await rpc(auto ? "confirmar_foto_os" : "confirmar_foto_atendimento", {
        p_oficina: oficina,
        ...(auto ? {} : { p_atendimento: d.base.documento_id }),
        p_arquivo: reserva.id,
      });
      f.sincronizada = true;
      await guardarExecucao(d);
    }
    d.base = d.resposta;
    d.dados = {
      situacao: d.base.situacao,
      ficha: structuredClone(d.base.ficha),
      anotacoes: "",
      iniciado_em: "",
      finalizado_em: "",
    };
    d.pendente = false;
    d.pedido = undefined;
    d.resposta = undefined;
    d.conflito = false;
    d.erro = "";
    d.chave = crypto.randomUUID();
    d.preparado = Date.now();
    await guardarExecucao(d);
    return d;
  } catch (e) {
    d.erro = erroPublico(e);
    tratarFalhaExecucao(d, e && typeof e === "object" && "code" in e ? e.code : null);
    await guardarExecucao(d);
    throw e;
  }
}
