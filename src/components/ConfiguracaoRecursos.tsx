import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAcesso } from "../auth/contexto";
import { novoId } from "../lib/uuid";
import { erroPublico } from "../lib/supabase";
import { Dialogo } from "./Dialogo";
import {
  listarAtivosAgenda,
  salvarAtivoAgenda,
  type AtivoAgenda,
} from "../services/reservasRecursos";
import "./ReservaRecursos.css";
const local = (s: string) =>
  s
    ? new Date(s)
        .toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" })
        .replace(" ", "T")
        .slice(0, 16)
    : "";
const iso = (s: string) => (s ? new Date(`${s}:00-03:00`).toISOString() : "");

export function ConfiguracaoRecursos() {
  const a = useAcesso(),
    w = a.oficina!.id,
    cache = useQueryClient();
  const [aberto, setAberto] = useState(false),
    [item, setItem] = useState<AtivoAgenda | null>(null);
  const [ocupado, setOcupado] = useState(false),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState("");
  const [busca, setBusca] = useState("");
  const trava = useRef(false);
  const gerente = ["owner", "manager"].includes(a.oficina!.perfil);
  const q = useQuery({
    queryKey: ["ativos-agenda", w],
    queryFn: ({ signal }) => listarAtivosAgenda(w, signal),
    enabled: aberto && !a.demo,
  });
  function editar(r?: AtivoAgenda) {
    setErro("");
    setItem(
      r
        ? structuredClone(r)
        : {
            id: novoId(),
            nome: "",
            tipo: "box",
            movel: false,
            ativo: true,
            revisao: 0,
            bloqueios: [],
          },
    );
  }
  const alterar = (d: Partial<AtivoAgenda>) => setItem((p) => (p ? { ...p, ...d } : p));
  return (
    <section className="reserva-config">
      <details onToggle={(e) => setAberto(e.currentTarget.open)}>
        <summary>Boxes e equipamentos</summary>
        <p>
          Cadastre cada box, bancada ou equipamento uma vez. No agendamento, selecione
          todos os recursos necessários.
        </p>
        {aviso && <p role="status">{aviso}</p>}
        {a.demo ? (
          <p>Disponível nas empresas conectadas.</p>
        ) : q.isError ? (
          <p role="alert">{erroPublico(q.error)}</p>
        ) : q.isPending ? (
          <p role="status">Carregando…</p>
        ) : (
          <>
            <div className="reserva-barra">
              <label>
                Buscar recurso
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Nome do box ou equipamento"
                />
              </label>
              {gerente && (
                <button
                  type="button"
                  className="botao-primario"
                  onClick={() => editar()}
                >
                  + Cadastrar recurso
                </button>
              )}
            </div>
            {q.data
              .filter((r) =>
                r.nome.toLocaleLowerCase().includes(busca.toLocaleLowerCase()),
              )
              .map((r) => (
                <div className="reserva-linha" key={r.id}>
                  <div>
                    <strong>{r.nome}</strong>
                    <small>
                      {r.tipo === "box"
                        ? "Box / espaço"
                        : r.movel
                          ? "Equipamento móvel"
                          : "Equipamento fixo"}
                      {!r.ativo && " · Inativo"}
                      {r.bloqueios.length > 0 &&
                        ` · ${r.bloqueios.length} ${r.bloqueios.length === 1 ? "período" : "períodos"} de indisponibilidade`}
                    </small>
                  </div>
                  {gerente && (
                    <button type="button" onClick={() => editar(r)}>
                      Editar
                    </button>
                  )}
                </div>
              ))}
            {!q.data.length && <p>Nenhum box ou equipamento cadastrado.</p>}
          </>
        )}
      </details>
      {item && (
        <Dialogo
          aberto
          titulo={item.revisao ? "Editar recurso" : "Novo box ou equipamento"}
          fechar={() => {
            if (!ocupado) setItem(null);
          }}
        >
          <form
            className="reserva-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (trava.current) return;
              trava.current = true;
              setOcupado(true);
              setErro("");
              try {
                await salvarAtivoAgenda(w, item);
                await Promise.all([
                  cache.invalidateQueries({ queryKey: ["ativos-agenda", w] }),
                  cache.invalidateQueries({
                    queryKey: ["disponibilidade-recursos", w],
                  }),
                ]);
                setItem(null);
                setAviso("Recurso salvo.");
              } catch (e) {
                setErro(erroPublico(e));
              } finally {
                trava.current = false;
                setOcupado(false);
              }
            }}
          >
            <fieldset disabled={ocupado}>
              <label>
                Nome
                <input
                  required
                  minLength={2}
                  maxLength={100}
                  value={item.nome}
                  onChange={(e) => alterar({ nome: e.target.value })}
                  placeholder="Nome ou identificação da unidade"
                />
              </label>
              <label>
                Tipo
                <select
                  value={item.tipo}
                  onChange={(e) =>
                    alterar({
                      tipo: e.target.value as AtivoAgenda["tipo"],
                      movel: e.target.value === "equipamento",
                    })
                  }
                >
                  <option value="box">Box / bancada / espaço</option>
                  <option value="equipamento">Equipamento</option>
                </select>
              </label>
              {item.tipo === "equipamento" && (
                <label className="reserva-check">
                  <input
                    type="checkbox"
                    checked={item.movel}
                    onChange={(e) => alterar({ movel: e.target.checked })}
                  />
                  Equipamento móvel: reservar também durante o deslocamento da visita
                </label>
              )}
              <label className="reserva-check">
                <input
                  type="checkbox"
                  checked={item.ativo}
                  onChange={(e) => alterar({ ativo: e.target.checked })}
                />
                Disponível para novos agendamentos
              </label>
              <details>
                <summary>Manutenção e indisponibilidade (opcional)</summary>
                <p>
                  Reservas existentes precisam ser remarcadas antes de bloquear o mesmo
                  horário.
                </p>
                {item.bloqueios.map((b, i) => (
                  <div className="reserva-bloqueio" key={i}>
                    <label>
                      Início da indisponibilidade (Brasília)
                      <input
                        type="datetime-local"
                        required
                        value={local(b.inicio)}
                        onChange={(e) =>
                          alterar({
                            bloqueios: item.bloqueios.map((x, n) =>
                              n === i ? { ...x, inicio: iso(e.target.value) } : x,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      Fim da indisponibilidade (Brasília)
                      <input
                        type="datetime-local"
                        required
                        value={local(b.fim)}
                        onChange={(e) =>
                          alterar({
                            bloqueios: item.bloqueios.map((x, n) =>
                              n === i ? { ...x, fim: iso(e.target.value) } : x,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      Motivo
                      <input
                        maxLength={200}
                        value={b.motivo}
                        onChange={(e) =>
                          alterar({
                            bloqueios: item.bloqueios.map((x, n) =>
                              n === i ? { ...x, motivo: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        alterar({ bloqueios: item.bloqueios.filter((_, n) => n !== i) })
                      }
                    >
                      Remover período
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={item.bloqueios.length >= 100}
                  onClick={() =>
                    alterar({
                      bloqueios: [
                        ...item.bloqueios,
                        { inicio: "", fim: "", motivo: "" },
                      ],
                    })
                  }
                >
                  + Adicionar período
                </button>
              </details>
              {erro && <p role="alert">{erro}</p>}
              <button className="botao-primario">
                {ocupado ? "Salvando…" : "Salvar recurso"}
              </button>
            </fieldset>
          </form>
        </Dialogo>
      )}
    </section>
  );
}
