import type { ItemCatalogo } from "../lib/catalogo";
import { dinheiro } from "../lib/formatacao";
import estilos from "../components/catalogo/TabelaPrecosImpressao.css?inline";

export type ServicoTabelaPrecos = Pick<
  ItemCatalogo,
  "id" | "descricao" | "preco_padrao_centavos"
>;

export function ordenarTabelaPrecos(itens: ServicoTabelaPrecos[]) {
  return [...itens].sort((a, b) =>
    a.descricao.localeCompare(b.descricao, "pt-BR", { numeric: true }),
  );
}

/** Abre a impressão no clique e insere os nomes como texto, nunca como HTML. */
export async function imprimirTabelaServicos(
  empresa: string,
  itens: ServicoTabelaPrecos[],
) {
  if (!itens.length) throw new Error("Selecione pelo menos um serviço.");
  const janela = window.open("", "_blank");
  if (!janela) throw new Error("A janela de impressão foi bloqueada.");
  janela.opener = null;
  const doc = janela.document;
  doc.open();
  doc.write(
    '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>',
  );
  doc.close();
  doc.title = `Tabela de preços — ${empresa}`;
  const style = doc.createElement("style");
  style.textContent = estilos;
  doc.head.append(style);
  function elemento<K extends keyof HTMLElementTagNameMap>(nome: K, texto = "") {
    const e = doc.createElement(nome);
    e.textContent = texto;
    return e;
  }
  const barra = elemento("nav");
  barra.className = "tabela-precos-acoes";
  const botao = elemento("button", "Imprimir / Salvar PDF");
  botao.onclick = () => {
    janela.focus();
    janela.print();
  };
  barra.append(botao);
  const folha = elemento("main");
  folha.className = "tabela-precos-folha";
  const cabecalho = elemento("header");
  cabecalho.append(elemento("h1", empresa), elemento("h2", "Serviços e preços"));
  const data = new Intl.DateTimeFormat("pt-BR").format(new Date());
  cabecalho.append(elemento("p", `Tabela gerada em ${data}`));
  const tabela = elemento("table");
  tabela.setAttribute("aria-label", "Serviços e seus respectivos preços");
  const head = elemento("thead"),
    linha = elemento("tr");
  for (const nome of ["Serviço", "Preço"]) {
    const celula = elemento("th", nome);
    celula.scope = "col";
    linha.append(celula);
  }
  head.append(linha);
  const corpo = elemento("tbody");
  for (const item of ordenarTabelaPrecos(itens)) {
    const linha = elemento("tr");
    linha.append(
      elemento("td", item.descricao),
      elemento("td", dinheiro(item.preco_padrao_centavos)),
    );
    corpo.append(linha);
  }
  tabela.append(head, corpo);
  folha.append(cabecalho, tabela);
  doc.body.append(barra, folha);
  await doc.fonts.ready;
  if (!janela.closed) {
    janela.focus();
    janela.print();
  }
}
