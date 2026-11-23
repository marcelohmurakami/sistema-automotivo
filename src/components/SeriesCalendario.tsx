import { useState } from "react";
import "./PlanejamentoOperacional.css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAcesso } from "../auth/contexto";
import { rpc } from "../lib/rpc";
import { erroPublico } from "../lib/supabase";
import { cancelarSerieCalendario } from "../services/calendarioOperacao";
import { Dialogo } from "./Dialogo";
type Serie = { id: string; titulo: string; criado_em: string; proxima: string | null };
export function SeriesCalendario() {
  const a = useAcesso();
  return a.demo || a.oficina?.perfil === "staff" ? null : <Lista key={a.oficina!.id} />;
}
function Lista() {
  const a = useAcesso(),
    qc = useQueryClient(),
    [aberto, setAberto] = useState(false),
    [pagina, setPagina] = useState(0),
    [serie, setSerie] = useState<Serie | null>(null),
    [erro, setErro] = useState(""),
    [busy, setBusy] = useState(false),
    [aviso, setAviso] = useState("");
  const q = useQuery({
    queryKey: ["series-calendario", a.oficina!.id, pagina],
    queryFn: () =>
      rpc<Serie[]>("listar_series_calendario", {
        p_oficina: a.oficina!.id,
        p_pagina: pagina,
      }),
    enabled: aberto,
  });
  return (
    <section className="plano-op">
      <details onToggle={(e) => setAberto(e.currentTarget.open)}>
        <summary>Agendamentos recorrentes</summary>
        {aviso && <p role="status">{aviso}</p>}
        {q.isError && <p role="alert">{erroPublico(q.error)}</p>}
        {q.data?.map((s) => (
          <div className="plano-linha" key={s.id}>
            <span>
              <strong>{s.titulo}</strong>
              <br />
              {s.proxima
                ? `Agendamentos desde ${new Date(s.proxima).toLocaleDateString("pt-BR")}`
                : "Sem agendamentos pendentes"}
            </span>
            <button
              disabled={!s.proxima}
              onClick={() => {
                setSerie(s);
                setErro("");
              }}
            >
              Cancelar próximas visitas
            </button>
          </div>
        ))}
        <div className="plano-acoes">
          <button disabled={!pagina} onClick={() => setPagina((p) => p - 1)}>
            Anterior
          </button>
          <button
            disabled={(q.data?.length || 0) < 20}
            onClick={() => setPagina((p) => p + 1)}
          >
            Próxima
          </button>
        </div>
      </details>
      {serie && (
        <Dialogo
          aberto
          titulo="Cancelar visitas da série"
          fechar={() => {
            if (!busy) setSerie(null);
          }}
        >
          <form
            className="plano-op"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setBusy(true);
              setErro("");
              try {
                const n = await cancelarSerieCalendario(
                  a.oficina!.id,
                  serie.id,
                  String(f.get("desde")),
                );
                setAviso(
                  `${n} agendamentos cancelados. Os registros das ordens de serviço foram preservados.`,
                );
                await Promise.all(
                  ["series-calendario", "servicos", "produtividade", "alertas"].map(
                    (k) => qc.invalidateQueries({ queryKey: [k] }),
                  ),
                );
                setSerie(null);
              } catch (err) {
                setErro(erroPublico(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            <p>
              {serie.titulo}. Serão cancelados apenas os agendamentos pendentes a partir
              da data escolhida. Ordens de serviço e visitas já realizadas permanecem no
              histórico.
            </p>
            <label>
              A partir de
              <input
                name="desde"
                type="date"
                required
                defaultValue={new Date().toLocaleDateString("en-CA")}
              />
            </label>
            {erro && <p role="alert">{erro}</p>}
            <button className="botao-primario" disabled={busy}>
              Confirmar cancelamento
            </button>
          </form>
        </Dialogo>
      )}
    </section>
  );
}
