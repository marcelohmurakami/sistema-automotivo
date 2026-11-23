import { useMemo } from "react";
import type { Agendamento } from "../../services/produtividade";
import { situacoesAgendaOficina } from "../../lib/calendarioAgenda";
import { CalendarioAgenda } from "./CalendarioAgenda";

export function CalendarioOficina({
  agenda,
  dia,
  alterarDia,
  abrir,
  novo,
}: {
  agenda: Agendamento[];
  dia: string;
  alterarDia: (dia: string) => void;
  abrir: (item: Agendamento) => void;
  novo: (dia: string, hora?: string, recurso?: string) => void;
}) {
  const itens = useMemo(
    () =>
      agenda.map((x) => ({
        ...x,
        identificacao: x.veiculo || x.identificacao || undefined,
      })),
    [agenda],
  );
  return (
    <CalendarioAgenda
      agenda={itens}
      dia={dia}
      alterarDia={alterarDia}
      situacoes={situacoesAgendaOficina}
      historicoDias={90}
      novo={novo}
      abrir={(id) => {
        const item = agenda.find((x) => x.id === id);
        if (item) abrir(item);
      }}
    />
  );
}
