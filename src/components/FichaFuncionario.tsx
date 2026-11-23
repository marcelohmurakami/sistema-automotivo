import { novoId } from "../lib/uuid.ts";
import { atualizarCadastro } from "../lib/atualizarCadastro";
import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAcesso } from "../auth/contexto";
import { erroPublico } from "../lib/supabase";
import { hoje } from "../services/financeiro";
import {
  listarRegistrosFuncionario,
  registrarEventoFuncionario,
  situacaoEventoFuncionario,
  tiposRegistroFuncionario,
  type Funcionario,
  type RegistroFuncionario,
} from "../services/funcionarios";
import "./FichaFuncionario.css";
import { ValeFuncionario } from "./ValeFuncionario";
export { CamposFichaFuncionario } from "./CamposFichaFuncionario";
const dataBR = (v: string) => v.split("-").reverse().join("/");
export function HistoricoFuncionario({
  f,
  somenteVales = false,
}: {
  f: Funcionario;
  somenteVales?: boolean;
}) {
  const a = useAcesso(),
    o = a.oficina!.id,
    qc = useQueryClient();
  const [novo, setNovo] = useState(false),
    [tipo, setTipo] = useState(somenteVales ? "vale" : "recado"),
    [erro, setErro] = useState(""),
    [ocupado, setOcupado] = useState(false),
    [aviso, setAviso] = useState(""),
    [filtro, setFiltro] = useState("");
  const chave = useRef(novoId()),
    trava = useRef(false);
  const q = useQuery({
    queryKey: ["funcionario-registros", a.demo, o, f.id],
    queryFn: ({ signal }) => listarRegistrosFuncionario(a.demo, o, f.id, signal),
  });
  async function executar(fn: () => Promise<unknown>) {
    if (trava.current) return;
    trava.current = true;
    setOcupado(true);
    setErro("");
    try {
      await fn();
      await atualizarCadastro(qc, ["funcionario-registros", a.demo, o, f.id]);
      setNovo(false);
      setAviso("Histórico atualizado.");
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      setOcupado(false);
      trava.current = false;
    }
  }
  function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget),
      inicio = String(d.get("inicio")),
      fim = String(d.get("fim") || "");
    if (fim && fim < inicio) {
      setErro("A data final deve ser igual ou posterior à inicial.");
      return;
    }
    const r: RegistroFuncionario = {
      id: chave.current,
      tipo,
      inicio,
      fim: fim || null,
      descricao: String(d.get("descricao")).trim(),
      situacao: "pendente",
      ...(["vale", "emprestimo"].includes(tipo)
        ? { valor_centavos: Math.round(Number(d.get("valor")) * 100) }
        : {}),
    };
    void executar(() => registrarEventoFuncionario(a.demo, o, f.id, r));
  }
  const tipos = Object.entries(tiposRegistroFuncionario).filter(
    ([k]) => ["vale", "emprestimo"].includes(k) === somenteVales,
  );
  const registros = (q.data ?? [])
    .filter((r) => ["vale", "emprestimo"].includes(r.tipo) === somenteVales)
    .slice()
    .sort(
      (a, b) =>
        b.inicio.localeCompare(a.inicio) ||
        (b.criado_em ?? "").localeCompare(a.criado_em ?? ""),
    );
  const pendentes = registros.filter((r) => r.situacao === "pendente");
  return (
    <section
      className={
        somenteVales
          ? "funcionario-historico funcionario-vales"
          : "funcionario-historico"
      }
    >
      <div className="funcionario-historico-topo">
        <div>
          <h3>
            {somenteVales
              ? "Vales, adiantamentos e empréstimos"
              : "Histórico e acompanhamento"}
          </h3>
          <p>{pendentes.length} registro(s) pendente(s)</p>
        </div>
        <button
          type="button"
          className="botao-secundario"
          disabled={ocupado}
          onClick={() => {
            chave.current = novoId();
            setErro("");
            setNovo(true);
          }}
        >
          {somenteVales ? "Registrar vale / empréstimo" : "Adicionar registro"}
        </button>
      </div>
      {aviso && <p role="status">{aviso}</p>}
      {erro && (
        <p role="alert" className="erro-formulario">
          {erro}
        </p>
      )}
      {novo && (
        <form
          className="formulario-cliente funcionario-registro-form"
          onSubmit={salvar}
        >
          <fieldset disabled={ocupado}>
            <label>
              Tipo de registro
              <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {tipos
                  .filter(([k]) => k !== "salario")
                  .map(([k, n]) => (
                    <option value={k} key={k}>
                      {n}
                    </option>
                  ))}
              </select>
            </label>
            <div className="dupla-campos">
              <label>
                {tipo === "recado" ? "Data / prazo" : "Data inicial"}
                <input type="date" name="inicio" defaultValue={hoje()} required />
              </label>
              <label>
                {["vale", "emprestimo"].includes(tipo)
                  ? "Previsão de devolução (opcional)"
                  : "Data final (opcional)"}
                <input type="date" name="fim" />
              </label>
            </div>
            {["vale", "emprestimo"].includes(tipo) && (
              <>
                <label>
                  Valor concedido (R$)
                  <input
                    type="number"
                    name="valor"
                    min="0.01"
                    max="100000000"
                    step="0.01"
                    required
                  />
                </label>
                <p className="texto-suave">
                  Controle interno da ficha. Não movimenta o caixa nem desconta do
                  salário automaticamente.
                </p>
              </>
            )}
            <label>
              Descrição / motivo
              <textarea
                name="descricao"
                rows={3}
                required
                maxLength={2000}
                placeholder={
                  tipo === "ferias"
                    ? "Período combinado, referência e observações"
                    : tipo === "ausencia"
                      ? "Motivo, duração e se a ausência foi justificada"
                      : "O que precisa ficar registrado"
                }
              />
            </label>
            <div className="compra-acoes">
              <button className="botao-primario">
                {ocupado ? "Salvando…" : "Salvar registro"}
              </button>
              <button
                type="button"
                className="botao-secundario"
                onClick={() => setNovo(false)}
              >
                Cancelar
              </button>
            </div>
          </fieldset>
        </form>
      )}
      <label>
        Mostrar registros
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="">Todos</option>
          {tipos.map(([k, n]) => (
            <option key={k} value={k}>
              {n}
            </option>
          ))}
        </select>
      </label>
      {q.isPending ? (
        <p>Carregando histórico…</p>
      ) : q.isError ? (
        <p role="alert">
          {erroPublico(q.error)}{" "}
          <button type="button" onClick={() => void q.refetch()}>
            Tentar novamente
          </button>
        </p>
      ) : (
        <div>
          {!registros.filter((r) => !filtro || r.tipo === filtro).length && (
            <p>Nenhum registro neste filtro.</p>
          )}
          {registros
            .filter((r) => !filtro || r.tipo === filtro)
            .map((r) => (
              <article className="funcionario-registro" key={r.id}>
                <div>
                  <strong>{tiposRegistroFuncionario[r.tipo]}</strong>
                  <span>
                    {dataBR(r.inicio)}
                    {r.fim ? ` até ${dataBR(r.fim)}` : ""} ·{" "}
                    {r.situacao === "pendente"
                      ? "Pendente"
                      : r.situacao === "concluido"
                        ? ["vale", "emprestimo"].includes(r.tipo)
                          ? "Quitado"
                          : "Concluído"
                        : "Cancelado"}
                  </span>
                </div>
                <p>{r.descricao}</p>
                {["vale", "emprestimo"].includes(r.tipo) && (
                  <ValeFuncionario
                    key={`${r.id}:${r.abatimentos?.length ?? 0}`}
                    r={r}
                    funcionario={f.id}
                    ocupado={ocupado}
                    executar={executar}
                  />
                )}
                {r.situacao === "pendente" && (
                  <div className="compra-acoes">
                    {!["vale", "emprestimo"].includes(r.tipo) && (
                      <button
                        type="button"
                        className="botao-secundario"
                        disabled={ocupado}
                        onClick={() =>
                          void executar(() =>
                            situacaoEventoFuncionario(
                              a.demo,
                              o,
                              f.id,
                              r.id,
                              "concluido",
                            ),
                          )
                        }
                      >
                        Concluir
                      </button>
                    )}
                    <button
                      type="button"
                      className="botao-secundario"
                      disabled={ocupado || !!r.abatimentos?.length}
                      onClick={() =>
                        void executar(() =>
                          situacaoEventoFuncionario(a.demo, o, f.id, r.id, "cancelado"),
                        )
                      }
                    >
                      Cancelar registro
                    </button>
                  </div>
                )}
              </article>
            ))}
        </div>
      )}
    </section>
  );
}
