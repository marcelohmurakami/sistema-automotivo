import { novoId } from "../lib/uuid";
import { lerOrdensDemo } from "../lib/ordensDemo";
import type { TituloFinanceiro } from "./financeiro";
import type { PainelServicos } from "./servicos";
import type { DetalhesAtendimento } from "../types/servicosCompletos";

/** Prepara as alterações sem gravar: documento e pagamento são confirmados juntos. */
export function prepararDescontoRecebimentoDemo(
  oficina: string,
  titulo: TituloFinanceiro,
  desconto: number,
  mostrarDescontoNota?: boolean,
): Map<string, string> {
  const alteracoes = new Map<string, string>();
  if (titulo.natureza !== "receber")
    throw new Error("Desconto disponível somente para recebimentos de OS.");
  if (titulo.automatico && titulo.ordem_servico_id) {
    const ordens = lerOrdensDemo();
    const os = ordens.find((o) => o.id === titulo.ordem_servico_id);
    if (
      !os ||
      os.arquivado_em ||
      os.situacao === "cancelled" ||
      os.total_centavos !== titulo.valor_centavos
    )
      throw new Error("Confira o total da OS antes de aplicar o desconto.");
    os.desconto_centavos = (os.desconto_centavos || 0) + desconto;
    if (mostrarDescontoNota !== undefined)
      os.mostrar_desconto_nota = mostrarDescontoNota;
    os.total_centavos -= desconto;
    os.revisao++;
    os.historico.push({
      id: novoId(),
      descricao: "Desconto concedido no recebimento",
      ocorrido_em: new Date().toISOString(),
      metadados: { desconto_centavos: desconto },
    });
    alteracoes.set("patio_os_v1", JSON.stringify(ordens));
  } else {
    const chavePainel = `patio_servicos:${oficina}`;
    const painel: PainelServicos = JSON.parse(
      localStorage.getItem(chavePainel) || "{}",
    );
    const id = painel.cobrancas?.find((c) => c.titulo_id === titulo.id)?.atendimento_id;
    const atendimento = painel.atendimentos?.find((a) => a.id === id);
    if (
      !id ||
      !atendimento ||
      ["orcamento", "cancelado"].includes(atendimento.situacao) ||
      atendimento.valor_centavos !== titulo.valor_centavos
    )
      throw new Error("Confira o total da OS antes de aplicar o desconto.");
    const chaveExtras = `patio_detalhes_servicos:${oficina}`;
    const extras: Record<
      string,
      Omit<DetalhesAtendimento, "atendimento" | "cliente" | "objeto">
    > = JSON.parse(localStorage.getItem(chaveExtras) || "{}");
    const d = extras[id] ?? {
      itens: [],
      comercial: {},
      equipe: [],
      horas: [],
      qualidade: [],
      eventos: [],
    };
    d.comercial.desconto_centavos = (d.comercial.desconto_centavos || 0) + desconto;
    d.eventos.push({
      id: Date.now(),
      tipo: "desconto_recebimento",
      antes: String(atendimento.valor_centavos),
      depois: String(atendimento.valor_centavos - desconto),
      criado_em: new Date().toISOString(),
    });
    extras[id] = d;
    atendimento.valor_centavos -= desconto;
    if (mostrarDescontoNota !== undefined)
      atendimento.mostrar_desconto_nota = mostrarDescontoNota;
    atendimento.revisao++;
    alteracoes.set(chavePainel, JSON.stringify(painel));
    alteracoes.set(chaveExtras, JSON.stringify(extras));
  }
  return alteracoes;
}

export function gravarRecebimentoDemo(alteracoes: Map<string, string>) {
  const anteriores = new Map<string, string | null>();
  try {
    for (const [chave, valor] of alteracoes) {
      const anterior = localStorage.getItem(chave);
      localStorage.setItem(chave, valor);
      anteriores.set(chave, anterior);
    }
  } catch (erro) {
    for (const [chave, valor] of anteriores) {
      if (valor === null) localStorage.removeItem(chave);
      else localStorage.setItem(chave, valor);
    }
    throw erro;
  }
}
