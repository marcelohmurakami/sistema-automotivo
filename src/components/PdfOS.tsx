import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Printer } from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { consultarIdentidade } from "../services/documentos";
import type { OrdemServico } from "../services/ordensServico";
import { erroPublico } from "../lib/supabase";
import { FichaComplementarOS } from "./FichaComplementarOS";
export function PdfOS({ os }: { os: OrdemServico }) {
  const a = useAcesso();
  const trava = useRef(false);
  const [erro, setErro] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <Link
        className="botao-secundario"
        to={`/documentos?tipo=os&id=${os.id}&origem=os`}
      >
        <Printer size={17} /> Visualizar e imprimir
      </Link>
      <button
        className="botao-secundario"
        disabled={busy}
        onClick={async () => {
          if (trava.current) return;
          trava.current = true;
          setBusy(true);
          setErro("");
          try {
            const [identidade, { gerarPdfOS }] = await Promise.all([
              consultarIdentidade(a.demo, a.oficina!.id),
              import("../services/pdfDocumentos"),
            ]);
            gerarPdfOS(os, identidade).save(`ordem-servico-${os.numero}.pdf`);
          } catch (e) {
            setErro(erroPublico(e));
          } finally {
            trava.current = false;
            setBusy(false);
          }
        }}
      >
        {busy ? "Preparando…" : "Baixar OS em PDF"}
      </button>
      {erro && <p role="alert">{erro}</p>}
      <FichaComplementarOS os={os} />
    </div>
  );
}
