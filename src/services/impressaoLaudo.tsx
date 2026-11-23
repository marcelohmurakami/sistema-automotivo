import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { DocumentoLaudo, type DocumentoLaudoDados } from "../components/DocumentoLaudo";
import { numeroLaudo } from "../lib/laudos";
import estilos from "../components/DocumentoLaudo.css?inline";

export async function imprimirLaudo(janela: Window, dados: DocumentoLaudoDados) {
  janela.opener = null;
  const d = janela.document;
  d.open();
  d.write(
    '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>',
  );
  d.close();
  d.title = `${numeroLaudo(dados.numero)} · ${dados.dados.cliente}`;
  const css = d.createElement("style");
  css.textContent =
    estilos +
    "body{margin:0;background:#e8ece8;font-family:Arial,sans-serif}.acoes-impressao-laudo{max-width:210mm;margin:16px auto;display:flex;align-items:center;gap:12px;padding:12px;flex-wrap:wrap}.acoes-impressao-laudo button{background:#244336;color:white;border:0;border-radius:8px;padding:12px 18px;cursor:pointer}.acoes-impressao-laudo p{font-size:13px;margin:0}@media print{body{background:white}.acoes-impressao-laudo{display:none!important}}";
  d.head.append(css);
  const nav = d.createElement("nav");
  nav.className = "acoes-impressao-laudo";
  const btn = d.createElement("button");
  btn.textContent = "Imprimir / salvar PDF";
  btn.onclick = () => {
    janela.focus();
    janela.print();
  };
  const ajuda = d.createElement("p");
  ajuda.textContent =
    "Para guardar o arquivo, escolha Salvar como PDF na janela de impressão.";
  nav.append(btn, ajuda);
  const main = d.createElement("main");
  d.body.append(nav, main);
  const root = createRoot(main);
  flushSync(() => root.render(<DocumentoLaudo documento={dados} />));
  janela.addEventListener("pagehide", () => root.unmount(), { once: true });
  await Promise.all(
    Array.from(main.querySelectorAll("img"), (img) =>
      img.decode().catch(() => undefined),
    ),
  );
  await d.fonts.ready;
  if (!janela.closed) {
    janela.focus();
    janela.print();
  }
}
