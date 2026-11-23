import { useEffect, useState } from "react";
// Evita uma consulta ao servidor para cada tecla, sem atrasar a digitação.
export function useBuscaDebounced(valor: string) {
  const [consulta, setConsulta] = useState(valor);
  useEffect(() => {
    const timer = window.setTimeout(() => setConsulta(valor), 200);
    return () => window.clearTimeout(timer);
  }, [valor]);
  // Limpar o campo (inclusive após selecionar) deve voltar imediatamente à lista.
  return valor === "" ? "" : consulta;
}
