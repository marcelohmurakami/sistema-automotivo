/** A descrição livre é opcional; a identificação da OS vem dos itens cadastrados. */
export function tituloAtendimento(
  descricao: string,
  itens: { descricao: string }[],
  equipamento: string,
  rotulo: string,
) {
  const titulo =
    descricao.trim() ||
    itens
      .map((i) => i.descricao.trim())
      .filter(Boolean)
      .join(" · ") ||
    [rotulo, equipamento.trim()].filter(Boolean).join(" · ");
  return (titulo.length < 3 ? `${rotulo} · ${titulo}` : titulo).slice(0, 180);
}
