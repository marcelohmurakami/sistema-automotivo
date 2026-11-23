import { useMemo, useState } from "react";
import { unirOpcoesPorId } from "../lib/buscaSelecaoRapida";
import { useQuery } from "@tanstack/react-query";
import { SelecaoRapida } from "./SelecaoRapida";
import { useCatalogoBusca } from "../lib/useCatalogoBusca";
import {
  buscarCadastro,
  type CatalogoConsultado,
} from "../services/consultasCadastros";
import { useAcesso } from "../auth/contexto";
import { erroPublico } from "../lib/supabase";
import { lerCatalogoDemo } from "../lib/catalogo";
import { dinheiro } from "../lib/formatacao";

export function SelecaoCatalogo({
  valor,
  selecionar,
  rotulo = "Serviço ou material",
  tipo = "",
  unidade,
  opcaoVazia,
  nomeSelecionado,
}: {
  valor: string;
  selecionar: (id: string, item?: CatalogoConsultado) => void;
  rotulo?: string;
  tipo?: "service" | "part" | "";
  unidade?: string;
  opcaoVazia?: string;
  nomeSelecionado?: string;
}) {
  const a = useAcesso(),
    [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);
  const q = useCatalogoBusca(busca, tipo, aberto);
  const escolhido = useQuery({
    queryKey: ["catalogo", a.demo, a.oficina!.id, "id", valor],
    enabled: !!valor && !nomeSelecionado && !q.data?.some((item) => item.id === valor),
    queryFn: ({ signal }) =>
      a.demo
        ? Promise.resolve(lerCatalogoDemo(a.oficina!.id).filter((x) => x.id === valor))
        : buscarCadastro(a.oficina!.id, "catalogo", { id: valor }, signal),
    staleTime: 60_000,
  });
  const opcoes = useMemo(
    () =>
      unirOpcoesPorId(q.data, escolhido.data).filter(
        (x) => !unidade || x.unidade === unidade,
      ),
    [q.data, escolhido.data, unidade],
  );
  return (
    <SelecaoRapida
      rotulo={rotulo}
      valor={valor || (opcaoVazia ? "__novo" : "")}
      aoAbrir={() => setAberto(true)}
      aoBuscar={setBusca}
      carregando={q.aguardando}
      erro={
        q.error || (!q.data?.some((item) => item.id === valor) && escolhido.error)
          ? erroPublico(q.error || escolhido.error)
          : undefined
      }
      opcoes={[
        ...(opcaoVazia ? [{ id: "__novo", nome: opcaoVazia }] : []),
        ...(nomeSelecionado && valor && !opcoes.some((x) => x.id === valor)
          ? [{ id: valor, nome: nomeSelecionado }]
          : []),
        ...opcoes.map((x) => ({
          id: x.id,
          nome: x.descricao,
          detalhe: `${dinheiro(x.preco_padrao_centavos)} / ${x.unidade}`,
        })),
      ]}
      selecionar={(id) => {
        if (!id) return;
        selecionar(
          id === "__novo" ? "" : id,
          opcoes.find((x) => x.id === id),
        );
      }}
    />
  );
}
