import { novoId } from "../lib/uuid.ts";
import type {
  TaxaDiagnostico,
  ComprovanteAutorizacao,
} from "../lib/diagnosticoOrcamento";
import { rpc } from "../lib/rpc";
import { normalizarBuscaOrcamentos } from "../lib/buscaOrcamentos";
import { lerCatalogoDemo, filtrarCatalogo } from "../lib/catalogo";
import { supabase } from "../lib/supabase";
import { listarClientes } from "./clientes";
import type { FichaEspecialidade } from "../lib/perfisAtendimento";
export type ItemProposta = {
  grupo_servico?: string;
  explicacao_cliente?: string;
  prioridade_servico?: "urgente" | "recomendado" | "preventivo";
  depende_grupo?: string;
  custo_unitario_previsto_centavos?: number | null;
  custo_ajustado?: boolean;
  minutos_previstos?: number;
  custo_hora_centavos?: number;
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
  taxa_diagnostico?: TaxaDiagnostico;
  data_servico?: string | null;
  ficha_especialidade?: FichaEspecialidade | null;
  tipo_servico?: string | null;
  detalhes_especialidade?: string;
  queixa_cliente?: string;
  diagnostico?: string;
  codigos_falha?: string;
  pecas_a_trocar?: string;
  forma_pagamento?: string | null;
  vencimento_pagamento?: string | null;
  responsavel?: string | null;
  prioridade?: string;

  outros_custos_centavos?: number;
  id: string;
  numero_versao: number;
  dados_oficina: {
    nome: string;
    telefone_e164?: string | null;
    logo?: string;
    cor?: string;
    rodape?: string;
  };
  dados_cliente: {
    nome: string;
    telefone_e164?: string | null;
    email?: string | null;
  };
  dados_veiculo: {
    modelo: string;
    motor?: string;
    especialidade?: string;
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
  encerramento?: {
    decisao: string;
    motivo: string;
    registrado_em: string;
    versao_id: string;
  } | null;
  arquivado_em?: string | null;
  motivo_exclusao?: string | null;
  edicao_bloqueada?: boolean;
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
    comprovante?: ComprovanteAutorizacao | null;
    grupos_aprovados?: string[] | null;
    subtotal_aprovado_centavos?: number | null;
    desconto_aprovado_centavos?: number | null;
    total_aprovado_centavos?: number | null;
    decisao: string;
    nome_informado: string;
    confirmado_em: string;
  } | null;
  ordem_servico_id: string | null;
  adicional_os_id?: string | null;
  adicional_aplicado_em?: string | null;
};
export type ResumoProposta = {
  ordem_servico_id?: string | null;
  adicional_os_id?: string | null;
  arquivado_em?: string | null;
  motivo_exclusao?: string | null;
  edicao_bloqueada?: boolean;
  total_aprovado_centavos?: number | null;
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
  taxa_diagnostico?: TaxaDiagnostico;
  data_servico?: string | null;
  ficha_especialidade?: FichaEspecialidade | null;
  carro_livre?: string;
  motor_livre?: string;
  tipo_servico?: string | null;
  detalhes_especialidade?: string;
  queixa_cliente?: string;
  diagnostico?: string;
  codigos_falha?: string;
  pecas_a_trocar?: string;
  forma_pagamento?: string | null;
  vencimento_pagamento?: string | null;
  responsavel?: string | null;
  prioridade?: string;

  cliente_nome_livre?: string;
  cliente_telefone_livre?: string;
  outros_custos_centavos?: number;
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
    produto_estoque_id?: string | null;
    custo_centavos?: number | null;
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

const chave = "patio_orcamentos_v2";
export function lerPropostasDemo(): Proposta[] {
  try {
    return JSON.parse(localStorage.getItem(chave) ?? "[]");
  } catch {
    return [];
  }
}
export function gravarDemo(q: Proposta) {
  localStorage.setItem(
    chave,
    JSON.stringify([q, ...lerPropostasDemo().filter((p) => p.id !== q.id)]),
  );
  return q;
}
type VeiculoDemo = Auxiliares["veiculos"][number] & { cliente_id: string };
function lerVeiculosDemo(): VeiculoDemo[] {
  return JSON.parse(localStorage.getItem("patio_veiculos_v1") || "[]");
}
export async function cadastrarVeiculoOrcamento(
  demo: boolean,
  oficina: string,
  cliente: string,
  modelo: string,
  placa: string,
) {
  const placaNormalizada = placa.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (
    !cliente ||
    !modelo.trim() ||
    modelo.trim().length > 100 ||
    (placaNormalizada && !/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(placaNormalizada))
  )
    throw new Error("Confira o cliente, o nome do veículo e a placa (opcional).");
  if (!demo)
    return rpc<string>("cadastrar_veiculo_orcamento", {
      p_oficina: oficina,
      p_cliente: cliente === "avulso" ? null : cliente,
      p_modelo: modelo.trim(),
      p_placa: placaNormalizada,
    });
  const veiculos = lerVeiculosDemo();
  if (placaNormalizada && veiculos.some((v) => v.placa === placaNormalizada))
    throw new Error("Esta placa já está cadastrada. Selecione o veículo existente.");
  const novo: VeiculoDemo = {
    id: novoId(),
    cliente_id: cliente,
    modelo: modelo.trim(),
    placa: placaNormalizada || null,
    marca: null,
    ano_modelo: null,
  };
  localStorage.setItem("patio_veiculos_v1", JSON.stringify([...veiculos, novo]));
  return novo.id;
}
export async function auxiliaresOrcamento(
  demo: boolean,
  oficina: string,
): Promise<Auxiliares> {
  // Nos formulários conectados cada seletor busca suas opções sob demanda.
  if (!demo) return { clientes: [], veiculos: [], vinculos: [], catalogo: [] };
  return baixarBaseOffline(demo, oficina);
}

/** Download explícito para uso sem conexão; nunca usado para abrir um formulário. */
export async function baixarBaseOffline(
  demo: boolean,
  oficina: string,
): Promise<Auxiliares> {
  if (demo) {
    const clientes = (await listarClientes(true, "demonstracao", "", false, 0)).itens;
    return {
      clientes,
      veiculos: [
        ...clientes.map((c, i) => ({
          id: `veiculo-${c.id}`,
          modelo: ["Gol", "Onix", "HB20", "Corolla"][i % 4],
          marca: null,
          placa: null,
          ano_modelo: 2020,
        })),
        ...lerVeiculosDemo(),
      ],
      vinculos: [
        ...clientes.map((c) => ({
          cliente_id: c.id,
          veiculo_id: `veiculo-${c.id}`,
        })),
        ...lerVeiculosDemo().map((v) => ({
          cliente_id: v.cliente_id,
          veiculo_id: v.id,
        })),
      ],
      catalogo: filtrarCatalogo(lerCatalogoDemo(), "", "todos", "ativos", false),
    };
  }
  async function todas<T>(
    consulta: (inicio: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
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
        .select(
          "id,descricao,tipo,preco_padrao_centavos,unidade,favorito,custo_centavos",
        )
        .eq("oficina_id", oficina)
        .is("arquivado_em", null)
        .order("favorito", { ascending: false })
        .order("descricao")
        .order("id")
        .range(inicio, inicio + 499),
    ),
    todas((inicio) =>
      supabase!
        .from("estoque_produtos")
        .select("item_catalogo_id,custo_centavos")
        .eq("oficina_id", oficina)
        .order("item_catalogo_id")
        .range(inicio, inicio + 499),
    ),
  ]);
  const custos = new Map(
    resultados[4].map((e) => [e.item_catalogo_id, e.custo_centavos]),
  );
  const produtos = new Map(
    resultados[4].map((e) => [e.item_catalogo_id, e.item_catalogo_id]),
  );
  return {
    clientes: resultados[0],
    veiculos: resultados[1],
    vinculos: resultados[2],
    catalogo: resultados[3].map((c) => ({
      ...c,
      custo_centavos: custos.get(c.id) ?? c.custo_centavos,
      produto_estoque_id: produtos.get(c.id) ?? null,
    })),
  } as Auxiliares;
}
export async function listarPropostas(
  demo: boolean,
  oficina: string,
  busca: string,
  situacao: string,
  pagina: number,
  signal?: AbortSignal,
): Promise<{ itens: ResumoProposta[]; total: number }> {
  busca = normalizarBuscaOrcamentos(busca);
  if (!demo)
    return rpc(
      "listar_orcamentos_gestao",
      {
        p_oficina: oficina,
        p_busca: busca,
        p_situacao: situacao === "excluidos" ? "" : situacao,
        p_excluidos: situacao === "excluidos",
        p_pagina: pagina,
      },
      signal,
    );
  const todos = lerPropostasDemo()
    .filter((q) => Boolean(q.arquivado_em) === (situacao === "excluidos"))
    .map((q) => ({
      ordem_servico_id: q.ordem_servico_id,
      adicional_os_id: q.adicional_os_id,
      arquivado_em: q.arquivado_em,
      motivo_exclusao: q.motivo_exclusao,
      edicao_bloqueada: q.edicao_bloqueada,
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
      total_aprovado_centavos: q.aprovacao?.total_aprovado_centavos,
      numero_versao: q.versao.numero_versao,
      expira_em: q.versao.expira_em,
      criado_em: "",
    }))
    .filter(
      (q) =>
        (!situacao || situacao === "excluidos" || q.situacao === situacao) &&
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
  signal?: AbortSignal,
): Promise<Proposta> {
  if (!demo)
    return rpc(
      "consultar_orcamento",
      {
        p_oficina: oficina,
        p_orcamento: id,
        p_versao: versao ?? null,
      },
      signal,
    );
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
    return rpc(anterior ? "editar_orcamento" : "salvar_orcamento", {
      p_oficina: oficina,
      p_dados: {
        ...dados,
        cliente_id: dados.cliente_id === "avulso" ? null : dados.cliente_id,
      },
      p_chave: chaveCriacao,
      p_orcamento: anterior?.id ?? null,
      p_revisao: anterior?.revisao ?? null,
    });
  if (anterior) {
    const atual = await obterProposta(true, oficina, anterior.id);
    if (atual.revisao !== anterior.revisao)
      throw new Error("O orçamento mudou. Feche e abra a edição novamente.");
    if (atual.arquivado_em) throw new Error("Restaure o orçamento antes de editar.");
    if (atual.edicao_bloqueada || atual.adicional_aplicado_em)
      throw new Error(
        "Este orçamento já autorizou uma OS. Use um orçamento adicional na OS.",
      );
  }
  const aux = await auxiliaresOrcamento(true, oficina);
  const c = dados.cliente_nome_livre
      ? {
          id: "",
          nome: dados.cliente_nome_livre,
          telefone_e164: dados.cliente_telefone_livre || null,
        }
      : aux.clientes.find((c) => c.id === dados.cliente_id),
    v = dados.motor_livre
      ? {
          id: anterior?.veiculo_id || novoId(),
          modelo: dados.carro_livre || "",
          motor: dados.motor_livre,
          especialidade: "retifica",
        }
      : aux.veiculos.find((v) => v.id === dados.veiculo_id);
  if (!c || !v) throw new Error("Selecione cliente e veículo.");
  const itens = dados.itens.map((i) => ({
    ...i,
    total_item_centavos: Math.round(i.quantidade * i.preco_unitario_centavos),
  }));
  const subtotal = itens.reduce((a, i) => a + i.total_item_centavos, 0);
  if (dados.desconto_centavos > subtotal)
    throw new Error("Desconto maior que o subtotal.");
  const versao: VersaoProposta = {
    data_servico:
      dados.data_servico === undefined
        ? anterior?.versao.data_servico
        : dados.data_servico,
    forma_pagamento: dados.forma_pagamento,
    vencimento_pagamento: dados.vencimento_pagamento,
    responsavel: dados.responsavel,
    prioridade: dados.prioridade,
    pecas_a_trocar: dados.pecas_a_trocar,
    tipo_servico: dados.tipo_servico,
    detalhes_especialidade: dados.detalhes_especialidade,
    ficha_especialidade: dados.ficha_especialidade ?? null,
    queixa_cliente: dados.queixa_cliente,
    diagnostico: dados.diagnostico,
    codigos_falha: dados.codigos_falha,
    id: anterior?.situacao === "draft" ? anterior.versao.id : novoId(),
    numero_versao: anterior
      ? anterior.versao.numero_versao + (anterior.situacao === "draft" ? 0 : 1)
      : 1,
    dados_oficina: (() => {
      const d = JSON.parse(localStorage.getItem("patio_configuracoes_demo") || "{}");
      return {
        nome: d.nome || "Oficina do Marcelo",
        telefone_e164: d.telefone || null,
      };
    })(),
    dados_cliente: c,
    dados_veiculo: v,
    observacoes: dados.observacoes,
    condicoes: dados.condicoes,
    outros_custos_centavos: dados.outros_custos_centavos ?? 0,
    subtotal_centavos: subtotal,
    desconto_centavos: dados.desconto_centavos,
    total_centavos: subtotal - dados.desconto_centavos,
    publicado_em: null,
    expira_em: null,
  };
  return gravarDemo({
    id: anterior?.id ?? chaveCriacao,
    numero:
      anterior?.numero ?? Math.max(0, ...lerPropostasDemo().map((q) => q.numero)) + 1,
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
      ...(anterior?.historico.filter((v) => v.id !== versao.id) ?? []),
    ],
    aprovacao: null,
    ordem_servico_id: anterior?.ordem_servico_id ?? null,
  });
}

