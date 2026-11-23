import type { DetalhesAtendimento, ItemAtendimento } from "../types/servicosCompletos";
export function quantidadeMinima(unidade: string) {
  return ["un", "unid", "serv", "servico", "peça", "peca"].includes(
    unidade.toLowerCase().trim(),
  )
    ? 1
    : 0.001;
}
export function ajustarQuantidade(
  quantidade: number,
  unidade: string,
  direcao: -1 | 1,
) {
  const minimo = quantidadeMinima(unidade);
  return Math.min(
    1000000,
    Math.max(minimo, Math.round((quantidade + direcao) * 1000) / 1000),
  );
}
export function totaisItens(itens: ItemAtendimento[], desconto = 0) {
  if (!Number.isSafeInteger(desconto) || desconto < 0)
    throw Error("Informe um desconto válido.");
  for (const i of itens) {
    if (quantidadeMinima(i.unidade) === 1 && !Number.isInteger(i.quantidade))
      throw Error("Use uma quantidade inteira para unidades, peças e serviços.");
    if (
      !i.descricao.trim() ||
      !Number.isFinite(i.quantidade) ||
      i.quantidade <= 0 ||
      i.quantidade > 1000000 ||
      Math.abs(i.quantidade * 1000 - Math.round(i.quantidade * 1000)) > 0.00001
    )
      throw Error("Confira a descrição e a quantidade dos itens.");
    for (const v of [i.preco_centavos, i.custo_centavos ?? 0])
      if (!Number.isSafeInteger(v) || v < 0 || v > 100000000)
        throw Error("Confira o preço e o custo.");
    if (i.origem === "estoque" && (!i.produto_id || i.tipo !== "material"))
      throw Error("Selecione um material do estoque.");
  }
  const subtotal = itens.reduce(
    (s, i) => s + Math.round(i.quantidade * i.preco_centavos),
    0,
  );
  if (desconto > subtotal) throw Error("O desconto não pode superar o subtotal.");
  return {
    subtotal,
    total: subtotal - desconto,
    custo: itens.reduce(
      (s, i) =>
        s +
        Math.round(
          i.quantidade * (i.origem === "cliente" ? 0 : (i.custo_centavos ?? 0)),
        ),
      0,
    ),
  };
}
export function resultadoAtendimento(d: DetalhesAtendimento) {
  const itens = totaisItens(d.itens, d.comercial.desconto_centavos || 0);
  const equipe = new Map(d.equipe.map((e) => [e.funcionario_id, e]));
  const horas = d.horas
    .filter((h) => h.fim)
    .reduce((s, h) => s + (Date.parse(h.fim!) - Date.parse(h.inicio)) / 3600000, 0);
  const maoObra = Math.round(
    d.horas
      .filter((h) => h.fim)
      .reduce(
        (s, h) =>
          s +
          ((Date.parse(h.fim!) - Date.parse(h.inicio)) / 3600000) *
            (equipe.get(h.funcionario_id)?.custo_hora_centavos || 0),
        0,
      ),
  );
  const comissao =
    d.comercial.comissao_total_centavos ??
    d.equipe.reduce((s, e) => s + (e.comissao_centavos || 0), 0);
  const qualidade = d.qualidade.reduce((s, q) => s + q.custo_centavos, 0);
  const custo =
    itens.custo +
    (d.comercial.custo_extra_centavos || 0) +
    maoObra +
    comissao +
    qualidade;
  return {
    ...itens,
    receita: d.atendimento.valor_centavos,
    horas,
    maoObra,
    comissao,
    qualidade,
    custo,
    margem: d.atendimento.valor_centavos - custo,
  };
}
