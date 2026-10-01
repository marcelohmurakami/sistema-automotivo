import { jsPDF } from "jspdf";
import { dinheiro, type Proposta } from "./orcamentos";
export function gerarPdf(q: Proposta, link = "") {
  const pdf = new jsPDF();
  let y = 20;
  const v = q.versao;
  function pagina(altura: number) {
    if (y + altura > 275) {
      pdf.addPage();
      y = 20;
    }
  }
  function texto(valor: string, tamanho = 10, negrito = false) {
    pdf.setFont("helvetica", negrito ? "bold" : "normal");
    pdf.setFontSize(tamanho);
    const linhas = pdf.splitTextToSize(valor, 170) as string[];
    for (const linha of linhas) {
      pagina(7);
      pdf.text(linha, 20, y);
      y += tamanho > 15 ? 10 : 6;
    }
  }
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(19);
  const alturaCabecalho = Math.max(
    43,
    30 + pdf.splitTextToSize(v.dados_oficina.nome, 170).length * 10,
  );
  pdf.setFillColor(
    /^#[a-f0-9]{6}$/i.test(v.dados_oficina.cor || "")
      ? v.dados_oficina.cor!
      : "#242f2a",
  );
  pdf.rect(0, 0, 210, alturaCabecalho, "F");
  pdf.setTextColor(255, 255, 255);
  texto(v.dados_oficina.nome, 19, true);
  texto(
    `ORÇAMENTO #${String(q.numero).padStart(4, "0")}  |  VERSÃO ${v.numero_versao}`,
    10,
  );
  y = alturaCabecalho + 11;
  pdf.setTextColor(40, 49, 57);
  if (v.dados_oficina.logo) {
    try {
      const props = pdf.getImageProperties(v.dados_oficina.logo);
      const scale = Math.min(40 / props.width, 22 / props.height);
      pdf.addImage(
        v.dados_oficina.logo,
        20,
        y,
        props.width * scale,
        props.height * scale,
      );
      y += 28;
    } catch {
      /* Preserva documentos antigos com imagem inválida. */
    }
  }
  if (!v.publicado_em) texto("RASCUNHO - NÃO EMITIDO", 11, true);
  texto(`Cliente: ${v.dados_cliente.nome}`, 12, true);
  texto(
    `Veículo: ${[v.dados_veiculo.marca, v.dados_veiculo.modelo, v.dados_veiculo.placa].filter(Boolean).join(" · ")}`,
  );
  if (v.dados_oficina.telefone_e164)
    texto(`Oficina: ${v.dados_oficina.telefone_e164}`);
  if (v.expira_em)
    texto(`Válido até ${new Date(v.expira_em).toLocaleString("pt-BR")}`);
  y += 7;
  for (const [indice, item] of q.itens.entries()) {
    pagina(25);
    texto(`${indice + 1}. ${item.descricao}`, 11, true);
    texto(
      `${item.tipo === "service" ? "Serviço" : "Peça"} · ${item.quantidade} ${item.unidade} × ${dinheiro(item.preco_unitario_centavos)} = ${dinheiro(item.total_item_centavos ?? Math.round(item.quantidade * item.preco_unitario_centavos))}`,
    );
    y += 4;
  }
  y += 5;
  pagina(35);
  texto(`Subtotal: ${dinheiro(v.subtotal_centavos)}`);
  texto(`Desconto: ${dinheiro(v.desconto_centavos)}`);
  texto(`TOTAL: ${dinheiro(v.total_centavos)}`, 16, true);
  y += 6;
  if (v.observacoes) {
    texto("Observações", 11, true);
    texto(v.observacoes);
    y += 4;
  }
  if (v.condicoes) {
    texto("Condições de pagamento e execução", 11, true);
    texto(v.condicoes);
    y += 4;
  }
  if (v.dados_oficina.rodape) {
    texto(v.dados_oficina.rodape);
    y += 4;
  }
  if (q.aprovacao)
    texto(
      `${q.aprovacao.decisao === "approved" ? "Aprovado" : "Recusado"} por ${q.aprovacao.nome_informado} em ${new Date(q.aprovacao.confirmado_em).toLocaleString("pt-BR")}`,
    );
  if (link) {
    pagina(24);
    pdf.setTextColor(60, 105, 40);
    pdf.textWithLink("CONSULTAR E RESPONDER AO ORÇAMENTO", 20, y, {
      url: link,
    });
  }
  const total = pdf.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i);
    pdf.setTextColor(130);
    pdf.setFontSize(8);
    pdf.text("Documento de orçamento · Não é nota fiscal", 20, 289);
    pdf.text(`${i}/${total}`, 182, 289);
  }
  return pdf;
}
export function arquivoPdf(q: Proposta, link = "") {
  const pdf = gerarPdf(q, link);
  return new File(
    [pdf.output("blob")],
    `orcamento-${q.numero}-v${q.versao.numero_versao}.pdf`,
    { type: "application/pdf" },
  );
}
