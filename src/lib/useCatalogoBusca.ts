import { useQuery } from "@tanstack/react-query";
import { useAcesso } from "../auth/contexto";
import { useBuscaDebounced } from "./useBuscaDebounced";
import { buscarCadastro } from "../services/consultasCadastros";
import { filtrarCatalogo, lerCatalogoDemo } from "./catalogo";

/** Compartilha resultados e cancela buscas obsoletas entre seletores de itens. */
export function useCatalogoBusca(
  busca: string,
  tipo: "service" | "part" | "" = "",
  ativo = true,
) {
  const a = useAcesso(),
    termo = useBuscaDebounced(busca);
  const consulta = useQuery({
    queryKey: ["catalogo", a.demo, a.oficina?.id, "busca", tipo, termo],
    enabled: ativo && !!a.oficina && a.permite("catalog"),
    queryFn: ({ signal }) =>
      a.demo
        ? Promise.resolve(
            filtrarCatalogo(
              lerCatalogoDemo(a.oficina!.id),
              termo,
              tipo || "todos",
              "ativos",
              false,
            ).slice(0, 30),
          )
        : buscarCadastro(
            a.oficina!.id,
            "catalogo",
            { busca: termo, tipoItem: tipo },
            signal,
          ),
    staleTime: 60_000,
  });
  return { ...consulta, aguardando: termo !== busca || consulta.isFetching };
}
