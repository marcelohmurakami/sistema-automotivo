import {
  ShieldCheck,
  Clock3,
  CheckCircle2,
  ChevronRight,
  Wallet,
  XCircle,
} from "lucide-react";
import { dinheiro } from "../../lib/formatacao";
import "./QualidadeServicos.css";

export type LinhaQualidade = {
  id: string;
  tipo: string;
  abertura: string;
  descricao: string;
  cliente?: string;
  referencia?: string;
  situacao: string;
  tom: "aberta" | "resolvida" | "cancelada";
  custo: number;
  detalheCusto: string;
};
export function ResumoQualidade({
  abertas,
  resolvidas,
  custo,
}: {
  abertas: number;
  resolvidas: number;
  custo: number;
}) {
  return (
    <div className="qserv-resumo" aria-label="Resumo das ocorrências">
      <div>
        <Clock3 size={20} />
        <span>
          Em aberto<strong>{abertas}</strong>
        </span>
      </div>
      <div>
        <CheckCircle2 size={20} />
        <span>
          Resolvidas<strong>{resolvidas}</strong>
        </span>
      </div>
      <div>
        <Wallet size={20} />
        <span>
          Custo registrado<strong>{dinheiro(custo)}</strong>
        </span>
      </div>
    </div>
  );
}
export function ListaQualidade({
  itens,
  abrir,
  ocupado = false,
  filtrada = false,
}: {
  itens: LinhaQualidade[];
  abrir: (id: string) => void;
  ocupado?: boolean;
  filtrada?: boolean;
}) {
  return itens.length ? (
    <div className="qserv-lista" aria-label="Ocorrências">
      {itens.map((i) => (
        <button
          type="button"
          className="qserv-linha"
          key={i.id}
          disabled={ocupado}
          onClick={() => abrir(i.id)}
        >
          <span className={`qserv-situacao ${i.tom}`}>
            {i.tom === "resolvida" ? (
              <CheckCircle2 size={15} />
            ) : i.tom === "cancelada" ? (
              <XCircle size={15} />
            ) : (
              <Clock3 size={15} />
            )}
            {i.situacao}
          </span>
          <span className="qserv-linha-conteudo">
            <span className="qserv-tipo">
              {i.tipo} · {i.abertura}
            </span>
            <strong>{i.descricao}</strong>
            {(i.cliente || i.referencia) && (
              <small>{[i.cliente, i.referencia].filter(Boolean).join(" · ")}</small>
            )}
          </span>
          <span className="qserv-linha-custo">
            <strong>{dinheiro(i.custo)}</strong>
            <small>{i.detalheCusto}</small>
          </span>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      ))}
    </div>
  ) : (
    <div className="qserv-vazio">
      <ShieldCheck size={30} />
      <strong>
        {filtrada
          ? "Nenhuma ocorrência com estes filtros"
          : "Nenhuma ocorrência registrada"}
      </strong>
      <p>
        {filtrada
          ? "Altere a busca, a situação ou o período."
          : "Registre um retorno para acompanhar a solução e os custos."}
      </p>
    </div>
  );
}
