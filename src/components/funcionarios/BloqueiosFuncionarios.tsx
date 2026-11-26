import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Building2, CalendarOff, RotateCcw } from "lucide-react";
import { useAcesso } from "../../auth/contexto";
import { erroPublico } from "../../lib/supabase";
import { novoId } from "../../lib/uuid";
import { intervaloBloqueio } from "../../lib/gestaoFuncionario";
import { listarFuncionarios, type Funcionario } from "../../services/funcionarios";
import {
  listarBloqueiosFuncionario,
  registrarBloqueioFuncionario,
  cancelarBloqueioFuncionario,
  type BloqueioFuncionario,
} from "../../services/gestaoFuncionario";
const tipos: Record<string, string> = {
  folga: "Folga",
  ferias: "Férias",
  atestado: "Atestado",
  bloqueio: "Indisponibilidade",
  feriado: "Feriado",
  manutencao: "Manutenção",
  evento: "Evento",
  outro: "Outro",
};
const dataLocal = (date: Date) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
function periodo(b: BloqueioFuncionario) {
  const formato = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    ...(b.dia_inteiro ? {} : { timeStyle: "short" }),
  });
  return `${formato.format(new Date(b.inicio))} — ${formato.format(new Date(Date.parse(b.fim) - (b.dia_inteiro ? 1 : 0)))}`;
}
export default function BloqueiosFuncionarios({
  funcionario,
}: {
  funcionario?: Funcionario;
}) {
  const [agora] = useState(() => Date.now());
  const a = useAcesso(),
    w = a.oficina!,
    qc = useQueryClient(),
    hoje = dataLocal(new Date());
  const [alvo, setAlvo] = useState(funcionario?.id ?? ""),
    [inteiro, setInteiro] = useState(false),
    [confirmado, setConfirmado] = useState(false),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState(""),
    [ocupado, setOcupado] = useState(false),
    [cancelar, setCancelar] = useState<BloqueioFuncionario | null>(null),
    [motivoCancelamento, setMotivoCancelamento] = useState("");
  const trava = useRef(false),
    id = useRef(novoId());
  const q = useQuery({
    queryKey: ["bloqueios-funcionarios", a.demo, w.id, funcionario?.id ?? "todos"],
    queryFn: ({ signal }) =>
      listarBloqueiosFuncionario(a.demo, w.id, funcionario?.id, signal),
  });
  const equipe = useQuery({
    queryKey: ["funcionarios", a.demo, w.id],
    queryFn: ({ signal }) => listarFuncionarios(a.demo, w.id, signal),
    enabled: !funcionario,
  });
  async function executar(acao: () => Promise<unknown>, mensagem: string) {
    if (trava.current) return;
    trava.current = true;
    setOcupado(true);
    setErro("");
    setAviso("");
    try {
      await acao();
      void qc.invalidateQueries({ queryKey: ["bloqueios-funcionarios"] });
      setAviso(mensagem);
      setCancelar(null);
    } catch (e) {
      setErro(erroPublico(e));
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }
  function criar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!alvo || (alvo === "global" && !confirmado)) {
      setErro(
        "Escolha o alcance e confirme o bloqueio de toda a empresa, se aplicável.",
      );
      return;
    }
    const form = e.currentTarget,
      d = new FormData(form);
    try {
      const intervalo = intervaloBloqueio(
        String(d.get("inicio")),
        String(d.get("fim")),
        inteiro,
      );
      void executar(
        async () => {
          await registrarBloqueioFuncionario(a.demo, w.id, {
            id: id.current,
            funcionario_id: alvo === "global" ? null : alvo,
            tipo: String(d.get("tipo")),
            dia_inteiro: inteiro,
            motivo: String(d.get("motivo") ?? "").trim(),
            ...intervalo,
          });
          id.current = novoId();
          form.reset();
          setInteiro(false);
          setConfirmado(false);
          setAlvo(funcionario?.id ?? "");
        },
        funcionario ? "Ausência registrada." : "Bloqueio criado.",
      );
    } catch (e) {
      setErro(erroPublico(e));
    }
  }
  const registros = q.data ?? [];
  return (
    <div
      className={
        funcionario
          ? "func-bloqueios"
          : "func-corpo func-bloqueios func-bloqueios-global"
      }
    >
      <form onSubmit={criar}>
        <fieldset disabled={ocupado}>
          <div className="func-intro">
            <h3>{funcionario ? "Nova ausência" : "Novo bloqueio"}</h3>
            <p>Defina quem ficará indisponível e por quanto tempo.</p>
          </div>
          {!funcionario && (
            <label>
              Aplicar a
              <select
                required
                value={alvo}
                onChange={(e) => {
                  setAlvo(e.target.value);
                  setConfirmado(false);
                }}
              >
                <option value="">Escolha o alcance</option>
                <option value="global">Toda a empresa</option>
                {(equipe.data ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                    {f.ativo ? "" : " (inativo)"}
                  </option>
                ))}
              </select>
              {equipe.isError && (
                <span role="alert">
                  {erroPublico(equipe.error)}{" "}
                  <button type="button" onClick={() => void equipe.refetch()}>
                    Tentar novamente
                  </button>
                </span>
              )}
            </label>
          )}
          {alvo === "global" && (
            <div className="func-nota">
              <strong>Toda a empresa ficará indisponível no período.</strong>
              <label className="func-check">
                <input
                  type="checkbox"
                  checked={confirmado}
                  onChange={(e) => setConfirmado(e.target.checked)}
                  required
                />
                Confirmo o bloqueio de toda a empresa
              </label>
            </div>
          )}
          <label>
            Tipo
            <select name="tipo" defaultValue={funcionario ? "folga" : "bloqueio"}>
              {(funcionario
                ? ["folga", "ferias", "atestado", "bloqueio", "outro"]
                : ["bloqueio", "feriado", "manutencao", "evento", "outro"]
              ).map((t) => (
                <option key={t} value={t}>
                  {tipos[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="func-check">
            <input
              type="checkbox"
              checked={inteiro}
              onChange={(e) => setInteiro(e.target.checked)}
            />
            Dia inteiro
          </label>
          <div className="func-form-grid" key={String(inteiro)}>
            <label>
              Início
              <input
                type={inteiro ? "date" : "datetime-local"}
                name="inicio"
                defaultValue={hoje + (inteiro ? "" : "T08:00")}
                required
              />
            </label>
            <label>
              Término
              <input
                type={inteiro ? "date" : "datetime-local"}
                name="fim"
                defaultValue={hoje + (inteiro ? "" : "T18:00")}
                required
              />
            </label>
          </div>
          <label>
            Motivo (opcional)
            <textarea name="motivo" rows={2} maxLength={500} />
          </label>
          {erro && !cancelar && (
            <p role="alert" className="erro-formulario">
              {erro}
            </p>
          )}
          {aviso && (
            <p role="status" className="aviso-cliente">
              {aviso}
            </p>
          )}
          <button
            className="botao-primario"
            disabled={ocupado || !alvo || (alvo === "global" && !confirmado)}
          >
            <Ban size={17} />
            {ocupado
              ? "Salvando…"
              : funcionario
                ? "Registrar ausência"
                : "Criar bloqueio"}
          </button>
        </fieldset>
      </form>
      <section>
        <h3>Bloqueios e histórico recente</h3>
        {q.isPending ? (
          <p role="status">Carregando bloqueios…</p>
        ) : q.isError ? (
          <p role="alert">
            {erroPublico(q.error)}{" "}
            <button onClick={() => void q.refetch()}>Tentar novamente</button>
          </p>
        ) : !registros.length ? (
          <div className="func-vazio">
            <CalendarOff size={28} />
            <p>Nenhum bloqueio cadastrado.</p>
          </div>
        ) : (
          <div className="func-bloqueio-lista">
            {registros.map((b) => (
              <article
                key={b.id}
                className="func-bloqueio"
                data-cancelado={!!b.cancelado_em}
              >
                {b.funcionario_id ? <CalendarOff size={18} /> : <Building2 size={18} />}
                <div>
                  <strong>{tipos[b.tipo] ?? b.tipo}</strong>
                  <span>
                    {b.funcionario_id
                      ? (b.funcionario_nome ?? funcionario?.nome)
                      : "Toda a empresa"}
                  </span>
                  <small>{periodo(b)}</small>
                  {b.motivo && <small>{b.motivo}</small>}
                  {b.cancelamento_motivo && (
                    <small>Cancelamento: {b.cancelamento_motivo}</small>
                  )}
                  <span className="func-etiqueta">
                    {b.cancelado_em
                      ? "Cancelado"
                      : Date.parse(b.fim) < agora
                        ? "Encerrado"
                        : "Ativo"}
                  </span>
                </div>
                {!b.cancelado_em && (
                  <button
                    type="button"
                    disabled={ocupado}
                    className="botao-icone"
                    title="Cancelar bloqueio"
                    aria-label={`Cancelar bloqueio: ${b.funcionario_nome ?? "Toda a empresa"}, ${periodo(b)}`}
                    onClick={() => {
                      setErro("");
                      setMotivoCancelamento("");
                      setCancelar(b);
                    }}
                  >
                    <RotateCcw size={17} />
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
      {cancelar && (
        <section className="func-cancelamento">
          <label>
            Motivo do cancelamento
            <input
              maxLength={500}
              autoFocus
              value={motivoCancelamento}
              onChange={(e) => setMotivoCancelamento(e.target.value)}
            />
          </label>
          {erro && (
            <p role="alert" className="erro-formulario">
              {erro}
            </p>
          )}
          <div className="func-rodape">
            <button
              className="botao-secundario"
              disabled={ocupado}
              onClick={() => setCancelar(null)}
            >
              Voltar
            </button>
            <button
              className="botao-primario"
              disabled={ocupado || !motivoCancelamento.trim()}
              onClick={() =>
                void executar(
                  () =>
                    cancelarBloqueioFuncionario(
                      a.demo,
                      w.id,
                      cancelar.id,
                      motivoCancelamento.trim(),
                    ),
                  "Bloqueio cancelado.",
                )
              }
            >
              Confirmar cancelamento
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
