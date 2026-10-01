import { jsPDF } from "jspdf";
import { dinheiro } from "./orcamentos";
import type { Identidade, Notinha } from "./documentos";
import { situacoesOS, type OrdemServico } from "./ordensServico";
export function documentoBase(titulo: string, identidade: Identidade) {
  const pdf = new jsPDF();
  let y = 22;
  const linha = (s: string, size = 11, bold = false) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    for (const l of pdf.splitTextToSize(s || "—", 170) as string[]) {
      if (y > 272) {
        pdf.addPage();
        y = 22;
      }
      pdf.text(l, 20, y);
      y += size > 15 ? 10 : 6;
    }
  };
  pdf.setFillColor(
    /^#[0-9a-f]{6}$/i.test(identidade.cor || "") ? identidade.cor! : "#244336",
  );
  pdf.rect(0, 0, 210, 9, "F");
  if (identidade.logo) {
    try {
      const props = pdf.getImageProperties(identidade.logo);
      const scale = Math.min(40 / props.width, 22 / props.height);
      pdf.addImage(
        identidade.logo,
        20,
        y,
        props.width * scale,
        props.height * scale,
      );
      y += 26;
    } catch {
      /* Documentos antigos continuam disponíveis se o logo estiver corrompido. */
    }
  }
  linha(identidade.nome, 19, true);
  linha(titulo, 13, true);
  linha(identidade.telefone || identidade.telefone_e164 || "");
  if (identidade.endereco) {
    const endereco = Object.values(identidade.endereco)
      .filter((x) => typeof x === "string" && x)
      .join(" · ");
    if (endereco) linha(endereco, 9);
  }
  y += 6;
  const finalizar = (aviso: string) => {
    if (identidade.rodape) {
      y += 5;
      linha(identidade.rodape, 10);
    }
    for (let i = 1; i <= pdf.getNumberOfPages(); i++) {
      pdf.setPage(i);
      pdf.setFontSize(8);
      pdf.setTextColor(110);
      pdf.text(aviso, 20, 289);
      pdf.text(`${i}/${pdf.getNumberOfPages()}`, 181, 289);
    }
    return pdf;
  };
  return { pdf, linha, finalizar };
}
export function gerarPdfNotinha(n: Notinha) {
  const { linha, finalizar } = documentoBase(
    `NOTA DE ATENDIMENTO #${n.numero}`,
    n.dados_oficina,
  );
  if (n.situacao === "cancelled") linha("CANCELADA", 16, true);
  linha(`Cliente: ${n.dados_cliente.nome}`, 12, true);
  linha(`Emissão: ${new Date(n.emitido_em).toLocaleString("pt-BR")}`);
  for (const i of n.itens) {
    linha(i.descricao, 11, true);
    linha(
      `${i.quantidade} ${i.unidade} x ${dinheiro(i.preco_unitario_centavos)} = ${dinheiro(i.total_item_centavos ?? Math.round(i.quantidade * i.preco_unitario_centavos))}`,
    );
  }
  linha(`Subtotal: ${dinheiro(n.subtotal_centavos)}`);
  linha(`Desconto: ${dinheiro(n.desconto_centavos)}`);
  linha(`Total: ${dinheiro(n.total_centavos)}`, 16, true);
  if (n.observacoes) linha(n.observacoes);
  return finalizar(
    "Documento de atendimento · Sem valor fiscal · Não comprova pagamento",
  );
}
export function gerarPdfOS(o: OrdemServico, identidade: Identidade) {
  const { linha, finalizar } = documentoBase(
    `ORDEM DE SERVIÇO #${o.numero}`,
    identidade,
  );
  linha(`Situação: ${situacoesOS[o.situacao] || o.situacao}`);
  linha(`Cliente: ${o.dados_cliente.nome}`, 12, true);
  linha(
    `Veículo: ${o.dados_veiculo.modelo} · ${o.dados_veiculo.placa || "Sem placa"}`,
  );
  if (o.recebido_em)
    linha(`Entrada: ${new Date(o.recebido_em).toLocaleString("pt-BR")}`);
  if (o.entrega_prevista_em)
    linha(
      `Previsão de entrega: ${new Date(o.entrega_prevista_em).toLocaleString("pt-BR")}`,
    );
  if (o.quilometragem_entrada != null)
    linha(`Quilometragem de entrada: ${o.quilometragem_entrada} km`);
  if (o.queixa_cliente) {
    linha("Relato do cliente", 12, true);
    linha(o.queixa_cliente);
  }
  if (o.resumo_cliente) {
    linha("Serviços e orientações", 12, true);
    linha(o.resumo_cliente);
  }
  for (const i of o.itens) {
    linha(i.descricao, 11, true);
    linha(
      `${i.quantidade} ${i.unidade} x ${dinheiro(i.preco_unitario_centavos)} = ${dinheiro(i.total_item_centavos ?? Math.round(i.quantidade * i.preco_unitario_centavos))}`,
    );
  }
  linha(`Total da OS: ${dinheiro(o.total_centavos)}`, 16, true);
  if (o.condicoes_garantia) {
    linha("Garantia", 12, true);
    linha(o.condicoes_garantia);
  }
  if (o.garantia_ate)
    linha(
      `Garantia até: ${new Date(o.garantia_ate + "T12:00:00").toLocaleDateString("pt-BR")}`,
    );
  linha("Recebimento do veículo: ____/____/________");
  linha("Assinatura do cliente: __________________________________");
  return finalizar(
    "Ordem de serviço · Sem valor fiscal · Consulte os pagamentos com a oficina",
  );
}
