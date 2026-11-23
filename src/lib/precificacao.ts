export type ParametrosCusteio = {
  salarios: number;
  encargos: number;
  beneficios: number;
  prolabore: number;
  indiretos: number;
  depreciacao: number;
  profissionais: number;
  dias: number;
  horas: number;
  ocupacao: number;
  margem: number;
  impostos: number;
  taxas: number;
  rateio: "horas" | "receita" | "nenhum";
};
export const parametrosIniciais: ParametrosCusteio = {
  salarios: 0,
  encargos: 0,
  beneficios: 0,
  prolabore: 0,
  indiretos: 0,
  depreciacao: 0,
  profissionais: 1,
  dias: 22,
  horas: 8,
  ocupacao: 70,
  margem: 20,
  impostos: 0,
  taxas: 0,
  rateio: "horas",
};
export function calcularHoraProdutiva(p: ParametrosCusteio) {
  for (const [k, v] of Object.entries(p)) {
    if (k === "rateio") continue;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1e10)
      throw Error("Confira os parâmetros da hora produtiva.");
  }
  for (const k of [
    "salarios",
    "beneficios",
    "prolabore",
    "indiretos",
    "depreciacao",
  ] as const)
    if (!Number.isSafeInteger(p[k]))
      throw Error("Informe os custos em centavos inteiros.");
  if (
    p.profissionais < 1 ||
    p.profissionais > 10000 ||
    p.dias < 1 ||
    p.dias > 31 ||
    p.horas <= 0 ||
    p.horas > 24 ||
    p.ocupacao <= 0 ||
    p.ocupacao > 100 ||
    p.encargos > 300 ||
    p.margem + p.impostos + p.taxas >= 100
  )
    throw Error(
      "Confira capacidade e percentuais. Margem, impostos e taxas devem somar menos de 100%.",
    );
  const disponiveis = p.profissionais * p.dias * p.horas,
    produtivas = (disponiveis * p.ocupacao) / 100;
  const pessoal = p.salarios * (1 + p.encargos / 100) + p.beneficios + p.prolabore,
    estrutura = p.indiretos + p.depreciacao,
    total = pessoal + estrutura;
  return {
    disponiveis,
    produtivas,
    ociosas: disponiveis - produtivas,
    pessoal: Math.round(pessoal),
    estrutura: Math.round(estrutura),
    mensal: Math.round(total),
    horaPessoal: pessoal / produtivas,
    horaEstrutura: estrutura / produtivas,
    hora: total / produtivas,
  };
}
export function calcularPrecoServico(
  p: ParametrosCusteio,
  minutos: number,
  materiais: number,
  terceiros: number,
  outros: number,
) {
  const h = calcularHoraProdutiva(p);
  if (
    !Number.isFinite(minutos) ||
    minutos < 0 ||
    minutos > 1e6 ||
    [materiais, terceiros, outros].some(
      (v) => !Number.isSafeInteger(v) || v < 0 || v > 1e10,
    )
  )
    throw Error("Confira a duração e os custos do serviço.");
  const maoObra = Math.round((h.horaPessoal * minutos) / 60),
    indiretos = Math.round((h.horaEstrutura * minutos) / 60),
    custo = maoObra + indiretos + materiais + terceiros + outros;
  const piso = arredondarPreco(custo / (1 - (p.impostos + p.taxas) / 100)),
    preco = arredondarPreco(custo / (1 - (p.margem + p.impostos + p.taxas) / 100));
  return {
    ...h,
    maoObra,
    indiretos,
    custo,
    piso,
    preco,
    tributos: Math.round((preco * p.impostos) / 100),
    taxasVenda: Math.round((preco * p.taxas) / 100),
    lucro:
      preco -
      custo -
      Math.round((preco * p.impostos) / 100) -
      Math.round((preco * p.taxas) / 100),
  };
}

function arredondarPreco(v: number) {
  return Math.ceil(v - Number.EPSILON * Math.abs(v) * 4);
}
