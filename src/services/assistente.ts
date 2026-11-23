import { supabase } from "../lib/supabase";
import { rpc } from "../lib/rpc";
import { comPrazoAssistente } from "../lib/prazoAssistente";
import type {
  ContextoAssistente,
  MensagemAssistente,
  RespostaAssistente,
  ResultadoAssistente,
} from "../lib/assistente";

export async function pedirAssistente(
  pedido: {
    oficina: string;
    sessao: string;
    chave: string;
    texto: string;
    contexto: ContextoAssistente;
    historico: MensagemAssistente[];
  },
  audio: Blob | undefined,
  signal: AbortSignal,
): Promise<RespostaAssistente> {
  if (!supabase) throw Error("Conexão indisponível.");
  let body: typeof pedido | FormData = pedido;
  if (audio) {
    body = new FormData();
    body.append("pedido", JSON.stringify(pedido));
    body.append("audio", audio, "pedido");
  }
  const functions = supabase.functions;
  const { data, error } = await comPrazoAssistente(
    (sinal) => functions.invoke("assistente-operacional", { body, signal: sinal }),
    signal,
  );
  if (error) {
    let mensagem =
      "Não foi possível falar com o assistente. Confira sua conexão e tente novamente.";
    if (error.context instanceof Response) {
      try {
        const detalhe = await error.context.json();
        if (typeof detalhe.erro === "string") mensagem = detalhe.erro;
      } catch {
        /* Resposta do gateway pode não ser JSON. */
      }
    }
    throw Error(mensagem);
  }
  if (data?.erro) throw Error(data.erro);
  if (typeof data?.texto !== "string" || !Array.isArray(data.consultas))
    throw Error("Resposta incompleta. Envie novamente seu pedido.");
  return data;
}
export const confirmarAssistente = (oficina: string, proposta: string) =>
  rpc<ResultadoAssistente>("confirmar_assistente", {
    p_oficina: oficina,
    p_proposta: proposta,
  });
export const cancelarAssistente = (oficina: string, sessao: string) =>
  rpc<void>("cancelar_proposta_assistente", { p_oficina: oficina, p_sessao: sessao });

// Atualiza os saldos antes de exportar, inclusive se houve pagamento em outra tela.
export async function atualizarContasAssistente(oficina: string, cliente: string) {
  return rpc<import("../lib/assistente").ConsultaAssistente>("consultar_assistente", {
    p_oficina: oficina,
    p_tipo: "contas",
    p_cliente: cliente,
  });
}
