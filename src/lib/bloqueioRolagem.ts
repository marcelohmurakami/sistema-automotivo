const bloqueios = new WeakMap<HTMLElement, { quantidade: number; anterior: string }>();

/** Diálogos sobrepostos podem fechar em qualquer ordem sem prender a página. */
export function bloquearRolagem(elemento: HTMLElement) {
  const estado = bloqueios.get(elemento) ?? {
    quantidade: 0,
    anterior: elemento.style.overflow,
  };
  estado.quantidade++;
  bloqueios.set(elemento, estado);
  elemento.style.overflow = "hidden";
  let liberado = false;
  return () => {
    if (liberado) return;
    liberado = true;
    if (--estado.quantidade === 0) {
      elemento.style.overflow = estado.anterior;
      bloqueios.delete(elemento);
    }
  };
}
