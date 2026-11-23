import { jsPDF } from "jspdf";
import { gerarPdfOrdemServico } from "./pdfOrdemServico.ts";
import { gerarPdfProposta } from "./pdfProposta.ts";
import {
  corDocumento,
  logoDocumento,
  moedaDocumento,
  quantidadeDocumento,
  type DocumentoCliente,
} from "../lib/documentoCliente.ts";

/** Mesmo conteúdo da prévia, com paginação A4 e cabeçalhos repetidos. */
export function gerarPdfCliente(d: DocumentoCliente, link = "") {
  if (d.tipo === "orcamento" && !d.comprovante) return gerarPdfProposta(d, link);
  if (d.tipo === "os" && !d.somenteRegistro) return gerarPdfOrdemServico(d);
  const pdf = new jsPDF({ compress: true });
  const margem = 16,
    direita = 194,
    limite = 273,
    largura = direita - margem;
  const cor = corDocumento(d.identidade.cor);
  let y = 0;
  const limpar = (s: string) =>
    s.replace(/[\u2011\u2013\u2014]/g, "-").replace(/\u00a0/g, " ");
  const fonte = (tam = 10, negrito = false) => {
    pdf.setFont("helvetica", negrito ? "bold" : "normal");
    pdf.setFontSize(tam);
    pdf.setTextColor(35, 45, 43);
  };
  function novaPagina() {
    if (pdf.getNumberOfPages() > 1 || y) pdf.addPage();
    pdf.setFillColor(cor);
    pdf.rect(margem, 12, largura, 1.3, "F");
    fonte(9, true);
    pdf.text(
      `${d.titulo} #${d.numero}${d.versao ? ` / v${d.versao}` : ""}`,
      margem,
      21,
    );
    const nome = pdf.splitTextToSize(limpar(d.identidade.nome), 85) as string[];
    fonte(8);
    pdf.text(nome[0] || "Oficina", direita, 21, { align: "right" });
    y = 30;
  }
  function reservar(altura: number) {
    if (y + altura > limite) novaPagina();
  }
  function texto(conteudo: string, tamanho = 10, negrito = false, espaco = 2) {
    fonte(tamanho, negrito);
    const linhas = pdf.splitTextToSize(limpar(conteudo), largura) as string[];
    for (const linha of linhas) {
      reservar(6);
      fonte(tamanho, negrito);
      pdf.text(linha, margem, y);
      y += 5;
    }
    y += espaco;
  }
  pdf.setProperties({
    title: `${d.titulo} #${d.numero}`,
    author: d.identidade.nome,
    subject: "Documento para o cliente",
  });
  pdf.setFillColor(cor);
  pdf.rect(margem, 13, largura, 2, "F");
  let xMarca = margem;
  const logo = logoDocumento(d.identidade.logo);
  if (logo) {
    try {
      const p = pdf.getImageProperties(logo),
        escala = Math.min(32 / p.width, 24 / p.height);
      pdf.addImage(logo, margem, 23, p.width * escala, p.height * escala);
      xMarca += 39;
    } catch {
      /* A identidade textual mantém documentos antigos legíveis. */
    }
  }
  fonte(15, true);
  const marca = pdf.splitTextToSize(
    limpar(d.identidade.nome),
    direita - xMarca,
  ) as string[];
  y = 28;
  for (const l of marca) {
    pdf.text(l, xMarca, y);
    y += 7;
  }
  fonte(9);
  const contato = [
    d.identidade.telefone || d.identidade.telefone_e164,
    ...Object.values(d.identidade.endereco || {}).filter(Boolean),
  ]
    .filter(Boolean)
    .join(" · ");
  for (const l of pdf.splitTextToSize(limpar(contato), direita - xMarca) as string[]) {
    pdf.text(l, xMarca, y);
    y += 4.5;
  }
  y = Math.max(y + 8, 52);
  texto(
    `${d.titulo.toUpperCase()} #${d.numero}${d.versao ? `  /  VERSÃO ${d.versao}` : ""}`,
    18,
    true,
    5,
  );
  fonte(10, true);
  if (d.destaque) pdf.setTextColor(161, 48, 38);
  pdf.text(d.situacao, margem, y);
  y += 10;
  const dados = [
    {
      rotulo: "Cliente",
      valor: [d.cliente, d.telefoneCliente].filter(Boolean).join("\n"),
    },
    {
      rotulo: d.bem?.rotulo || "Veículo",
      valor:
        d.bem?.valor ||
        `${d.veiculo}\n${d.retifica ? "Motor: " + (d.motor || "Não informado") : "Placa: " + d.placa}`,
    },
    ...d.informacoes,
  ];
  for (let n = 0; n < dados.length; n += 2) {
    fonte(9);
    const blocos = dados.slice(n, n + 2).map((i) => ({
      ...i,
      linhas: pdf.splitTextToSize(limpar(i.valor), 82) as string[],
    }));
    const altura = Math.max(...blocos.map((b) => b.linhas.length)) * 4 + 9;
    reservar(altura);
    blocos.forEach((b, coluna) => {
      const x = margem + coluna * 93;
      fonte(7, true);
      pdf.setTextColor(102, 117, 107);
      pdf.text(b.rotulo.toUpperCase(), x, y);
      fonte(9);
      pdf.text(b.linhas, x, y + 5, { lineHeightFactor: 1.26 });
    });
    y += altura;
  }
  y += 4;
  function cabecalhoTabela() {
    reservar(19);
    pdf.setFillColor(239, 243, 240);
    pdf.rect(margem, y - 4, largura, 9, "F");
    fonte(8, true);
    pdf.text("DESCRIÇÃO / TIPO", margem + 2, y + 1);
    pdf.text("QTD.", 120, y + 1, { align: "right" });
    pdf.text("UNITÁRIO", 155, y + 1, { align: "right" });
    pdf.text("TOTAL", direita - 2, y + 1, { align: "right" });
    y += 12;
  }
  if (!d.somenteRegistro) {
    cabecalhoTabela();
    if (!d.itens.length) texto("Nenhum item lançado neste atendimento.", 10);
    for (const i of d.itens) {
      fonte(9);
      const descricao = pdf.splitTextToSize(
        limpar(`${i.descricao}${i.cancelado ? " (cancelado)" : ""}`),
        84,
      ) as string[];
      const altura = Math.max(16, descricao.length * 4.5 + 9);
      if (y + altura > limite) {
        novaPagina();
        cabecalhoTabela();
      }
      fonte(9);
      pdf.text(descricao, margem + 2, y, { lineHeightFactor: 1.42 });
      pdf.text(`${quantidadeDocumento(i.quantidade)} ${i.unidade}`, 120, y, {
        align: "right",
      });
      pdf.text(moedaDocumento(i.preco_unitario_centavos), 155, y, {
        align: "right",
      });
      fonte(9, true);
      pdf.text(moedaDocumento(i.total), direita - 2, y, { align: "right" });
      fonte(8);
      pdf.setTextColor(107, 120, 110);
      pdf.text(
        i.tipo === "service" ? "Serviço" : "Peça / produto",
        margem + 2,
        y + descricao.length * 4.5,
      );
      y += altura;
      pdf.setDrawColor(224, 231, 226);
      pdf.line(margem, y - 5, direita, y - 5);
    }
    reservar(40);
    y += 3;
    for (const [rotulo, valor] of [
      ["Subtotal", d.subtotal],
      ["Desconto", -d.desconto],
    ] as const) {
      if (rotulo === "Desconto" && d.mostrarDesconto === false) continue;
      fonte(10);
      pdf.text(rotulo, 118, y);
      pdf.text(moedaDocumento(valor), direita - 2, y, { align: "right" });
      y += 7;
    }
    pdf.setFillColor(239, 243, 240);
    pdf.roundedRect(114, y - 4, 80, 13, 2, 2, "F");
    fonte(12, true);
    pdf.text("TOTAL", 118, y + 4);
    pdf.text(moedaDocumento(d.total), direita - 3, y + 4, { align: "right" });
    y += 20;
  }
  for (const s of d.secoes) {
    reservar(18);
    texto(s.titulo, 11, true);
    texto(s.texto, 10, false, 3);
  }
  if (d.confirmacao) {
    reservar(18);
    texto("Confirmação registrada", 11, true);
    texto(d.confirmacao);
  }
  if (link && /^https?:\/\//i.test(link)) {
    reservar(14);
    fonte(9, true);
    pdf.setTextColor(36, 90, 62);
    pdf.textWithLink("CONSULTAR E RESPONDER AO ORÇAMENTO", margem, y, {
      url: link,
    });
    y += 12;
  }
  if (d.identidade.rodape) {
    reservar(16);
    texto(d.identidade.rodape, 9, false, 3);
  }
  if (d.assinatura) {
    reservar(15);
    y += 6;
    pdf.setDrawColor(147, 158, 150);
    pdf.line(margem, y, 120, y);
    pdf.line(148, y, direita, y);
    fonte(8);
    pdf.text(d.assinatura, margem, y + 5);
    pdf.text("Data: ____/____/________", 148, y + 5);
  }
  for (let p = 1; p <= pdf.getNumberOfPages(); p++) {
    pdf.setPage(p);
    pdf.setDrawColor(219, 226, 222);
    pdf.line(margem, 281, direita, 281);
    fonte(7);
    pdf.setTextColor(102, 115, 106);
    pdf.text(d.aviso, margem, 286);
    pdf.text(`${p} / ${pdf.getNumberOfPages()}`, direita, 286, {
      align: "right",
    });
  }
  return pdf;
}
