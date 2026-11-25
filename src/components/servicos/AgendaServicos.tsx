import { ConfiguracaoCalendario } from "../CalendarioOperacao";
import { CalendariosExternos } from "../CalendariosExternos";
import { novoId } from "../../lib/uuid.ts";
import { ConfiguracaoDistribuicao } from "../ConfiguracaoDistribuicao";
import { ConfiguracaoRecursos } from "../ConfiguracaoRecursos";
import { useMemo } from "react";
import { useAcesso } from "../../auth/contexto";
import { exemploBuscaOperacao } from "../../lib/buscaOperacao";
import { CalendarioAgenda } from "../agenda/CalendarioAgenda";

import { estadosAgenda, type PainelServicos } from "../../services/servicos";

import type { Editor } from "./tipos";
import { RoteiroVisitas } from "../RoteiroVisitas";
export function AgendaServicos({
  dados,
  abrir,
  novo,
  gerencia,
  nomeCliente,
  dia,
  setDia,
  visao,
  setVisao,
}: {
  dados: PainelServicos;
  abrir: (e: Editor) => void;
  novo: (dia?: string, hora?: string, recurso?: string) => void;
  gerencia: boolean;
  nomeCliente: (id: string) => string;
  dia: string;
  setDia: (dia: string) => void;
  visao: "dia" | "semana" | "mes";
  setVisao: (visao: "dia" | "semana" | "mes") => void;
}) {
  const ramo = useAcesso().oficina?.ramo;
  const atendimentosPorId = useMemo(
    () => new Map(dados.atendimentos.map((a) => [a.id, a])),
    [dados.atendimentos],
  );
  const recursosPorId = useMemo(
    () => new Map(dados.recursos.map((r) => [r.id, r])),
    [dados.recursos],
  );
  const objetosPorId = useMemo(
    () => new Map(dados.objetos.map((o) => [o.id, o])),
    [dados.objetos],
  );
  const itens = useMemo(
    () =>
      dados.agenda.map((x) => {
        const atendimento = atendimentosPorId.get(x.atendimento_id);
        // Os recursos adicionais continuam visíveis sem repetir a equipe principal.
        const equipe = recursosPorId.get(x.recurso_id)?.nome || "Equipe";
        const adicionais = x.resumo_recursos
          ?.map((r) => r.nome)
          .filter((nome) => nome !== equipe);
        return {
          ...x,
          recurso: x.recurso_id,
          recursoNome: equipe,
          cliente: atendimento ? nomeCliente(atendimento.cliente_id) : "Cliente",
          identificacao: atendimento
            ? objetosPorId.get(atendimento.objeto_id)?.nome
            : undefined,
          servico: atendimento?.titulo,
          detalhes: adicionais?.length ? [adicionais.join(" · ")] : [],
        };
      }),
    [dados.agenda, atendimentosPorId, recursosPorId, objetosPorId, nomeCliente],
  );
  const abrirReserva = (id: string) => {
    const item = dados.agenda.find((x) => x.id === id);
    if (item) abrir({ tipo: "agenda", item });
  };
  return (
    <>
      <CalendarioAgenda
        exemploBusca={exemploBuscaOperacao(ramo)}
        fusoHorario="America/Sao_Paulo"
        agenda={itens}
        recursos={dados.recursos}
        dia={dia}
        alterarDia={setDia}
        visao={visao}
        alterarVisao={setVisao}
        situacoes={estadosAgenda}
        rotuloRecurso="Profissional / equipe"
        rotuloDia="Dia por profissional"
        abrir={abrirReserva}
        novo={novo}
        aposGrade={(reservas) => (
          <RoteiroVisitas
            data={dia}
            reservas={reservas.map((x) => ({
              ...x,
              titulo: x.servico || "Atendimento",
              equipe: x.recursoNome || "Equipe",
            }))}
            abrir={abrirReserva}
          />
        )}
      />
      {!dados.recursos.some((r) => r.ativo) && (
        <p>Cadastre um profissional ou equipe para começar a agendar.</p>
      )}
      {gerencia && (
        <details className="agenda-equipes">
          <summary>Profissionais e equipes</summary>
          <p>
            Use uma equipe única para pessoas que sempre trabalham juntas; recursos
            diferentes podem atender simultaneamente.
          </p>
          <div className="servico-acoes">
            {dados.recursos.map((r) => (
              <button key={r.id} onClick={() => abrir({ tipo: "recurso", item: r })}>
                {r.nome}
                {r.ativo ? "" : " · Inativo"}
              </button>
            ))}
            <button
              onClick={() =>
                abrir({
                  tipo: "recurso",
                  item: {
                    id: novoId(),
                    nome: "",
                    ativo: true,
                    revisao: 0,
                  },
                })
              }
            >
              + Cadastrar profissional / equipe
            </button>
          </div>
        </details>
      )}
      <ConfiguracaoDistribuicao />
      <ConfiguracaoRecursos />
      <ConfiguracaoCalendario />
      <CalendariosExternos />
    </>
  );
}
