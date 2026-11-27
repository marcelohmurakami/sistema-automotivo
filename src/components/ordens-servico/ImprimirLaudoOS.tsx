import { useRef, useState } from "react";
import { FileText } from "lucide-react";
import { useAcesso } from "../../auth/contexto";
import { erroPublico } from "../../lib/supabase";

export function ImprimirLaudoOS({
  id,
  tipo = "os",
}: {
  id: string;
  tipo?: "os" | "atendimento";
}) {
  const a = useAcesso();
  const trava = useRef(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  async function imprimir() {
    if (trava.current) return;
    setErro("");
    // Abre durante o clique, antes de carregar os dados e o módulo de impressão.
    const janela = window.open("", "_blank");
    if (!janela) {
      setErro("Permita a abertura da janela para imprimir o laudo.");
      return;
    }
    janela.opener = null;
    janela.document.title = "Preparando laudo…";
    janela.document.body.textContent = "Preparando laudo técnico…";
    trava.current = true;
    setOcupado(true);
    try {
      const { imprimirLaudoOS } = await import("../../services/impressaoLaudoOS");
      await imprimirLaudoOS(janela, a.demo, a.oficina!.id, id, tipo);
    } catch (e) {
      janela.close();
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="botao-secundario os-imprimir-laudo"
        disabled={ocupado}
        onClick={() => void imprimir()}
      >
        <FileText size={18} aria-hidden="true" />
        {ocupado ? "Preparando laudo…" : "Imprimir laudo"}
      </button>
      {erro && (
        <p role="alert" className="erro-formulario os-laudo-erro">
          {erro}
        </p>
      )}
    </>
  );
}
