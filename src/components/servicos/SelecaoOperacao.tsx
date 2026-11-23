import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAcesso } from "../../auth/contexto";
import { useBuscaDebounced } from "../../lib/useBuscaDebounced";
import { erroPublico } from "../../lib/supabase";
import { buscarCadastro } from "../../services/consultasCadastros";
import { buscarSelecaoServicos } from "../../services/painelServicos";
import { lerDemo } from "../../services/clientes";
import { SelecaoRapida } from "../SelecaoRapida";
import type { ObjetoServico, AtendimentoServico } from "../../services/servicos";
import type { Auxiliares } from "../../services/orcamentos";
import { unirOpcoesPorId } from "../../lib/buscaSelecaoRapida";

type Opcao =
  | ObjetoServico
  | (AtendimentoServico & { cliente_nome?: string })
  | Auxiliares["clientes"][number];
export function SelecaoOperacao({
  tipo,
  cliente = "",
  valor,
  rotulo,
  selecionar,
  selecionarUnico = false,
}: {
  tipo: "clientes" | "objetos" | "atendimentos";
  cliente?: string;
  valor: string;
  rotulo: string;
  selecionar: (id: string, item?: Opcao) => void;
  selecionarUnico?: boolean;
}) {
  const a = useAcesso(),
    cache = useQueryClient(),
    oficina = a.oficina!.id,
    [busca, setBusca] = useState("");
  const termo = useBuscaDebounced(busca);
  const consultar = (
    busca: string,
    id: string,
    signal: AbortSignal,
  ): Promise<Opcao[]> =>
    tipo === "clientes"
      ? a.demo
        ? Promise.resolve(
            lerDemo()
              .filter((c) =>
                id
                  ? c.id === id
                  : !c.arquivado_em &&
                    c.nome.toLowerCase().includes(busca.toLowerCase()),
              )
              .slice(0, 30),
          )
        : buscarCadastro(oficina, "clientes", { busca, id }, signal)
      : buscarSelecaoServicos(oficina, a.demo, tipo, busca, cliente, id, signal);
  const q = useQuery({
    queryKey: ["selecao-operacao", oficina, a.demo, tipo, cliente, termo],
    queryFn: ({ signal }) => consultar(termo, "", signal),
    enabled: tipo !== "objetos" || !!cliente,
    staleTime: 60_000,
    // A busca mostra a falha imediatamente; o usuário pode repeti-la sem
    // esperar uma segunda tentativa de até 20 segundos nem perder o formulário.
    retry: false,
  });
  const escolhido = useQuery({
    queryKey: ["selecao-operacao", oficina, a.demo, tipo, cliente, "id", valor],
    queryFn: ({ signal }) => consultar("", valor, signal),
    enabled: !!valor && !q.data?.some((item) => item.id === valor),
    staleTime: 60_000,
    retry: false,
  });
  const opcoes = useMemo(
    () => unirOpcoesPorId(q.data, escolhido.data),
    [q.data, escolhido.data],
  );
  const clienteConferido = useRef("");
  useEffect(() => {
    if (
      !selecionarUnico ||
      tipo !== "objetos" ||
      !cliente ||
      valor ||
      busca ||
      q.isFetching ||
      !q.isSuccess ||
      clienteConferido.current === cliente
    )
      return;
    clienteConferido.current = cliente;
    const unico = q.data?.length === 1 ? q.data[0] : undefined;
    if (unico && "cliente_id" in unico && unico.cliente_id === cliente)
      selecionar(unico.id, unico);
  }, [
    selecionarUnico,
    tipo,
    cliente,
    valor,
    busca,
    q.isFetching,
    q.isSuccess,
    q.data,
    selecionar,
  ]);
  return (
    <SelecaoRapida
      rotulo={rotulo}
      valor={valor}
      obrigatorio
      aoBuscar={setBusca}
      carregando={q.isFetching || termo !== busca}
      erro={
        q.error || (!q.data?.some((item) => item.id === valor) && escolhido.error)
          ? erroPublico(q.error || escolhido.error)
          : undefined
      }
      tentarNovamente={() => {
        void q.refetch();
        if (escolhido.isError) void escolhido.refetch();
      }}
      opcoes={opcoes.map((x) => ({
        id: x.id,
        nome: "titulo" in x ? `${x.cliente_nome || ""} · ${x.titulo}` : x.nome,
      }))}
      selecionar={(id) => {
        clienteConferido.current = cliente;
        const item = opcoes.find((x) => x.id === id);
        if (id && item)
          cache.setQueryData(
            ["selecao-operacao", oficina, a.demo, tipo, cliente, "id", id],
            [item],
          );
        selecionar(id, item);
      }}
    />
  );
}
