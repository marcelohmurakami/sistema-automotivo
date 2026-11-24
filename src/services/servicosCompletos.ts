import { novoId } from "../lib/uuid.ts";
import { rpc } from "../lib/rpc";
import { transacaoDemo } from "../lib/transacaoDemo";
import { fichaReaberta, validarEtapaReparo } from "../lib/assistenciaTecnica";
import {
  temAceiteServico,
  reabrirFichaServico,
  resumoAceiteServico,
  validarAceiteServico,
} from "../lib/aceiteServico";
import { totaisItens } from "../lib/calculosAtendimento";
import {
  itensDaProposta,
  gruposDoAtendimento,
  totalAutorizado,
} from "../lib/aprovacaoServicos";
import { consultarClienteDemo } from "./clientes";
import { lerServicosDemo, gravarServico } from "./servicos";
import { validarFichaEspecialidade, perfilAtendimento } from "../lib/perfisAtendimento";
import { validarLimpeza } from "../lib/limpeza";
import { listarFuncionarios } from "./funcionarios";
import { lerEstoqueDemo } from "./estoque";
import { tituloDemoAtivo } from "./financeiro";
import type { AtendimentoServico } from "./servicos";
import type {
  DetalhesAtendimento,
  ItemAtendimento,
  IntegranteAtendimento,
  QualidadeAtendimento,
} from "../types/servicosCompletos";
const chave = (oficina: string) => `patio_detalhes_servicos:${oficina}`;
export async function criarAtendimentoComItens(
  demo: boolean,
  oficina: string,
  args: Record<string, unknown>,
): Promise<string> {
  const entrada = args.p_dados as AtendimentoServico;
  const itens = args.p_itens as ItemAtendimento[];
  const desconto = Number(args.p_desconto || 0);
  const total = totaisItens(itens, desconto).total;
  if (entrada.ficha_especialidade)
    validarFichaEspecialidade(entrada.ficha_especialidade);
  validarEtapaReparo(entrada);
  validarAceiteServico(entrada);
  validarLimpeza(entrada);
  if (entrada.situacao === "cancelado")
    throw new Error("Salve a ordem antes de cancelar o serviço.");
  if (!demo) return rpc("criar_atendimento_com_itens", { p_oficina: oficina, ...args });
  const id = String(args.p_id);
  if (lerServicosDemo(oficina).atendimentos.some((a) => a.id === id)) return id;
  const chaves = [`patio_servicos:${oficina}`, chave(oficina)];
  const anteriores = chaves.map((key) => localStorage.getItem(key));
  try {
    await gravarServico(
      "salvar_atendimento_servico",
      oficina,
      {
        p_id: id,
        p_dados: {
          ...entrada,
          situacao: "orcamento",
          valor_centavos: total,
          ...(entrada.situacao === "concluido" && entrada.ficha_especialidade
            ? {
                ficha_especialidade: {
                  ...entrada.ficha_especialidade,
                  etapa: perfilAtendimento(entrada.ficha_especialidade.especialidade)
                    .etapas[0],
                  campos: {
                    ...entrada.ficha_especialidade.campos,
                    ...(temAceiteServico(entrada)
                      ? {
                          situacao_aceite: "Pendente",
                          aceite: "",
                          data_aceite: "",
                          ressalvas_aceite: "",
                        }
                      : {}),
                  },
                },
              }
            : {}),
        },
      },
      true,
    );
    const a = lerServicosDemo(oficina).atendimentos.find((a) => a.id === id)!;
    await operarAtendimento(true, oficina, "salvar_itens_atendimento", {
      p_atendimento: id,
      p_revisao: a.revisao,
      p_itens: itens,
      p_desconto: desconto,
    });
    if (entrada.situacao !== "orcamento") {
      const atual = lerServicosDemo(oficina).atendimentos.find((a) => a.id === id)!;
      await gravarServico(
        "salvar_atendimento_servico",
        oficina,
        {
          p_id: id,
          p_revisao: atual.revisao,
          p_dados: {
            ...atual,
            situacao: entrada.situacao,
            ficha_especialidade: entrada.ficha_especialidade,
          },
        },
        true,
      );
    }
    return id;
  } catch (erro) {
    chaves.forEach((key, index) =>
      anteriores[index] === null
        ? localStorage.removeItem(key)
        : localStorage.setItem(key, anteriores[index]!),
    );
    throw erro;
  }
}
type Extras = Omit<DetalhesAtendimento, "atendimento" | "cliente" | "objeto">;
const vazio = (): Extras => ({
  itens: [],
  comercial: {},
  equipe: [],
  horas: [],
  qualidade: [],
  eventos: [],
});
function ler(oficina: string): Record<string, Extras> {
  return JSON.parse(localStorage.getItem(chave(oficina)) || "{}");
}
export async function consultarDetalhesAtendimento(
  demo: boolean,
  oficina: string,
  id: string,
  signal?: AbortSignal,
): Promise<DetalhesAtendimento> {
  if (!demo)
    return rpc(
      "consultar_detalhes_atendimento",
      {
        p_oficina: oficina,
        p_atendimento: id,
      },
      signal,
    );
  const p = lerServicosDemo(oficina),
    a = p.atendimentos.find((a) => a.id === id);
  if (!a) throw Error("Atendimento indisponível.");
  const c = consultarClienteDemo(a.cliente_id);
  return {
    ...(ler(oficina)[id] || vazio()),
    atendimento: a,
    cliente: { nome: c.nome, telefone: c.telefone_e164 },
    objeto: p.objetos.find((o) => o.id === a.objeto_id)!,
  };
}
export async function operarAtendimento(
  demo: boolean,
  oficina: string,
  funcao: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (!demo) {
    // A comissão identifica o atendimento pelo integrante, não por p_atendimento.
    const parametros =
      funcao === "gerar_comissao_atendimento" ? { p_equipe: args.p_equipe } : args;
    return rpc(
      funcao === "salvar_itens_atendimento" &&
        typeof args.p_mostrar_desconto_nota === "boolean"
        ? "salvar_itens_atendimento_nota"
        : funcao,
      { p_oficina: oficina, ...parametros },
    );
  }
  const painel = lerServicosDemo(oficina),
    extras = ler(oficina);
  const id = String(
    args.p_atendimento ||
      Object.keys(extras).find((id) =>
        extras[id].equipe.some((e) => e.id === args.p_equipe),
      ) ||
      "",
  );
  const a = painel.atendimentos.find((a) => a.id === id);
  if (!a) throw Error("Atendimento indisponível.");
  const d = extras[id] || vazio();
  extras[id] = d;
  if (
    args.p_revisao != null &&
    args.p_revisao !== a.revisao &&
    funcao !== "salvar_qualidade_atendimento"
  )
    throw Error("Atendimento alterado. Atualize a tela.");
  if (
    [
      "salvar_itens_atendimento",
      "salvar_equipe_atendimento",
      "registrar_horas_atendimento",
    ].includes(funcao) &&
    ["concluido", "cancelado"].includes(a.situacao)
  )
    throw Error("Reabra o atendimento antes de alterar.");
  let resultado: unknown;
  let estoqueAtualizado: ReturnType<typeof lerEstoqueDemo> | undefined;
  if (
    ["aprovar_grupos_atendimento", "registrar_autorizacao_atendimento"].includes(funcao)
  ) {
    if (a.situacao !== "orcamento")
      throw Error("Este atendimento não aguarda aprovação.");
    const nome = String(args.p_nome || "").trim();
    const grupos = args.p_grupos as string[];
    const itens = itensDaProposta(d.itens, a.titulo, a.valor_centavos, a.id);
    const disponiveis = gruposDoAtendimento(itens);
    if (
      !args.p_confirmo ||
      nome.length < 2 ||
      nome.length > 160 ||
      !Array.isArray(grupos) ||
      !grupos.length ||
      grupos.some((g) => !disponiveis.some((v) => v.nome === g))
    )
      throw Error("Confira os grupos, o nome e a confirmação.");
    if (
      disponiveis.some(
        (g) =>
          grupos.includes(g.nome) && g.dependencias.some((v) => !grupos.includes(v)),
      )
    )
      throw Error("Inclua os grupos necessários aos serviços selecionados.");
    const desconto = d.itens.length ? d.comercial.desconto_centavos || 0 : 0;
    const total = totalAutorizado(itens, desconto, grupos);
    d.propostas = [
      {
        id: novoId(),
        revisao: a.revisao,
        documento: {
          numero: a.numero || 0,
          titulo: a.titulo,
          data_servico: a.data_servico || a.vencimento,
          cliente: consultarClienteDemo(a.cliente_id).nome,
          objeto: painel.objetos.find((o) => o.id === a.objeto_id)?.nome || "",
          empresa: { nome: "Empresa de demonstração", ramo: "servicos" },
          resumo: a.resumo_cliente || "",
          itens: structuredClone(itens),
          desconto_centavos: desconto,
          total_centavos: a.valor_centavos,
        },
        decisao: "aprovado",
        nome_informado: nome,
        confirmado_em: new Date().toISOString(),
        grupos_aprovados: grupos,
        total_aprovado_centavos: total.total,
        origem: "equipe",
      },
      ...(d.propostas || []),
    ];
    d.comercial.orcado_centavos = a.valor_centavos;
    d.comercial.desconto_centavos = total.desconto;
    d.itens = d.itens.filter((i) =>
      grupos.includes(i.grupo_servico?.trim() || "Atendimento"),
    );
    a.valor_centavos = total.total;
    a.situacao = "aprovado";
    a.dados = {
      ...a.dados,
      documento: "ordem",
      orcamento_enviado: "sim",
      orcamento_aprovado_em: new Date().toISOString(),
    };
  } else if (funcao === "salvar_itens_atendimento") {
    if (
      painel.cobrancas.some(
        (c) => c.atendimento_id === id && tituloDemoAtivo(c.titulo_id),
      )
    )
      throw Error("Cancele a cobrança antes de alterar itens.");
    const estoque = lerEstoqueDemo();
    const itens = (args.p_itens as ItemAtendimento[]).map((i) => {
      if (i.origem !== "estoque")
        return {
          ...i,
          produto_id: null,
          custo_centavos: i.origem === "cliente" ? 0 : i.custo_centavos,
        };
      const p = estoque.produtos.find(
        (p) => p.id === i.produto_id && !p.arquivado_em && p.saldo != null,
      );
      if (!p) throw Error("Selecione um produto ativo do estoque.");
      return { ...i, custo_centavos: p.custo_centavos };
    });
    if (new Set(itens.map((i) => i.id)).size !== itens.length)
      throw Error("Itens duplicados.");
    const desconto = Number(args.p_desconto || 0),
      custo = Number(args.p_custo_extra || 0);
    if (!Number.isSafeInteger(custo) || custo < 0) throw Error("Custo inválido.");
    const t = totaisItens(itens, desconto);
    d.itens = itens;
    d.comercial = {
      ...d.comercial,
      desconto_centavos: desconto,
      custo_extra_centavos: custo,
      motivo_custo: String(args.p_motivo || ""),
    };
    a.valor_centavos = t.total;
    if (typeof args.p_mostrar_desconto_nota === "boolean")
      a.mostrar_desconto_nota = args.p_mostrar_desconto_nota;
  } else if (funcao === "salvar_equipe_atendimento") {
    const lista = args.p_equipe as IntegranteAtendimento[],
      f = await listarFuncionarios(true, oficina);
    if (
      lista.reduce((s, e) => s + (e.percentual || 0), 0) > 100 ||
      new Set(lista.map((e) => e.funcionario_id)).size !== lista.length
    )
      throw Error("Confira a equipe e os percentuais.");
    if (d.horas.some((h) => !lista.some((e) => e.funcionario_id === h.funcionario_id)))
      throw Error("Preserve os funcionários com horas registradas.");
    d.equipe = lista.map((e) => {
      const nome = f.find((f) => f.id === e.funcionario_id && f.ativo)?.nome;
      if (!nome) throw Error("Funcionário indisponível.");
      return {
        ...e,
        id: d.equipe.find((x) => x.funcionario_id === e.funcionario_id)?.id || novoId(),
        nome,
        comissao_centavos: 0,
        titulo_id: null,
      };
    });
  } else if (funcao === "registrar_horas_atendimento") {
    const inicio = String(args.p_inicio),
      fim = args.p_fim ? String(args.p_fim) : null,
      func = String(args.p_funcionario),
      hid = String(args.p_id);
    if (!d.equipe.some((e) => e.funcionario_id === func))
      throw Error("Selecione um integrante da equipe.");
    if (
      !Number.isFinite(Date.parse(inicio)) ||
      Date.parse(inicio) > Date.now() + 60000 ||
      (fim &&
        (!Number.isFinite(Date.parse(fim)) ||
          Date.parse(fim) > Date.now() + 60000 ||
          Date.parse(fim) <= Date.parse(inicio) ||
          Date.parse(fim) - Date.parse(inicio) > 86400000))
    )
      throw Error("Período de trabalho inválido.");
    if (
      Object.values(extras).some((d) =>
        d.horas.some(
          (h) =>
            h.id !== hid &&
            h.funcionario_id === func &&
            Date.parse(h.inicio) < (fim ? Date.parse(fim) : Infinity) &&
            (h.fim ? Date.parse(h.fim) : Infinity) > Date.parse(inicio),
        ),
      )
    )
      throw Error("Há outro apontamento neste horário.");
    const antigo = d.horas.find((h) => h.id === hid);
    if (antigo && (antigo.inicio !== inicio || antigo.funcionario_id !== func))
      throw Error("O início e o funcionário do apontamento não podem ser alterados.");
    if (antigo?.fim && antigo.fim !== fim) throw Error("Apontamento já encerrado.");
    d.horas = [
      ...d.horas.filter((h) => h.id !== hid),
      {
        id: hid,
        atendimento_id: id,
        funcionario_id: func,
        inicio,
        fim,
        descricao: String(args.p_descricao || ""),
      },
    ];
  } else if (funcao === "salvar_qualidade_atendimento") {
    const q = args.p_dados as QualidadeAtendimento,
      qid = String(args.p_id),
      antigo = d.qualidade.find((q) => q.id === qid);
    if (antigo && antigo.revisao !== args.p_revisao)
      throw Error("Ocorrência alterada.");
    if (
      q.motivo.trim().length < 3 ||
      q.custo_centavos < 0 ||
      q.minutos < 0 ||
      (q.resolvido_em && q.resolvido_em < q.aberto_em)
    )
      throw Error("Confira motivo, datas e valores.");
    d.qualidade = [
      ...d.qualidade.filter((q) => q.id !== qid),
      { ...q, id: qid, atendimento_id: id, revisao: (antigo?.revisao || 0) + 1 },
    ];
  } else if (funcao === "gerar_comissao_atendimento") {
    const e = d.equipe.find((e) => e.id === args.p_equipe);
    if (!e || !e.comissao_centavos || a.situacao !== "concluido")
      throw Error("Conclua o atendimento com comissão positiva.");
    if (e.titulo_id && tituloDemoAtivo(e.titulo_id)) return e.titulo_id;
    const { novoTitulo, salvarTitulo } = await import("./financeiro");
    const t = {
      ...novoTitulo("pagar"),
      descricao: `Comissão · ${a.titulo}`,
      categoria: "pessoal",
      pessoa: e.nome,
      valor_centavos: e.comissao_centavos,
    };
    await salvarTitulo(true, oficina, t);
    e.titulo_id = t.id;
    resultado = t.id;
  } else if (funcao === "reabrir_atendimento_servico") {
    if (a.situacao !== "concluido" || String(args.p_motivo || "").trim().length < 3)
      throw Error("Informe o motivo para reabrir.");
    if (d.equipe.some((e) => e.titulo_id && tituloDemoAtivo(e.titulo_id)))
      throw Error("Cancele a comissão antes de reabrir.");
    const estoque = lerEstoqueDemo();
    for (const m of estoque.movimentos.filter(
      (m) => m.documento === id && m.tipo === "saida" && !m.estornado,
    )) {
      const p = estoque.produtos.find((p) => p.id === m.item_catalogo_id)!;
      p.saldo = (p.saldo || 0) - m.quantidade;
      p.revisao = (p.revisao || 0) + 1;
      m.estornado = true;
      estoque.movimentos.push({
        ...m,
        id: novoId(),
        tipo: "estorno",
        criado_em: new Date().toISOString(),
        quantidade: -m.quantidade,
        saldo_apos: p.saldo,
        estorno_de: m.id,
        estornado: false,
        chave: novoId(),
      });
    }
    estoqueAtualizado = estoque;
    a.situacao = "em_execucao";
    a.concluido_em = null;
    const aceiteAnterior = resumoAceiteServico(a);
    const ficha = temAceiteServico(a) ? reabrirFichaServico(a) : fichaReaberta(a);
    if (ficha && ficha.etapa !== a.ficha_especialidade?.etapa) {
      d.eventos.push({
        id: Date.now(),
        tipo: "etapa",
        antes: a.ficha_especialidade?.etapa || null,
        depois: ficha.etapa,
        criado_em: new Date().toISOString(),
      });
    }
    if (ficha) a.ficha_especialidade = ficha;
    if (temAceiteServico(a) && aceiteAnterior !== resumoAceiteServico(a))
      d.eventos.push({
        id: Date.now() + d.eventos.length,
        tipo: "aceite",
        antes: aceiteAnterior,
        depois: resumoAceiteServico(a),
        criado_em: new Date().toISOString(),
      });
    d.equipe = d.equipe.map((e) => ({ ...e, comissao_centavos: 0, titulo_id: null }));
  } else if (funcao === "compartilhar_atendimento_cliente") {
    throw Error(
      "A área do cliente usa contas confirmadas. A publicação fica disponível na conta real.",
    );
  } else throw Error("Operação indisponível.");
  if (
    ![
      "registrar_horas_atendimento",
      "salvar_qualidade_atendimento",
      "gerar_comissao_atendimento",
    ].includes(funcao)
  )
    a.revisao++;
  d.eventos.push({
    id: Date.now(),
    tipo: funcao,
    antes: null,
    depois: String(args.p_motivo || "Registro atualizado"),
    criado_em: new Date().toISOString(),
  });
  transacaoDemo(
    [chave(oficina), `patio_servicos:${oficina}`, "patio_estoque_v1"],
    () => {
      localStorage.setItem(chave(oficina), JSON.stringify(extras));
      if (estoqueAtualizado)
        localStorage.setItem("patio_estoque_v1", JSON.stringify(estoqueAtualizado));
      localStorage.setItem(`patio_servicos:${oficina}`, JSON.stringify(painel));
    },
  );
  return resultado;
}
export function concluirDemo(oficina: string, id: string) {
  const extras = ler(oficina),
    d = extras[id] || vazio();
  if (d.horas.some((h) => !h.fim))
    throw Error("Encerre os apontamentos de tempo antes de concluir.");
  const estoque = lerEstoqueDemo();
  for (const i of d.itens.filter((i) => i.origem === "estoque")) {
    const p = estoque.produtos.find((p) => p.id === i.produto_id);
    if (!p || p.saldo == null || p.saldo < i.quantidade)
      throw Error("Estoque insuficiente.");
    p.saldo -= i.quantidade;
    p.revisao = (p.revisao || 0) + 1;
    i.custo_centavos = p.custo_centavos;
    estoque.movimentos.push({
      id: novoId(),
      item_catalogo_id: p.id,
      tipo: "saida",
      quantidade: -i.quantidade,
      saldo_apos: p.saldo,
      custo_centavos: p.custo_centavos,
      motivo: "Material utilizado no atendimento",
      documento: id,
      atendimento_id: id,
      ordem_servico_id: null,
      numero_os: null,
      criado_em: new Date().toISOString(),
      estornado: false,
      chave: novoId(),
    });
  }
  const t = totaisItens(d.itens, d.comercial.desconto_centavos || 0),
    base = d.itens
      .filter((i) => i.tipo === "servico")
      .reduce((s, i) => s + Math.round(i.quantidade * i.preco_centavos), 0);
  d.equipe = d.equipe.map((e) => ({
    ...e,
    comissao_centavos: Math.round(
      ((t.subtotal
        ? (base * t.total) / t.subtotal
        : lerServicosDemo(oficina).atendimentos.find((a) => a.id === id)
            ?.valor_centavos || 0) *
        (e.percentual || 0)) /
        100,
    ),
  }));
  extras[id] = d;
  localStorage.setItem(chave(oficina), JSON.stringify(extras));
  localStorage.setItem("patio_estoque_v1", JSON.stringify(estoque));
}
export function validarValorAtendimentoDemo(
  oficina: string,
  id: string,
  valor: number,
) {
  const d = ler(oficina)[id];
  if (
    d?.itens.length &&
    totaisItens(d.itens, d.comercial.desconto_centavos || 0).total !== valor
  )
    throw Error(
      "O total é calculado pelos itens. Altere os serviços, materiais ou desconto.",
    );
}
export function registrarTransicaoAtendimentoDemo(
  oficina: string,
  antes: AtendimentoServico | undefined,
  depois: AtendimentoServico,
) {
  const extras = ler(oficina),
    d = extras[depois.id] || vazio();
  if (depois.situacao === "aprovado" && d.comercial.orcado_centavos == null)
    d.comercial.orcado_centavos = depois.valor_centavos;
  const transicoes: [string, string | undefined, string | undefined][] = [
    ["situacao", antes?.situacao, depois.situacao],
    ["etapa", antes?.ficha_especialidade?.etapa, depois.ficha_especialidade?.etapa],
  ];
  if (temAceiteServico(depois))
    transicoes.push([
      "aceite",
      resumoAceiteServico(antes),
      resumoAceiteServico(depois),
    ]);
  for (const [tipo, a, b] of transicoes)
    if (a !== b)
      d.eventos.push({
        id: Date.now() + d.eventos.length,
        tipo,
        antes: a || null,
        depois: b || null,
        criado_em: new Date().toISOString(),
      });
  extras[depois.id] = d;
  localStorage.setItem(chave(oficina), JSON.stringify(extras));
}
