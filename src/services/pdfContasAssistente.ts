import { gerarPdfContaCliente } from "./pdfContaCliente";
import { consultarIdentidade } from "./documentos";
import type { ContaOS } from "../lib/contasClientes";

export async function gerarPdfContasAssistente(
  oficina: string,
  contas: Record<string, unknown>[],
  consultadoEm: string,
) {
  const hoje = new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Sao_Paulo",
  });
  const ordens = new Map<string, ContaOS>();
  for (const c of contas) {
    if (!c.servico_id || !c.cliente_id)
      throw Error("Selecione contas vinculadas às OS de um cliente.");
    const id = String(c.servico_id);
    const o = ordens.get(id) || {
      id,
      numero: Number(c.numero),
      cliente_id: String(c.cliente_id),
      chave_cliente: `cliente:${c.cliente_id}`,
      cliente: String(c.cliente),
      telefone: "",
      data: String(c.data_servico || ""),
      situacao: "",
      veiculo: String(c.identificacao || "Serviço"),
      placa: "",
      servicos: "",
      vencimento: String(c.vencimento),
      total_centavos: 0,
      pago_centavos: 0,
      aberto_centavos: 0,
      vencido_centavos: 0,
      titulos: [],
    };
    o.titulos.push({
      id: String(c.id),
      descricao: String(c.descricao),
      vencimento: String(c.vencimento),
      total_centavos: Number(c.valor_centavos),
      pago_centavos: Number(c.baixado_centavos),
      aberto_centavos: Number(c.aberto_centavos),
    });
    o.total_centavos += Number(c.valor_centavos);
    o.pago_centavos += Number(c.baixado_centavos);
    o.aberto_centavos += Number(c.aberto_centavos);
    if (String(c.vencimento) < hoje) o.vencido_centavos += Number(c.aberto_centavos);
    ordens.set(id, o);
  }
  return gerarPdfContaCliente(
    [...ordens.values()],
    await consultarIdentidade(false, oficina),
    consultadoEm,
    hoje,
  );
}
