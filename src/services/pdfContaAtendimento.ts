import { jsPDF } from "jspdf";
import type { ContaAtendimento } from "../lib/relatoriosServicos";
import { dinheiro } from "../lib/formatacao.ts";
export function gerarPdfContaAtendimento(empresa: string, contas: ContaAtendimento[]) {
  if (!contas.length || new Set(contas.map((c) => c.cliente_id)).size !== 1)
    throw Error("Selecione atendimentos de um único cliente.");
  if (new Set(contas.map((c) => c.titulo_id)).size !== contas.length)
    throw Error("Conta duplicada.");
  const pdf = new jsPDF();
  let y = 20;
  const linha = (texto: string, bold = false) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(11);
    for (const l of pdf.splitTextToSize(texto, 180)) {
      if (y > 276) {
        pdf.addPage();
        y = 20;
      }
      pdf.text(l, 15, y);
      y += 7;
    }
  };
  linha(empresa, true);
  linha(`CONTA DE ${contas[0].cliente}`, true);
  linha(`Consulta em ${new Date().toLocaleDateString("pt-BR")}`);
  y += 5;
  for (const c of contas) {
    linha(`#${c.numero} · ${c.titulo}`, true);
    linha(
      `Serviço: ${c.data_servico.split("-").reverse().join("/")} · Vencimento: ${c.vencimento.split("-").reverse().join("/")}`,
    );
    linha(
      `Total: ${dinheiro(c.total)} · Recebido: ${dinheiro(c.pago)} · Em aberto: ${dinheiro(c.saldo)}`,
    );
    y += 5;
  }
  linha(
    `TOTAL EM ABERTO SELECIONADO: ${dinheiro(contas.reduce((s, c) => s + c.saldo, 0))}`,
    true,
  );
  linha(
    "Demonstrativo dos atendimentos selecionados. Não é recibo de pagamento nem documento fiscal.",
  );
  return pdf;
}
