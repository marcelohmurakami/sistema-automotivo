import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAcesso } from "../auth/contexto";
import { erroPublico } from "../lib/supabase";
import { baixarExecucoes, prepararAparelho } from "../services/execucaoOffline";
import { RegistrosAparelho } from "./RegistrosAparelho";
export function AtalhoExecucaoOffline({ documento }: { documento: string }) {
  const a = useAcesso(),
    navegar = useNavigate(),
    [busy, setBusy] = useState(false),
    [erro, setErro] = useState("");
  const trava = useRef(false);
  if (a.demo) return null;
  return (
    <>
      <button
        type="button"
        className="botao-secundario"
        disabled={busy}
        onClick={async () => {
          if (trava.current) return;
          trava.current = true;
          setBusy(true);
          setErro("");
          try {
            await prepararAparelho(
              await baixarExecucoes(
                a.oficina!.id,
                undefined,
                undefined,
                null,
                documento,
              ),
            );
            navegar("/execucao-offline");
          } catch (e) {
            setErro(erroPublico(e));
          } finally {
            trava.current = false;
            setBusy(false);
          }
        }}
      >
        {busy ? "Preparando…" : "Usar sem internet"}
      </button>
      <RegistrosAparelho documento={documento} />
      {erro && <p role="alert">{erro}</p>}
    </>
  );
}
