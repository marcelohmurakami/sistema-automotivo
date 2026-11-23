import { documentoAtendimento } from "../lib/documentoAtendimento";
import { consultarIdentidade } from "./documentos";
import { consultarDetalhesAtendimento } from "./servicosCompletos";
import { abrirJanelaNotaOS } from "./impressaoNotaOS";

/** Usa a mesma impressão das OS, com a identificação específica do atendimento. */
export async function imprimirNotaAtendimento(
  demo: boolean,
  oficina: string,
  id: string,
  janela: Window | null = abrirJanelaNotaOS(),
) {
  if (!janela || janela.closed)
    throw new Error(
      "A impressão foi bloqueada ou fechada. Use Imprimir nota ou Baixar PDF.",
    );
  try {
    const [d, empresa, { imprimirDocumentoCliente }] = await Promise.all([
      consultarDetalhesAtendimento(demo, oficina, id),
      consultarIdentidade(demo, oficina),
      import("./impressaoDocumentoCliente"),
    ]);
    const modo =
      d.atendimento.situacao === "orcamento" &&
      d.atendimento.dados.documento !== "ordem"
        ? "orcamento"
        : "atendimento";
    await imprimirDocumentoCliente(janela, documentoAtendimento(d, empresa, modo));
  } catch (e) {
    janela.close();
    throw e;
  }
}
