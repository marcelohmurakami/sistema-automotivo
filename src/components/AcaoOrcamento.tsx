import { ArrowUpRight, Check } from "lucide-react";
import { Link } from "react-router-dom";
import type { ResumoProposta } from "../services/orcamentos";

/** Mesma ação principal na lista e no detalhe, inclusive para rascunhos antigos. */
export function AcaoOrcamento({
  proposta,
  permiteOS,
  ocupado,
  aprovar,
  converter,
  compacta = false,
}: {
  proposta: Pick<
    ResumoProposta,
    "situacao" | "arquivado_em" | "ordem_servico_id" | "adicional_os_id"
  >;
  permiteOS: boolean;
  ocupado: boolean;
  aprovar: () => void;
  converter: () => void;
  compacta?: boolean;
}) {
  if (proposta.arquivado_em) return null;
  const classe = compacta ? "botao-secundario acao-rapida-orcamento" : "botao-primario";
  if (["draft", "awaiting_approval"].includes(proposta.situacao))
    return (
      <button className={classe} disabled={ocupado} onClick={aprovar}>
        <Check size={16} /> Aprovar
      </button>
    );
  const os = proposta.ordem_servico_id || proposta.adicional_os_id;
  if (os && permiteOS)
    return (
      <Link className={classe} to={`/ordens-servico?os=${os}`}>
        <ArrowUpRight size={16} /> Abrir OS
      </Link>
    );
  if (proposta.situacao === "approved" && permiteOS)
    return (
      <button className={classe} disabled={ocupado} onClick={converter}>
        <ArrowUpRight size={16} /> Transformar em OS
      </button>
    );
  return null;
}
