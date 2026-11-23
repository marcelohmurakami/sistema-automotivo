export type TipoDesconto = "percentual" | "valor";
export type EstadoDesconto = {
  tipo: TipoDesconto;
  valor: number | "";
  convertido?: { subtotal: number; centavos: number };
};

export function descontoInicial(centavos = 0): EstadoDesconto {
  return centavos > 0
    ? { tipo: "valor", valor: centavos / 100 }
    : { tipo: "percentual", valor: 0 };
}

export function calcularDesconto(estado: EstadoDesconto, subtotal: number): number {
  if (estado.tipo === "valor") return Math.round(Number(estado.valor) * 100);
  // Alternar a unidade não deve mudar centavos de um desconto já informado.
  if (estado.convertido?.subtotal === subtotal) return estado.convertido.centavos;
  const percentualCentesimos = Math.round(Number(estado.valor) * 100);
  if (
    Number.isSafeInteger(subtotal) &&
    subtotal >= 0 &&
    Number.isSafeInteger(percentualCentesimos) &&
    percentualCentesimos >= 0
  ) {
    return Number((BigInt(subtotal) * BigInt(percentualCentesimos) + 5000n) / 10000n);
  }
  return Math.round((subtotal * percentualCentesimos) / 10000);
}

export function alternarTipoDesconto(
  estado: EstadoDesconto,
  tipo: TipoDesconto,
  subtotal: number,
): EstadoDesconto {
  if (tipo === estado.tipo) return estado;
  const centavos = calcularDesconto(estado, subtotal);
  return tipo === "valor"
    ? { tipo, valor: centavos / 100 }
    : {
        tipo,
        valor: subtotal > 0 ? Math.round((centavos / subtotal) * 10000) / 100 : 0,
        ...(subtotal > 0 ? { convertido: { subtotal, centavos } } : {}),
      };
}

export function estadoDescontoValido(valor: unknown): valor is EstadoDesconto {
  if (!valor || typeof valor !== "object") return false;
  const e = valor as EstadoDesconto;
  return (
    ["percentual", "valor"].includes(e.tipo) &&
    (e.valor === "" ||
      (typeof e.valor === "number" && Number.isFinite(e.valor) && e.valor >= 0)) &&
    (e.tipo !== "percentual" || Number(e.valor) <= 100) &&
    (!e.convertido ||
      (Number.isSafeInteger(e.convertido.subtotal) &&
        e.convertido.subtotal > 0 &&
        Number.isSafeInteger(e.convertido.centavos) &&
        e.convertido.centavos >= 0 &&
        e.convertido.centavos <= e.convertido.subtotal))
  );
}
