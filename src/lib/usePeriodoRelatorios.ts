import { useSearchParams } from "react-router-dom";
import { hojeNoAparelho } from "./dataServico";
import {
  periodoRapido,
  periodoRelatorioValido,
  type PeriodoRelatorio,
} from "./periodoRelatorios";
export function usePeriodoRelatorios() {
  const [params, setParams] = useSearchParams();
  const inicio = params.get("inicio") || "",
    fim = params.get("fim") || "";
  const valido = periodoRelatorioValido(inicio, fim);
  const periodo = valido ? { inicio, fim } : periodoRapido("mes", hojeNoAparelho());
  const aplicar = (p: PeriodoRelatorio) => {
    if (!periodoRelatorioValido(p.inicio, p.fim)) return;
    setParams(
      (anterior) => {
        const novos = new URLSearchParams(anterior);
        novos.set("inicio", p.inicio);
        novos.set("fim", p.fim);
        return novos;
      },
      { replace: true },
    );
  };
  return { periodo, aplicar, invalido: !!(inicio || fim) && !valido };
}
