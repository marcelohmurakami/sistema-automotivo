import { jsPDF } from "jspdf";
import { apresentacaoOrcamento } from "../lib/apresentacaoOrcamento.ts";
import {
  corDocumento,
  logoDocumento,
  moedaDocumento,
  quantidadeDocumento,
  type DocumentoCliente,
} from "../lib/documentoCliente.ts";

/** Proposta A4: identidade, itens compactos, fechamento e continuação paginada. */
export function gerarPdfProposta(d: DocumentoCliente, link = "") {
  const pdf = new jsPDF({ compress: true });
  const a = apresentacaoOrcamento(d);
  const x = 15,
    direita = 195,
    largura = 180,
    limite = 276;
  const cor = corDocumento(d.identidade.cor);
  let y = 0;
  const limpar = (s: string) =>
    s.replace(/[\u2011\u2013\u2014\u2212]/g, "-").replace(/\u00a0/g, " ");
  function fonte(t = 9, bold = false, color = "#24332e") {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(t);
    pdf.setTextColor(color);
  }
  function linhas(s: string, w: number, t = 9, bold = false): string[] {
    fonte(t, bold);
    return pdf.splitTextToSize(limpar(s), w) as string[];
  }
  function escrever(
    s: string,
    left: number,
    top: number,
    t = 9,
    bold = false,
    color = "#24332e",
    align: "left" | "right" | "center" = "left",
  ) {
    fonte(t, bold, color);
    pdf.text(limpar(s), left, top, { align });
  }
  function linha(top: number) {
    pdf.setDrawColor("#d8e0dc");
    pdf.setLineWidth(0.2);
    pdf.line(x, top, direita, top);
  }
  function pagina() {
    pdf.addPage();
    pdf.setFillColor(cor);
    pdf.rect(x, 12, largura, 1, "F");
    escrever(
      `ORÇAMENTO #${d.numero}${d.versao ? ` / v${d.versao}` : ""}`,
      x,
      21,
      9,
      true,
    );
    escrever(
      linhas(d.identidade.nome, 85, 8)[0] || "",
      direita,
      21,
      8,
      false,
      "#5c6b65",
      "right",
    );
    y = 31;
  }
  function reservar(h: number) {
    if (y + h > limite) pagina();
  }
  function paragrafo(s: string, t = 9, bold = false, color = "#4d5e54") {
    for (const l of linhas(s, largura, t, bold)) {
      reservar(4.5);
      escrever(l, x, y + 3, t, bold, color);
      y += 4.5;
    }
  }
  pdf.setProperties({
    title: `Orçamento #${d.numero}`,
    author: d.identidade.nome,
    subject: "Proposta de serviços e produtos",
  });
  pdf.setFillColor(cor);
  pdf.rect(x, 13, largura, 1.6, "F");
  const logo = logoDocumento(d.identidade.logo);
  let marcaX = x;
  if (logo) {
    try {
      const p = pdf.getImageProperties(logo),
        scale = Math.min(19 / p.width, 19 / p.height);
      pdf.addImage(logo, x, 22, p.width * scale, p.height * scale);
      marcaX += 24;
    } catch {
      /* Logotipo legado inválido: preservar a identidade textual. */
    }
  }
  let marcaY = 25;
  for (const l of linhas(d.identidade.nome, 132 - marcaX, 17, true)) {
    escrever(l, marcaX, marcaY, 17, true);
    marcaY += 6.8;
  }
  marcaY += 1;
  for (const contato of a.contatosEmpresa) {
    for (const l of linhas(contato, 132 - marcaX, 8)) {
      escrever(l, marcaX, marcaY, 8, false, "#5c6b65");
      marcaY += 3.6;
    }
  }
  escrever("ORÇAMENTO", direita, 25, 9, true, "#43564a", "right");
  escrever(`#${d.numero}`, direita, 36, 27, true, "#24332e", "right");
  if (d.versao != null)
    escrever(`Versão ${d.versao}`, direita, 42, 8, false, "#5c6b65", "right");
  y = Math.max(marcaY + 2, 45);
  linha(y);
  const metas = [{ rotulo: "Situação", valor: a.situacao }, ...a.datas];
  for (let start = 0; start < metas.length; start += 3) {
    const bloco = metas.slice(start, start + 3);
    const textos = bloco.map((i) => linhas(i.valor, 54, 8.5, true));
    const h = Math.max(...textos.map((l) => l.length)) * 3.8 + 9;
    reservar(h);
    bloco.forEach((i, n) => {
      const left = x + n * 62;
      escrever(i.rotulo.toUpperCase(), left, y + 5, 7, false, "#5c6b65");
      textos[n].forEach((l, k) =>
        escrever(
          l,
          left,
          y + 10 + k * 3.8,
          8.5,
          true,
          start === 0 && n === 0 && d.destaque ? "#924b22" : "#24332e",
        ),
      );
    });
    y += h;
  }
  linha(y);
  y += 7;
  const cliente = [d.cliente, ...a.contatosCliente];
  const bem = [...(a.bem ? [a.bem.valor] : []), ...a.detalhesBem];
  const colunas = [
    { label: "CLIENTE", dados: cliente, left: x, w: 86 },
    { label: a.bem?.rotulo.toUpperCase() || "", dados: bem, left: 112, w: 83 },
  ];
  let fimDados = y;
  for (const c of colunas) {
    if (!c.dados.length) continue;
    escrever(c.label, c.left, y, 7.5, true, "#5c6b65");
    let top = y + 6;
    c.dados.forEach((s, n) => {
      const t = n === 0 ? 11 : 8.5;
      for (const l of linhas(s, c.w, t, n === 0)) {
        escrever(l, c.left, top, t, n === 0, n === 0 ? "#24332e" : "#5c6b65");
        top += n === 0 ? 4.8 : 3.8;
      }
    });
    fimDados = Math.max(fimDados, top);
  }
  y = fimDados + 5;
  function cabecalhoTabela(continuacao = false) {
    reservar(20);
    escrever(
      `${a.tituloItens}${continuacao ? " (continuação)" : ""}`,
      x,
      y,
      10.5,
      true,
    );
    if (!continuacao)
      escrever(
        `${d.itens.length} ${d.itens.length === 1 ? "item" : "itens"}`,
        direita,
        y,
        8,
        false,
        "#5c6b65",
        "right",
      );
    y += 4;
    pdf.setFillColor("#eaf0ec");
    pdf.rect(x, y, largura, 8, "F");
    escrever("DESCRIÇÃO", x + 3, y + 5.3, 7.5, true);
    escrever("QTD.", 120, y + 5.3, 7.5, true, "#24332e", "center");
    escrever("UNITÁRIO", 158, y + 5.3, 7.5, true, "#24332e", "right");
    escrever("TOTAL", direita - 3, y + 5.3, 7.5, true, "#24332e", "right");
    y += 8;
  }
  cabecalhoTabela();
  d.itens.forEach((i, n) => {
    const descricao = linhas(i.descricao, 92, 9, true);
    const tipo = `${i.tipo === "service" ? "Serviço" : d.rotuloMateriais || "Peça / produto"}${i.cancelado ? " · Cancelado" : ""}`;
    const tipoLinhas = linhas(tipo, 92, 7.5);
    const numeros = [
      linhas(quantidadeDocumento(i.quantidade), 16, 8.5),
      linhas(moedaDocumento(i.preco_unitario_centavos), 29, 8.5),
      linhas(moedaDocumento(i.total), 30, 9, true),
    ];
    let offset = 0;
    while (offset < descricao.length) {
      const alturaCompleta = Math.max(
        (descricao.length - offset) * 4 + tipoLinhas.length * 3.5 + 4.5,
        12,
        Math.max(...numeros.map((l) => l.length)) * 4 + 8,
      );
      if ((alturaCompleta <= 224 && y + alturaCompleta > limite) || limite - y < 18) {
        pagina();
        cabecalhoTabela(true);
      }
      const capacidade = Math.max(
        1,
        Math.floor((limite - y - 4.5 - tipoLinhas.length * 3.5) / 4),
      );
      const bloco = descricao.slice(offset, offset + capacidade);
      const ultimo = offset + bloco.length >= descricao.length;
      const h = Math.max(
        bloco.length * 4 + (ultimo ? tipoLinhas.length * 3.5 : 0) + 4.5,
        offset === 0
          ? Math.max(12, Math.max(...numeros.map((l) => l.length)) * 4 + 8)
          : 10,
      );
      if (n % 2) {
        pdf.setFillColor("#f5f7f5");
        pdf.rect(x, y, largura, h, "F");
      }
      bloco.forEach((l, k) => escrever(l, x + 3, y + 5 + k * 4, 9, true));
      if (ultimo)
        tipoLinhas.forEach((l, k) =>
          escrever(l, x + 3, y + 5 + bloco.length * 4 + k * 3.5, 7.5, false, "#68766e"),
        );
      if (offset === 0) {
        numeros[0].forEach((l, k) =>
          escrever(l, 120, y + 5 + k * 4, 8.5, false, "#24332e", "center"),
        );
        linhas(i.unidade || "", 16, 7).forEach((l, k) =>
          escrever(
            l,
            120,
            y + 5 + numeros[0].length * 4 + k * 3.5,
            7,
            false,
            "#68766e",
            "center",
          ),
        );
        numeros[1].forEach((l, k) =>
          escrever(l, 158, y + 5 + k * 4, 8.5, false, "#24332e", "right"),
        );
        numeros[2].forEach((l, k) =>
          escrever(l, direita - 3, y + 5 + k * 4, 9, true, "#24332e", "right"),
        );
      }
      y += h;
      linha(y);
      offset += bloco.length;
    }
  });
  if (!d.itens.length) {
    y += 7;
    paragrafo("Nenhum item incluído neste orçamento.");
  }
  y += 7;
  reservar(40);
  const topoResumo = y;
  escrever("Subtotal", 119, y + 4, 9);
  escrever(
    moedaDocumento(d.subtotal),
    direita - 3,
    y + 4,
    9,
    false,
    "#24332e",
    "right",
  );
  y += 8;
  if (d.mostrarDesconto !== false && d.desconto > 0) {
    escrever("Desconto", 119, y + 3, 9);
    escrever(
      `- ${moedaDocumento(d.desconto)}`,
      direita - 3,
      y + 3,
      9,
      false,
      "#24332e",
      "right",
    );
    y += 7;
  }
  pdf.setFillColor("#eaf0ec");
  pdf.rect(116, y, 79, 22, "F");
  pdf.setFillColor(cor);
  pdf.rect(116, y, 0.9, 22, "F");
  escrever("Total do orçamento", 121, y + 6, 8.5);
  // Valores muito grandes continuam dentro da caixa, sem mudar o valor da proposta.
  const total = moedaDocumento(d.total);
  let tamanhoTotal = 21;
  fonte(tamanhoTotal, true);
  while (pdf.getTextWidth(limpar(total)) > 69 && tamanhoTotal > 10) {
    tamanhoTotal--;
    fonte(tamanhoTotal, true);
  }
  escrever(total, 121, y + 16, tamanhoTotal, true);
  y += 26;
  const fimResumo = y;
  let condicaoY = topoResumo + 4;
  if (a.condicoes.length) {
    escrever("Condições de pagamento", x, condicaoY, 9, true);
    condicaoY += 6;
    for (const c of a.condicoes) {
      const conteudo = [...linhas(c.rotulo, 89, 7.5), ...linhas(c.valor, 89, 8.5)];
      const h = conteudo.length * 3.8 + 3;
      if (condicaoY + h > limite) {
        y = Math.max(condicaoY, fimResumo);
        pagina();
        condicaoY = y;
      }
      const labels = linhas(c.rotulo, 89, 7.5).length;
      conteudo.forEach((l, k) =>
        escrever(
          l,
          x,
          condicaoY + k * 3.8,
          k < labels ? 7.5 : 8.5,
          false,
          k < labels ? "#68766e" : "#24332e",
        ),
      );
      condicaoY += h;
    }
  }
  y = Math.max(y, condicaoY) + 3;
  for (const [indice, s] of d.secoes.entries()) {
    // Evita uma última folha contendo apenas a assinatura.
    if (indice === d.secoes.length - 1) {
      const fechamento =
        17 +
        linhas(d.assinatura, 110, 8).length * 3.6 +
        (d.identidade.rodape
          ? linhas(d.identidade.rodape, largura, 8).length * 4.5 + 3
          : 0) +
        (d.confirmacao ? linhas(d.confirmacao, largura, 9, true).length * 4.5 + 7 : 0) +
        (/^https?:\/\//i.test(link) ? 12 : 0);
      const secao =
        8 +
        (linhas(s.titulo, largura, 9, true).length +
          linhas(s.texto, largura, 8.5).length) *
          4.5;
      if (secao + fechamento < 220) reservar(secao + fechamento);
    }
    reservar(17);
    linha(y);
    y += 5;
    paragrafo(s.titulo, 9, true, "#24332e");
    paragrafo(s.texto, 8.5);
    y += 3;
  }
  if (d.confirmacao) {
    reservar(14);
    y += 3;
    paragrafo(d.confirmacao, 9, true, "#2d5940");
    y += 4;
  }
  if (d.identidade.rodape) {
    reservar(9);
    paragrafo(d.identidade.rodape, 8);
    y += 3;
  }
  if (/^https?:\/\//i.test(link)) {
    reservar(12);
    fonte(9, true, "#244336");
    pdf.textWithLink("Consultar e responder ao orçamento online", x, y + 4, {
      url: link,
    });
    y += 12;
  }
  const assinatura = linhas(d.assinatura, 110, 8);
  reservar(17 + assinatura.length * 3.6);
  y += 12;
  pdf.setDrawColor("#88998f");
  pdf.line(x, y, 126, y);
  assinatura.forEach((l, k) => escrever(l, x, y + 5 + k * 3.6, 8, false, "#5c6b65"));
  escrever("Data: ____/____/________", direita, y + 5, 8, false, "#5c6b65", "right");
  const totalPaginas = pdf.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    pdf.setPage(p);
    linha(283);
    const aviso = linhas(d.aviso, 139, 7);
    aviso.forEach((l, k) => escrever(l, x, 287 + k * 3, 7, false, "#5c6b65"));
    escrever(`${p}/${totalPaginas}`, direita, 287, 7.5, false, "#5c6b65", "right");
  }
  return pdf;
}
