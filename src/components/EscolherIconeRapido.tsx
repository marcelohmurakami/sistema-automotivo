import { useAcesso } from "../auth/contexto";
import {
  especialidadePadrao,
  tiposDaEspecialidade,
  tiposServico,
  type TipoServico,
} from "../lib/especialidades";
import { IconeTipoServico } from "./TipoServico";
import "./EdicaoRapidaMapa.css";
export function EscolherIconeRapido({
  valor,
  ocupado,
  escolher,
}: {
  valor?: string | null;
  ocupado: boolean;
  escolher: (valor: string) => void;
}) {
  const a = useAcesso();
  const opcoes = [
    ...new Set([
      "",
      ...tiposDaEspecialidade(
        a.oficina?.especialidade || especialidadePadrao(a.oficina?.ramo),
      ),
      ...(valor && tiposServico[valor as TipoServico] ? [valor] : []),
    ]),
  ];
  return (
    <div className="mapa-edicao-tipos" role="group" aria-label="Escolher ícone">
      {opcoes.map((tipo) => (
        <button
          key={tipo}
          type="button"
          disabled={ocupado}
          aria-pressed={(valor || "") === tipo}
          aria-label={tiposServico[tipo as TipoServico]?.[0] || "Sem identificação"}
          onClick={() => escolher(tipo)}
        >
          <IconeTipoServico tipo={tipo} legenda />
        </button>
      ))}
    </div>
  );
}
