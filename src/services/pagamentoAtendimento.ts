import { consultarDetalhesAtendimento } from "./servicosCompletos";
import { gravarServico } from "./servicos";
import { consultarTituloFinanceiro } from "./financeiro";

/** A cobrança é idempotente; a baixa só acontece após a confirmação do usuário. */
export async function prepararPagamentoAtendimento(
  demo: boolean,
  oficina: string,
  id: string,
) {
  const { atendimento, cliente } = await consultarDetalhesAtendimento(
    demo,
    oficina,
    id,
  );
  const cancelado = atendimento.situacao === "cancelado";
  const podeCobrar =
    !cancelado &&
    atendimento.situacao !== "orcamento" &&
    atendimento.valor_centavos > 0;
  const tituloId = podeCobrar
    ? await gravarServico(
        "faturar_atendimento_servico",
        oficina,
        { p_atendimento: id },
        demo,
      )
    : null;
  const titulo = tituloId
    ? await consultarTituloFinanceiro(demo, oficina, tituloId)
    : null;
  if (podeCobrar && !titulo) {
    throw new Error("Não foi possível consultar a cobrança. Tente novamente.");
  }
  return {
    os: undefined,
    mostrarDescontoNota: atendimento.mostrar_desconto_nota === true,
    titulo,
    descricao: `OS #${atendimento.numero || id.slice(0, 8)} · ${cliente.nome}`,
    total: atendimento.valor_centavos,
    cancelado: cancelado || atendimento.situacao === "orcamento",
  };
}
