import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAcesso } from "../auth/contexto";
import { consultarContasBancarias, contasPadrao } from "../services/contasBancarias";
export function useContasBancarias() {
  const a = useAcesso();
  const q = useQuery({
    queryKey: ["contas-bancarias", a.demo, a.oficina?.id],
    queryFn: ({ signal }) =>
      consultarContasBancarias(a.demo, a.oficina!.id, undefined, signal),
    enabled: !!a.oficina && a.permite("finance") && a.oficina.perfil !== "staff",
    staleTime: 30000,
  });
  const lista = q.data || contasPadrao;
  const nomes = useMemo(
    () => ({
      contas: Object.fromEntries(lista.map((c) => [c.codigo, c.nome])),
      ativas: Object.fromEntries(
        lista.filter((c) => c.ativo).map((c) => [c.codigo, c.nome]),
      ),
    }),
    [lista],
  );
  return {
    ...q,
    lista,
    ...nomes,
  };
}
