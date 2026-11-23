import { useState } from "react";
import {
  alternarTipoDesconto,
  calcularDesconto,
  descontoInicial,
  estadoDescontoValido,
  type EstadoDesconto,
  type TipoDesconto,
} from "./desconto";

export function useDesconto(
  subtotal: number,
  inicialCentavos = 0,
  recuperado?: EstadoDesconto,
) {
  const [estado, setEstado] = useState<EstadoDesconto>(() =>
    estadoDescontoValido(recuperado) ? recuperado : descontoInicial(inicialCentavos),
  );
  return {
    estado,
    subtotal,
    centavos: calcularDesconto(estado, subtotal),
    alterarValor: (valor: number | "") =>
      setEstado((atual) => ({ tipo: atual.tipo, valor })),
    alterarTipo: (tipo: TipoDesconto) =>
      setEstado((atual) => alternarTipoDesconto(atual, tipo, subtotal)),
    reiniciar: () => setEstado(descontoInicial()),
  };
}

export type ControleDesconto = ReturnType<typeof useDesconto>;
