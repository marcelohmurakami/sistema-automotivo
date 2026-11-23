import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { DocumentoCliente } from "../components/DocumentoCliente";
import type { DocumentoCliente as Documento } from "../lib/documentoCliente";
import estilos from "../pages/CentralDocumentos.css?inline";

/** Imprime a nota pela API do navegador, sem depender da execução de ações do leitor de PDF. */
export async function imprimirDocumentoCliente(janela: Window, documento: Documento) {
  const doc = janela.document;
  doc.open();
  doc.write(
    '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>',
  );
  doc.close();
  doc.title = `${documento.titulo} #${documento.numero}`;
  const style = doc.createElement("style");
  style.textContent =
    estilos +
    `
    * { box-sizing: border-box; }
    body { margin: 0; background: #edf0ed; font-family: Arial, sans-serif; color: #202820; }
    .nota-acoes { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 16px; max-width: 210mm; margin: auto; }
    .nota-acoes button { padding: 12px 18px; min-height: 44px; border: 1px solid #244336; border-radius: 8px; background: #244336; color: white; font: inherit; cursor: pointer; }
    .nota-acoes p { margin: 0; font-size: 13px; flex-basis: 100%; }
    .folha-cliente { max-width: 210mm; margin: 0 auto 24px; }
    @media print { body { background: white; } .nota-acoes { display: none !important; } .folha-cliente { max-width: none; margin: 0; } }
  `;
  doc.head.append(style);
  const barra = doc.createElement("nav");
  barra.className = "nota-acoes";
  barra.setAttribute("aria-label", "Ações da impressão");
  const imprimir = doc.createElement("button");
  imprimir.textContent = "Imprimir";
  imprimir.onclick = () => {
    janela.focus();
    janela.print();
  };
  const baixar = doc.createElement("button");
  baixar.textContent = "Baixar PDF";
  const aviso = doc.createElement("p");
  aviso.setAttribute("role", "status");
  aviso.textContent =
    "A impressão abrirá automaticamente. Para abrir novamente, toque em Imprimir.";
  baixar.onclick = async () => {
    baixar.disabled = true;
    try {
      const { gerarPdfCliente } = await import("./pdfCliente");
      gerarPdfCliente(documento).save(documento.arquivo);
    } catch {
      aviso.textContent =
        "Não foi possível baixar o PDF. Tente novamente ou escolha Salvar como PDF na impressão.";
    } finally {
      baixar.disabled = false;
    }
  };
  barra.append(imprimir, baixar, aviso);
  const conteudo = doc.createElement("main");
  doc.body.append(barra, conteudo);
  const root = createRoot(conteudo);
  flushSync(() => root.render(<DocumentoCliente documento={documento} />));
  janela.addEventListener("pagehide", () => root.unmount(), { once: true });
  await Promise.all(
    Array.from(conteudo.querySelectorAll("img"), (img) =>
      img.decode().catch(() => undefined),
    ),
  );
  await doc.fonts.ready;
  if (janela.closed) return;
  janela.focus();
  janela.print();
}
