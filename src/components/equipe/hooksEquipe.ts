import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAcesso } from "../../auth/contexto";
import { erroPublico } from "../../lib/supabase";
import { listarFuncionarios } from "../../services/funcionarios";
import { mesEquipe } from "../../lib/produtividadeEquipe";
export function useEquipe() {
  const a = useAcesso(),
    w = a.oficina!.id;
  const funcionarios = useQuery({
    queryKey: ["funcionarios", a.demo, w],
    queryFn: ({ signal }) => listarFuncionarios(a.demo, w, signal),
  });
  return {
    w,
    funcionarios: funcionarios.data ?? [],
    erroFuncionarios: funcionarios.error,
  };
}
export function useAcaoEquipe() {
  const qc = useQueryClient(),
    trava = useRef(false),
    [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState("");
  return {
    ocupado,
    erro,
    aviso,
    setErro,
    async executar(acao: () => Promise<unknown>, mensagem = "Alteração salva.") {
      if (trava.current) return;
      trava.current = true;
      setOcupado(true);
      setErro("");
      setAviso("");
      try {
        await acao();
        await qc.invalidateQueries({ queryKey: ["equipe"] });
        setAviso(mensagem);
      } catch (e) {
        setErro(erroPublico(e));
      } finally {
        trava.current = false;
        setOcupado(false);
      }
    },
  };
}
export function usePeriodoEquipe() {
  return useState(mesEquipe);
}
