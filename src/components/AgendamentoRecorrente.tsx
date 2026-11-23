import { useId, useState } from "react";
import { useAcesso } from "../auth/contexto";
import { erroPublico } from "../lib/supabase";
import {
  preverCalendario,
  regraInicial,
  type OcorrenciaCalendario,
} from "../services/calendarioOperacao";
import "./PlanejamentoOperacional.css";
import "./AgendamentoRecorrente.css";

const semana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const unidades: Record<string, [string, string]> = {
  diaria: ["dia", "dias"],
  semanal: ["semana", "semanas"],
  mensal: ["mês", "meses"],
  anual: ["ano", "anos"],
};
const dia = (d: string) => d.split("-").reverse().join("/");

export function AgendamentoRecorrente({
  quantidade,
  alterar,
  inicio,
  fim,
}: {
  quantidade: number;
  alterar: (n: number) => void;
  inicio: string;
  fim: string;
}) {
  const a = useAcesso();
  const titulo = useId();
  const [r, setR] = useState(regraInicial);
  const [previa, setPrevia] = useState<{
    chave: string;
    datas: OcorrenciaCalendario[];
  }>();
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const [dataEx, setDataEx] = useState("");
  const [novaData, setNovaData] = useState("");
  const [acaoEx, setAcaoEx] = useState("pular");
  const chave = JSON.stringify({ inicio, fim, quantidade, r });
  const lista = previa?.chave === chave ? previa.datas : [];
  const mudar = (v: Partial<typeof r>) => {
    setR((p) => ({ ...p, ...v }));
    setErro("");
  };
  if (a.demo || a.oficina?.perfil === "staff") return null;
  const unidade = unidades[r.frequencia][r.intervalo === 1 ? 0 : 1];

  return (
    <section
      className="plano-op recorrencia-programacao"
      aria-labelledby={titulo}
      onInvalidCapture={(e) => {
        const detalhes = (e.target as HTMLElement).closest("details");
        if (detalhes) detalhes.open = true;
      }}
    >
      <header className="recorrencia-cabecalho">
        <h3 id={titulo}>Quando repetir?</h3>
        <p>Use o horário informado acima para os próximos agendamentos.</p>
      </header>
      <input type="hidden" name="regra_calendario" value={JSON.stringify(r)} />
      <input type="hidden" name="intervalo" value="7" />
      <div className="plano-campos recorrencia-campos">
        <label>
          Frequência
          <select
            value={r.frequencia}
            onChange={(e) => mudar({ frequencia: e.target.value })}
          >
            <option value="diaria">Diária</option>
            <option value="semanal">Semanal</option>
            <option value="mensal">Mensal</option>
            <option value="anual">Anual</option>
          </select>
        </label>
        <label>
          Quantidade de agendamentos
          <input
            name="quantidade"
            type="number"
            min="2"
            max="52"
            step="1"
            required
            value={quantidade || ""}
            onChange={(e) => alterar(Number(e.target.value))}
          />
          <small>De 2 a 52, contando a primeira data.</small>
        </label>
        <label>
          Intervalo em {unidades[r.frequencia][1]}
          <input
            type="number"
            min="1"
            max="24"
            step="1"
            required
            value={r.intervalo || ""}
            onChange={(e) => mudar({ intervalo: Number(e.target.value) })}
          />
          <small>Ex.: 2 = a cada 2 {unidades[r.frequencia][1]}.</small>
        </label>
        <label>
          Data limite (opcional)
          <input
            type="date"
            value={r.ate}
            onChange={(e) => mudar({ ate: e.target.value })}
          />
          <small>Encerra antes, mesmo sem atingir a quantidade.</small>
        </label>
      </div>
      {r.frequencia === "semanal" && (
        <fieldset className="recorrencia-semana">
          <legend>Dias da semana</legend>
          <div className="plano-dias">
            {semana.map((s, i) => (
              <label key={s}>
                <input
                  type="checkbox"
                  checked={r.dias_semana.includes(i)}
                  onChange={(e) =>
                    mudar({
                      dias_semana: e.target.checked
                        ? [...r.dias_semana, i]
                        : r.dias_semana.filter((x) => x !== i),
                    })
                  }
                />
                {s}
              </label>
            ))}
          </div>
          <small>
            Sem seleção: repete no mesmo dia da semana do primeiro agendamento.
          </small>
        </fieldset>
      )}
      {["mensal", "anual"].includes(r.frequencia) && (
        <label>
          Em qual dia do mês?
          <select value={r.mensal} onChange={(e) => mudar({ mensal: e.target.value })}>
            <option value="dia">
              Mesmo dia do mês (ou o último dia, se o mês for menor)
            </option>
            <option value="semana">
              Mesma posição na semana (ex.: segunda terça-feira)
            </option>
          </select>
        </label>
      )}
      <p className="recorrencia-resumo">
        A cada{" "}
        <strong>
          {r.intervalo || "—"} {unidade}
        </strong>
        , até <strong>{quantidade || "—"} agendamentos</strong>
        {r.ate ? `, até ${dia(r.ate)}` : ""}. Confira as datas abaixo antes de salvar.
      </p>
      <details>
        <summary>Feriados e exceções (opcional)</summary>
        <div className="plano-op">
          <fieldset className="recorrencia-semana">
            <legend>Dias em que a empresa não atende</legend>
            <div className="plano-dias">
              {semana.map((s, i) => (
                <label key={s}>
                  <input
                    type="checkbox"
                    checked={r.dias_fechados.includes(i)}
                    onChange={(e) =>
                      mudar({
                        dias_fechados: e.target.checked
                          ? [...r.dias_fechados, i]
                          : r.dias_fechados.filter((x) => x !== i),
                      })
                    }
                  />
                  {s}
                </label>
              ))}
            </div>
          </fieldset>
          <label>
            Em feriados ou dias fechados
            <select
              value={r.feriado}
              onChange={(e) => mudar({ feriado: e.target.value })}
            >
              <option value="pular">Não agendar nessa data</option>
              <option value="proximo">Mover para o próximo dia útil</option>
              <option value="anterior">Mover para o dia útil anterior</option>
              <option value="manter">Manter a data</option>
            </select>
          </label>
          <small>
            Usa os feriados cadastrados na agenda. Datas excluídas contam no limite de
            agendamentos. O planejamento alcança até dois anos.
          </small>
          <div className="plano-campos recorrencia-campos">
            <label>
              Data a alterar
              <input
                type="date"
                value={dataEx}
                onChange={(e) => setDataEx(e.target.value)}
              />
            </label>
            <label>
              O que fazer nesta data?
              <select value={acaoEx} onChange={(e) => setAcaoEx(e.target.value)}>
                <option value="pular">Não agendar</option>
                <option value="mover">Remarcar</option>
              </select>
            </label>
            {acaoEx === "mover" && (
              <label>
                Nova data
                <input
                  type="date"
                  value={novaData}
                  onChange={(e) => setNovaData(e.target.value)}
                />
              </label>
            )}
            <button
              type="button"
              className="botao-secundario"
              disabled={!dataEx || (acaoEx === "mover" && !novaData)}
              onClick={() => {
                mudar({
                  excecoes: {
                    ...r.excecoes,
                    [dataEx]:
                      acaoEx === "mover"
                        ? { acao: "mover", data: novaData }
                        : { acao: "pular" },
                  },
                });
                setDataEx("");
                setNovaData("");
              }}
            >
              Adicionar exceção
            </button>
          </div>
          {Object.entries(r.excecoes).map(([d, x]) => (
            <div className="plano-linha" key={d}>
              <span>
                {dia(d)} → {x.data ? dia(x.data) : "Não agendar"}
              </span>
              <button
                type="button"
                className="botao-secundario"
                onClick={() => {
                  const v = { ...r.excecoes };
                  delete v[d];
                  mudar({ excecoes: v });
                }}
              >
                Remover exceção de {dia(d)}
              </button>
            </div>
          ))}
        </div>
      </details>
      <div className="recorrencia-previa">
        <button
          type="button"
          className="botao-secundario"
          disabled={
            busy ||
            !Number.isInteger(quantidade) ||
            quantidade < 2 ||
            quantidade > 52 ||
            !Number.isInteger(r.intervalo) ||
            r.intervalo < 1 ||
            r.intervalo > 24
          }
          onClick={async () => {
            setErro("");
            setBusy(true);
            try {
              if (
                !Number.isFinite(Date.parse(inicio)) ||
                !Number.isFinite(Date.parse(fim)) ||
                Date.parse(fim) <= Date.parse(inicio)
              )
                throw Error("Informe início e término para visualizar as datas.");
              const datas = await preverCalendario(
                a.oficina!.id,
                { inicio, fim, regra_calendario: r },
                quantidade,
              );
              setPrevia({ chave, datas });
            } catch (err) {
              setErro(erroPublico(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Conferindo…" : "Ver datas previstas"}
        </button>
        {erro && <p role="alert">{erro}</p>}
        {lista.length > 0 && (
          <div className="plano-previa" aria-label="Datas previstas">
            {lista.map((x) => (
              <div className="plano-linha" key={x.original}>
                <strong>{dia(x.original)}</strong>
                <span>
                  {x.data
                    ? x.data !== x.original
                      ? `→ ${dia(x.data)}`
                      : "Agendar"
                    : "Não agendar"}
                </span>
                <small>{x.motivo}</small>
              </div>
            ))}
            <p>
              {lista.filter((x) => x.data).length} agendamentos serão criados. Horários
              e recursos serão conferidos juntos ao salvar.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
