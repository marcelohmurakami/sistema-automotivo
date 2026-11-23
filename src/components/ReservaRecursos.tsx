import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAcesso } from "../auth/contexto";
import { erroPublico } from "../lib/supabase";
import { dadosVisita, horarioVisita } from "../lib/logisticaVisitas";
import {
  conferirRecursosAgenda,
  listarAtivosAgenda,
  type ResumoRecurso,
} from "../services/reservasRecursos";
import "./ReservaRecursos.css";

/** Reutilizado pelas duas agendas; a reserva definitiva ocorre no salvamento. */
export function ReservaRecursos({
  id,
  inicial = [],
  resumo = [],
  inicio,
  fim,
}: {
  id: string;
  inicial?: string[];
  resumo?: ResumoRecurso[];
  inicio: string;
  fim: string | null;
}) {
  const acesso = useAcesso(),
    oficina = acesso.oficina!.id;
  const ref = useRef<HTMLDetailsElement>(null);
  const [aberto, setAberto] = useState(inicial.length > 0);
  const [selecionados, setSelecionados] = useState(inicial);
  const [busca, setBusca] = useState("");
  const [periodo, setPeriodo] = useState("");
  const [versao, setVersao] = useState(0);
  const catalogo = useQuery({
    queryKey: ["ativos-agenda", oficina],
    queryFn: ({ signal }) => listarAtivosAgenda(oficina, signal),
    enabled: aberto && !acesso.demo,
    staleTime: 30000,
  });
  // Campos de logística são compartilhados com o formulário pai.
  useEffect(() => {
    if (!aberto) return;
    const form = ref.current?.closest("form");
    if (!form) return;
    let timer: ReturnType<typeof setTimeout>;
    const ler = () => {
      const f = new FormData(form);
      const i = String(f.get("inicio") || ""),
        t = String(f.get("fim") || "");
      setPeriodo(
        i &&
          t &&
          Number.isFinite(Date.parse(`${i}:00-03:00`)) &&
          Number.isFinite(Date.parse(`${t}:00-03:00`))
          ? JSON.stringify({
              id,
              inicio: new Date(`${i}:00-03:00`).toISOString(),
              fim: new Date(`${t}:00-03:00`).toISOString(),
              ...dadosVisita(f),
            })
          : "",
      );
    };
    const atualizar = (e?: Event) => {
      if (e?.target instanceof Element && e.target.closest(".reserva-recursos")) return;
      // Retira imediatamente o status antigo enquanto o novo período é conferido.
      setPeriodo("");
      clearTimeout(timer);
      timer = setTimeout(ler, 250);
    };
    timer = setTimeout(ler, 0);
    form.addEventListener("input", atualizar);
    form.addEventListener("change", atualizar);
    const observer = new MutationObserver((changes) => {
      if (
        changes.some(
          (c) => c.target instanceof HTMLInputElement && c.target.name === "logistica",
        )
      )
        atualizar();
    });
    observer.observe(form, {
      subtree: true,
      attributes: true,
      attributeFilter: ["value"],
    });
    return () => {
      clearTimeout(timer);
      form.removeEventListener("input", atualizar);
      form.removeEventListener("change", atualizar);
      observer.disconnect();
    };
  }, [aberto, id, inicio, fim, versao]);
  const disponibilidade = useQuery({
    queryKey: ["disponibilidade-recursos", oficina, periodo],
    queryFn: ({ signal }) =>
      conferirRecursosAgenda(oficina, JSON.parse(periodo), signal),
    enabled: aberto && !!periodo && !acesso.demo,
    staleTime: 0,
    refetchInterval: 30000,
  });
  const nomes = new Map(
    [...resumo, ...(catalogo.data || [])].map((r) => [r.id, r.nome]),
  );
  const estados = new Map(disponibilidade.data?.map((r) => [r.id, r]));
  const lista = (catalogo.data || []).filter(
    (r) =>
      (r.ativo || selecionados.includes(r.id)) &&
      (!busca || r.nome.toLocaleLowerCase().includes(busca.toLocaleLowerCase())),
  );
  return (
    <details
      className="reserva-recursos"
      ref={ref}
      open={aberto}
      onToggle={(e) => setAberto(e.currentTarget.open)}
    >
      <summary>
        Reservar box e equipamentos (opcional)
        {selecionados.length > 0 && (
          <span>
            {" "}
            · {selecionados.length}{" "}
            {selecionados.length === 1 ? "selecionado" : "selecionados"}
          </span>
        )}
      </summary>
      <input
        type="hidden"
        name="recursos_reservados"
        value={JSON.stringify(selecionados)}
      />
      <p>
        O técnico e os recursos serão reservados juntos ao salvar. Equipamentos móveis
        incluem ida e volta; boxes e equipamentos fixos usam o horário do serviço.
      </p>
      {acesso.demo ? (
        <p>Entre na empresa conectada para reservar recursos.</p>
      ) : (
        <>
          {catalogo.isPending && <p role="status">Carregando recursos…</p>}
          {catalogo.isError && (
            <p role="alert">
              {erroPublico(catalogo.error)}{" "}
              <button type="button" onClick={() => void catalogo.refetch()}>
                Tentar novamente
              </button>
            </p>
          )}
          {catalogo.data?.length === 0 && (
            <p>
              Cadastre os boxes e equipamentos na seção “Boxes e equipamentos”, no fim
              da agenda.
            </p>
          )}
          {selecionados.length > 0 && (
            <div className="reserva-selecionados" aria-label="Recursos selecionados">
              {selecionados.map((r) => (
                <button
                  type="button"
                  key={r}
                  aria-label={`Remover ${nomes.get(r) || "recurso"} da reserva`}
                  onClick={() => setSelecionados((s) => s.filter((x) => x !== r))}
                >
                  {nomes.get(r) || "Recurso indisponível"} ×
                </button>
              ))}
            </div>
          )}
          {!!catalogo.data?.length && (
            <>
              <label>
                Buscar box ou equipamento
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Digite o nome…"
                />
              </label>
              {!periodo ? (
                <p role="status">
                  Informe início e término para consultar a disponibilidade.
                </p>
              ) : disponibilidade.isFetching ? (
                <p role="status">Conferindo disponibilidade…</p>
              ) : disponibilidade.isError ? (
                <p role="alert">{erroPublico(disponibilidade.error)}</p>
              ) : null}
              <button
                type="button"
                className="botao-secundario"
                onClick={() => {
                  setVersao((v) => v + 1);
                  void disponibilidade.refetch();
                }}
                disabled={!periodo || disponibilidade.isFetching}
              >
                Atualizar disponibilidade
              </button>
              {(["box", "equipamento"] as const).map((tipo) => (
                <section
                  key={tipo}
                  aria-label={tipo === "box" ? "Boxes e espaços" : "Equipamentos"}
                >
                  <h4>{tipo === "box" ? "Boxes e espaços" : "Equipamentos"}</h4>
                  {lista
                    .filter((r) => r.tipo === tipo)
                    .map((r) => {
                      const estado = estados.get(r.id),
                        marcado = selecionados.includes(r.id);
                      const conferido =
                        !!periodo &&
                        !disponibilidade.isFetching &&
                        !disponibilidade.isError &&
                        !!estado;
                      return (
                        <label
                          key={r.id}
                          className={`reserva-opcao ${marcado ? "selecionado" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={marcado}
                            disabled={
                              !marcado &&
                              (!conferido ||
                                !estado?.disponivel ||
                                selecionados.length >= 20)
                            }
                            onChange={(e) =>
                              setSelecionados((s) =>
                                e.target.checked
                                  ? [...s, r.id]
                                  : s.filter((x) => x !== r.id),
                              )
                            }
                          />
                          <span>
                            <strong>{r.nome}</strong>
                            <small>
                              {r.movel
                                ? "Móvel · inclui deslocamento"
                                : "Fixo · horário do serviço"}
                            </small>
                          </span>
                          <span
                            className={`reserva-status ${conferido && !estado.disponivel ? "indisponivel" : ""}`}
                          >
                            {conferido
                              ? estado.disponivel
                                ? "Disponível"
                                : estado.motivo
                              : "A conferir"}
                            {conferido && marcado && (
                              <small>
                                {horarioVisita(Date.parse(estado.inicio))} –{" "}
                                {horarioVisita(Date.parse(estado.fim))}
                              </small>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  {!lista.some((r) => r.tipo === tipo) && (
                    <p>Nenhum recurso encontrado.</p>
                  )}
                </section>
              ))}
              <small>
                A disponibilidade será conferida novamente ao salvar. Em séries de
                visitas, cada data será validada.
              </small>
            </>
          )}
        </>
      )}
    </details>
  );
}
