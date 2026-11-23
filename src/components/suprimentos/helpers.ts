import { useState, useRef } from "react";
import { useBuscaDebounced } from "../../lib/useBuscaDebounced";
import { useQueryClient } from "@tanstack/react-query";
import { useAcesso } from "../../auth/contexto";
import { erroPublico } from "../../lib/supabase";
import { atualizarIntegracoes } from "../../lib/atualizarIntegracoes";
export function useBusca(v: string) {
  return useBuscaDebounced(v);
}
export function useSuprimentos() {
  const a = useAcesso(),
    qc = useQueryClient();
  const [erro, setErro] = useState(""),
    [ocupado, setOcupado] = useState(false);
  const trava = useRef(false);
  async function executar(fn: () => Promise<unknown>, atualizar = true) {
    if (trava.current) return false;
    trava.current = true;
    setErro("");
    setOcupado(true);
    try {
      await fn();
      if (atualizar) {
        await qc.cancelQueries({ queryKey: ["suprimentos"] });
        await atualizarIntegracoes(qc, ["suprimentos"]);
      }
      return true;
    } catch (e) {
      setErro(erroPublico(e));
      await qc.invalidateQueries({ queryKey: ["suprimentos"] });
      return false;
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  return { a, w: a.oficina!.id, erro, setErro, ocupado, executar };
}
export const numero = (n: number) =>
  n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
export const dataCurta = (v: string | null) =>
  v ? new Date(v + "T12:00:00").toLocaleDateString("pt-BR") : "Sem previsão";
export function lerSeries(texto: string) {
  return texto
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [serie, imei] = s.split(";").map((x) => x.trim());
      return { serie, imei: imei || null };
    });
}
export const passoProduto = (unidade: string) =>
  ["un", "unid", "peça", "peca"].includes(unidade.toLowerCase()) ? 1 : 0.001;
