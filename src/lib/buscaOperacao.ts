export const normalizarBuscaOperacao = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();

export const termosBuscaOperacao = (busca: string) =>
  busca.trim().split(/\s+/).map(normalizarBuscaOperacao).filter(Boolean);

export function exemploBuscaOperacao(ramo?: string) {
  if (ramo === "assistencia_tecnica") return "Cliente ou equipamento…";
  if (ramo === "manutencao_campo") return "Cliente, equipamento ou local…";
  if (ramo === "limpeza") return "Cliente ou local…";
  return "Cliente, carro ou placa…";
}

type DadosBuscaAgenda = {
  cliente: string;
  identificacao?: string;
  placa?: string;
  servico?: string;
};
// Os registros da agenda são imutáveis. Normaliza uma vez por atualização,
// reutilizando o texto entre teclas e nas visualizações de dia, semana e mês.
const indiceAgenda = new WeakMap<DadosBuscaAgenda, string>();
export function filtrarBuscaAgenda<T extends DadosBuscaAgenda>(
  agenda: readonly T[],
  busca: string,
): T[] {
  const termos = termosBuscaOperacao(busca);
  return agenda.filter((item) => {
    if (!termos.length) return true;
    let texto = indiceAgenda.get(item);
    if (texto === undefined) {
      texto = normalizarBuscaOperacao(
        `${item.cliente} ${item.identificacao || ""} ${item.placa || ""} ${item.servico || ""}`,
      );
      indiceAgenda.set(item, texto);
    }
    return termos.every((termo) => texto.includes(termo));
  });
}
