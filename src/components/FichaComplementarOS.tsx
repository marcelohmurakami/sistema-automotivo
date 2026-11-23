import { useRef, useState } from "react";
import { Printer, Download } from "lucide-react";
import { useAcesso } from "../auth/contexto";
import type { OrdemServico } from "../services/ordensServico";
import { consultarIdentidade } from "../services/documentos";
import { camposFichaComplementar } from "../lib/fichaComplementarOS";
import { erroPublico } from "../lib/supabase";
import "./FichaComplementarOS.css";

export function FichaComplementarOS({ os }: { os: OrdemServico }) {
  const a = useAcesso();
  const trava = useRef(false);
  const [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState("");
  if (!camposFichaComplementar(os).length) return null;
  async function gerar(imprimir: boolean) {
    if (trava.current) return;
    const janela = imprimir ? window.open("", "_blank") : null;
    if (imprimir && !janela) {
      setErro("Permita abrir a impressão no navegador ou baixe a ficha em PDF.");
      return;
    }
    if (janela) janela.opener = null;
    trava.current = true;
    setOcupado(true);
    setErro("");
    try {
      const [identidade, { gerarPdfFichaComplementarOS }] = await Promise.all([
        consultarIdentidade(a.demo, a.oficina!.id),
        import("../services/pdfFichaComplementarOS"),
      ]);
      const pdf = gerarPdfFichaComplementarOS(os, identidade);
      if (janela) {
        pdf.autoPrint();
        const url = URL.createObjectURL(pdf.output("blob"));
        janela.location.replace(url);
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else pdf.save(`ficha-complementar-os-${os.numero}.pdf`);
    } catch (e) {
      janela?.close();
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  return (
    <section className="ficha-complementar-acoes">
      <strong>Ficha complementar da OS</strong>
      <p>
        Impressão separada com as informações adicionais preenchidas.
        {os.observacoes_internas?.trim()
          ? " Inclui observações internas: documento para uso da oficina."
          : ""}
      </p>
      <div className="fin-acoes">
        <button
          className="botao-secundario"
          disabled={ocupado}
          onClick={() => void gerar(true)}
        >
          <Printer size={17} />
          {ocupado ? "Preparando…" : "Imprimir ficha complementar"}
        </button>
        <button
          className="botao-secundario"
          disabled={ocupado}
          onClick={() => void gerar(false)}
        >
          <Download size={17} />
          Baixar ficha em PDF
        </button>
      </div>
      {erro && <p role="alert">{erro}</p>}
    </section>
  );
}
