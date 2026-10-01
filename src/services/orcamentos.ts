import { lerCatalogoDemo, filtrarCatalogo } from "../lib/catalogo";
import { supabase } from "../lib/supabase";
import { listarClientes } from "./clientes";
export type ItemProposta = {
  id?: string;
  item_catalogo_id?: string | null;
  tipo: "service" | "part";
  descricao: string;
  unidade: string;
  quantidade: number;
  preco_unitario_centavos: number;
  total_item_centavos?: number;
};
export type VersaoProposta = {
  id: string;
  numero_versao: number;
  dados_oficina: { nome: string; telefone_e164?: string | null; logo?: string; cor?: string; rodape?: string };
  dados_cliente: {
    nome: string;
    telefone_e164?: string | null;
    email?: string | null;
  };
  dados_veiculo: {
    modelo: string;
    marca?: string | null;
    placa?: string | null;
    ano_modelo?: number | null;
  };
  observacoes: string;
  condicoes: string;
  subtotal_centavos: number;
  desconto_centavos: number;
  total_centavos: number;
  publicado_em: string | null;
  expira_em: string | null;
};
export type Proposta = {
  id: string;
  numero: number;
  revisao: number;
  situacao: string;
  cliente_id: string;
  veiculo_id: string;
  versao_atual_id: string;
  versao: VersaoProposta;
  itens: ItemProposta[];
  historico: {
    id: string;
    numero_versao: number;
    total_centavos: number;
    publicado_em: string | null;
  }[];
  aprovacao: {
    decisao: string;
    nome_informado: string;
    confirmado_em: string;
  } | null;
  ordem_servico_id: string | null;
};
export type ResumoProposta = {
  id: string;
  numero: number;
  revisao: number;
  situacao: string;
  cliente: string;
  veiculo: string;
  placa: string | null;
  total_centavos: number;
  numero_versao: number;
  expira_em: string | null;
  criado_em: string;
};
export type DadosProposta = {
  cliente_id: string;
  veiculo_id: string;
  itens: ItemProposta[];
  observacoes: string;
  condicoes: string;
  desconto_centavos: number;
};
export type Auxiliares = {
  clientes: {
    id: string;
    nome: string;
    telefone_e164: string | null;
    email: string | null;
  }[];
  veiculos: {
    id: string;
    modelo: string;
    marca: string | null;
    placa: string | null;
    ano_modelo: number | null;
  }[];
  vinculos: { cliente_id: string; veiculo_id: string }[];
  catalogo: {
    id: string;
    descricao: string;
    tipo: "service" | "part";
    preco_padrao_centavos: number;
    unidade: string;
    favorito: boolean;
  }[];
};
export const rotulosSituacao: Record<string, string> = {
  draft: "Rascunho",
  awaiting_approval: "Aguardando aprovação",
  approved: "Aprovado",
  declined: "Recusado",
  expired: "Vencido",
  cancelled: "Cancelado",
};
export const dinheiro = (centavos: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    centavos / 100,
  );
