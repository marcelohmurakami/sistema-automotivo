import { novoId } from "../lib/uuid.ts";
import { normalizarBuscaDocumento } from "../lib/buscaDocumentos";
import { lerOrdensDemo } from "../lib/ordensDemo";
import { rpc } from "../lib/rpc";
import { lerCatalogoDemo } from "../lib/catalogo";
import { motivosParada } from "../lib/mapaOficina";
import { baixarEstoqueDemo, lerEstoqueDemo } from "./estoque";
import { validarFinanceiroOSDemo, sincronizarFinanceiroOSDemo } from "./financeiro";
import { supabase } from "../lib/supabase";
import {
  auxiliaresOrcamento,
  lerPropostasDemo,
  gravarDemo,
  type ItemProposta,
  type Proposta,
} from "./orcamentos";
import { notificarOSPronta } from "../lib/avisoOSPronta";
import { hojeNoAparelho, validarDataServico } from "../lib/dataServico";
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
  in_progress: ["open", "quality_check", "cancelled"],
  quality_check: ["in_progress", "ready", "cancelled"],
  ready: ["quality_check", "in_progress", "delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};
import {
  validarFichaEspecialidade,
  type FichaEspecialidade,
} from "../lib/perfisAtendimento";
export type OrdemServico = {
  mostrar_desconto_nota?: boolean;
  ficha_especialidade?: FichaEspecialidade | null;
  data_servico?: string | null;
  motivo_cancelamento?: string | null;
  tipo_servico?: string | null;
  detalhes_especialidade?: string;
  id: string;
  numero: number;
  revisao: number;
  minutos_previstos?: number;
  custo_hora_centavos?: number;
  situacao: string;
  arquivado_em?: string | null;
  motivo_exclusao?: string | null;
  excluido_por?: string | null;
  cliente_id: string;
  veiculo_id: string;
  orcamento_origem_id: string | null;
  orcamento_aguardando_id?: string | null;
  autorizacao_oficina_em?: string | null;
  orcamento_pendente?: {
    id: string;
    numero: number;
    revisao: number;
    versao_id: string;
    total_centavos: number;
    pode_autorizar: boolean;
  } | null;
  dados_cliente: {
    nome: string;
    telefone_e164?: string;
    documento?: string;
    endereco?: string;
  };
  dados_veiculo: {
    modelo: string;
    placa?: string;
    motor?: string;
    especialidade?: string;
  };
  prioridade: string;
  responsavel: string | null;
  queixa_cliente: string | null;
  diagnostico: string | null;
  codigos_falha?: string | null;
  pecas_a_trocar?: string | null;
  observacoes_internas: string | null;
  resumo_cliente: string | null;
  quilometragem_entrada: number | null;
  quilometragem_saida: number | null;
  combustivel_percentual: number | null;
  pertences: string | null;
  entrega_prevista_em: string | null;
  recebido_em: string | null;
  vencimento_pagamento?: string | null;
  concluido_em?: string | null;
  forma_pagamento?: string | null;
  condicoes_garantia: string | null;
  garantia_ate: string | null;
  checklist: Record<string, boolean>;
  etapa_id: string | null;
  local_id: string | null;
  total_centavos: number;
  subtotal_centavos?: number;
  desconto_centavos?: number;
  criado_em: string;
  paradas_abertas?: number;
  itens: (ItemProposta & {
    id: string;
    situacao: string;
    origem_peca?: string | null;
    produto_estoque_id?: string | null;
    item_orcamento_origem_id?: string | null;
    concluido_em?: string | null;
  })[];
  historico: {
    id: string;
    descricao: string;
    ocorrido_em: string;
    metadados?: Record<string, unknown>;
  }[];
  paradas: {
    iniciado_em?: string | null;
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
  return lerOrdensDemo();
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
    id: novoId(),
    descricao: texto,
    ocorrido_em: new Date().toISOString(),
  });
}
function comOrcamentoPendente(o: OrdemServico): OrdemServico {
  const q = lerPropostasDemo().find((q) => q.id === o.orcamento_aguardando_id);
  return {
    ...o,
    orcamento_pendente: q
      ? {
          id: q.id,
          numero: q.numero,
          revisao: q.revisao,
          versao_id: q.versao.id,
          total_centavos: q.versao.total_centavos,
          pode_autorizar:
            !q.arquivado_em &&
            ["draft", "awaiting_approval"].includes(q.situacao) &&
            q.itens.length > 0 &&
            (!q.versao.expira_em || Date.parse(q.versao.expira_em) > Date.now()),
        }
      : null,
  };
}
export async function autorizarServicoOS(
  demo: boolean,
  oficina: string,
  os: OrdemServico,
  manifestacao?: { nome: string; canal: string; confirmo: boolean },
) {
  const p = os.orcamento_pendente;
  if (!p?.pode_autorizar)
    throw new Error("Confira a situação e a validade do orçamento.");
  if (!demo)
    return rpc<OrdemServico>(
      manifestacao ? "registrar_autorizacao_pela_os" : "autorizar_servico_pela_os",
      {
        ...(manifestacao
          ? {
              p_nome: manifestacao.nome,
              p_canal: manifestacao.canal,
              p_confirmo: manifestacao.confirmo,
            }
          : {}),
        p_oficina: oficina,
        p_os: os.id,
        p_revisao: os.revisao,
        p_orcamento: p.id,
        p_revisao_orcamento: p.revisao,
        p_versao: p.versao_id,
      },
    );
  const atual = ler().find((o) => o.id === os.id);
  const q = lerPropostasDemo().find((q) => q.id === p.id);
  if (
    !atual ||
    !q ||
    atual.arquivado_em ||
    ["cancelled", "delivered"].includes(atual.situacao)
  )
    throw new Error("Esta OS está encerrada ou indisponível.");
  if (atual.orcamento_origem_id === q.id && q.situacao === "approved") return atual;
  if (
    atual.revisao !== os.revisao ||
    q.revisao !== p.revisao ||
    q.versao.id !== p.versao_id
  )
    throw new Error("A OS ou o orçamento mudou. Atualize a tela antes de autorizar.");
  if (!comOrcamentoPendente(atual).orcamento_pendente?.pode_autorizar)
    throw new Error("Confira a situação e a validade do orçamento.");
  const agora = new Date().toISOString();
  gravarDemo({
    ...q,
    situacao: "approved",
    revisao: q.revisao + 1,
    versao: {
      ...q.versao,
      publicado_em: q.versao.publicado_em || agora,
      expira_em:
        q.versao.expira_em || new Date(Date.now() + 7 * 86400000).toISOString(),
    },
    aprovacao: {
      decisao: "approved",
      nome_informado: "Responsável da oficina",
      confirmado_em: agora,
      grupos_aprovados: [
        ...new Set(q.itens.map((i) => i.grupo_servico || "Atendimento")),
      ],
      subtotal_aprovado_centavos: q.versao.subtotal_centavos,
      desconto_aprovado_centavos: q.versao.desconto_centavos,
      total_aprovado_centavos: q.versao.total_centavos,
    },
  });
  atual.orcamento_aguardando_id = null;
  atual.orcamento_origem_id = q.id;
  atual.autorizacao_oficina_em = agora;
  atual.itens = q.itens.map((i) => ({
    ...i,
    id: novoId(),
    item_orcamento_origem_id: i.id,
    situacao: "pending",
  }));
  atual.subtotal_centavos = q.versao.subtotal_centavos;
  atual.desconto_centavos = q.versao.desconto_centavos;
  atual.total_centavos = q.versao.total_centavos;
  atual.paradas.forEach((p) => {
    if (p.motivo === "approval" && !p.encerrado_em) p.encerrado_em = agora;
  });
  evento(
    atual,
    "Serviço autorizado pela oficina nesta OS. Itens e valores do orçamento incorporados.",
  );
  gravar(atual);
  return comOrcamentoPendente(atual);
}
export async function listarOS(
  demo: boolean,
  oficina: string,
  busca: string,
  situacao: string,
  pagina: number,
  signal?: AbortSignal,
) {
  busca = normalizarBuscaDocumento(busca);
  if (!demo)
    return rpc<{ itens: OrdemServico[]; total: number }>(
      "listar_ordens_servico_gestao",
      {
        p_oficina: oficina,
        p_busca: busca,
        p_situacao: situacao === "excluidas" ? "" : situacao,
        p_pagina: pagina,
        p_excluidos: situacao === "excluidas",
      },
      signal,
    );
  const lista = ler().filter(
    (o) =>
      Boolean(o.arquivado_em) === (situacao === "excluidas") &&
      (!situacao || situacao === "excluidas" || o.situacao === situacao) &&
      `${o.numero} ${o.dados_cliente.nome} ${o.dados_veiculo.modelo} ${o.dados_veiculo.motor || ""} ${o.dados_veiculo.placa}`
        .toLowerCase()
        .includes(busca.toLowerCase()),
  );
  return {
    itens: lista.slice(pagina * 24, pagina * 24 + 24).map(comOrcamentoPendente),
    total: lista.length,
  };
}
export async function consultarOS(
  demo: boolean,
  oficina: string,
  id: string,
  signal?: AbortSignal,
) {
  const o = demo
    ? ler().find((o) => o.id === id)
    : await rpc<OrdemServico>(
        "consultar_ordem_servico",
        {
          p_oficina: oficina,
          p_os: id,
        },
        signal,
      );
  if (!o) throw new Error("OS não encontrada.");
  return demo ? comOrcamentoPendente(o) : o;
}
export async function excluirOS(
  demo: boolean,
  oficina: string,
  os: OrdemServico,
  motivo: string,
) {
  const texto = motivo.trim();
  if (texto.length < 3 || texto.length > 1000)
    throw new Error("Informe o motivo da exclusão, entre 3 e 1.000 caracteres.");
  if (!demo)
    return rpc("excluir_ordem_servico", {
      p_oficina: oficina,
      p_os: os.id,
      p_revisao: os.revisao,
      p_motivo: texto,
    });
  let atual = await consultarOS(true, oficina, os.id);
  if (atual.arquivado_em) return;
  if (atual.revisao !== os.revisao)
    throw new Error("A OS foi alterada. Atualize a lista antes de excluir.");
  if (!["delivered", "cancelled"].includes(atual.situacao)) {
    await operarOS(true, oficina, atual, "atualizar_mapa_ordem_servico", {
      p_revisao_esperada: atual.revisao,
      p_situacao: "cancelled",
      p_recebido_em: atual.recebido_em,
      p_motivo_cancelamento: texto,
    });
    atual = await consultarOS(true, oficina, os.id);
  }
  atual.arquivado_em = new Date().toISOString();
  atual.motivo_exclusao = texto;
  evento(atual, `OS excluída da listagem. Motivo: ${texto}`);
  gravar(atual);
}
export async function restaurarOS(demo: boolean, oficina: string, os: OrdemServico) {
  if (!demo)
    return rpc("restaurar_ordem_servico", {
      p_oficina: oficina,
      p_os: os.id,
      p_revisao: os.revisao,
    });
  const atual = await consultarOS(true, oficina, os.id);
  if (!atual.arquivado_em) return;
  if (atual.revisao !== os.revisao)
    throw new Error("A OS foi alterada. Atualize a lista.");
  atual.arquivado_em = null;
  evento(atual, "OS restaurada na listagem. Situação preservada.");
  gravar(atual);
}
export async function salvarOS(
  demo: boolean,
  oficina: string,
  dados: Record<string, unknown>,
  chaveCriacao: string,
  anterior?: OrdemServico,
  opcoes?: { avisarPronta?: boolean },
) {
  if (Object.hasOwn(dados, "data_servico")) validarDataServico(dados.data_servico);
  if (dados.ficha_especialidade != null)
    validarFichaEspecialidade(dados.ficha_especialidade);
  if (!demo) {
    const salva = await rpc<OrdemServico>(
      !anterior && dados.servico_pronto === true
        ? "criar_os_pronta"
        : Array.isArray(dados.itens)
          ? "salvar_os_com_itens"
          : "salvar_ordem_servico",
      {
        p_oficina: oficina,
        p_dados: dados,
        p_chave: chaveCriacao,
        p_os: anterior?.id ?? null,
        p_revisao: anterior?.revisao ?? null,
      },
    );
    if (
      opcoes?.avisarPronta !== false &&
      anterior?.situacao !== "ready" &&
      salva.situacao === "ready"
    )
      notificarOSPronta(oficina, salva.id);
    return salva;
  }
  const aux = await auxiliaresOrcamento(true, oficina);
  if (anterior) {
    const atual = ler().find((o) => o.id === anterior.id);
    if (!atual || atual.revisao !== anterior.revisao)
      throw new Error("OS alterada. Reabra antes de salvar.");
    if (["delivered", "cancelled"].includes(atual.situacao))
      throw new Error("OS encerrada: histórico preservado.");
  }
  const repetido = ler().find((o) => o.id === chaveCriacao);
  if (!anterior && repetido) return repetido;
  if (
    !anterior &&
    dados.servico_pronto === true &&
    (!Array.isArray(dados.itens) ||
      !dados.itens.some((i) => i.situacao !== "cancelled"))
  )
    throw new Error("Inclua os serviços realizados antes de marcar como pronto.");
  const o = {
    ...(anterior ?? {
      id: chaveCriacao,
      numero: Math.max(0, ...ler().map((o) => o.numero)) + 1,
      revisao: 1,
      situacao: "open",
      forma_pagamento: "Carteira",
      data_servico: hojeNoAparelho(),
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
      (dados.cliente_nome_livre
        ? {
            nome: String(dados.cliente_nome_livre),
            telefone_e164: String(dados.cliente_telefone_livre || ""),
          }
        : undefined) ??
      anterior?.dados_cliente ??
      aux.clientes.find((c) => c.id === dados.cliente_id),
    dados_veiculo:
      (dados.motor_livre
        ? {
            modelo: String(dados.carro_livre).trim(),
            motor: String(dados.motor_livre).trim(),
            especialidade: "retifica",
          }
        : anterior?.dados_veiculo) ??
      aux.veiculos.find((v) => v.id === dados.veiculo_id),
  } as OrdemServico;
  if (Array.isArray(dados.itens)) {
    if (anterior?.orcamento_aguardando_id)
      throw new Error(
        "Autorize o orçamento vinculado antes de editar os serviços desta OS.",
      );
    if (dados.itens.length > 100) throw new Error("Inclua até 100 itens na OS.");
    const ids = new Set<string>();
    o.itens = dados.itens.map((item: OrdemServico["itens"][number]) => {
      if (
        !item.id ||
        ids.has(item.id) ||
        !item.descricao.trim() ||
        item.descricao.trim().length > 300 ||
        !["service", "part"].includes(item.tipo) ||
        !item.unidade.trim() ||
        item.unidade.length > 15 ||
        !Number.isFinite(item.quantidade) ||
        item.quantidade < 0.001 ||
        item.quantidade > 100000 ||
        !Number.isInteger(item.preco_unitario_centavos) ||
        item.preco_unitario_centavos < 0 ||
        item.preco_unitario_centavos > 100000000 ||
        !["pending", "in_progress", "done", "cancelled"].includes(item.situacao)
      )
        throw new Error(
          "Confira descrição, quantidade, preço e situação dos serviços.",
        );
      ids.add(item.id);
      const original = anterior?.itens.find((i) => i.id === item.id);
      if (
        original &&
        (original.tipo !== item.tipo ||
          original.unidade !== item.unidade ||
          (original.item_catalogo_id ?? null) !== (item.item_catalogo_id ?? null))
      )
        throw new Error(
          "O vínculo, tipo e unidade de um item existente devem ser preservados.",
        );
      const cadastro =
        !original && item.item_catalogo_id
          ? lerCatalogoDemo().find(
              (c) => c.id === item.item_catalogo_id && !c.arquivado_em,
            )
          : null;
      if (
        !original &&
        item.item_catalogo_id &&
        (!cadastro || cadastro.tipo !== item.tipo || cadastro.unidade !== item.unidade)
      )
        throw new Error("Cadastro do catálogo indisponível ou incompatível.");
      const estoque =
        !original &&
        item.tipo === "part" &&
        lerEstoqueDemo().produtos.find(
          (p) => p.id === item.item_catalogo_id && p.saldo !== null,
        );
      return {
        ...original,
        ...item,
        descricao: item.descricao.trim(),
        total_item_centavos: Math.round(item.quantidade * item.preco_unitario_centavos),
        concluido_em:
          item.situacao === "done"
            ? (original?.concluido_em ?? new Date().toISOString())
            : null,
        ...(estoque ? { origem_peca: "estoque", produto_estoque_id: estoque.id } : {}),
      };
    });
    o.subtotal_centavos = o.itens.reduce(
      (s, i) => s + Math.round(i.quantidade * i.preco_unitario_centavos),
      0,
    );
    o.desconto_centavos = Number(
      dados.desconto_centavos ?? anterior?.desconto_centavos ?? 0,
    );
    if (
      !Number.isInteger(o.desconto_centavos) ||
      o.desconto_centavos < 0 ||
      o.desconto_centavos > o.subtotal_centavos
    )
      throw new Error("O desconto não pode ultrapassar o subtotal dos itens.");
    o.total_centavos = o.subtotal_centavos - o.desconto_centavos;
    const comparar = (itens: OrdemServico["itens"]) =>
      JSON.stringify(
        itens.map((i) => [
          i.id,
          i.descricao,
          i.tipo,
          i.unidade,
          i.quantidade,
          i.preco_unitario_centavos,
          i.situacao,
        ]),
      );
    if (comparar(anterior?.itens ?? []) !== comparar(o.itens)) {
      if (o.situacao === "ready") o.situacao = "in_progress";
      evento(
        o,
        "Serviços da OS atualizados. Inclusões, alterações e remoções registradas.",
      );
      o.historico[0].metadados = {
        antes: anterior?.itens ?? [],
        depois: o.itens,
      };
    }
  }
  evento(
    o,
    anterior ? "Dados do atendimento atualizados." : "Ordem de serviço aberta.",
  );
  if (anterior)
    o.historico[0].metadados = {
      antes: {
        entrega_prevista_em: anterior.entrega_prevista_em,
        data_servico: anterior.data_servico,
      },
      depois: {
        entrega_prevista_em: o.entrega_prevista_em,
        data_servico: o.data_servico,
      },
    };
  if (!anterior && dados.servico_pronto === true) {
    o.situacao = "ready";
    o.concluido_em = new Date().toISOString();
    o.itens = o.itens.map((i) =>
      i.situacao === "cancelled"
        ? i
        : { ...i, situacao: "done", concluido_em: o.concluido_em },
    );
    evento(o, "Serviço rápido: OS criada com os serviços concluídos.");
  }
  validarFinanceiroOSDemo(o);
  const financeiroAntes = localStorage.getItem("patio_financeiro_v1");
  try {
    sincronizarFinanceiroOSDemo(o);
    gravar(o);
  } catch (e) {
    if (financeiroAntes === null) localStorage.removeItem("patio_financeiro_v1");
    else localStorage.setItem("patio_financeiro_v1", financeiroAntes);
    throw e;
  }
  if (
    opcoes?.avisarPronta !== false &&
    anterior?.situacao !== "ready" &&
    o.situacao === "ready"
  )
    notificarOSPronta(oficina, o.id);
  return o;
}
export async function abrirOSOrcamentoDemo(oficina: string, proposta: Proposta) {
  const existente = ler().find(
    (o) =>
      o.orcamento_aguardando_id === proposta.id ||
      o.orcamento_origem_id === proposta.id,
  );
  if (existente) return existente;
  if (
    ler().some(
      (o) =>
        o.veiculo_id === proposta.veiculo_id &&
        !["delivered", "cancelled"].includes(o.situacao),
    )
  )
    throw new Error(
      "Este veículo já possui uma OS aberta. Confira o atendimento existente.",
    );
  const o = await salvarOS(
    true,
    oficina,
    {
      cliente_id: proposta.cliente_id,
      veiculo_id: proposta.veiculo_id,
      ...(!proposta.cliente_id
        ? {
            cliente_nome_livre: proposta.versao.dados_cliente.nome,
            cliente_telefone_livre: proposta.versao.dados_cliente.telefone_e164,
          }
        : {}),
    },
    proposta.id,
  );
  o.orcamento_aguardando_id = proposta.id;
  o.paradas.push({
    iniciado_em: new Date().toISOString(),
    id: novoId(),
    motivo: "approval",
    detalhes: `Aguardando aprovação do orçamento #${proposta.numero}`,
    encerrado_em: null,
  });
  evento(o, `OS aberta aguardando aprovação do orçamento #${proposta.numero}.`);
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
    if (
      o.situacao !== "ready" &&
      ((acao === "atualizar_mapa_ordem_servico" && dados.p_situacao === "ready") ||
        (acao === "operar_mapa_rapido" && dados.p_acao === "concluir"))
    )
      notificarOSPronta(oficina, o.id);
    return;
  }
  const atual = await consultarOS(true, oficina, o.id);
  if (
    atual.orcamento_aguardando_id &&
    ([
      "salvar_item_os",
      "corrigir_item_os",
      "adicionar_servico_catalogo_os",
      "adicionar_peca_os",
      "resolver_parada_os",
    ].includes(acao) ||
      (acao === "atualizar_mapa_ordem_servico" &&
        !["open", "cancelled"].includes(String(dados.p_situacao))) ||
      (acao === "operar_mapa_rapido" &&
        ["retomar", "concluir"].includes(String(dados.p_acao))))
  )
    throw new Error("Aguarde a aprovação do orçamento para iniciar o serviço.");
  if (acao === "operar_mapa_rapido") {
    if (atual.revisao !== dados.p_revisao)
      throw new Error(
        "Esta OS foi alterada. Confira o mapa atualizado e tente novamente.",
      );
    if (["delivered", "cancelled"].includes(atual.situacao))
      throw new Error("OS encerrada: histórico preservado.");
    const paradas = atual.paradas.filter((p) => !p.encerrado_em);
    if (dados.p_acao === "concluir") {
      if (atual.situacao !== "quality_check")
        throw new Error("Leve o serviço à conferência antes de concluir.");
      if (paradas.length)
        throw new Error("Retome o serviço e resolva as paradas antes de concluir.");
      const itens = atual.itens.filter(
        (i) => !["done", "cancelled"].includes(i.situacao),
      );
      itens.forEach((i) => {
        i.situacao = "done";
        i.concluido_em = new Date().toISOString();
      });
      if (itens.length) {
        evento(atual, "Itens concluídos pelo mapa da oficina.");
        atual.historico[0].metadados = {
          acao: "concluir_no_mapa",
          itens: itens.map((i) => i.id),
        };
      }
      atual.situacao = "ready";
      atual.concluido_em = new Date().toISOString();
      evento(atual, "Situação: Pronta para entrega");
    } else if (dados.p_acao === "parar") {
      if (!["open", "in_progress", "quality_check"].includes(atual.situacao))
        throw new Error("Volte à conferência antes de parar um serviço concluído.");
      if (paradas.length) throw new Error("Este serviço já está parado.");
      const motivo = String(dados.p_motivo ?? "");
      const detalhes = String(dados.p_detalhes ?? "").trim();
      if (!Object.hasOwn(motivosParada, motivo) || detalhes.length > 2000)
        throw new Error("Selecione um motivo e use detalhes com até 2.000 caracteres.");
      atual.paradas.unshift({
        iniciado_em: new Date().toISOString(),
        id: novoId(),
        motivo,
        detalhes: detalhes || motivosParada[motivo],
        encerrado_em: null,
      });
      evento(atual, "Parada registrada: " + (detalhes || motivosParada[motivo]));
    } else if (dados.p_acao === "retomar") {
      if (!paradas.length) throw new Error("Este serviço não está parado.");
      paradas.forEach((p) => {
        p.encerrado_em = new Date().toISOString();
        evento(atual, "Motivo de parada resolvido.");
      });
    } else throw new Error("Ação inválida.");
  }
  if (acao === "atualizar_mapa_ordem_servico") {
    if (atual.revisao !== dados.p_revisao_esperada)
      throw new Error("Esta OS foi alterada. Atualize antes de mudar a etapa.");
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
    if (destino === "delivered" && !dados.p_recebido_em)
      throw new Error("Registre a entrada do veículo na OS antes de entregar.");
  }

  if (acao === "registrar_anotacao_os") evento(atual, String(dados.p_texto));
  if (acao === "atualizar_mapa_ordem_servico") {
    atual.situacao = String(dados.p_situacao);
    if (atual.situacao === "ready") atual.concluido_em = new Date().toISOString();
    else if (atual.situacao === "in_progress") atual.concluido_em = null;
    atual.recebido_em = (dados.p_recebido_em as string | null) ?? null;
    evento(atual, `Situação: ${situacoesOS[atual.situacao]}`);
  }
  if (acao === "registrar_parada_os") {
    atual.paradas.unshift({
      iniciado_em: new Date().toISOString(),
      id: novoId(),
      motivo: String(dados.p_motivo),
      detalhes: String(dados.p_detalhes),
      encerrado_em: null,
    });
    evento(atual, "Parada registrada: " + dados.p_detalhes);
  }
  if (acao === "resolver_parada_os") {
    atual.paradas = atual.paradas.map((p) =>
      p.id === dados.p_parada ? { ...p, encerrado_em: new Date().toISOString() } : p,
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
      (i) => i.id === dados.p_servico && i.tipo === "service" && !i.arquivado_em,
    );
    if (!c) throw new Error("Serviço indisponível. Atualize o catálogo.");
    atual.itens.push({
      id: novoId(),
      item_catalogo_id: c.id,
      tipo: "service",
      descricao: c.descricao,
      unidade: c.unidade,
      quantidade: 1,
      preco_unitario_centavos: c.preco_padrao_centavos,
      situacao: "pending",
    });
    evento(atual, "Serviço do catálogo adicionado.");
  }
  if (acao === "salvar_item_os") {
    const d = dados.p_dados as ItemProposta & { situacao: string };
    if (dados.p_item) {
      atual.itens = atual.itens.map((i) =>
        i.id === dados.p_item ? { ...i, situacao: d.situacao } : i,
      );
    } else {
      atual.itens.push({ ...d, id: novoId(), situacao: "pending" });
    }
    evento(atual, "Item da OS atualizado.");
  }
  if (acao === "corrigir_item_os") {
    atual.itens = atual.itens.map((i) =>
      i.id === dados.p_item ? { ...i, ...(dados.p_dados as Partial<ItemProposta>) } : i,
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
      id: novoId(),
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
    evento(atual, "Peça do estoque adicionada.");
  }
  if (
    [
      "adicionar_servico_catalogo_os",
      "salvar_item_os",
      "corrigir_item_os",
      "adicionar_peca_estoque_os",
    ].includes(acao)
  ) {
    atual.subtotal_centavos = atual.itens.reduce(
      (v, i) => v + Math.round(i.quantidade * i.preco_unitario_centavos),
      0,
    );
    const desconto = atual.desconto_centavos || 0;
    if (desconto > atual.subtotal_centavos)
      throw new Error("O desconto não pode ultrapassar o subtotal dos itens.");
    atual.total_centavos = atual.subtotal_centavos - desconto;
  }
  validarFinanceiroOSDemo(atual);
  const salvarIntegrado = () => {
    const financeiroAntes = localStorage.getItem("patio_financeiro_v1");
    try {
      sincronizarFinanceiroOSDemo(atual);
      gravar(atual);
    } catch (e) {
      if (financeiroAntes === null) localStorage.removeItem("patio_financeiro_v1");
      else localStorage.setItem("patio_financeiro_v1", financeiroAntes);
      throw e;
    }
  };
  if (acao === "atualizar_mapa_ordem_servico" && atual.situacao === "delivered")
    baixarEstoqueDemo(atual, salvarIntegrado);
  else salvarIntegrado();
  if (o.situacao !== "ready" && atual.situacao === "ready")
    notificarOSPronta(oficina, o.id);
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
      id: novoId(),
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
  const reserva = await rpc<{ id: string; caminho: string }>("reservar_foto_os", {
    p_oficina: oficina,
    p_os: o.id,
    p_fase: fase,
    p_nome: arquivo.name,
    p_mime: arquivo.type,
    p_tamanho: arquivo.size,
    p_legenda: legenda,
  });
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
