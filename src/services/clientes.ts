import { novoId } from "../lib/uuid.ts";
import { supabase } from "../lib/supabase";
export type DadosCliente = {
  nome: string;
  telefone_e164: string;
  email: string;
  tipo: "pessoa_fisica" | "pessoa_juridica";
  endereco: string;
  observacoes: string;
};
export type Cliente = Omit<DadosCliente, "telefone_e164" | "email"> & {
  telefone_e164: string | null;
  email: string | null;
  id: string;
  oficina_id: string;
  revisao: number;
  criado_em: string;
  atualizado_em: string;
  arquivado_em: string | null;
};
export type ListaClientes = { itens: Cliente[]; total: number };
const chaveDemo = "patio_clientes_demo_v1";
export function lerDemo(): Cliente[] {
  const guardados = localStorage.getItem(chaveDemo);
  if (guardados) {
    try {
      const dados = JSON.parse(guardados);
      if (Array.isArray(dados)) return dados;
    } catch {
      /* Reinicia somente os exemplos corrompidos. */
    }
  }
  return [
    "Ana Carolina Silva",
    "Bruno Oliveira",
    "Carlos Eduardo Santos",
    "Daniela Martins",
    "Eduardo Ferreira",
    "Fernanda Costa",
  ].map((nome, i) => ({
    id: `exemplo-${i}`,
    oficina_id: "demonstracao",
    nome,
    telefone_e164: null,
    email: null,
    tipo: "pessoa_fisica",
    endereco: "",
    observacoes: "Cadastro ilustrativo para explorar o sistema.",
    revisao: 1,
    criado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
    arquivado_em: null,
  }));
}
export function consultarClienteDemo(id: string) {
  const cliente = lerDemo().find((c) => c.id === id);
  if (!cliente) throw new Error("Cliente não encontrado.");
  return cliente;
}
export function normalizarTelefone(valor: string) {
  const digitos = valor.replace(/\D/g, "");
  if (!digitos) return "";
  const numero = valor.trim().startsWith("+") ? `+${digitos}` : `+55${digitos}`;
  if (
    !/^\+[1-9]\d{7,14}$/.test(numero) ||
    (!valor.trim().startsWith("+") && !/^\d{10,11}$/.test(digitos))
  )
    throw new Error(
      "Informe o telefone com DDD. Para outros países, comece com + e o código do país.",
    );
  return numero;
}
export async function listarClientes(
  demo: boolean,
  oficina: string,
  busca: string,
  arquivados: boolean,
  pagina: number,
  signal?: AbortSignal,
): Promise<ListaClientes> {
  if (!demo) {
    const consulta = supabase!.rpc("listar_clientes", {
      p_oficina: oficina,
      p_busca: busca,
      p_arquivados: arquivados,
      p_pagina: pagina,
    });
    if (signal) consulta.abortSignal(signal);
    const { data, error } = await consulta;
    if (error) throw error;
    return data;
  }
  const encontrados = lerDemo()
    .filter(
      (c) =>
        !!c.arquivado_em === arquivados &&
        `${c.nome} ${c.telefone_e164 ?? ""} ${c.email ?? ""}`
          .toLocaleLowerCase()
          .includes(busca.toLocaleLowerCase()),
    )
    .sort((a, b) => a.nome.localeCompare(b.nome));
  return {
    itens: encontrados.slice(pagina * 24, (pagina + 1) * 24),
    total: encontrados.length,
  };
}
export async function salvarCliente(
  demo: boolean,
  oficina: string,
  dados: DadosCliente,
  anterior?: Cliente,
) {
  if (!demo) {
    const { data, error } = await supabase!.rpc("salvar_cliente", {
      p_oficina: oficina,
      p_dados: dados,
      p_cliente: anterior?.id ?? null,
      p_revisao: anterior?.revisao ?? null,
    });
    if (error) throw error;
    return data as Cliente;
  }
  const clientes = lerDemo();
  const atual = anterior && clientes.find((c) => c.id === anterior.id);
  if (anterior && (!atual || atual.revisao !== anterior.revisao))
    throw new Error("Este cliente foi alterado. Atualize a lista e abra novamente.");
  const cliente: Cliente = {
    ...dados,
    id: anterior?.id ?? novoId(),
    oficina_id: oficina,
    revisao: (anterior?.revisao ?? 0) + 1,
    criado_em: anterior?.criado_em ?? new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
    arquivado_em: null,
  };
  localStorage.setItem(
    chaveDemo,
    JSON.stringify([cliente, ...clientes.filter((c) => c.id !== cliente.id)]),
  );
  return cliente;
}
export async function arquivarCliente(
  demo: boolean,
  oficina: string,
  cliente: Cliente,
  arquivar: boolean,
) {
  if (!demo) {
    const { error } = await supabase!.rpc("definir_arquivamento_cliente", {
      p_oficina: oficina,
      p_cliente: cliente.id,
      p_revisao: cliente.revisao,
      p_arquivar: arquivar,
    });
    if (error) throw error;
    return;
  }
  const clientes = lerDemo();
  const atual = clientes.find((c) => c.id === cliente.id);
  if (!atual || atual.revisao !== cliente.revisao)
    throw new Error("Este cliente foi alterado. Atualize a lista e tente novamente.");
  localStorage.setItem(
    chaveDemo,
    JSON.stringify(
      clientes.map((c) =>
        c.id === cliente.id
          ? {
              ...c,
              revisao: c.revisao + 1,
              arquivado_em: arquivar ? new Date().toISOString() : null,
            }
          : c,
      ),
    ),
  );
}