export async function rpc<T>(
  nome: string,
  dados: Record<string, unknown> = {},
): Promise<T> {
  if (!supabase) throw new Error("Conexão indisponível.");
  const { data, error } = await supabase.rpc(nome, dados);
  if (error) throw error;
  return data as T;
}
const chave = "patio_orcamentos_v2";
export function lerPropostasDemo(): Proposta[] {
  try {
    return JSON.parse(localStorage.getItem(chave) ?? "[]");
  } catch {
    return [];
  }
}
function gravarDemo(q: Proposta) {
  localStorage.setItem(
    chave,
    JSON.stringify([q, ...lerPropostasDemo().filter((p) => p.id !== q.id)]),
  );
  return q;
}
export async function auxiliaresOrcamento(
  demo: boolean,
  oficina: string,
): Promise<Auxiliares> {
  if (demo) {
    const clientes = (await listarClientes(true, "demonstracao", "", false, 0))
      .itens;
    return {
      clientes,
      veiculos: clientes.map((c, i) => ({
        id: `veiculo-${c.id}`,
        modelo: ["Gol", "Onix", "HB20", "Corolla"][i % 4],
        marca: null,
        placa: null,
        ano_modelo: 2020,
      })),
      vinculos: clientes.map((c) => ({
        cliente_id: c.id,
        veiculo_id: `veiculo-${c.id}`,
      })),
      catalogo: filtrarCatalogo(
        lerCatalogoDemo(),
        "",
        "todos",
        "ativos",
        false,
      ),
    };
  }
  async function todas<T>(
    consulta: (
      inicio: number,
    ) => PromiseLike<{ data: T[] | null; error: unknown }>,
  ) {
    const registros: T[] = [];
    for (let inicio = 0; ; inicio += 500) {
      const resultado = await consulta(inicio);
      if (resultado.error) throw resultado.error;
      const lote = resultado.data ?? [];
      registros.push(...lote);
      if (lote.length < 500) return registros;
    }
  }
  const resultados = await Promise.all([
    todas((inicio) =>
      supabase!
        .from("clientes")
        .select("id,nome,telefone_e164,email")
        .eq("oficina_id", oficina)
        .is("arquivado_em", null)
        .order("nome")
        .order("id")
        .range(inicio, inicio + 499),
    ),
    todas((inicio) =>
      supabase!
        .from("veiculos")
        .select("id,modelo,marca,placa,ano_modelo")
        .eq("oficina_id", oficina)
        .is("arquivado_em", null)
        .order("modelo")
        .order("id")
        .range(inicio, inicio + 499),
    ),
    todas((inicio) =>
      supabase!
        .from("clientes_veiculos")
        .select("cliente_id,veiculo_id")
        .eq("oficina_id", oficina)
        .is("encerrado_em", null)
        .order("cliente_id")
        .order("veiculo_id")
        .range(inicio, inicio + 499),
    ),
    todas((inicio) =>
      supabase!
        .from("itens_catalogo")
        .select("id,descricao,tipo,preco_padrao_centavos,unidade,favorito")
        .eq("oficina_id", oficina)
        .is("arquivado_em", null)
        .order("favorito", { ascending: false })
        .order("descricao")
        .order("id")
        .range(inicio, inicio + 499),
    ),
  ]);
  return {
    clientes: resultados[0],
    veiculos: resultados[1],
    vinculos: resultados[2],
    catalogo: resultados[3],
  } as Auxiliares;
}
export async function listarPropostas(
  demo: boolean,
  oficina: string,
  busca: string,
  situacao: string,
  pagina: number,
): Promise<{ itens: ResumoProposta[]; total: number }> {
  if (!demo)
    return rpc("listar_orcamentos", {
      p_oficina: oficina,
      p_busca: busca,
      p_situacao: situacao,
      p_pagina: pagina,
    });
  const todos = lerPropostasDemo()
    .map((q) => ({
      id: q.id,
      numero: q.numero,
      revisao: q.revisao,
      situacao:
        q.situacao === "awaiting_approval" &&
        q.versao.expira_em &&
        new Date(q.versao.expira_em) < new Date()
          ? "expired"
          : q.situacao,
      cliente: q.versao.dados_cliente.nome,
      veiculo: q.versao.dados_veiculo.modelo,
      placa: q.versao.dados_veiculo.placa ?? null,
      total_centavos: q.versao.total_centavos,
      numero_versao: q.versao.numero_versao,
      expira_em: q.versao.expira_em,
      criado_em: "",
    }))
    .filter(
      (q) =>
        (!situacao || q.situacao === situacao) &&
        `${q.numero} ${q.cliente} ${q.veiculo} ${q.placa ?? ""}`
          .toLowerCase()
          .includes(busca.toLowerCase()),
    )
    .sort((a, b) => b.numero - a.numero);
  return {
    itens: todos.slice(pagina * 24, pagina * 24 + 24),
    total: todos.length,
  };
}
export async function obterProposta(
  demo: boolean,
  oficina: string,
  id: string,
  versao?: string,
): Promise<Proposta> {
  if (!demo)
    return rpc("consultar_orcamento", {
      p_oficina: oficina,
      p_orcamento: id,
      p_versao: versao ?? null,
    });
  const q = lerPropostasDemo().find((q) => q.id === id);
  if (!q) throw new Error("Orçamento não encontrado.");
  return q;
}
export async function salvarProposta(
  demo: boolean,
  oficina: string,
  dados: DadosProposta,
  chaveCriacao: string,
  anterior?: Proposta,
): Promise<Proposta> {
  if (!demo)
    return rpc("salvar_orcamento", {
      p_oficina: oficina,
      p_dados: dados,
      p_chave: chaveCriacao,
      p_orcamento: anterior?.id ?? null,
      p_revisao: anterior?.revisao ?? null,
    });
  const aux = await auxiliaresOrcamento(true, oficina);
  const c = aux.clientes.find((c) => c.id === dados.cliente_id),
    v = aux.veiculos.find((v) => v.id === dados.veiculo_id);
  if (!c || !v) throw new Error("Selecione cliente e veículo.");
  const itens = dados.itens.map((i) => ({
    ...i,
    total_item_centavos: Math.round(i.quantidade * i.preco_unitario_centavos),
  }));
  const subtotal = itens.reduce((a, i) => a + i.total_item_centavos, 0);
  if (dados.desconto_centavos > subtotal)
    throw new Error("Desconto maior que o subtotal.");
  const versao: VersaoProposta = {
    id: anterior?.versao.id ?? crypto.randomUUID(),
    numero_versao: anterior?.versao.numero_versao ?? 1,
    dados_oficina: (() => {
      const d = JSON.parse(
        localStorage.getItem("patio_configuracoes_demo") || "{}",
      );
      return {
        nome: d.nome || "Oficina do Marcelo",
        telefone_e164: d.telefone || null,
      };
    })(),
    dados_cliente: c,
    dados_veiculo: v,
    observacoes: dados.observacoes,
    condicoes: dados.condicoes,
    subtotal_centavos: subtotal,
    desconto_centavos: dados.desconto_centavos,
    total_centavos: subtotal - dados.desconto_centavos,
    publicado_em: null,
    expira_em: null,
  };
  return gravarDemo({
    id: anterior?.id ?? chaveCriacao,
    numero:
      anterior?.numero ??
      Math.max(0, ...lerPropostasDemo().map((q) => q.numero)) + 1,
    revisao: (anterior?.revisao ?? 0) + 1,
    situacao: "draft",
    cliente_id: c.id,
    veiculo_id: v.id,
    versao_atual_id: versao.id,
    versao,
    itens,
    historico: [
      {
        id: versao.id,
        numero_versao: versao.numero_versao,
        total_centavos: versao.total_centavos,
        publicado_em: null,
      },
    ],
    aprovacao: null,
    ordem_servico_id: null,
  });
}
export async function tokenSeguro() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return {
    token,
    hash: Array.from(new Uint8Array(digest), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join(""),
  };
}
export function basePublica() {
  return (import.meta.env.VITE_URL_PUBLICA || window.location.origin).replace(
    /\/$/,
    "",
  );
}
export function linkPublico(token: string) {
  return `${basePublica()}/proposta#${token}`;
}
export function linkSomenteLocal() {
  try {
    return ["127.0.0.1", "localhost", "[::1]"].includes(
      new URL(basePublica()).hostname,
    );
  } catch {
    return true;
  }
}
export async function emitirProposta(
  demo: boolean,
  oficina: string,
  q: Proposta,
  dias: number,
) {
  if (demo) {
    if (!q.itens.length) throw new Error("Adicione pelo menos um item.");
    const versao = {
      ...q.versao,
      publicado_em: new Date().toISOString(),
      expira_em: new Date(Date.now() + dias * 86400000).toISOString(),
    };
    return {
      proposta: gravarDemo({
        ...q,
        revisao: q.revisao + 1,
        situacao: "awaiting_approval",
        versao,
        historico: [{ ...q.historico[0], publicado_em: versao.publicado_em }],
      }),
      link: "",
    };
  }
  const segredo = await tokenSeguro();
  const proposta = await rpc<Proposta>("emitir_orcamento", {
    p_oficina: oficina,
    p_orcamento: q.id,
    p_revisao: q.revisao,
    p_validade_dias: dias,
    p_hash_token: segredo.hash,
  });
  return { proposta, link: linkPublico(segredo.token) };
}
export async function novoLink(oficina: string, q: Proposta) {
  const segredo = await tokenSeguro();
  await rpc("gerar_link_orcamento", {
    p_oficina: oficina,
    p_orcamento: q.id,
    p_hash_token: segredo.hash,
  });
  return linkPublico(segredo.token);
}
export async function acaoProposta(
  demo: boolean,
  oficina: string,
  q: Proposta,
  acao: "revisar" | "cancelar" | "converter",
) {
  if (!demo) {
    if (acao === "converter")
      return rpc<string>("converter_orcamento_em_os", {
        p_oficina: oficina,
        p_orcamento: q.id,
      });
    return rpc<Proposta | null>(`${acao}_orcamento`, {
      p_oficina: oficina,
      p_orcamento: q.id,
      p_revisao: q.revisao,
    });
  }
  if (acao === "converter")
    throw new Error(
      "A conversão real está disponível na conta da oficina após a aprovação do cliente.",
    );
  if (acao === "cancelar") {
    gravarDemo({ ...q, situacao: "cancelled", revisao: q.revisao + 1 });
    return null;
  }
  const versao = {
    ...q.versao,
    id: crypto.randomUUID(),
    numero_versao: q.versao.numero_versao + 1,
    publicado_em: null,
    expira_em: null,
  };
  return gravarDemo({
    ...q,
    situacao: "draft",
    versao,
    revisao: q.revisao + 1,
    versao_atual_id: versao.id,
    historico: [
      {
        id: versao.id,
        numero_versao: versao.numero_versao,
        total_centavos: versao.total_centavos,
        publicado_em: null,
      },
      ...q.historico,
    ],
  });
}
