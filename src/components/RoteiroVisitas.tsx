import { useState } from "react";
import { Route } from "lucide-react";
import {
  fimOcupacao,
  horarioVisita,
  inicioOcupacao,
  linkNavegacao,
  reservaAtiva,
  type VisitaPlanejada,
} from "../lib/logisticaVisitas";
import "./PlanejamentoVisita.css";
export type VisitaRoteiro = VisitaPlanejada & {
  titulo: string;
  cliente: string;
  equipe: string;
};
export function RoteiroVisitas({
  reservas,
  data,
  abrir,
}: {
  reservas: VisitaRoteiro[];
  data?: string;
  abrir: (id: string) => void;
}) {
  const [dia, setDia] = useState(() =>
    new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }),
  );
  const [equipe, setEquipe] = useState("");
  const atual = data || dia;
  const diaInicio = Date.parse(`${atual}T00:00:00-03:00`),
    diaFim = diaInicio + 86400000;
  const todas = reservas
    .filter(
      (x) =>
        reservaAtiva(x) && inicioOcupacao(x) < diaFim && fimOcupacao(x) > diaInicio,
    )
    .sort((a, b) => inicioOcupacao(a) - inicioOcupacao(b));
  const visitas = todas.filter((x) => x.visita && (!equipe || x.equipe === equipe));
  const anteriorPorId = new Map<string, VisitaRoteiro>();
  const ultimaPorEquipe = new Map<string, VisitaRoteiro>();
  for (const x of [...todas].sort(
    (a, b) => Date.parse(a.inicio) - Date.parse(b.inicio),
  )) {
    const anterior = ultimaPorEquipe.get(x.equipe);
    if (anterior) anteriorPorId.set(x.id, anterior);
    ultimaPorEquipe.set(x.equipe, x);
  }
  if (!reservas.some((x) => x.visita && reservaAtiva(x))) return null;
  const tempo = visitas.reduce(
    (n, x) => n + (x.deslocamento_minutos || 0) + (x.logistica?.retorno_minutos || 0),
    0,
  );
  return (
    <section className="roteiro-visitas">
      <header>
        <div>
          <h3>
            <Route size={20} /> Roteiro de visitas
          </h3>
          <p>
            {visitas.length} {visitas.length === 1 ? "visita" : "visitas"} · {tempo} min
            de viagem planejada
          </p>
        </div>
        <div className="visita-atalhos">
          {!data && (
            <label>
              Dia do roteiro
              <input
                type="date"
                value={dia}
                onChange={(e) => {
                  if (e.target.value) setDia(e.target.value);
                }}
              />
            </label>
          )}
          <label>
            Equipe do roteiro
            <select value={equipe} onChange={(e) => setEquipe(e.target.value)}>
              <option value="">Todas</option>
              {[...new Set(reservas.map((x) => x.equipe))].sort().map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
        </div>
      </header>
      {!visitas.length && <p>Nenhuma visita ativa neste dia e equipe.</p>}
      <ol>
        {visitas.map((x) => {
          const anterior = anteriorPorId.get(x.id);
          const folga = anterior
            ? Math.floor((inicioOcupacao(x) - fimOcupacao(anterior)) / 60000)
            : null;
          const pontoAnterior = anterior?.visita
            ? anterior.logistica?.retorno_minutos
              ? anterior.logistica.origem
              : anterior.logistica?.destino
            : undefined;
          const origemDiferente =
            pontoAnterior &&
            x.logistica?.origem &&
            pontoAnterior.trim().toLocaleLowerCase() !==
              x.logistica.origem.trim().toLocaleLowerCase();
          return (
            <li key={x.id}>
              <div className="roteiro-horarios">
                <small>Sair até</small>
                <strong>{horarioVisita(inicioOcupacao(x))}</strong>
                <small>Atender {horarioVisita(Date.parse(x.inicio))}</small>
              </div>
              <button className="roteiro-detalhe" onClick={() => abrir(x.id)}>
                <strong>{x.cliente}</strong>
                <span>
                  {x.titulo} · {x.equipe}
                </span>
                <span>{x.logistica?.destino || "Endereço ainda não informado"}</span>
                <small>
                  Origem: {x.logistica?.origem || "Não informada"} · Equipe livre{" "}
                  {horarioVisita(fimOcupacao(x))}
                </small>
                {folga !== null && (
                  <small className={folga < 0 ? "erro-formulario" : ""}>
                    {folga < 0
                      ? `Conflito: faltam ${-folga} min entre atendimentos`
                      : `${folga} min livres antes da saída`}
                  </small>
                )}
                {origemDiferente && (
                  <small className="erro-formulario">
                    Confira a origem: difere do local em que terminou o atendimento
                    anterior.
                  </small>
                )}
              </button>
              {x.logistica?.origem && x.logistica?.destino && (
                <a
                  className="botao-secundario"
                  href={linkNavegacao(x.logistica.origem, x.logistica.destino)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Navegar ↗
                </a>
              )}
            </li>
          );
        })}
      </ol>
      <small>
        Ordem dos horários confirmados. Confira o trânsito antes de sair; a margem é
        reservada junto com a viagem.
      </small>
    </section>
  );
}
