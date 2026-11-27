import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { DocumentoLaudoOS } from "../components/DocumentoLaudoOS";
import { laudoDaOS, laudoDoAtendimento, type LaudoOS } from "../lib/laudoOS";
import { consultarIdentidade } from "./documentos";
import { consultarOS } from "./ordensServico";
import { consultarDetalhesAtendimento } from "./servicosCompletos";
import estilos from "../components/DocumentoLaudoOS.css?inline";

export async function prepararImpressaoLaudoOS(janela: Window, dados: LaudoOS) {
  if (janela.closed)
    throw new Error(
      "A janela do laudo foi fechada. Clique em Imprimir laudo novamente.",
    );
  janela.opener = null;
  const d = janela.document;
  d.open();
  d.write(
    '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>',
  );
  d.close();
  d.title = `Laudo técnico - OS ${dados.numero}`;
  const css = d.createElement("style");
  css.textContent =
    estilos +
    `body{margin:0;background:#e9eeea}.laudo-os-barra{box-sizing:border-box;max-width:210mm;margin:0 auto;padding:16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;font:13px/1.5 Arial,sans-serif;color:#23332e}.laudo-os-barra button{border:0;border-radius:8px;background:#244336;color:white;padding:12px 18px;min-height:44px;font:600 14px Arial,sans-serif;cursor:pointer}.laudo-os-barra p{margin:0}@media print{body{background:white}.laudo-os-barra{display:none!important}}`;
  d.head.append(css);
  const nav = d.createElement("nav");
  nav.className = "laudo-os-barra";
  nav.setAttribute("aria-label", "Ações do laudo");
  const imprimir = d.createElement("button");
  imprimir.textContent = "Imprimir / salvar PDF";
  imprimir.onclick = () => {
    janela.focus();
    janela.print();
  };
  const ajuda = d.createElement("p");
  ajuda.textContent =
    "Confira os dados. Para guardar o arquivo, escolha Salvar como PDF na impressão.";
  nav.append(imprimir, ajuda);
  const main = d.createElement("main");
  d.body.append(nav, main);
  const root = createRoot(main);
  flushSync(() => root.render(<DocumentoLaudoOS documento={dados} />));
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

export async function imprimirLaudoOS(
  janela: Window,
  demo: boolean,
  oficina: string,
  id: string,
  tipo: "os" | "atendimento",
) {
  const [origem, empresa] = await Promise.all([
    tipo === "os"
      ? consultarOS(demo, oficina, id).then((os) => ({ tipo: "os" as const, os }))
      : consultarDetalhesAtendimento(demo, oficina, id).then((atendimento) => ({
          tipo: "atendimento" as const,
          atendimento,
        })),
    consultarIdentidade(demo, oficina),
  ]);
  await prepararImpressaoLaudoOS(
    janela,
    origem.tipo === "os"
      ? laudoDaOS(origem.os, empresa)
      : laudoDoAtendimento(origem.atendimento, empresa),
  );
}
