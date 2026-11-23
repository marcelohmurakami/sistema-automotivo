import { dataDocumento } from "../lib/documentoCliente.ts";
import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import {
  telefoneDocumento,
  camposGradeOS,
  logoDocumento,
  moedaDocumento,
  quantidadeDocumento,
  type DocumentoCliente,
} from "../lib/documentoCliente.ts";

/** A4 compacto, com paginação por conteúdo e sem reduzir a fonte conforme a OS cresce. */
export function gerarPdfOrdemServico(d: DocumentoCliente, comprimir = true) {
  const pdf = new jsPDF({ compress: comprimir });
  const orcamento = d.tipo === "orcamento";
  const rotuloDocumento = orcamento ? "ORÇAMENTO" : "ORDEM DE SERVIÇO";
  const sigla = orcamento ? "Orçamento" : "OS";
  const x = 14,
    right = 196,
    width = right - x,
    bottom = 275;
  const cor = "#202020";
  const rgb = [1, 3, 5].map((i) => parseInt(cor.slice(i, i + 2), 16));
  const textoCabecalho =
    (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 155 ? "#20392d" : "#ffffff";

  const limpar = (s: string) =>
    s.replace(/[\u2011\u2013\u2014]/g, "-").replace(/\u00a0/g, " ");
  let y = 0;
  function fonte(size = 9, bold = false, color = "#202020") {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(size * 1.2);
    pdf.setTextColor(color);
  }
  function linhas(s: string, w: number, size = 9, bold = false) {
    fonte(size, bold);
    return pdf.splitTextToSize(limpar(s || "-"), w) as string[];
  }
  function pagina() {
    pdf.addPage();
    fonte(9, true);
    pdf.text(`${rotuloDocumento} #${d.numero}`, x, 17);
    fonte(8);
    pdf.text(linhas(d.identidade.nome, 85, 8)[0], right, 17, {
      align: "right",
    });
    pdf.setDrawColor(cor);
    pdf.setLineWidth(0.6);
    pdf.line(x, 21, right, 21);
    y = 26;
  }
  function reservar(h: number) {
    if (y + h > bottom) pagina();
  }
  function paragrafo(s: string, size = 8.5) {
    for (const l of linhas(s, width, size)) {
      reservar(5);
      fonte(size, false, "#292929");
      pdf.text(l, x, y + 3);
      y += 5;
    }
  }
  function secao(titulo: string, texto: string) {
    // Rótulo e texto lado a lado economizam espaço sem omitir as orientações.
    const tituloLinhas = linhas(titulo, 38, 8, true);
    const textoLinhas = linhas(texto, width - 44, 8.5);
    const altura = Math.max(tituloLinhas.length, textoLinhas.length) * 4.6 + 2;
    reservar(Math.min(altura, 35));
    fonte(8, true);
    pdf.text(tituloLinhas, x, y + 3, { lineHeightFactor: 1.35 });
    for (const l of textoLinhas) {
      reservar(5);
      fonte(8.5, false, "#292929");
      pdf.text(l, x + 44, y + 3);
      y += 4.6;
    }
    y += Math.max(0, tituloLinhas.length - textoLinhas.length) * 4.6 + 2;
  }
  pdf.setProperties({
    title: `${d.titulo} #${d.numero}`,
    author: d.identidade.nome,
    subject: orcamento ? "Orçamento de serviços" : "Comprovante de atendimento",
  });
  pdf.setFillColor(cor);
  pdf.rect(x, 12, width, 1.2, "F");
  const logo = logoDocumento(d.identidade.logo);
  const imagemPix = !d.destaque ? logoDocumento(d.identidade.pix_qr) : undefined;
  const temPix = !d.destaque && (!!d.pixCopiaCola || !!imagemPix);
  const left = logo ? 48 : x,
    end = temPix ? 151 : right;
  const nome = linhas(d.identidade.nome, end - left, 14, true);
  const contato = [
    d.identidade.documento ? "CNPJ/CPF: " + d.identidade.documento : "",
    telefoneDocumento(d.identidade.telefone || d.identidade.telefone_e164),
    Object.values(d.identidade.endereco || {})
      .filter(Boolean)
      .join(" · "),
  ]
    .filter(Boolean)
    .flatMap((t) => linhas(t, end - left, 7.5));
  const alturaTexto = nome.length * 7 + contato.length * 4.5,
    altura = Math.max(44, alturaTexto + 8),
    meio = 17 + altura / 2;
  if (logo) {
    try {
      const p = pdf.getImageProperties(logo),
        k = Math.min(28 / p.width, 26 / p.height);
      pdf.addImage(
        logo,
        x + (28 - p.width * k) / 2,
        meio - (p.height * k) / 2,
        p.width * k,
        p.height * k,
      );
    } catch {
      /* Logo inválida: usa o nome. */
    }
  }
  let ty = meio - alturaTexto / 2 + 5;
  fonte(14, true);
  for (const l of nome) {
    pdf.text(l, left, ty);
    ty += 7;
  }
  fonte(7.5, false, "#292929");
  for (const l of contato) {
    pdf.text(l, left, ty);
    ty += 4.5;
  }
  if (temPix) {
    const topo = meio - 21;
    fonte(7, true);
    pdf.text("PAGUE VIA PIX", right - 19, topo, { align: "center" });
    if (d.pixCopiaCola) {
      const qr = QRCode.create(d.pixCopiaCola, { errorCorrectionLevel: "M" }),
        cell = 38 / (qr.modules.size + 8);
      pdf.setFillColor(0, 0, 0);
      for (let r = 0; r < qr.modules.size; r++)
        for (let c = 0; c < qr.modules.size; c++)
          if (qr.modules.get(r, c))
            pdf.rect(
              right - 38 + (c + 4) * cell,
              topo + 3 + (r + 4) * cell,
              cell,
              cell,
              "F",
            );
    } else if (imagemPix) {
      try {
        const p = pdf.getImageProperties(imagemPix),
          k = Math.min(38 / p.width, 38 / p.height);
        pdf.addImage(
          imagemPix,
          right - 38 + (38 - p.width * k) / 2,
          topo + 3 + (38 - p.height * k) / 2,
          p.width * k,
          p.height * k,
        );
      } catch {
        /* QR legado inválido não interrompe a emissão. */
      }
    }
  }
  y = 17 + altura + 4;
  pdf.setDrawColor("#777777");
  pdf.line(x, y, right, y);
  y += 8;
  fonte(13, true);
  pdf.text(`${rotuloDocumento}${orcamento ? "" : " [OS]"} Nº ${d.numero}`, 105, y, {
    align: "center",
  });
  y += 6;

  // Métricas da Helvetica em mm: centraliza a área dos glifos, não as baselines.
  const pontosEmMm = 25.4 / 72;
  const alturaRotulo = 6.8 * 1.2 * pontosEmMm * 0.718;
  const subidaValor = 8.5 * 1.2 * pontosEmMm * 0.718;
  const descidaValor = 8.5 * 1.2 * pontosEmMm * 0.207;
  const entrelinhas = 8.5 * 1.2 * pontosEmMm * 1.25;
  const espacoRotulo = 2;
  const alturaBloco = (n: number) =>
    alturaRotulo + espacoRotulo + subidaValor + descidaValor + (n - 1) * entrelinhas;
  const dados = camposGradeOS(d),
    passo = width / 2;
  for (let n = 0; n < dados.length; n += 2) {
    const blocos = dados.slice(n, n + 2).map((b) => ({
      rotulo: b.rotulo.toUpperCase(),
      valores: b.valor
        .split("\n")
        .flatMap((texto, indice) =>
          linhas(texto, passo - 6, 8.5, n === 0 && b === dados[0] && indice === 0).map(
            (valor) => ({ valor, negrito: n === 0 && b === dados[0] && indice === 0 }),
          ),
        ),
    }));
    const h = Math.max(
      13,
      Math.max(...blocos.map((b) => alturaBloco(b.valores.length))) + 4,
    );
    reservar(h);
    pdf.setFillColor("#fafafa");
    pdf.setDrawColor("#888888");
    pdf.setLineWidth(0.18);
    pdf.rect(x, y, width, h, "FD");
    for (let col = 0; col < 2; col++) {
      const bx = x + col * passo;
      if (col) pdf.line(bx, y, bx, y + h);
      const b = blocos[col];
      if (!b) continue;
      const topoTexto = y + (h - alturaBloco(b.valores.length)) / 2;
      fonte(6.8, true, "#333333");
      pdf.text(b.rotulo, bx + 3, topoTexto + alturaRotulo);
      b.valores.forEach((linha, indice) => {
        fonte(8.5, linha.negrito);
        pdf.text(
          linha.valor,
          bx + 3,
          topoTexto + alturaRotulo + espacoRotulo + subidaValor + indice * entrelinhas,
        );
      });
    }
    y += h;
  }
  y += 5;
  function cabecalhoTabela() {
    reservar(14);
    pdf.setFillColor(cor);
    pdf.rect(x, y, width, 8, "F");
    fonte(7, true, textoCabecalho);
    pdf.text(d.tituloItens || "SERVIÇOS E PEÇAS", x + 3, y + 6);
    pdf.text("TIPO", 113, y + 4.5, { align: "center" });
    pdf.text("QTD.", 138, y + 4.5, { align: "right" });
    pdf.text("UNITÁRIO", 165, y + 4.5, { align: "right" });
    pdf.text("TOTAL", right - 3, y + 4.5, { align: "right" });
    y += 8;
  }
  cabecalhoTabela();
  if (!d.itens.length) {
    y += 3;
    paragrafo("Nenhum item autorizado lançado nesta OS.");
    y += 3;
  }
  d.itens.forEach((i, index) => {
    const desc = linhas(i.descricao + (i.cancelado ? " (cancelado)" : ""), 86, 9);
    const qtd = linhas(quantidadeDocumento(i.quantidade) + " " + i.unidade, 19, 8);
    const unit = linhas(moedaDocumento(i.preco_unitario_centavos), 24, 8.5),
      total = linhas(moedaDocumento(i.total), 25, 9, true);
    const numeros = Math.max(qtd.length, unit.length, total.length) * 4.6 + 2.4;
    let offset = 0;
    while (offset < desc.length) {
      const hDesejada = Math.max(
        (desc.length - offset) * 4.6 + 2.4,
        offset ? 7 : numeros,
      );
      if (y + Math.min(hDesejada, 60) > bottom) {
        pagina();
        cabecalhoTabela();
      }
      const trecho = desc.slice(
        offset,
        offset + Math.max(1, Math.floor((bottom - y - 2.4) / 4.6)),
      );
      const h = Math.max(trecho.length * 4.6 + 2.4, offset ? 7 : numeros);
      if (index % 2 === 0) {
        pdf.setFillColor("#f4f4f4");
        pdf.rect(x, y, width, h, "F");
      }
      // Desenha após o fundo para não encobrir a divisória da linha anterior.
      pdf.setDrawColor("#999999");
      pdf.setLineWidth(0.22);
      pdf.line(x, y, right, y);
      fonte(9);
      pdf.text(trecho, x + 3, y + 4.5, { lineHeightFactor: 1.2 });
      fonte(7, false, "#333333");
      pdf.text(
        offset
          ? "continua"
          : i.tipo === "service"
            ? "Serviço"
            : d.rotuloMateriais || "Peça",
        113,
        y + 4.5,
        { align: "center" },
      );
      if (!offset) {
        fonte(8);
        pdf.text(qtd, 138, y + 4.5, { align: "right", lineHeightFactor: 1.3 });
        fonte(8.5);
        pdf.text(unit, 165, y + 4.5, {
          align: "right",
          lineHeightFactor: 1.25,
        });
        fonte(9, true);
        pdf.text(total, right - 3, y + 4.5, {
          align: "right",
          lineHeightFactor: 1.2,
        });
      }
      y += h;
      pdf.setDrawColor("#999999");
      pdf.setLineWidth(0.22);
      pdf.line(x, y, right, y);
      offset += trecho.length;
    }
  });
  reservar(19);
  y += 3;
  const totalLinhas = linhas(moedaDocumento(d.total), 62, 16, true);
  const alturaTotal = Math.max(16, totalLinhas.length * 7.2 + 8);
  reservar(alturaTotal + 3);
  fonte(8, false, "#333333");
  pdf.text("Subtotal", x + 3, y + 4.5);
  pdf.text(moedaDocumento(d.subtotal), x + 76, y + 4.5, { align: "right" });
  if (d.mostrarDesconto !== false) {
    pdf.text("Desconto", x + 3, y + 10);
    pdf.text(moedaDocumento(-d.desconto), x + 76, y + 10, { align: "right" });
  }
  pdf.setFillColor("#ededed");
  pdf.roundedRect(108, y, 88, alturaTotal, 1.5, 1.5, "F");
  pdf.setFillColor(cor);
  pdf.rect(108, y, 1, alturaTotal, "F");
  fonte(7, true, "#292929");
  pdf.text("TOTAL", 112, y + 8);
  fonte(16, true);
  pdf.text(totalLinhas, right - 4, y + 9, {
    align: "right",
    lineHeightFactor: 1.1,
  });
  y += alturaTotal + 4;
  for (const s of d.secoes) secao(s.titulo, s.texto);
  if (d.confirmacao) secao("Autorização registrada", d.confirmacao);
  if (d.identidade.rodape) {
    y += 1;
    paragrafo(d.identidade.rodape, 8);
  }
  const divisao = x + width * 0.75;
  const centroAssinatura = (x + divisao - 5) / 2;
  const assinaturaLinhas = linhas(d.assinatura, divisao - 5 - x, 9);
  const alturaAssinatura = assinaturaLinhas.length * 4.8 + 18;
  reservar(alturaAssinatura);
  y = bottom - alturaAssinatura + 6;
  fonte(9);
  pdf.text(assinaturaLinhas, centroAssinatura, y, {
    align: "center",
    lineHeightFactor: 1.25,
  });
  y += assinaturaLinhas.length * 4.8 + 6;
  pdf.setDrawColor("#111111");
  pdf.setLineWidth(0.45);
  pdf.line(x, y, divisao - 5, y);
  fonte(9);
  pdf.text(
    d.vencimento ? dataDocumento(d.vencimento, false) : "____/____/________",
    (divisao + right) / 2,
    y + 5,
    { align: "center" },
  );
  fonte(8, true);
  pdf.text("Assinatura do cliente", (x + divisao - 5) / 2, y + 5, { align: "center" });
  pdf.text("Vencimento", (divisao + right) / 2, y - 2, { align: "center" });
  const paginas = pdf.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    pdf.setPage(p);
    pdf.setDrawColor("#888888");
    pdf.line(x, 282, right, 282);
    fonte(6.5, false, "#333333");
    pdf.text(d.aviso, x, 287);
    fonte(7, true);
    pdf.text(`${sigla} #${d.numero} · ${p}/${paginas}`, right, 287, {
      align: "right",
    });
  }
  return pdf;
}