export async function excluirProposta(
  demo: boolean,
  oficina: string,
  q: ResumoProposta,
  motivo: string,
) {
  const texto = motivo.trim();
  if (texto.length < 3 || texto.length > 1000)
    throw new Error("Informe o motivo da exclusão, entre 3 e 1.000 caracteres.");
  if (!demo)
    return rpc("excluir_orcamento", {
      p_oficina: oficina,
      p_orcamento: q.id,
      p_revisao: q.revisao,
      p_motivo: texto,
    });
  const atual = await obterProposta(true, oficina, q.id);
  if (atual.arquivado_em) return;
  if (atual.revisao !== q.revisao)
    throw new Error("O orçamento mudou. Atualize a lista.");
  if (atual.ordem_servico_id && atual.situacao !== "approved")
    throw new Error("Cancele a OS que aguarda este orçamento antes de excluí-lo.");
  gravarDemo({
    ...atual,
    arquivado_em: new Date().toISOString(),
    motivo_exclusao: texto,
    revisao: atual.revisao + 1,
  });
}

export async function restaurarProposta(
  demo: boolean,
  oficina: string,
  q: ResumoProposta,
) {
  if (!demo)
    return rpc("restaurar_orcamento", {
      p_oficina: oficina,
      p_orcamento: q.id,
      p_revisao: q.revisao,
    });
  const atual = await obterProposta(true, oficina, q.id);
  if (!atual.arquivado_em) return;
  if (atual.revisao !== q.revisao)
    throw new Error("O orçamento mudou. Atualize a lista.");
  gravarDemo({ ...atual, arquivado_em: null, revisao: atual.revisao + 1 });
}
export async function tokenSeguro() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
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
    const atual = lerPropostasDemo().find((p) => p.id === q.id);
    if (
      !atual ||
      atual.arquivado_em ||
      atual.situacao !== "draft" ||
      atual.revisao !== q.revisao ||
      atual.versao_atual_id !== q.versao.id
    )
      throw new Error(
        "O orçamento mudou. Atualize e confira os valores antes de continuar.",
      );
    q = atual;
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
        historico: q.historico.map((v) =>
          v.id === versao.id ? { ...v, publicado_em: versao.publicado_em } : v,
        ),
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
export async function criarOSParaOrcamento(
  demo: boolean,
  oficina: string,
  q: Proposta,
): Promise<string> {
  if (!demo)
    return rpc<string>("criar_os_aguardando_orcamento", {
      p_oficina: oficina,
      p_orcamento: q.id,
    });
  const atual = lerPropostasDemo().find((p) => p.id === q.id);
  if (!atual) throw new Error("Orçamento não encontrado.");
  if (atual.ordem_servico_id) return atual.ordem_servico_id;
  if (!["draft", "awaiting_approval"].includes(atual.situacao))
    throw new Error("Use um orçamento em rascunho ou aguardando aprovação.");
  const { abrirOSOrcamentoDemo } = await import("./ordensServico");
  const os = await abrirOSOrcamentoDemo(oficina, atual);
  gravarDemo({ ...atual, ordem_servico_id: os.id });
  return os.id;
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
  if (acao === "converter") {
    const atual = lerPropostasDemo().find((p) => p.id === q.id);
    if (!atual || atual.arquivado_em || atual.situacao !== "approved")
      throw new Error("Aprove o orçamento antes de criar a OS.");
    if (atual.ordem_servico_id) return atual.ordem_servico_id;
    const { salvarOS } = await import("./ordensServico");
    const grupos = atual.aprovacao?.grupos_aprovados;
    const os = await salvarOS(
      true,
      oficina,
      {
        forma_pagamento: atual.versao.forma_pagamento,
        vencimento_pagamento: atual.versao.vencimento_pagamento,
        responsavel: atual.versao.responsavel,
        prioridade: atual.versao.prioridade,
        pecas_a_trocar: atual.versao.pecas_a_trocar,
        ...(atual.versao.dados_veiculo.motor
          ? {
              carro_livre: atual.versao.dados_veiculo.modelo,
              motor_livre: atual.versao.dados_veiculo.motor,
            }
          : {}),
        tipo_servico: atual.versao.tipo_servico,
        detalhes_especialidade: atual.versao.detalhes_especialidade,
        ficha_especialidade: atual.versao.ficha_especialidade,
        queixa_cliente: atual.versao.queixa_cliente,
        diagnostico: atual.versao.diagnostico,
        codigos_falha: atual.versao.codigos_falha,
        resumo_cliente: atual.versao.observacoes,
        cliente_id: atual.cliente_id,
        veiculo_id: atual.veiculo_id,
        ...(!atual.cliente_id
          ? {
              cliente_nome_livre: atual.versao.dados_cliente.nome,
              cliente_telefone_livre: atual.versao.dados_cliente.telefone_e164,
            }
          : {}),
        orcamento_origem_id: atual.id,
        ...(atual.versao.data_servico
          ? { data_servico: atual.versao.data_servico }
          : {}),
        versao_orcamento_origem_id: atual.versao_atual_id,
        itens: atual.itens
          .filter(
            (i) => !grupos?.length || grupos.includes(i.grupo_servico || "Atendimento"),
          )
          .map((i) => ({
            ...i,
            id: novoId(),
            item_orcamento_origem_id: i.id,
            situacao: "pending",
          })),
        desconto_centavos:
          atual.aprovacao?.desconto_aprovado_centavos ?? atual.versao.desconto_centavos,
      },
      atual.id,
    );
    gravarDemo({ ...atual, ordem_servico_id: os.id });
    return os.id;
  }
  if (acao === "cancelar") {
    gravarDemo({ ...q, situacao: "cancelled", revisao: q.revisao + 1 });
    return null;
  }
  const versao = {
    ...q.versao,
    id: novoId(),
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

export async function aprovarPropostaInterna(
  demo: boolean,
  oficina: string,
  q: Proposta,
  manifestacao?: { nome: string; canal: string; confirmo: boolean },
) {
  // Usa a emissão existente para validar e congelar os valores do rascunho.
  // Não envia mensagem ao cliente; a aprovação fica registrada pela oficina.
  if (q.situacao === "draft") q = (await emitirProposta(demo, oficina, q, 7)).proposta;
  if (!demo)
    return rpc(
      manifestacao ? "registrar_autorizacao_orcamento" : "aprovar_orcamento_interno",
      {
        p_oficina: oficina,
        p_orcamento: q.id,
        p_revisao: q.revisao,
        p_versao: q.versao_atual_id,
        ...(manifestacao
          ? {
              p_nome: manifestacao.nome,
              p_canal: manifestacao.canal,
              p_confirmo: manifestacao.confirmo,
            }
          : {}),
      },
    );
  const atual = lerPropostasDemo().find((p) => p.id === q.id);
  if (
    atual &&
    !atual.arquivado_em &&
    atual.situacao === "approved" &&
    atual.versao_atual_id === q.versao_atual_id
  )
    return;
  if (
    !atual ||
    atual.revisao !== q.revisao ||
    atual.versao_atual_id !== q.versao_atual_id ||
    atual.arquivado_em ||
    atual.situacao !== "awaiting_approval" ||
    (atual.versao.expira_em && new Date(atual.versao.expira_em) <= new Date())
  )
    throw new Error("Atualize a lista e confira a validade do orçamento.");
  if (atual.ordem_servico_id) {
    const { consultarOS, autorizarServicoOS } = await import("./ordensServico");
    const os = await consultarOS(true, oficina, atual.ordem_servico_id);
    if (os.orcamento_aguardando_id === atual.id) {
      await autorizarServicoOS(true, oficina, os);
      return;
    }
  }
  gravarDemo({
    ...atual,
    situacao: "approved",
    revisao: atual.revisao + 1,
    aprovacao: {
      decisao: "approved",
      nome_informado: manifestacao?.nome || "Responsável da oficina",
      confirmado_em: new Date().toISOString(),
      grupos_aprovados: [
        ...new Set(atual.itens.map((i) => i.grupo_servico || "Atendimento")),
      ],
      subtotal_aprovado_centavos: atual.versao.subtotal_centavos,
      desconto_aprovado_centavos: atual.versao.desconto_centavos,
      total_aprovado_centavos: atual.versao.total_centavos,
    },
  });
}
