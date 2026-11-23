import { ListFilter } from "lucide-react";
import "./FiltrosSituacao.css";

type Opcao = { valor: string; nome: string; tom?: string };

/** Expõe as consultas frequentes sem acrescentar outra etapa ao atendimento. */
export function FiltrosSituacao({
  rotulo,
  valor,
  alterar,
  principais,
  outras,
}: {
  rotulo: string;
  valor: string;
  alterar: (valor: string) => void;
  principais: readonly Opcao[];
  outras: readonly Opcao[];
}) {
  const outraSelecionada = outras.some((opcao) => opcao.valor === valor);
  return (
    <div className="filtros-situacao" role="group" aria-label={rotulo}>
      {principais.map((opcao) => (
        <button
          key={opcao.valor}
          type="button"
          aria-pressed={valor === opcao.valor}
          data-tom={opcao.tom}
          onClick={() => alterar(opcao.valor)}
        >
          {opcao.tom && <span className="filtro-ponto" aria-hidden="true" />}
          {opcao.nome}
        </button>
      ))}
      <label
        className={outraSelecionada ? "filtro-outras selecionado" : "filtro-outras"}
      >
        <ListFilter size={16} aria-hidden="true" />
        <select
          aria-label="Outras situações"
          value={outraSelecionada ? valor : "__outras"}
          onChange={(e) => alterar(e.target.value)}
        >
          <option value="__outras" disabled>
            Mais situações
          </option>
          {outras.map((opcao) => (
            <option key={opcao.valor} value={opcao.valor}>
              {opcao.nome}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
