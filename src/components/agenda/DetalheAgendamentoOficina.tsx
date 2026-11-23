import { Link } from "react-router-dom";
import { Dialogo } from "../Dialogo";
import type { Agendamento } from "../../services/produtividade";
import { horarioVisita, inicioOcupacao } from "../../lib/logisticaVisitas";
import { situacoesAgendaOficina } from "../../lib/calendarioAgenda";

export function DetalheAgendamentoOficina({
  item,
  ocupado,
  fechar,
  editar,
  converter,
  cancelar,
  erro,
}: {
  item: Agendamento;
  ocupado: boolean;
  fechar: () => void;
  editar: () => void;
  converter: () => void;
  cancelar: () => void;
  erro: string;
}) {
  return (
    <Dialogo
      aberto
      fechar={() => !ocupado && fechar()}
      titulo="Detalhes do agendamento"
    >
      <div className="cal-oficina-detalhe">
        {erro && (
          <p role="alert" className="erro-formulario">
            {erro}
          </p>
        )}
        <span className="cal-oficina-situacao">
          {situacoesAgendaOficina[item.situacao] || item.situacao}
        </span>
        <h3>{item.cliente}</h3>
        <p>
          {item.veiculo || item.identificacao}
          {item.placa ? ` · ${item.placa}` : ""}
        </p>
        <dl>
          <div>
            <dt>Início</dt>
            <dd>
              {new Date(item.inicio).toLocaleString("pt-BR", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </dd>
          </div>
          <div>
            <dt>Fim previsto</dt>
            <dd>
              {item.fim
                ? new Date(item.fim).toLocaleString("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })
                : "Não informado"}
            </dd>
          </div>
          <div>
            <dt>Serviço</dt>
            <dd>{item.servico}</dd>
          </div>
          <div>
            <dt>Box ou responsável</dt>
            <dd>{item.recurso || "Não informado"}</dd>
          </div>
          {!!item.resumo_recursos?.length && (
            <div>
              <dt>Recursos reservados</dt>
              <dd>{item.resumo_recursos.map((r) => r.nome).join(" · ")}</dd>
            </div>
          )}
          {item.visita && (
            <div>
              <dt>Visita</dt>
              <dd>Sair até {horarioVisita(inicioOcupacao(item))}</dd>
            </div>
          )}
        </dl>
        {item.situacao === "agendado" && (
          <div className="cal-oficina-acoes">
            <button
              type="button"
              className="botao-primario"
              disabled={ocupado}
              onClick={converter}
            >
              Receber e abrir OS
            </button>
            <button
              type="button"
              className="botao-secundario"
              disabled={ocupado}
              onClick={editar}
            >
              Editar agendamento
            </button>
            <button
              type="button"
              className="botao-secundario"
              disabled={ocupado}
              onClick={cancelar}
            >
              Cancelar agendamento
            </button>
          </div>
        )}
        {item.ordem_servico_id && (
          <Link
            className="botao-primario"
            to={`/ordens-servico?os=${item.ordem_servico_id}`}
          >
            Abrir OS
          </Link>
        )}
      </div>
    </Dialogo>
  );
}
