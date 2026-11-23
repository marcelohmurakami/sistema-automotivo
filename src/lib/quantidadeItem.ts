export const QUANTIDADE_MAXIMA_ITEM = 100000;

export function quantidadeItemValida(valor: number) {
  return Number.isInteger(valor) && valor >= 1 && valor <= QUANTIDADE_MAXIMA_ITEM;
}
