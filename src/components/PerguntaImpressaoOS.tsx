import { useRef, useState } from "react";
import { Printer } from "lucide-react";
import { useAcesso } from "../auth/contexto";
import { erroPublico } from "../lib/supabase";
import { abrirJanelaNotaOS, imprimirNotaOS } from "../services/impressaoNotaOS";
import { imprimirNotaAtendimento } from "../services/impressaoAtendimento";
import { Dialogo } from "./Dialogo";
import "./PagamentoAposRegistro.css";

export function PerguntaImpressaoOS({
  tipo,
  id,
  fechar,
}: {
  tipo: "os" | "atendimento";
  id: string;
  fechar: () => void;
}) {
  const acesso = useAcesso();
  const trava = useRef(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  async function imprimir() {
    if (trava.current) return;
    trava.current = true;
    setOcupado(true);
    setErro("");
    // Abre pelo clique; carregar os dados antes pode bloquear a janela no celular.
    try {
      const janela = abrirJanelaNotaOS();
      if (tipo === "os")
        await imprimirNotaOS(acesso.demo, acesso.oficina!.id, id, janela);
      else await imprimirNotaAtendimento(acesso.demo, acesso.oficina!.id, id, janela);
      fechar();
    } catch (e) {
      // Tentar imprimir de novo nunca repete o pagamento nem a entrega.
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }

  return (
    <Dialogo
      aberto
      fechar={() => !trava.current && fechar()}
      titulo="Deseja imprimir a OS?"
      classe="dialogo-pagamento-registro"
    >
      {erro && <p role="alert">{erro}</p>}
      <div className="compra-acoes">
        <button
          type="button"
          className="botao-primario"
          disabled={ocupado}
          onClick={() => void imprimir()}
        >
          <Printer size={18} aria-hidden="true" />
          {ocupado ? "Preparando impressão…" : "Sim, imprimir"}
        </button>
        <button
          type="button"
          className="botao-secundario"
          disabled={ocupado}
          onClick={fechar}
        >
          Agora não
        </button>
      </div>
    </Dialogo>
  );
}
