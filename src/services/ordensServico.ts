import { lerCatalogoDemo } from "../lib/catalogo";
import { baixarEstoqueDemo, lerEstoqueDemo } from "./estoque";
import {
  validarFinanceiroOSDemo,
  sincronizarFinanceiroOSDemo,
} from "./financeiro";
import { supabase } from "../lib/supabase";
import { rpc, auxiliaresOrcamento, type ItemProposta } from "./orcamentos";
export const situacoesOS: Record<string, string> = {
  open: "Recebida",
  in_progress: "Em execução",
  quality_check: "Conferência",
  ready: "Pronta para entrega",
  delivered: "Entregue",
  cancelled: "Cancelada",
};
export const proximasOS: Record<string, string[]> = {
  open: ["in_progress", "cancelled"],
  in_progress: ["quality_check", "cancelled"],
  quality_check: ["in_progress", "ready", "cancelled"],
  ready: ["in_progress", "delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};
export type OrdemServico = {
  id: string;
  numero: number;
  revisao: number;
  situacao: string;
  cliente_id: string;
  veiculo_id: string;
  orcamento_origem_id: string | null;
  dados_cliente: { nome: string; telefone_e164?: string };
  dados_veiculo: { modelo: string; placa?: string };
  prioridade: string;
  responsavel: string | null;
  queixa_cliente: string | null;
  diagnostico: string | null;
  observacoes_internas: string | null;
  resumo_cliente: string | null;
  quilometragem_entrada: number | null;
  quilometragem_saida: number | null;
  combustivel_percentual: number | null;
  pertences: string | null;
  entrega_prevista_em: string | null;
  recebido_em: string | null;
  condicoes_garantia: string | null;
  garantia_ate: string | null;
  checklist: Record<string, boolean>;
  etapa_id: string | null;
  local_id: string | null;
  total_centavos: number;
  criado_em: string;
  paradas_abertas?: number;
  itens: (ItemProposta & {
    id: string;
    situacao: string;
    origem_peca?: string | null;
    produto_estoque_id?: string | null;
  })[];
  historico: {
    id: string;
    descricao: string;
    ocorrido_em: string;
    metadados?: Record<string, unknown>;
  }[];
  paradas: {
    id: string;
    motivo: string;
    detalhes: string;
    encerrado_em: string | null;
  }[];
  fotos: {
    id: string;
    fase: string;
    legenda: string;
    caminho_arquivo: string;
    capturado_em: string;
    url?: string;
  }[];
};
const chave = "patio_os_v1";
function ler(): OrdemServico[] {
  return JSON.parse(localStorage.getItem(chave) || "[]");
}
function gravar(o: OrdemServico) {
  const lista = ler();
  localStorage.setItem(
    chave,
    JSON.stringify([o, ...lista.filter((i) => i.id !== o.id)]),
  );
}
function evento(o: OrdemServico, texto: string) {
  o.revisao++;
  o.historico.unshift({
    id: crypto.randomUUID(),
    descricao: texto,
    ocorrido_em: new Date().toISOString(),
  });
}
export async function listarOS(
  demo: boolean,
  oficina: string,
  busca: string,
  situacao: string,
  pagina: number,
) {
  if (!demo)
    return rpc<{ itens: OrdemServico[]; total: number }>(
      "listar_ordens_servico",
      {
        p_oficina: oficina,
        p_busca: busca,
        p_situacao: situacao,
        p_pagina: pagina,
      },
    );
  const lista = ler().filter(
    (o) =>
      (!situacao || o.situacao === situacao) &&
      `${o.numero} ${o.dados_cliente.nome} ${o.dados_veiculo.modelo} ${o.dados_veiculo.placa}`
        .toLowerCase()
        .includes(busca.toLowerCase()),
  );
  return {
    itens: lista.slice(pagina * 24, pagina * 24 + 24),
    total: lista.length,
  };
}
export async function consultarOS(demo: boolean, oficina: string, id: string) {
  const o = demo
    ? ler().find((o) => o.id === id)
    : await rpc<OrdemServico>("consultar_ordem_servico", {
        p_oficina: oficina,
        p_os: id,
      });
  if (!o) throw new Error("OS não encontrada.");
  return o;
}
export async function salvarOS(
  demo: boolean,
  oficina: string,
  dados: Record<string, unknown>,
  chaveCriacao: string,
  anterior?: OrdemServico,
) {
  if (!demo)
    return rpc<OrdemServico>("salvar_ordem_servico", {
      p_oficina: oficina,
      p_dados: dados,
      p_chave: chaveCriacao,
      p_os: anterior?.id ?? null,
      p_revisao: anterior?.revisao ?? null,
    });
  const aux = await auxiliaresOrcamento(true, oficina);
  const repetido = ler().find((o) => o.id === chaveCriacao);
  if (!anterior && repetido) return repetido;
  const o = {
    ...(anterior ?? {
      id: chaveCriacao,
      numero: Math.max(0, ...ler().map((o) => o.numero)) + 1,
      revisao: 1,
      situacao: "open",
      orcamento_origem_id: null,
      recebido_em: new Date().toISOString(),
      criado_em: new Date().toISOString(),
      total_centavos: 0,
      itens: [],
      historico: [],
      fotos: [],
      paradas: [],
    }),
    ...dados,
    dados_cliente:
      anterior?.dados_cliente ??
      aux.clientes.find((c) => c.id === dados.cliente_id),
    dados_veiculo:
      anterior?.dados_veiculo ??
      aux.veiculos.find((v) => v.id === dados.veiculo_id),
  } as OrdemServico;
  evento(
    o,
    anterior ? "Dados do atendimento atualizados." : "Ordem de serviço aberta.",
  );
  gravar(o);
  return o;
}
export async function operarOS(
  demo: boolean,
  oficina: string,
  o: OrdemServico,
  acao: string,
  dados: Record<string, unknown>,
) {
  if (!demo) {
    await rpc(acao, {
      p_oficina: oficina,
      ...(acao === "atualizar_mapa_ordem_servico" ||
      acao === "registrar_parada_os" ||
      acao === "resolver_parada_os"
        ? { p_ordem_servico: o.id }
        : { p_os: o.id }),
      ...dados,
    });
    return;
  }
  const atual = await consultarOS(true, oficina, o.id);
  if (acao === "atualizar_mapa_ordem_servico") {
    const destino = String(dados.p_situacao);
    if (!proximasOS[atual.situacao].includes(destino))
      throw new Error("Mudança de situação inválida.");
    if (
      ["ready", "delivered"].includes(destino) &&
      atual.itens.some((i) => !["done", "cancelled"].includes(i.situacao))
    )
      throw new Error("Conclua os itens pendentes antes de liberar o veículo.");
    if (
      ["ready", "delivered"].includes(destino) &&
      atual.paradas.some((p) => !p.encerrado_em)
    )
      throw new Error("Resolva as paradas abertas primeiro.");
  }

  if (acao === "registrar_anotacao_os") evento(atual, String(dados.p_texto));
  if (acao === "atualizar_mapa_ordem_servico") {
    atual.situacao = String(dados.p_situacao);
    evento(atual, `Situação: ${situacoesOS[atual.situacao]}`);
  }
  if (acao === "registrar_parada_os") {
    atual.paradas.unshift({
      id: crypto.randomUUID(),
      motivo: String(dados.p_motivo),
      detalhes: String(dados.p_detalhes),
      encerrado_em: null,
    });
    evento(atual, "Parada registrada: " + dados.p_detalhes);
  }
  if (acao === "resolver_parada_os") {
    atual.paradas = atual.paradas.map((p) =>
      p.id === dados.p_parada
        ? { ...p, encerrado_em: new Date().toISOString() }
        : p,
    );
    evento(atual, "Parada resolvida.");
  }
  if (acao === "adicionar_servico_catalogo_os") {
    if (atual.revisao !== dados.p_revisao)
      throw new Error("Atualize a OS antes de alterar itens.");
    if (
      ["ready", "delivered", "cancelled"].includes(atual.situacao) ||
      atual.orcamento_origem_id
    )
      throw new Error("Esta OS não permite adicionar serviços.");
    if (atual.itens.length >= 100) throw new Error("Limite de 100 itens.");
    const c = lerCatalogoDemo().find(
      (i) =>
        i.id === dados.p_servico && i.tipo === "service" && !i.arquivado_em,
    );
    if (!c) throw new Error("Serviço indisponível. Atualize o catálogo.");
    atual.itens.push({
      id: crypto.randomUUID(),
      item_catalogo_id: c.id,
      tipo: "service",
      descricao: c.descricao,
      unidade: c.unidade,
      quantidade: 1,
      preco_unitario_centavos: c.preco_padrao_centavos,
      situacao: "pending",
    });
    atual.total_centavos = atual.itens.reduce(
      (total, i) =>
        total + Math.round(i.quantidade * i.preco_unitario_centavos),
      0,
    );
    evento(atual, "Serviço do catálogo adicionado.");
  }
  if (acao === "salvar_item_os") {
    const d = dados.p_dados as ItemProposta & { situacao: string };
    if (dados.p_item) {
      atual.itens = atual.itens.map((i) =>
        i.id === dados.p_item ? { ...i, situacao: d.situacao } : i,
      );
    } else {
      atual.itens.push({ ...d, id: crypto.randomUUID(), situacao: "pending" });
      atual.total_centavos = atual.itens.reduce(
        (a, i) => a + Math.round(i.quantidade * i.preco_unitario_centavos),
        0,
      );
    }
    evento(atual, "Item da OS atualizado.");
  }
  if (acao === "corrigir_item_os") {
    atual.itens = atual.itens.map((i) =>
      i.id === dados.p_item
        ? { ...i, ...(dados.p_dados as Partial<ItemProposta>) }
        : i,
    );
    atual.total_centavos = atual.itens.reduce(
      (a, i) => a + Math.round(i.quantidade * i.preco_unitario_centavos),
      0,
    );
    evento(atual, "Item corrigido.");
  }
  if (acao === "vincular_estoque_item_os") {
    atual.itens = atual.itens.map((i) =>
      i.id === dados.p_item
        ? {
            ...i,
            origem_peca: String(dados.p_origem),
            produto_estoque_id:
              dados.p_origem === "estoque" ? String(dados.p_produto) : null,
          }
        : i,
    );
    evento(atual, "Origem da peça definida: " + dados.p_origem);
  }
  if (acao === "adicionar_peca_estoque_os") {
    const p = lerEstoqueDemo().produtos.find((p) => p.id === dados.p_produto)!;
    atual.itens.push({
      id: crypto.randomUUID(),
      item_catalogo_id: p.id,
      produto_estoque_id: p.id,
      origem_peca: "estoque",
      tipo: "part",
      descricao: p.descricao,
      unidade: p.unidade,
      quantidade: Number(dados.p_quantidade),
      preco_unitario_centavos: p.preco_padrao_centavos,
      situacao: "pending",
    });
    atual.total_centavos = atual.itens.reduce(
      (v, i) => v + Math.round(i.quantidade * i.preco_unitario_centavos),
      0,
    );
    evento(atual, "Peça do estoque adicionada.");
  }
  validarFinanceiroOSDemo(atual);
  const salvarIntegrado = () => {
    const financeiroAntes = localStorage.getItem("patio_financeiro_v1");
    try {
      sincronizarFinanceiroOSDemo(atual);
      gravar(atual);
    } catch (e) {
      if (financeiroAntes === null)
        localStorage.removeItem("patio_financeiro_v1");
      else localStorage.setItem("patio_financeiro_v1", financeiroAntes);
      throw e;
    }
  };
  if (acao === "atualizar_mapa_ordem_servico" && atual.situacao === "delivered")
    baixarEstoqueDemo(atual, salvarIntegrado);
  else salvarIntegrado();
}
export async function enviarFotoOS(
  demo: boolean,
  oficina: string,
  o: OrdemServico,
  arquivo: File,
  fase: string,
  legenda: string,
) {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(arquivo.type) ||
    arquivo.size > 10 * 1024 * 1024
  )
    throw new Error("Selecione uma foto JPG, PNG ou WebP de até 10 MB.");
  if (demo) {
    if (arquivo.size > 1500000)
      throw new Error(
        "Na demonstração, use fotos de até 1,5 MB. Na conta real, o limite é 10 MB.",
      );
    const url = await new Promise<string>((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onload = () => resolve(String(leitor.result));
      leitor.onerror = reject;
      leitor.readAsDataURL(arquivo);
    });
    const atual = await consultarOS(true, oficina, o.id);
    atual.fotos.unshift({
      id: crypto.randomUUID(),
      fase,
      legenda,
      caminho_arquivo: url,
      url,
      capturado_em: new Date().toISOString(),
    });
    evento(atual, "Foto adicionada ao atendimento.");
    gravar(atual);
    return;
  }
  const reserva = await rpc<{ id: string; caminho: string }>(
    "reservar_foto_os",
    {
      p_oficina: oficina,
      p_os: o.id,
      p_fase: fase,
      p_nome: arquivo.name,
      p_mime: arquivo.type,
      p_tamanho: arquivo.size,
      p_legenda: legenda,
    },
  );
  const { error } = await supabase!.storage
    .from("workshop-files")
    .upload(reserva.caminho, arquivo, {
      contentType: arquivo.type,
      upsert: false,
    });
  if (error) throw error;
  await rpc("confirmar_foto_os", { p_oficina: oficina, p_arquivo: reserva.id });
}
export async function urlFotoOS(caminho: string) {
  if (caminho.startsWith("data:")) return caminho;
  const { data, error } = await supabase!.storage
    .from("workshop-files")
    .createSignedUrl(caminho, 300);
  if (error) throw error;
  return data.signedUrl;
}
