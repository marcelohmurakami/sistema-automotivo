import { documentoDaOS } from "../lib/documentoCliente";
import { consultarIdentidade } from "./documentos";
import { consultarOS } from "./ordensServico";

export function abrirJanelaNotaOS() {
  const janela = window.open("", "_blank");
  if (janela) {
    janela.opener = null;
    janela.document.title = "Preparando nota da OS…";
  }
  return janela;
}

export async function imprimirNotaOS(
  demo: boolean,
  oficina: string,
  osId: string,
  janela: Window | null = abrirJanelaNotaOS(),
) {
  if (!janela || janela.closed)
    throw new Error(
      "A impressão foi bloqueada ou fechada. Use Imprimir nota da OS ou Visualizar / PDF.",
    );
  try {
    const [os, identidade, { imprimirDocumentoCliente }] = await Promise.all([
      consultarOS(demo, oficina, osId),
      consultarIdentidade(demo, oficina),
      import("./impressaoDocumentoCliente"),
    ]);
    await imprimirDocumentoCliente(janela, documentoDaOS(os, identidade));
  } catch (e) {
    janela.close();
    throw e;
  }
}
