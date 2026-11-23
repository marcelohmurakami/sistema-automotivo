import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useAcesso } from "../auth/contexto";
import { buscarCadastro } from "../services/consultasCadastros";
import { useBuscaDebounced } from "./useBuscaDebounced";
import type { Auxiliares } from "../services/orcamentos";
import { unirOpcoesPorId } from "./buscaSelecaoRapida";

export function useCadastrosOrcamento(
  aux: Auxiliares,
  cliente: string,
  veiculo: string,
) {
  const a = useAcesso(),
    cache = useQueryClient(),
    oficina = a.oficina!.id;
  const [buscaCliente, setBuscaCliente] = useState("");
  const [buscaVeiculo, setBuscaVeiculo] = useState("");
  const termoCliente = useBuscaDebounced(buscaCliente),
    termoVeiculo = useBuscaDebounced(buscaVeiculo);
  const remoto = !a.demo;
  const clientes = useQuery({
    queryKey: ["selecao-operacao", oficina, a.demo, "clientes", "", termoCliente],
    queryFn: ({ signal }) =>
      buscarCadastro(oficina, "clientes", { busca: termoCliente }, signal),
    enabled: remoto,
    staleTime: 60_000,
  });
  const selecionado = useQuery({
    queryKey: ["selecao-operacao", oficina, a.demo, "clientes", "", "id", cliente],
    queryFn: ({ signal }) =>
      buscarCadastro(oficina, "clientes", { id: cliente }, signal),
    enabled:
      remoto &&
      !!cliente &&
      cliente !== "avulso" &&
      !clientes.data?.some((item) => item.id === cliente),
    staleTime: 60_000,
  });
  const consultaVeiculos = (id: string, busca = "") => ({
    queryKey: ["selecao-operacao", oficina, a.demo, "veiculos", id, busca],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      buscarCadastro(oficina, "veiculos", { cliente: id, busca }, signal),
    staleTime: 60_000,
  });
  const veiculos = useQuery({
    ...consultaVeiculos(cliente, termoVeiculo),
    enabled: remoto && !!cliente && cliente !== "avulso",
  });
  const selecionadoVeiculo = useQuery({
    queryKey: ["selecao-operacao", oficina, a.demo, "veiculos", cliente, "id", veiculo],
    queryFn: ({ signal }) =>
      buscarCadastro(oficina, "veiculos", { cliente, id: veiculo }, signal),
    enabled:
      remoto &&
      !!veiculo &&
      !!cliente &&
      cliente !== "avulso" &&
      !veiculos.data?.some((item) => item.id === veiculo),
    staleTime: 60_000,
  });
  const opcoesClientes = useMemo(
    () => unirOpcoesPorId(clientes.data, selecionado.data),
    [clientes.data, selecionado.data],
  );
  const opcoesVeiculos = useMemo(
    () => unirOpcoesPorId(veiculos.data, selecionadoVeiculo.data),
    [veiculos.data, selecionadoVeiculo.data],
  );
  return {
    clientes: remoto ? opcoesClientes : aux.clientes,
    veiculos: remoto ? opcoesVeiculos : aux.veiculos,
    vinculos: remoto
      ? opcoesVeiculos.map((v) => ({
          cliente_id: cliente,
          veiculo_id: v.id,
        }))
      : aux.vinculos,
    buscarCliente: remoto ? setBuscaCliente : undefined,
    buscarVeiculo: remoto ? setBuscaVeiculo : undefined,
    carregandoClientes:
      remoto && (clientes.isFetching || termoCliente !== buscaCliente),
    carregandoVeiculos:
      remoto && (veiculos.isFetching || termoVeiculo !== buscaVeiculo),
    erroClientes:
      clientes.error ||
      (!clientes.data?.some((item) => item.id === cliente) && selecionado.error),
    erroVeiculos:
      veiculos.error ||
      (!veiculos.data?.some((item) => item.id === veiculo) && selecionadoVeiculo.error),
    carregarVeiculos: (id: string) => cache.fetchQuery(consultaVeiculos(id)),
  };
}
