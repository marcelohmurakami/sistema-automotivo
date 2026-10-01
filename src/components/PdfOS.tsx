import { useState } from "react";
import { useAcesso } from "../auth/contexto";
import { consultarIdentidade } from "../services/documentos";
import { gerarPdfOS } from "../services/pdfDocumentos";
import type { OrdemServico } from "../services/ordensServico";
import { erroPublico } from "../lib/supabase";
export function PdfOS({ os }: { os: OrdemServico }) {
  const a = useAcesso();
  const [erro, setErro] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div>
      <button
        className="botao-secundario"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErro("");
          try {
            gerarPdfOS(
              os,
              await consultarIdentidade(a.demo, a.oficina!.id),
            ).save(`ordem-servico-${os.numero}.pdf`);
          } catch (e) {
            setErro(erroPublico(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Preparando…" : "Baixar OS em PDF"}
      </button>
      {erro && <p role="alert">{erro}</p>}
    </div>
  );
}
