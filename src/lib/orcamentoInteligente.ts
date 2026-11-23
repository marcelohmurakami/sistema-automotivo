export type ItemInteligente = {
  grupo_servico?: string;
  depende_grupo?: string;
  explicacao_cliente?: string;
  prioridade_servico?: "urgente" | "recomendado" | "preventivo";
  tipo: string;
  quantidade: number;
  preco_unitario_centavos: number;
  custo_unitario_previsto_centavos?: number | null;
  minutos_previstos?: number;
  custo_hora_centavos?: number;
};
export const grupoDoItem = (i: ItemInteligente) =>
  i.grupo_servico?.trim() || "Atendimento";
export function gruposOrcamento(itens: ItemInteligente[]) {
  const grupos = new Map<
    string,
    { nome: string; subtotal: number; dependencias: Set<string> }
  >();
  for (const item of itens) {
    const nome = grupoDoItem(item);
    let grupo = grupos.get(nome);
    if (!grupo) {
      grupo = { nome, subtotal: 0, dependencias: new Set() };
      grupos.set(nome, grupo);
    }
    grupo.subtotal += Math.round(item.quantidade * item.preco_unitario_centavos);
    const dependencia = item.depende_grupo?.trim();
    if (dependencia) grupo.dependencias.add(dependencia);
  }
  return [...grupos.values()].map((grupo) => ({
    ...grupo,
    dependencias: [...grupo.dependencias],
  }));
}
export function incluirDependencias(itens: ItemInteligente[], escolhidos: string[]) {
  const grupos = gruposOrcamento(itens),
    s = new Set(escolhidos);
  for (let n = 0; n < grupos.length; n++)
    for (const g of grupos) if (s.has(g.nome)) g.dependencias.forEach((d) => s.add(d));
  return [...s];
}
export function retirarGrupo(
  itens: ItemInteligente[],
  escolhidos: string[],
  nome: string,
) {
  const s = new Set(escolhidos);
  s.delete(nome);
  const grupos = gruposOrcamento(itens);
  for (let n = 0; n < grupos.length; n++)
    for (const g of grupos) if (g.dependencias.some((d) => !s.has(d))) s.delete(g.nome);
  return [...s];
}
export function valorSelecionado(
  itens: ItemInteligente[],
  desconto: number,
  grupos: string[],
) {
  const subtotal = itens.reduce(
    (s, i) => s + Math.round(i.quantidade * i.preco_unitario_centavos),
    0,
  );
  const escolhidos = new Set(grupos);
  const selecionado = itens
    .filter((i) => escolhidos.has(grupoDoItem(i)))
    .reduce((s, i) => s + Math.round(i.quantidade * i.preco_unitario_centavos), 0);
  const proporcional =
    subtotal > 0 ? Math.round((desconto * selecionado) / subtotal) : 0;
  return {
    subtotal: selecionado,
    desconto: proporcional,
    total: selecionado - proporcional,
  };
}
export function estimarMargem(itens: ItemInteligente[], desconto: number, outros = 0) {
  const receita =
    itens.reduce(
      (s, i) => s + Math.round(i.quantidade * i.preco_unitario_centavos),
      0,
    ) - desconto;
  const faltantes = itens.filter((i) =>
    i.tipo === "part"
      ? i.custo_unitario_previsto_centavos == null
      : !(i.minutos_previstos && i.custo_hora_centavos),
  ).length;
  const custo = itens.reduce(
    (s, i) =>
      s +
      Math.round(i.quantidade * (i.custo_unitario_previsto_centavos ?? 0)) +
      Math.round(((i.minutos_previstos ?? 0) * (i.custo_hora_centavos ?? 0)) / 60),
    outros,
  );
  const saldo = receita - custo;
  return {
    receita,
    custo,
    saldo,
    percentual: receita > 0 ? (saldo / receita) * 100 : null,
    faltantes,
    limiteDesconto: Math.max(0, receita + desconto - custo),
  };
}
