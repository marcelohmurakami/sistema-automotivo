import {
  dataDocumento,
  telefoneDocumento,
  temInformacaoDocumento,
  type DocumentoCliente,
} from "./documentoCliente.ts";

/** Conteúdo comum à prévia, à impressão e ao PDF, sem recalcular a proposta. */
export function apresentacaoOrcamento(d: DocumentoCliente) {
  const informacoes = d.informacoes.filter((i) => temInformacaoDocumento(i.valor));
  const condicoes = informacoes.filter((i) => /pagamento/i.test(i.rotulo));
  if (d.formaPagamento && !condicoes.some((i) => /forma/i.test(i.rotulo)))
    condicoes.push({ rotulo: "Forma de pagamento", valor: d.formaPagamento });
  if (d.vencimento && !condicoes.some((i) => /vencimento/i.test(i.rotulo)))
    condicoes.push({
      rotulo: "Vencimento do pagamento",
      valor: dataDocumento(d.vencimento, false),
    });
  const bem = d.bem || { rotulo: "Veículo", valor: d.veiculo };
  const linhasBem = d.bem
    ? bem.valor
        .split(/\r?\n/)
        .map((v) => v.trim())
        .filter(Boolean)
    : [];
  const nomeBem = linhasBem[0]?.replace(
    /^(Equipamento(?: \/ local)?|Local do serviço):\s*/i,
    "",
  );
  return {
    situacao:
      d.situacao === "orcamento" ? "Orçamento em análise" : d.situacao || "Orçamento",
    contatosEmpresa: [
      d.identidade.documento && `CNPJ/CPF: ${d.identidade.documento}`,
      telefoneDocumento(d.identidade.telefone || d.identidade.telefone_e164),
      d.identidade.endereco &&
        Object.values(d.identidade.endereco).filter(Boolean).join(" · "),
    ].filter((s): s is string => !!s),
    contatosCliente: [
      telefoneDocumento(d.telefoneCliente),
      d.documentoCliente,
      d.enderecoCliente,
    ].filter((s): s is string => temInformacaoDocumento(s)),
    bem: temInformacaoDocumento(bem.valor)
      ? { ...bem, valor: nomeBem || bem.valor }
      : undefined,
    detalhesBem: [
      ...linhasBem.slice(1),
      !d.bem && temInformacaoDocumento(d.placa) ? `Placa: ${d.placa}` : "",
      temInformacaoDocumento(d.motor) ? `Motor: ${d.motor}` : "",
    ].filter(Boolean),
    datas: informacoes.filter((i) => !/pagamento/i.test(i.rotulo)),
    condicoes,
    tituloItens: d.tituloItens || "Serviços e produtos",
  };
}
