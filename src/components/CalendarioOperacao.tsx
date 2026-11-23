import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAcesso } from "../auth/contexto";
import { Dialogo } from "./Dialogo";
import { erroPublico } from "../lib/supabase";
import {
  consultarCalendario,
  salvarCalendario,
  type Feriado,
} from "../services/calendarioOperacao";
import "./PlanejamentoOperacional.css";
import { SeriesCalendario } from "./SeriesCalendario";
const dia = (d: string) => d.split("-").reverse().join("/");
export function ConfiguracaoCalendario() {
  const a = useAcesso(),
    [aberto, setAberto] = useState(false),
    [edit, setEdit] = useState<Feriado[] | null>(null),
    [erro, setErro] = useState(""),
    [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["calendario-operacao", a.oficina!.id],
    queryFn: () => consultarCalendario(a.oficina!.id),
    enabled: aberto && !a.demo,
  });
  return (
    <section className="plano-op">
      <SeriesCalendario />
      <details onToggle={(e) => setAberto(e.currentTarget.open)}>
        <summary>Feriados e dias de fechamento</summary>
        <p>
          As novas séries usam estas datas. Agendamentos já confirmados permanecem como
          estão.
        </p>
        {q.isError && <p role="alert">{erroPublico(q.error)}</p>}
        {q.data?.feriados.map((f, i) => (
          <div className="plano-linha" key={i}>
            <strong>{dia(f.data)}</strong>
            <span>{f.nome}</span>
            <small>{f.anual ? "Todo ano" : "Somente nesta data"}</small>
          </div>
        ))}
        {a.oficina!.perfil !== "staff" && (
          <button
            className="botao-secundario"
            disabled={!q.data || a.demo}
            onClick={() => {
              setEdit(structuredClone(q.data!.feriados));
              setErro("");
            }}
          >
            Editar calendário
          </button>
        )}
      </details>
      {edit && (
        <Dialogo
          titulo="Feriados e fechamentos"
          aberto
          fechar={() => {
            if (!busy) setEdit(null);
          }}
        >
          <form
            className="plano-op"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setErro("");
              try {
                await salvarCalendario(a.oficina!.id, edit, q.data!.revisao);
                await q.refetch();
                setEdit(null);
              } catch (err) {
                setErro(erroPublico(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            <fieldset disabled={busy}>
              {edit.map((f, i) => (
                <div className="plano-campos" key={i}>
                  <label>
                    Data
                    <input
                      type="date"
                      required
                      value={f.data}
                      onChange={(e) =>
                        setEdit(
                          edit.map((x, j) =>
                            j === i ? { ...x, data: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Nome
                    <input
                      required
                      minLength={2}
                      maxLength={100}
                      value={f.nome}
                      onChange={(e) =>
                        setEdit(
                          edit.map((x, j) =>
                            j === i ? { ...x, nome: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="plano-check">
                    <input
                      type="checkbox"
                      checked={f.anual}
                      onChange={(e) =>
                        setEdit(
                          edit.map((x, j) =>
                            j === i ? { ...x, anual: e.target.checked } : x,
                          ),
                        )
                      }
                    />
                    Todo ano
                  </label>
                  <button
                    type="button"
                    onClick={() => setEdit(edit.filter((_, j) => j !== i))}
                  >
                    Remover
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="botao-secundario"
                disabled={edit.length >= 300}
                onClick={() => setEdit([...edit, { data: "", nome: "", anual: false }])}
              >
                Adicionar data
              </button>
              {erro && <p role="alert">{erro}</p>}
              <button className="botao-primario">Salvar calendário</button>
            </fieldset>
          </form>
        </Dialogo>
      )}
    </section>
  );
}
