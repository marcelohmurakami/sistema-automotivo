import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Printer } from "lucide-react";
import { useAcesso } from "../../auth/contexto";
import { imprimirNotaOS } from "../../services/impressaoNotaOS";
import { erroPublico } from "../../lib/supabase";

export function ImprimirNotaOS({ osId }: { osId: string }) {
  const acesso = useAcesso();
  const trava = useRef(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  async function imprimir() {
    if (trava.current) return;
    setErro("");
    trava.current = true;
    setOcupado(true);
    try {
      await imprimirNotaOS(acesso.demo, acesso.oficina!.id, osId);
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  return (
    <div className="os-impressao-rapida">
      <button
        className="botao-primario"
        disabled={ocupado}
        onClick={() => void imprimir()}
      >
        <Printer size={19} aria-hidden="true" />
        {ocupado ? "Preparando nota…" : "Imprimir nota da OS"}
      </button>
      <Link to={`/documentos?tipo=os&id=${osId}&origem=os`}>Visualizar / PDF</Link>
      {erro && (
        <p role="alert" className="erro-formulario">
          {erro}
        </p>
      )}
    </div>
  );
}
